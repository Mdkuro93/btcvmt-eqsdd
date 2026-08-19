const fs = require('fs');
let schema = fs.readFileSync('supabase-schema.sql', 'utf8');

const oldRpc = `    elsif v_type = 'split' then
      update assets
      set
        lifecycle_status = 'split',
        updated_at = now()
      where id = v_item.asset_id;
    end if;`;

const newRpc = `    elsif v_type = 'split' then
      update assets
      set
        lifecycle_status = 'invalidated',
        custody_status = 'in_stock',
        updated_at = now()
      where id = v_item.asset_id;

      -- Insert child assets from details->'splitChildren' array
      if p_details ? 'splitChildren' and jsonb_typeof(p_details->'splitChildren') = 'array' then
        insert into assets (
          certificate_no, project_id, subdivision, area, owner_name, warehouse_id, parent_asset_id,
          custody_status, lifecycle_status, sale_status, mortgage_status,
          map_sheet_no, land_lot_no, province, district, ward, address_detail, land_use_purpose, land_use_term
        )
        select 
          c->>'certificate_no',
          v_asset.project_id,
          coalesce(c->>'subdivision', v_asset.subdivision),
          (c->>'area')::numeric,
          v_asset.owner_name,
          v_asset.warehouse_id,
          v_asset.id,
          'in_stock',
          'active',
          'not_ready',
          'none',
          v_asset.map_sheet_no,
          v_asset.land_lot_no,
          v_asset.province,
          v_asset.district,
          v_asset.ward,
          v_asset.address_detail,
          v_asset.land_use_purpose,
          v_asset.land_use_term
        from jsonb_array_elements(p_details->'splitChildren') as c
        where c->>'certificate_no' is not null;
      end if;
    end if;`;

schema = schema.replace(oldRpc, newRpc);
fs.writeFileSync('supabase-schema.sql', schema);
