-- =====================================================================================
-- Script gán kho lưu trữ mặc định cho các tài sản bị trống warehouse_id
-- Vị trí: scripts/golive/fix_unassigned_warehouses.sql
-- =====================================================================================
-- HƯỚNG DẪN:
--   1. Tìm tất cả tài sản có warehouse_id IS NULL.
--   2. Gán vào kho mặc định (ưu tiên kho trung tâm hoặc kho chỉ định).
-- =====================================================================================

BEGIN;

DO $$
DECLARE
  v_default_warehouse_id uuid;
  v_count integer;
BEGIN
  -- Lấy kho trung tâm (is_central = true) hoặc kho đầu tiên
  SELECT id INTO v_default_warehouse_id
  FROM public.warehouses
  ORDER BY is_central DESC, created_at ASC
  LIMIT 1;

  IF v_default_warehouse_id IS NULL THEN
    RAISE NOTICE 'Không tìm thấy kho nào trong hệ thống để gán.';
    RETURN;
  END IF;

  -- Đếm số tài sản chưa có kho
  SELECT count(*) INTO v_count
  FROM public.assets
  WHERE warehouse_id IS NULL;

  RAISE NOTICE 'Phát hiện % tài sản chưa được gán kho lưu trữ.', v_count;

  IF v_count > 0 THEN
    UPDATE public.assets
    SET warehouse_id = v_default_warehouse_id,
        updated_at = now()
    WHERE warehouse_id IS NULL;

    RAISE NOTICE 'Đã gán % tài sản vào kho ID: %', v_count, v_default_warehouse_id;
  END IF;
END $$;

COMMIT;

-- Kiểm tra lại:
-- SELECT count(*) AS unassigned_count FROM public.assets WHERE warehouse_id IS NULL;
