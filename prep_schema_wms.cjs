const fs = require('fs');
let schema = fs.readFileSync('supabase-schema.sql', 'utf8');

const wmsTable = `
-- ============================================================
-- 12. Storage Locations (WMS)
-- ============================================================
create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid references warehouses(id) not null,
  floor text,
  row text,
  shelf text,
  box text,
  capacity int,
  created_at timestamptz default now()
);
alter table storage_locations enable row level security;
create policy "Storage locations visible to all users" on storage_locations for select using (true);
create policy "WMS manager can manage storage locations" on storage_locations for all using (has_permission('asset.manage'));

alter table assets add column location_id uuid references storage_locations(id);
`;

if (!schema.includes('storage_locations')) {
  schema += wmsTable;
  fs.writeFileSync('supabase-schema.sql', schema);
}
