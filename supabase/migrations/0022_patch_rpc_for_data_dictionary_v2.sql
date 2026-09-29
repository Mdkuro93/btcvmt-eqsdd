-- ==============================================================================
-- MIGRATION: 0022_patch_rpc_for_data_dictionary_v2.sql
-- MỤC ĐÍCH: Viết lại (CREATE OR REPLACE) 3 function còn tham chiếu tới các cột
--   đã bị gộp/xóa ở migration 0021 (subdivision, lot_no, owner_name, province,
--   district, ward, address_detail, mortgage_bank_2, mortgage_unit_2, usage_term).
--   BẮT BUỘC chạy ngay sau 0021, nếu không các RPC này sẽ lỗi "column does not exist".
--
-- CÁC FUNCTION ĐƯỢC THAY:
--   1. decide_transaction_item  (nhánh 'mortgage' và 'split')
--   2. lookup_asset_status
--   3. get_report_statistics
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1) decide_transaction_item
--    - Nhánh 'mortgage': bỏ set mortgage_bank_2 / mortgage_unit_2 (đã gộp vào
--      mortgage_bank / mortgage_unit ở tầng ứng dụng trước khi gửi RPC).
--    - Nhánh 'split': tạo sổ con dùng legal_lot_code, current_owner_entity_id
--      thay cho subdivision/lot_no/owner_name/province/district/ward/address_detail.
-- ------------------------------------------------------------------------------
create or replace function decide_transaction_item(
  p_item_id uuid,
  p_status text,
  p_notes text,
  p_details jsonb,
  p_voucher_code text
) returns void as $$
declare
  v_item record;
  v_asset record;
  v_type text;
begin
  select * into v_item from transaction_items where id = p_item_id;
  if not found then
    raise exception 'Transaction item not found';
  end if;

  select * into v_asset from assets where id = v_item.asset_id;

  if not has_permission('request.approve') then
    raise exception 'Permission denied';
  end if;

  update transaction_items
  set
    status = p_status,
    decision_notes = p_notes,
    details = coalesce(p_details, details),
    voucher_code = coalesce(p_voucher_code, voucher_code),
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_item_id;

  if p_status = 'approved' then
    v_type := v_item.type;

    -- Update asset notes if provided in p_details
    if p_details ? 'notes' then
      update assets set notes = p_details->>'notes' where id = v_item.asset_id;
    end if;

    if v_type = 'checkout' then
      update assets
      set
        custody_status = 'checked_out',
        current_holder_dept = p_details->>'borrower',
        expected_return_date = (p_details->>'expected_return_date')::date,
        borrow_purpose = p_details->>'borrow_purpose',
        updated_at = now()
      where id = v_item.asset_id;

    elsif v_type = 'checkin' then
      update assets
      set
        custody_status = 'in_stock',
        current_holder_dept = null,
        warehouse_id = coalesce((p_details->>'warehouse_id')::uuid, warehouse_id),
        updated_at = now()
      where id = v_item.asset_id;

    elsif v_type = 'mortgage' then
      update assets
      set
        mortgage_status = 'mortgaged',
        mortgage_bank = p_details->>'bank',
        mortgage_unit = p_details->>'mortgage_unit',
        collateral_ratio = (p_details->>'collateral_ratio')::numeric,
        collateral_value = (p_details->>'collateral_value')::numeric,
        mortgage_valuation = (p_details->>'valuation')::numeric,
        mortgage_expected_release_date = (p_details->>'expected_release_date')::date,
        updated_at = now()
      where id = v_item.asset_id;

    elsif v_type = 'sale_update' then
      update assets
      set
        sale_status = p_details->>'sale_status',
        usage_term_type = coalesce(p_details->>'usage_term_type', usage_term_type),
        updated_at = now()
      where id = v_item.asset_id;

    elsif v_type = 'split' then
      update assets
      set
        lifecycle_status = 'invalidated',
        custody_status = 'in_stock',
        updated_at = now()
      where id = v_item.asset_id;

      if p_details ? 'splitChildren' and jsonb_typeof(p_details->'splitChildren') = 'array' then
        insert into assets (
          certificate_no, project_id, legal_lot_code, area, current_owner_entity_id, warehouse_id, parent_asset_id,
          custody_status, lifecycle_status, sale_status, mortgage_status,
          map_sheet_no, land_lot_no, usage_purpose, usage_term_type, usage_term_date,
          asset_type, collateral_type, business_plot_code, certificate_group, registry_no, registry_date, managing_unit
        )
        select
          c->>'certificate_no',
          v_asset.project_id,
          coalesce(c->>'legal_lot_code', v_asset.legal_lot_code),
          (c->>'area')::numeric,
          v_asset.current_owner_entity_id,
          v_asset.warehouse_id,
          v_asset.id,
          'in_stock',
          'active',
          'not_ready',
          'none',
          v_asset.map_sheet_no,
          c->>'land_lot_no',
          v_asset.usage_purpose,
          v_asset.usage_term_type,
          v_asset.usage_term_date,
          v_asset.asset_type,
          v_asset.collateral_type,
          v_asset.business_plot_code,
          'so_nho',
          v_asset.registry_no,
          v_asset.registry_date,
          v_asset.managing_unit
        from jsonb_array_elements(p_details->'splitChildren') as c
        where c->>'certificate_no' is not null;
      end if;
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- ------------------------------------------------------------------------------
-- 2) lookup_asset_status: subdivision -> legal_lot_code
--    Đổi kiểu dữ liệu trả về (OUT parameters) nên PHẢI DROP trước khi tạo lại,
--    Postgres không cho CREATE OR REPLACE đổi row type của hàm đã tồn tại.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.lookup_asset_status(text);

CREATE OR REPLACE FUNCTION public.lookup_asset_status(p_query TEXT)
RETURNS TABLE (
    certificate_no TEXT,
    project_name TEXT,
    legal_lot_code TEXT,
    custody_status TEXT,
    lifecycle_status TEXT,
    sale_status TEXT,
    mortgage_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.certificate_no,
        p.name AS project_name,
        a.legal_lot_code,
        a.custody_status,
        a.lifecycle_status,
        a.sale_status,
        a.mortgage_status
    FROM public.assets a
    LEFT JOIN public.projects p ON p.id = a.project_id
    WHERE (
        a.certificate_no ILIKE '%' || p_query || '%'
        OR a.legal_lot_code ILIKE '%' || p_query || '%'
        OR p.name ILIKE '%' || p_query || '%'
    )
    LIMIT 50;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3) get_report_statistics: owner_name (text) -> tên pháp nhân qua
--    current_owner_entity_id; lot_no/subdivision -> legal_lot_code
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_report_statistics(
  p_region_name text DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_mortgage_status text DEFAULT NULL,
  p_search_term text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_result jsonb;
  v_clean_region text;
  v_clean_search text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'total_count', 0, 'total_area', 0, 'mortgaged_count', 0,
      'total_mortgage_valuation', 0, 'in_stock_count', 0,
      'total_accessible_assets', 0, 'total_accessible_mortgaged', 0,
      'by_warehouse', '[]'::jsonb, 'by_project', '[]'::jsonb, 'by_mortgage_bank', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'total_count', 0, 'total_area', 0, 'mortgaged_count', 0,
      'total_mortgage_valuation', 0, 'in_stock_count', 0,
      'total_accessible_assets', 0, 'total_accessible_mortgaged', 0,
      'by_warehouse', '[]'::jsonb, 'by_project', '[]'::jsonb, 'by_mortgage_bank', '[]'::jsonb
    );
  END IF;

  v_clean_region := NULLIF(trim(p_region_name), '');
  IF v_clean_region = 'Tất cả vùng' THEN
    v_clean_region := NULL;
  ELSIF v_clean_region IS NOT NULL THEN
    v_clean_region := replace(v_clean_region, 'Vùng ', '');
    v_clean_region := trim(v_clean_region);
  END IF;

  v_clean_search := NULLIF(trim(p_search_term), '');

  WITH accessible_assets AS (
    SELECT
      a.id,
      a.area,
      a.mortgage_status,
      a.mortgage_bank,
      a.mortgage_valuation,
      a.collateral_value,
      a.custody_status,
      a.certificate_no,
      oe.name AS owner_name,
      a.land_lot_no,
      a.legal_lot_code,
      a.warehouse_id,
      a.project_id,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      r_wh.name AS warehouse_region_name,
      p.name AS project_name,
      r_pr.name AS project_region_name
    FROM assets a
    LEFT JOIN warehouses w ON w.id = a.warehouse_id
    LEFT JOIN regions r_wh ON r_wh.id = w.region_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN areas ar ON ar.id = p.area_id
    LEFT JOIN regions r_pr ON r_pr.id = ar.region_id
    LEFT JOIN investor_entities oe ON oe.id = a.current_owner_entity_id
    WHERE (
      v_profile.role IN ('super_admin', 'admin', 'btc_manager')
      OR (v_profile.role = 'warehouse_manager' AND a.warehouse_id = ANY(v_profile.managed_warehouse_ids))
      OR (v_profile.role IN ('capital_dept', 'project_dept', 're_dept') AND a.warehouse_id = ANY(v_profile.assigned_warehouse_ids))
      OR (v_profile.role = 'investor' AND a.current_owner_entity_id = ANY(v_profile.owner_entity_ids))
      OR (
        v_profile.role = 'viewer' AND EXISTS (
          SELECT 1 FROM viewer_warehouse_access vwa
          WHERE vwa.user_id = v_user_id
          AND vwa.warehouse_id = a.warehouse_id
          AND (vwa.expires_at IS NULL OR vwa.expires_at > timezone('utc'::text, now()))
        )
      )
    )
  ),
  overall_stats AS (
    SELECT
      COUNT(*) AS total_accessible,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS total_accessible_mortgaged
    FROM accessible_assets
  ),
  filtered_assets AS (
    SELECT *
    FROM accessible_assets
    WHERE
      (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND (p_project_id IS NULL OR project_id = p_project_id)
      AND (p_mortgage_status IS NULL OR p_mortgage_status = '' OR mortgage_status = p_mortgage_status)
      AND (
        v_clean_region IS NULL
        OR (warehouse_region_name ILIKE '%' || v_clean_region || '%')
        OR (project_region_name ILIKE '%' || v_clean_region || '%')
      )
      AND (
        v_clean_search IS NULL
        OR certificate_no ILIKE '%' || v_clean_search || '%'
        OR owner_name ILIKE '%' || v_clean_search || '%'
        OR land_lot_no ILIKE '%' || v_clean_search || '%'
        OR legal_lot_code ILIKE '%' || v_clean_search || '%'
        OR project_name ILIKE '%' || v_clean_search || '%'
      )
  ),
  summary_stats AS (
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(area), 0) AS total_area,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation) FILTER (WHERE mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation,
      COUNT(*) FILTER (WHERE custody_status = 'in_stock') AS in_stock_count
    FROM filtered_assets
  ),
  warehouse_agg AS (
    SELECT
      warehouse_id,
      COALESCE(warehouse_name, 'Chưa xác định') AS warehouse_name,
      COUNT(*) AS total_count,
      COALESCE(SUM(area), 0) AS total_area,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation) FILTER (WHERE mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation,
      COUNT(*) FILTER (WHERE custody_status = 'in_stock') AS in_stock_count
    FROM filtered_assets
    WHERE warehouse_id IS NOT NULL
    GROUP BY warehouse_id, warehouse_name
    ORDER BY total_count DESC
  ),
  project_agg AS (
    SELECT
      project_id,
      COALESCE(project_name, 'Chưa xác định') AS project_name,
      COUNT(*) AS total_count,
      COALESCE(SUM(area), 0) AS total_area,
      COUNT(*) FILTER (WHERE mortgage_status = 'mortgaged') AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation) FILTER (WHERE mortgage_status = 'mortgaged'), 0) AS total_mortgage_valuation
    FROM filtered_assets
    WHERE project_id IS NOT NULL
    GROUP BY project_id, project_name
    ORDER BY total_count DESC
  ),
  bank_agg AS (
    SELECT
      COALESCE(NULLIF(trim(mortgage_bank), ''), 'Chưa cập nhật tên NH') AS mortgage_bank,
      COUNT(*) AS mortgaged_count,
      COALESCE(SUM(mortgage_valuation), 0) AS total_valuation,
      COALESCE(SUM(collateral_value), 0) AS total_collateral_value
    FROM filtered_assets
    WHERE mortgage_status = 'mortgaged'
    GROUP BY mortgage_bank
    ORDER BY mortgaged_count DESC
  )
  SELECT jsonb_build_object(
    'total_count', COALESCE(ss.total_count, 0),
    'total_area', COALESCE(ss.total_area, 0),
    'mortgaged_count', COALESCE(ss.mortgaged_count, 0),
    'total_mortgage_valuation', COALESCE(ss.total_mortgage_valuation, 0),
    'in_stock_count', COALESCE(ss.in_stock_count, 0),
    'total_accessible_assets', COALESCE(os.total_accessible, 0),
    'total_accessible_mortgaged', COALESCE(os.total_accessible_mortgaged, 0),
    'by_warehouse', COALESCE((SELECT jsonb_agg(w) FROM warehouse_agg w), '[]'::jsonb),
    'by_project', COALESCE((SELECT jsonb_agg(p) FROM project_agg p), '[]'::jsonb),
    'by_mortgage_bank', COALESCE((SELECT jsonb_agg(b) FROM bank_agg b), '[]'::jsonb)
  )
  INTO v_result
  FROM summary_stats ss, overall_stats os;

  RETURN COALESCE(v_result, jsonb_build_object(
    'total_count', 0, 'total_area', 0, 'mortgaged_count', 0,
    'total_mortgage_valuation', 0, 'in_stock_count', 0,
    'total_accessible_assets', 0, 'total_accessible_mortgaged', 0,
    'by_warehouse', '[]'::jsonb, 'by_project', '[]'::jsonb, 'by_mortgage_bank', '[]'::jsonb
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION get_report_statistics(text, uuid, uuid, text, text) TO authenticated, anon;

COMMIT;