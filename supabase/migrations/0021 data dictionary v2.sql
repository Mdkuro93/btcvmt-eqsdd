-- ==============================================================================
-- MIGRATION: 0021_data_dictionary_v2.sql
-- MỤC ĐÍCH: Chuẩn hóa bảng `assets` (và `asset_declaration_requests` nếu có)
--   theo ma trận báo cáo 27 cột chốt với user (phiên làm việc ngày 2026-09-17).
--
-- THAY ĐỔI CHÍNH:
--   1. Thêm cột mới `legal_lot_code` (Mã Lô Pháp Lý) = gộp subdivision + lot_no.
--   2. Gộp mortgage_bank_2 -> mortgage_bank (nối ";"), mortgage_unit_2 -> mortgage_unit (nối ";").
--   3. Xóa các cột: subdivision, lot_no, owner_name, province, district, ward,
--      address_detail, mortgage_bank_2, mortgage_unit_2, credit_grant_rate,
--      usage_term (nếu còn sót), land_use_term, land_use_purpose.
--   4. KHÔNG đổi gì với: scan_file_url, parent_asset_id, expected_return_date,
--      borrow_purpose, mortgage_expected_release_date (giữ nguyên, dùng nội bộ,
--      không thuộc 27 cột báo cáo).
--
-- AN TOÀN: mọi lệnh đều dùng IF EXISTS / IF NOT EXISTS, chạy lại được nhiều lần.
-- LƯU Ý: sau migration này PHẢI chạy tiếp 0022 (patch các RPC/function còn
--   tham chiếu tới các cột đã xóa: decide_transaction_item, lookup_asset_status,
--   get_report_statistics), nếu không hệ thống sẽ lỗi ngay khi duyệt phiếu/tra cứu.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- BẢNG assets
-- ------------------------------------------------------------------------------

-- 1) Thêm cột mới Mã Lô Pháp Lý
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS legal_lot_code TEXT;
COMMENT ON COLUMN public.assets.legal_lot_code IS 'Mã Lô Pháp Lý (gộp Phân khu + Số Lô/Thửa cũ, tách biệt với Số Thửa/Tờ Bản Đồ)';

-- Migrate dữ liệu: subdivision + lot_no -> legal_lot_code (nối bằng "-")
UPDATE public.assets
SET legal_lot_code = NULLIF(TRIM(BOTH '-' FROM CONCAT_WS('-', NULLIF(TRIM(subdivision), ''), NULLIF(TRIM(lot_no), ''))), '')
WHERE legal_lot_code IS NULL
  AND (COALESCE(TRIM(subdivision), '') <> '' OR COALESCE(TRIM(lot_no), '') <> '');

-- 2) Gộp Ngân hàng thế chấp 1+2 -> mortgage_bank (nối ";")
UPDATE public.assets
SET mortgage_bank = NULLIF(TRIM(BOTH ';' FROM CONCAT_WS(';', NULLIF(TRIM(mortgage_bank), ''), NULLIF(TRIM(mortgage_bank_2), ''))), '')
WHERE COALESCE(TRIM(mortgage_bank_2), '') <> '';

-- 3) Gộp Đơn vị vay 1+2 -> mortgage_unit (nối ";")
UPDATE public.assets
SET mortgage_unit = NULLIF(TRIM(BOTH ';' FROM CONCAT_WS(';', NULLIF(TRIM(mortgage_unit), ''), NULLIF(TRIM(mortgage_unit_2), ''))), '')
WHERE COALESCE(TRIM(mortgage_unit_2), '') <> '';

-- 4) Xóa các cột thừa / không còn dùng
ALTER TABLE public.assets DROP COLUMN IF EXISTS subdivision;
ALTER TABLE public.assets DROP COLUMN IF EXISTS lot_no;
ALTER TABLE public.assets DROP COLUMN IF EXISTS owner_name;
ALTER TABLE public.assets DROP COLUMN IF EXISTS province;
ALTER TABLE public.assets DROP COLUMN IF EXISTS district;
ALTER TABLE public.assets DROP COLUMN IF EXISTS ward;
ALTER TABLE public.assets DROP COLUMN IF EXISTS address_detail;
ALTER TABLE public.assets DROP COLUMN IF EXISTS mortgage_bank_2;
ALTER TABLE public.assets DROP COLUMN IF EXISTS mortgage_unit_2;
ALTER TABLE public.assets DROP COLUMN IF EXISTS credit_grant_rate;
ALTER TABLE public.assets DROP COLUMN IF EXISTS usage_term;
ALTER TABLE public.assets DROP COLUMN IF EXISTS land_use_term;
ALTER TABLE public.assets DROP COLUMN IF EXISTS land_use_purpose;

-- Index tìm kiếm theo Mã Lô Pháp Lý (thay cho index cũ trên subdivision/lot_no)
DROP INDEX IF EXISTS idx_assets_project_cert_subdivision_lot;
CREATE INDEX IF NOT EXISTS idx_assets_legal_lot_code ON public.assets (legal_lot_code);

-- ------------------------------------------------------------------------------
-- BẢNG asset_declaration_requests (áp dụng tương tự nếu bảng/cột tồn tại)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'asset_declaration_requests'
  ) THEN

    ALTER TABLE public.asset_declaration_requests ADD COLUMN IF NOT EXISTS legal_lot_code TEXT;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_declaration_requests' AND column_name='subdivision')
       OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_declaration_requests' AND column_name='lot_no') THEN
      EXECUTE $sql$
        UPDATE public.asset_declaration_requests
        SET legal_lot_code = NULLIF(TRIM(BOTH '-' FROM CONCAT_WS('-', NULLIF(TRIM(subdivision), ''), NULLIF(TRIM(lot_no), ''))), '')
        WHERE legal_lot_code IS NULL
          AND (COALESCE(TRIM(subdivision), '') <> '' OR COALESCE(TRIM(lot_no), '') <> '')
      $sql$;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_declaration_requests' AND column_name='mortgage_bank_2') THEN
      EXECUTE $sql$
        UPDATE public.asset_declaration_requests
        SET mortgage_bank = NULLIF(TRIM(BOTH ';' FROM CONCAT_WS(';', NULLIF(TRIM(mortgage_bank), ''), NULLIF(TRIM(mortgage_bank_2), ''))), '')
        WHERE COALESCE(TRIM(mortgage_bank_2), '') <> ''
      $sql$;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset_declaration_requests' AND column_name='mortgage_unit_2') THEN
      EXECUTE $sql$
        UPDATE public.asset_declaration_requests
        SET mortgage_unit = NULLIF(TRIM(BOTH ';' FROM CONCAT_WS(';', NULLIF(TRIM(mortgage_unit), ''), NULLIF(TRIM(mortgage_unit_2), ''))), '')
        WHERE COALESCE(TRIM(mortgage_unit_2), '') <> ''
      $sql$;
    END IF;

    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS subdivision;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS lot_no;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS owner_name;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS province;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS district;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS ward;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS address_detail;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS mortgage_bank_2;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS mortgage_unit_2;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS credit_grant_rate;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS usage_term;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS land_use_term;
    ALTER TABLE public.asset_declaration_requests DROP COLUMN IF EXISTS land_use_purpose;

  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- GRANT: bảng đã tồn tại từ trước nên GRANT table-level cũ vẫn áp dụng cho cột
-- mới (legal_lot_code) tự động. Không cần GRANT thêm.
-- ------------------------------------------------------------------------------

COMMIT;