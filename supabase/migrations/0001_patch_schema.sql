alter table assets add column if not exists certificate_group text check (certificate_group in ('so_lon','so_nho'));
alter table assets add column if not exists lot_no text;
alter table assets add column if not exists usage_term_type text check (usage_term_type in ('fixed_date','long_term'));
alter table assets add column if not exists usage_term_date date;

-- migrate usage_term to usage_term_type
update assets set usage_term_type = case when usage_term ilike '%lâu dài%' then 'long_term' else 'fixed_date' end where usage_term is not null;
alter table assets drop column if exists usage_term;

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
        mortgage_bank_2 = p_details->>'bank_2',
        mortgage_unit_2 = p_details->>'mortgage_unit_2',
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
          certificate_no, project_id, subdivision, lot_no, area, owner_name, warehouse_id, parent_asset_id,
          custody_status, lifecycle_status, sale_status, mortgage_status,
          map_sheet_no, land_lot_no, province, district, ward, address_detail, usage_purpose, usage_term_type, usage_term_date,
          asset_type, certificate_group, registry_no, registry_date, managing_unit
        )
        select 
          c->>'certificate_no',
          v_asset.project_id,
          coalesce(c->>'subdivision', v_asset.subdivision),
          c->>'lot_no',
          (c->>'area')::numeric,
          v_asset.owner_name,
          v_asset.warehouse_id,
          v_asset.id,
          'in_stock',
          'active',
          'not_ready',
          'none',
          v_asset.map_sheet_no,
          c->>'land_lot_no',
          v_asset.province,
          v_asset.district,
          v_asset.ward,
          v_asset.address_detail,
          v_asset.usage_purpose,
          v_asset.usage_term_type,
          v_asset.usage_term_date,
          v_asset.asset_type,
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
