const fs = require('fs');
let schema = fs.readFileSync('supabase-schema.sql', 'utf8');

// 1. Warehouses
schema = schema.replace(
  'is_central boolean not null default false,',
  'code text,\n  region_code text,\n  is_central boolean not null default false,'
);

// 2. Assets
schema = schema.replace(
  '  asset_type text,\n  land_plot_no text,\n  map_sheet_no text,\n  address text,\n  registry_no text,\n  registry_date date,\n  managing_unit text,\n  usage_purpose text,\n  usage_term text,\n  notes text,',
  `  asset_type text,
  land_lot_no text,
  map_sheet_no text,
  province text,
  district text,
  ward text,
  address_detail text,
  registry_no text,
  registry_date date,
  managing_unit text,
  usage_purpose text,
  usage_term text,
  notes text,
  
  mortgage_bank text,
  mortgage_unit text,
  mortgage_valuation numeric,
  mortgage_expected_release_date date,
  
  scan_file_url text,
  parent_asset_id uuid references assets(id),
  
  expected_return_date date,
  borrow_purpose text,`
);

// 3. Transaction Items
schema = schema.replace(
  '  asset_id uuid references assets(id) not null,\n  status text not null default \'pending\' check (status in (\'pending\',\'approved\',\'rejected\',\'completed\')),\n  decided_by uuid references profiles(id),\n  decided_at timestamptz,\n  notes text',
  `  asset_id uuid references assets(id) not null,
  type text not null,
  details jsonb not null default '{}'::jsonb,
  voucher_code text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  decision_notes text,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  notes text`
);

// 4. Add Realtime and RPC at the end
schema += `

-- ============================================================
-- 11. RPC functions & Realtime
-- ============================================================

-- Function to safely apply a transaction item decision to an asset
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

  -- Verify permissions
  if not has_permission('request.approve') then
    raise exception 'Permission denied';
  end if;

  -- Update transaction_item
  update transaction_items
  set
    status = p_status,
    decision_notes = p_notes,
    details = coalesce(p_details, details),
    voucher_code = coalesce(p_voucher_code, voucher_code),
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_item_id;

  -- Apply changes to asset if approved
  if p_status = 'approved' then
    v_type := v_item.type;
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
        mortgage_valuation = (p_details->>'valuation')::numeric,
        mortgage_expected_release_date = (p_details->>'expected_release_date')::date,
        updated_at = now()
      where id = v_item.asset_id;
    elsif v_type = 'sale_update' then
      update assets
      set
        sale_status = p_details->>'sale_status',
        updated_at = now()
      where id = v_item.asset_id;
    elsif v_type = 'split' then
      update assets
      set
        lifecycle_status = 'split',
        updated_at = now()
      where id = v_item.asset_id;
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- Enable realtime
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table assets;
alter publication supabase_realtime add table transaction_items;
`;

fs.writeFileSync('supabase-schema.sql', schema);
