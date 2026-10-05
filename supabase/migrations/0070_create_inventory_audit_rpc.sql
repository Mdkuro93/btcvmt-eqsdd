-- 0070_create_inventory_audit_rpc.sql
-- Lý do: createInventoryAudit() (src/api/inventoryAudits.ts) đang chạy ở trình duyệt:
--   - đọc danh sách GCN trong kho bằng 1 truy vấn không phân trang -> Supabase mặc định cắt 1.000 dòng: kho 12.000 GCN
--     chỉ được kiểm 1.000, total_expected sai, GCN thất lạc ngoài 1.000 dòng đầu không bao giờ bị phát hiện;
--   - tạo phiếu rồi chèn dòng bằng 2 lệnh rời: lỗi giữa chừng để lại đợt kiểm kê mồ côi.
-- Sửa: một RPC nguyên tử, INSERT ... SELECT hoàn toàn trong DB.
-- SECURITY INVOKER: RLS hiện có của inventory_audits / inventory_audit_items / assets (0010, 0055) vẫn áp dụng đúng như
--   khi client ghi trực tiếp -> không mở thêm quyền nào.
-- Hành vi giữ nguyên: lấy GCN của kho có custody_status = 'in_stock' hoặc NULL; vị trí lấy từ ghi chú "[Vị trí kho thực tế: ...]".
BEGIN;

CREATE OR REPLACE FUNCTION public.create_inventory_audit(
  p_warehouse_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
  v_total    integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để tạo đợt kiểm kê.' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.inventory_audits (
    warehouse_id, performed_by, started_at, status, notes,
    total_expected, total_found, total_missing, total_misplaced, total_surplus
  ) VALUES (
    p_warehouse_id, auth.uid(), now(), 'in_progress', NULLIF(btrim(p_notes), ''),
    0, 0, 0, 0, 0
  ) RETURNING id INTO v_audit_id;

  INSERT INTO public.inventory_audit_items (
    audit_id, asset_id, expected_status, expected_location,
    actual_found, actual_location, finding_status, note
  )
  SELECT
    v_audit_id,
    a.id,
    COALESCE(a.custody_status, 'in_stock'),
    COALESCE(NULLIF(btrim(substring(a.notes FROM '\[Vị trí kho thực tế:\s*([^\]]+)\]')), ''), 'Vị trí kho tiêu chuẩn'),
    false, NULL, 'pending', NULL
  FROM public.assets a
  WHERE a.warehouse_id = p_warehouse_id
    AND (a.custody_status = 'in_stock' OR a.custody_status IS NULL);

  GET DIAGNOSTICS v_total = ROW_COUNT;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Kho này hiện không có tài sản ở trạng thái "Trong kho" (in_stock). Không thể tạo đợt kiểm kê rỗng.';
  END IF;

  UPDATE public.inventory_audits SET total_expected = v_total WHERE id = v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_audit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_audit(uuid, text) TO authenticated, service_role;

COMMIT;

-- ROLLBACK: DROP FUNCTION public.create_inventory_audit(uuid, text);
