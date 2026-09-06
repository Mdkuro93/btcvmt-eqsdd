-- ==============================================================================
-- MIGRATION: 005_report_snapshots_and_rls_lock.sql
-- HỆ THỐNG: QUẢN LÝ GCN QSDĐ & TSĐB (BTC VMT)
-- MỤC ĐÍCH:
--   1. Tạo bảng `report_snapshots` lưu trữ báo cáo kỳ dạng dữ liệu tĩnh (Denormalized JSONB)
--   2. Thiết lập RLS Policy: Khi period_status = 'locked', cấm mọi thao tác UPDATE và DELETE
--   3. Cài đặt Trigger kiểm soát cấp CSDL ngăn chặn bypass
--   4. Hàm RPC `reopen_reporting_period()` bắt buộc ghi lý do mở khóa vào `audit_logs`
--   5. Hàm RPC `lock_reporting_period()` để chốt kỳ báo cáo
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. BẢNG `report_snapshots`
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_code TEXT NOT NULL,                                  -- Mã kỳ báo cáo (VD: BC-2026-08, BC-Q2-2026...)
  report_period TEXT NOT NULL,                                -- Tên kỳ hiển thị (VD: "Tháng 08/2026", "Năm 2026"...)
  period_status TEXT NOT NULL DEFAULT 'open' 
    CHECK (period_status IN ('open', 'locked')),              -- Trạng thái: 'open' (Đang mở) hoặc 'locked' (Đã chốt khóa)
  title TEXT NOT NULL,                                        -- Tiêu đề báo cáo
  region TEXT DEFAULT 'Tất cả vùng',
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  warehouse_name TEXT,                                        -- Tên kho tĩnh (Denormalized)
  department_name TEXT DEFAULT 'Ban Tài Chính VMT',           -- Đơn vị lập báo cáo tĩnh (Denormalized)
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_name TEXT,                                     -- Họ tên người nộp tĩnh (Denormalized)
  submitted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  locked_at TIMESTAMPTZ,                                      -- Thời điểm chốt sổ khóa dữ liệu
  locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_by_name TEXT,                                        -- Họ tên người thực hiện khóa tĩnh (Denormalized)
  
  reopened_at TIMESTAMPTZ,                                    -- Thời điểm mở khóa gần nhất (nếu có)
  reopened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reopened_by_name TEXT,                                      -- Họ tên người mở khóa
  reopen_reason TEXT,                                         -- Lý do mở khóa bắt buộc
  
  total_assets INT DEFAULT 0,                                 -- Tổng số GCN/tài sản trong kỳ
  total_area NUMERIC DEFAULT 0,                               -- Tổng diện tích (m²)
  total_valuation NUMERIC DEFAULT 0,                          -- Tổng giá trị định giá thế chấp (VNĐ)
  total_collateral_value NUMERIC DEFAULT 0,                   -- Tổng giá trị bảo đảm vay (VNĐ)
  
  -- QUAN TRỌNG: Cột report_data dạng JSONB lưu toàn bộ tài sản dưới dạng chuỗi tĩnh
  -- (Bao gồm tên phòng ban, tên loại đất, tên dự án, tên kho, tên ngân hàng...)
  -- Tránh tuyệt đối việc đổi tên danh mục sau này làm sai lệch số liệu lịch sử đã chốt!
  report_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  summary_stats JSONB DEFAULT '{}'::jsonb,                    -- Số liệu tổng hợp theo loại đất, ngân hàng, kho
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tạo Index tăng tốc tìm kiếm
CREATE INDEX IF NOT EXISTS idx_report_snapshots_period_status ON report_snapshots(period_status);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_report_period ON report_snapshots(report_period);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_submitted_at ON report_snapshots(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_warehouse_id ON report_snapshots(warehouse_id);

-- ------------------------------------------------------------------------------
-- 2. THIẾT LẬP ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;

-- 2.1 Quyền SELECT: Người dùng đã xác thực được xem danh sách và chi tiết các kỳ báo cáo
DROP POLICY IF EXISTS "Xem danh sách report_snapshots" ON report_snapshots;
CREATE POLICY "Xem danh sách report_snapshots"
ON report_snapshots FOR SELECT
TO authenticated
USING (true);

-- 2.2 Quyền INSERT: Cho phép người dùng authenticated nộp kỳ báo cáo mới
DROP POLICY IF EXISTS "Tạo mới report_snapshots" ON report_snapshots;
CREATE POLICY "Tạo mới report_snapshots"
ON report_snapshots FOR INSERT
TO authenticated
WITH CHECK (true);

-- 2.3 Quyền UPDATE:
-- QUY TẮC RLS: Nếu period_status === 'locked', CẤM TẤT CẢ các thao tác UPDATE (kể cả tài khoản Admin).
-- Biểu thức USING (period_status != 'locked') sẽ lọc ra 0 bản ghi nếu period_status = 'locked',
-- khiến cho mọi câu lệnh UPDATE trực tiếp đều bị từ chối/không có hiệu lực.
DROP POLICY IF EXISTS "Cấm sửa report_snapshots khi đã khóa" ON report_snapshots;
CREATE POLICY "Cấm sửa report_snapshots khi đã khóa"
ON report_snapshots FOR UPDATE
TO authenticated
USING (period_status != 'locked')
WITH CHECK (period_status != 'locked');

-- 2.4 Quyền DELETE:
-- QUY TẮC RLS: Nếu period_status === 'locked', CẤM TẤT CẢ các thao tác DELETE (kể cả tài khoản Admin).
DROP POLICY IF EXISTS "Cấm xóa report_snapshots khi đã khóa" ON report_snapshots;
CREATE POLICY "Cấm xóa report_snapshots khi đã khóa"
ON report_snapshots FOR DELETE
TO authenticated
USING (period_status != 'locked');

-- ------------------------------------------------------------------------------
-- 3. TRIGGER BẢO VỆ TOÀN VẸN CẤP CƠ SỞ DỮ LIỆU (Database-Level Guard)
-- Ngăn chặn ngay cả trường hợp Service Role hay Superuser thực hiện UPDATE/DELETE trực tiếp
-- Ngoại trừ duy nhất khi được thực thi qua hàm RPC reopen_reporting_period()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_locked_report_snapshot_guard()
RETURNS TRIGGER AS $$
BEGIN
  -- Nếu bản ghi đang có trạng thái 'locked'
  IF OLD.period_status = 'locked' THEN
    -- Kiểm tra cờ session bảo mật do RPC reopen_reporting_period() thiết lập
    IF current_setting('app.reopening_period', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'LỖI BẢO MẬT: Báo cáo kỳ này đã bị KHÓA CHỐT DỮ LIỆU (period_status = locked). Cấm mọi thao tác UPDATE hoặc DELETE trực tiếp (kể cả quyền Admin)! Muốn điều chỉnh, bắt buộc phải thông qua hàm RPC reopen_reporting_period() có kèm lý do mở khóa được ghi vết vào audit_logs.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_locked_report_snapshot_guard ON report_snapshots;
CREATE TRIGGER trg_locked_report_snapshot_guard
  BEFORE UPDATE OR DELETE ON report_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION check_locked_report_snapshot_guard();

-- ------------------------------------------------------------------------------
-- 4. HÀM RPC: reopen_reporting_period(p_snapshot_id, p_reason)
-- Mục đích: Chuyển trạng thái về 'open' và ghi lý do mở khóa vào audit_logs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reopen_reporting_period(
  p_snapshot_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_snapshot RECORD;
  v_result JSONB;
BEGIN
  -- 1. Lấy thông tin người dùng đang gọi
  v_user_id := auth.uid();
  
  SELECT coalesce(full_name, email, 'Quản trị viên')
  INTO v_user_name
  FROM profiles
  WHERE id = v_user_id;

  IF v_user_name IS NULL THEN
    v_user_name := 'Admin / Người dùng hệ thống';
  END IF;

  -- 2. Kiểm tra lý do mở khóa
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Vui lòng cung cấp lý do mở khóa kỳ báo cáo hợp lệ và rõ ràng (tối thiểu 5 ký tự)';
  END IF;

  -- 3. Kiểm tra bản ghi snapshot
  SELECT * INTO v_snapshot
  FROM report_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ báo cáo với ID: %', p_snapshot_id;
  END IF;

  IF v_snapshot.period_status != 'locked' THEN
    RAISE EXCEPTION 'Kỳ báo cáo "%" hiện đang ở trạng thái "%", không cần mở khóa', v_snapshot.report_period, v_snapshot.period_status;
  END IF;

  -- 4. Bật cờ session bảo mật để Trigger cho phép cập nhật trạng thái
  PERFORM set_config('app.reopening_period', 'true', true);

  -- 5. Cập nhật trạng thái kỳ báo cáo về 'open'
  UPDATE report_snapshots
  SET 
    period_status = 'open',
    reopened_at = timezone('utc'::text, now()),
    reopened_by = v_user_id,
    reopened_by_name = v_user_name,
    reopen_reason = trim(p_reason),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_snapshot_id;

  -- 6. Tắt cờ session bảo mật
  PERFORM set_config('app.reopening_period', 'false', true);

  -- 7. Ghi nhận bắt buộc vào bảng `audit_logs` để lưu vết đầy đủ
  INSERT INTO audit_logs (
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    changed_by_name,
    notes,
    created_at
  ) VALUES (
    p_snapshot_id::text,
    'REOPEN_REPORT_PERIOD',
    jsonb_build_object(
      'report_code', v_snapshot.report_code,
      'report_period', v_snapshot.report_period,
      'period_status', 'locked',
      'locked_at', v_snapshot.locked_at,
      'locked_by_name', v_snapshot.locked_by_name
    ),
    jsonb_build_object(
      'report_code', v_snapshot.report_code,
      'report_period', v_snapshot.report_period,
      'period_status', 'open',
      'reopened_at', timezone('utc'::text, now()),
      'reopened_by', v_user_id,
      'reopened_by_name', v_user_name,
      'reopen_reason', trim(p_reason)
    ),
    v_user_id,
    v_user_name,
    concat('Mở khóa kỳ báo cáo [', v_snapshot.report_code, ' - ', v_snapshot.report_period, ']. Lý do: ', trim(p_reason)),
    timezone('utc'::text, now())
  );

  -- Lấy kết quả mới nhất trả về
  SELECT to_jsonb(r) INTO v_result
  FROM report_snapshots r
  WHERE r.id = p_snapshot_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã mở khóa kỳ báo cáo thành công. Trạng thái đã chuyển sang OPEN.',
    'snapshot', v_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 5. HÀM RPC: lock_reporting_period(p_snapshot_id, p_notes)
-- Mục đích: Chốt sổ và khóa kỳ báo cáo, ngăn ngừa mọi can thiệp sửa đổi
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lock_reporting_period(
  p_snapshot_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_snapshot RECORD;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  
  SELECT coalesce(full_name, email, 'Quản trị viên')
  INTO v_user_name
  FROM profiles
  WHERE id = v_user_id;

  IF v_user_name IS NULL THEN
    v_user_name := 'Admin / Người dùng hệ thống';
  END IF;

  SELECT * INTO v_snapshot
  FROM report_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ báo cáo với ID: %', p_snapshot_id;
  END IF;

  IF v_snapshot.period_status = 'locked' THEN
    RAISE EXCEPTION 'Kỳ báo cáo này đã ở trạng thái khóa (locked) trước đó';
  END IF;

  UPDATE report_snapshots
  SET 
    period_status = 'locked',
    locked_at = timezone('utc'::text, now()),
    locked_by = v_user_id,
    locked_by_name = v_user_name,
    notes = coalesce(p_notes, notes),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_snapshot_id;

  INSERT INTO audit_logs (
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    changed_by_name,
    notes,
    created_at
  ) VALUES (
    p_snapshot_id::text,
    'LOCK_REPORT_PERIOD',
    jsonb_build_object('period_status', v_snapshot.period_status),
    jsonb_build_object('period_status', 'locked', 'locked_at', timezone('utc'::text, now()), 'locked_by_name', v_user_name),
    v_user_id,
    v_user_name,
    concat('Chốt và khóa kỳ báo cáo [', v_snapshot.report_code, ' - ', v_snapshot.report_period, ']. Toàn bộ dữ liệu tĩnh đã được niêm phong an toàn.'),
    timezone('utc'::text, now())
  );

  SELECT to_jsonb(r) INTO v_result
  FROM report_snapshots r
  WHERE r.id = p_snapshot_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã chốt và khóa kỳ báo cáo thành công. Dữ liệu đã được niêm phong.',
    'snapshot', v_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Chú thích tài liệu CSDL
COMMENT ON TABLE report_snapshots IS 'Bảng lưu vết các kỳ báo cáo đã nộp/chốt, lưu dữ liệu tĩnh (Denormalized JSONB) và bảo vệ bằng RLS cấm sửa/xóa khi locked';
COMMENT ON COLUMN report_snapshots.period_status IS 'Trạng thái kỳ báo cáo: open (đang mở) | locked (đã chốt khóa, cấm UPDATE/DELETE qua RLS)';
COMMENT ON COLUMN report_snapshots.report_data IS 'Mảng JSONB lưu toàn bộ danh sách tài sản với tên phòng ban, tên loại đất, tên dự án dưới dạng chuỗi tĩnh';
