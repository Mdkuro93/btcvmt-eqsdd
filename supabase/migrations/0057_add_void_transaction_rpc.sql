-- =====================================================================================
-- 0057 — RPC void_transaction_item: Hủy phiếu xuất mượn / giao dịch & hoàn trả tài sản về kho
-- =====================================================================================
-- BỐI CẢNH:
--   Khi phiếu xuất mượn bị tạo sai hoặc kiểm thử (test), hệ thống trước đây không có cơ chế
--   hủy phiếu đã duyệt. Xóa thủ công trong DB sẽ khiến tài sản bị kẹt ở custody_status = 'checked_out'.
--
-- THAY ĐỔI (theo AGENTS #12):
--   1. Mở rộng ràng buộc status của transaction_items để hỗ trợ trạng thái 'cancelled'.
--   2. Hàm public.void_transaction_item(p_item_id, p_reason) (SECURITY DEFINER):
--      - Kiểm tra quyền: Chỉ super_admin, admin, btc_manager được phép hủy.
--      - Thực hiện nguyên tử (Atomic Rollback trong 1 transaction):
--        + Cập nhật transaction_items: status = 'cancelled', ghi rõ lý do hủy.
--        + Hoàn trả trạng thái tài sản: custody_status = 'in_stock', xóa thông tin người mượn / hạn trả.
--        + Ghi nhật ký vào activity_logs với action_type = 'Hủy phiếu'.
-- =====================================================================================

BEGIN;

-- 1. Cập nhật check constraint status của transaction_items để chấp nhận 'cancelled'
ALTER TABLE public.transaction_items DROP CONSTRAINT IF EXISTS transaction_items_status_check;
ALTER TABLE public.transaction_items ADD CONSTRAINT transaction_items_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled'));

-- 2. Stored Procedure hủy phiếu an toàn
CREATE OR REPLACE FUNCTION public.void_transaction_item(
  p_item_id uuid,
  p_reason text DEFAULT 'Hủy phiếu sai/phiếu kiểm thử'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_role        text;
  v_item        record;
  v_asset       record;
  v_reason_clean text;
BEGIN
  -- 2.1 Kiểm tra đăng nhập
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện thao tác này.' USING ERRCODE = '28000';
  END IF;

  -- 2.2 Kiểm tra quyền (chỉ super_admin, admin, btc_manager)
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid AND status = 'active';

  IF v_role NOT IN ('super_admin', 'admin', 'btc_manager') THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy phiếu giao dịch (chỉ Admin và BTC Manager được phép).' USING ERRCODE = '42501';
  END IF;

  -- 2.3 Lấy thông tin dòng phiếu
  SELECT ti.*, t.type AS tx_type, t.created_by AS tx_requester
  INTO v_item
  FROM public.transaction_items ti
  JOIN public.transactions t ON t.id = ti.transaction_id
  WHERE ti.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu giao dịch cần hủy.' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.status = 'cancelled' THEN
    RAISE EXCEPTION 'Phiếu giao dịch này đã được hủy trước đó.' USING ERRCODE = '22023';
  END IF;

  v_reason_clean := COALESCE(NULLIF(btrim(p_reason), ''), 'Hủy phiếu sai/kiểm thử');

  -- 2.4 Lấy thông tin tài sản liên quan
  SELECT id, certificate_no, custody_status, warehouse_id, expected_return_date
  INTO v_asset
  FROM public.assets
  WHERE id = v_item.asset_id;

  -- 2.5 Rollback theo loại giao dịch
  IF v_item.type = 'checkout' THEN
    -- Nếu là phiếu xuất mượn đã duyệt / đã xuất:
    -- Chỉ hoàn trả khi tài sản vẫn đang ở trạng thái mượn / luân chuyển (không chặn nếu là test)
    IF v_asset.custody_status IN ('checked_out', 'in_transit') THEN
      UPDATE public.assets
      SET custody_status = 'in_stock',
          expected_return_date = NULL,
          borrow_purpose = NULL,
          current_holder_dept = NULL,
          updated_at = now()
      WHERE id = v_item.asset_id;
    END IF;
  ELSIF v_item.type = 'checkin' THEN
    -- Nếu là phiếu nhập kho bị hủy: nếu trước đó tài sản đang mượn thì trả lại trạng thái
    -- Tùy trường hợp, thông thường chỉ ghi nhận hủy phiếu nhập
    NULL;
  END IF;

  -- 2.6 Cập nhật trạng thái phiếu giao dịch
  UPDATE public.transaction_items
  SET status = 'cancelled',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN '[ĐÃ HỦY: ' || v_reason_clean || ']'
        ELSE notes || ' | [ĐÃ HỦY: ' || v_reason_clean || ']'
      END,
      decision_notes = COALESCE(decision_notes, '') || ' (Đã hủy bởi ' || v_role || ')',
      decided_at = now(),
      decided_by = v_uid
  WHERE id = p_item_id;

  -- 2.7 Ghi nhật ký vào activity_logs nếu bảng tồn tại
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_logs') THEN
    INSERT INTO public.activity_logs (
      log_date, action_type, document_no, description, used_by, notes,
      asset_id, transaction_id, warehouse_id, performed_by
    ) VALUES (
      CURRENT_DATE,
      'Hủy phiếu',
      COALESCE(v_item.voucher_code, 'CHƯA-SỐ'),
      'Hủy phiếu ' || COALESCE(v_item.voucher_code, '') || ' của GCN ' || COALESCE(v_asset.certificate_no, '-') || '. Lý do: ' || v_reason_clean,
      'BTC VMT',
      v_reason_clean,
      v_item.asset_id,
      v_item.transaction_id,
      v_asset.warehouse_id,
      v_uid
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'asset_id', v_item.asset_id,
    'message', 'Đã hủy phiếu và hoàn trả trạng thái tài sản về kho thành công.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_transaction_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_transaction_item(uuid, text) TO authenticated, service_role;

COMMIT;
