-- ============================================================
-- SCHEMA v8 — Quyền chi tiết theo từng user (permissions override role),
-- hàm tra cứu giới hạn trường dữ liệu cho Viewer (không cho xem toàn bộ danh mục)
-- Paste toàn bộ vào Supabase SQL Editor và Run (an toàn chạy lại nhiều lần).
-- ============================================================

drop table if exists activity_logs cascade;
drop table if exists asset_lineage_links cascade;
drop table if exists asset_lineage_events cascade;
drop table if exists collaterals cascade;
drop table if exists transaction_items cascade;
drop table if exists transactions cascade;
drop table if exists assets cascade;
drop table if exists warehouses cascade;
drop table if exists projects cascade;
drop table if exists areas cascade;
drop table if exists regions cascade;
drop table if exists profiles cascade;

-- ============================================================
-- 1. REGIONS (Vùng)
-- ============================================================
create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into regions (name) values ('Miền Bắc'), ('Miền Trung'), ('Miền Nam');

-- ============================================================
-- 2. AREAS (Địa bàn)
-- ============================================================
create table areas (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references regions(id) not null,
  name text not null,
  unique (region_id, name)
);

insert into areas (region_id, name)
select id, 'Đà Nẵng' from regions where name = 'Miền Trung'
union all
select id, 'Quảng Nam' from regions where name = 'Miền Trung'
union all
select id, 'Huế' from regions where name = 'Miền Trung';

-- ============================================================
-- 3. WAREHOUSES (Kho quản lý)
-- ============================================================
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_id uuid references regions(id),
  is_central boolean not null default false,
  created_at timestamptz default now()
);

insert into warehouses (name, region_id, is_central)
select 'Kho BTC VMT', id, true from regions where name = 'Miền Trung';

-- ============================================================
-- 4. PROFILES — phạm vi (Vùng>Địa bàn>Dự án>all) + quyền chi tiết (permissions)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer' check (role in (
    'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'viewer'
  )),
  region_id uuid references regions(id),
  area_id uuid references areas(id),
  project_ids uuid[],
  permissions text[],              -- NULL = dùng mặc định theo role; có giá trị = ghi đè chi tiết cho riêng user này
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz default now()
);

-- Mặc định quyền theo role (dùng làm fallback khi permissions IS NULL)
create or replace function default_permissions_for_role(p_role text)
returns text[] as $$
  select case p_role
    when 'btc_manager' then array['asset.checkout','asset.checkin','asset.split','asset.mortgage','asset.sale_update','request.approve','asset.manage','log.view','report.view','admin.manage']
    when 'capital_dept' then array['asset.checkout','asset.checkin','asset.split','asset.mortgage','report.view']
    when 'project_dept' then array['asset.checkout','asset.checkin','asset.split','report.view']
    when 're_dept' then array['asset.sale_update','report.view']
    else array[]::text[]
  end;
$$ language sql immutable;

create or replace function handle_new_user()
returns trigger as $$
declare
  default_region_id uuid;
begin
  select id into default_region_id from regions where name = 'Miền Trung' limit 1;
  insert into public.profiles (id, email, full_name, role, region_id, permissions)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer', default_region_id, default_permissions_for_role('viewer'));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function current_role_name() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_region_id() returns uuid as $$
  select region_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_area_id() returns uuid as $$
  select area_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_project_ids() returns uuid[] as $$
  select project_ids from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Quyền hiệu lực của user hiện tại: permissions riêng nếu có, không thì theo mặc định của role
create or replace function has_permission(perm text) returns boolean as $$
  select perm = any(coalesce(
    (select permissions from profiles where id = auth.uid()),
    default_permissions_for_role((select role from profiles where id = auth.uid()))
  ));
$$ language sql stable security definer;

create or replace function can_request(tx_type text) returns boolean as $$
  select
    (tx_type = 'checkout' and has_permission('asset.checkout'))
    or (tx_type = 'checkin' and has_permission('asset.checkin'))
    or (tx_type = 'split' and has_permission('asset.split'))
    or (tx_type = 'mortgage' and has_permission('asset.mortgage'))
    or (tx_type = 'sale_update' and has_permission('asset.sale_update'));
$$ language sql stable security definer;

create or replace function project_in_scope(p_region_id uuid, p_area_id uuid, p_project_id uuid) returns boolean as $$
  select
    current_role_name() = 'btc_manager'
    or (
      (current_region_id() is null or p_region_id = current_region_id())
      and (current_area_id() is null or p_area_id = current_area_id())
      and (current_project_ids() is null or p_project_id = any(current_project_ids()))
    );
$$ language sql stable security definer;

-- ============================================================
-- 5. PROJECTS
-- ============================================================
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area_id uuid references areas(id) not null,
  created_at timestamptz default now()
);

-- ============================================================
-- 6. ASSETS
-- ============================================================
create table assets (
  id uuid primary key default gen_random_uuid(),
  certificate_no text unique not null,
  project_id uuid references projects(id),
  subdivision text,
  area numeric,
  owner_name text,

  custody_status text not null default 'in_stock' check (custody_status in ('in_stock','checked_out')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','split','invalidated')),
  sale_status text not null default 'not_ready' check (sale_status in ('not_ready','ready_for_sale','sold')),
  mortgage_status text not null default 'none' check (mortgage_status in ('none','mortgaged')),

  warehouse_id uuid references warehouses(id),
  current_holder_dept text,

  asset_type text,
  land_plot_no text,
  map_sheet_no text,
  address text,
  registry_no text,
  registry_date date,
  managing_unit text,
  usage_purpose text,
  usage_term text,
  notes text,

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 7. TRANSACTIONS + TRANSACTION_ITEMS
-- ============================================================
create table transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('checkout','checkin','split','mortgage','sale_update')),
  requester_id uuid references profiles(id) not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade not null,
  asset_id uuid references assets(id) not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  notes text
);

-- ============================================================
-- 8. COLLATERALS
-- ============================================================
create table collaterals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) not null,
  transaction_id uuid references transactions(id),
  bank text,
  borrower text,
  valuation numeric,
  guarantee_ratio numeric,
  status text not null default 'active' check (status in ('active','released')),
  started_at date default current_date,
  released_at date
);

-- ============================================================
-- 9. LINEAGE
-- ============================================================
create table asset_lineage_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('split','merge')),
  decision_no text,
  event_date date default current_date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table asset_lineage_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references asset_lineage_events(id) on delete cascade not null,
  asset_id uuid references assets(id) not null,
  role text not null check (role in ('source','result'))
);

-- ============================================================
-- 10. ACTIVITY_LOGS
-- ============================================================
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  action_type text not null,
  document_no text,
  description text,
  used_by text,
  notes text,
  asset_id uuid references assets(id),
  transaction_id uuid references transactions(id),
  warehouse_id uuid references warehouses(id),
  performed_by uuid references profiles(id),
  region_id uuid references regions(id),
  area_id uuid references areas(id),
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table regions enable row level security;
alter table areas enable row level security;
alter table warehouses enable row level security;
alter table projects enable row level security;
alter table assets enable row level security;
alter table transactions enable row level security;
alter table transaction_items enable row level security;
alter table collaterals enable row level security;
alter table asset_lineage_events enable row level security;
alter table asset_lineage_links enable row level security;
alter table activity_logs enable row level security;

create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_admin" on profiles for update using (has_permission('admin.manage'));

create policy "regions_select_all" on regions for select using (auth.uid() is not null);
create policy "regions_write_admin" on regions for all using (has_permission('admin.manage'));

create policy "areas_select_all" on areas for select using (auth.uid() is not null);
create policy "areas_write_admin" on areas for all using (has_permission('admin.manage'));

create policy "warehouses_select_all" on warehouses for select using (auth.uid() is not null);
create policy "warehouses_write_admin" on warehouses for all using (has_permission('admin.manage'));

-- LƯU Ý: viewer thường KHÔNG có quyền select trực tiếp projects/assets đầy đủ (browse toàn bộ danh mục).
-- Việc "tra cứu" cho viewer phải đi qua hàm lookup_asset_status() bên dưới (chỉ trả về field giới hạn).
create policy "projects_select_scoped" on projects for select using (
  exists (
    select 1 from areas a where a.id = projects.area_id
    and project_in_scope(a.region_id, a.id, projects.id)
  )
  and current_role_name() != 'viewer'
);
create policy "projects_write_admin" on projects for all using (has_permission('admin.manage'));

create policy "assets_select_scoped" on assets for select using (
  exists (
    select 1 from projects p join areas a on a.id = p.area_id
    where p.id = assets.project_id
    and project_in_scope(a.region_id, a.id, p.id)
  )
  and current_role_name() != 'viewer'
);
create policy "assets_write_admin" on assets for insert with check (has_permission('asset.manage'));
create policy "assets_update_admin" on assets for update using (has_permission('asset.manage'));

create policy "transactions_select" on transactions for select using (
  requester_id = auth.uid()
  or (has_permission('request.approve') and exists (
    select 1 from transaction_items ti
    join assets ast on ast.id = ti.asset_id
    join projects p on p.id = ast.project_id
    join areas a on a.id = p.area_id
    where ti.transaction_id = transactions.id
    and project_in_scope(a.region_id, a.id, p.id)
  ))
);
create policy "transactions_insert" on transactions for insert with check (
  requester_id = auth.uid() and can_request(type)
);

create policy "transaction_items_select" on transaction_items for select using (
  exists (
    select 1 from transactions t where t.id = transaction_items.transaction_id
    and (t.requester_id = auth.uid() or has_permission('request.approve'))
  )
);
create policy "transaction_items_insert" on transaction_items for insert with check (
  exists (select 1 from transactions t where t.id = transaction_id and t.requester_id = auth.uid())
);
create policy "transaction_items_decide" on transaction_items for update using (
  has_permission('request.approve')
);

create policy "collaterals_select" on collaterals for select using (
  has_permission('request.approve') or has_permission('asset.mortgage')
);
create policy "collaterals_write" on collaterals for all using (has_permission('request.approve'));

create policy "lineage_events_select_all" on asset_lineage_events for select using (
  auth.uid() is not null and current_role_name() != 'viewer'
);
create policy "lineage_events_write_admin" on asset_lineage_events for all using (has_permission('request.approve'));
create policy "lineage_links_select_all" on asset_lineage_links for select using (
  auth.uid() is not null and current_role_name() != 'viewer'
);
create policy "lineage_links_write_admin" on asset_lineage_links for all using (has_permission('request.approve'));

create policy "activity_logs_select_scoped" on activity_logs for select using (
  has_permission('log.view')
);
create policy "activity_logs_write_admin" on activity_logs for all using (has_permission('request.approve'));

-- ============================================================
-- HÀM TRA CỨU CHO VIEWER — chỉ trả field giới hạn (không owner, không kho chi tiết)
-- Gọi qua supabase.rpc('lookup_asset_status', { p_query: '...' })
-- ============================================================
create or replace function lookup_asset_status(p_query text)
returns table (
  certificate_no text,
  project_name text,
  subdivision text,
  custody_status text,
  lifecycle_status text,
  sale_status text,
  mortgage_status text
) as $$
  select
    a.certificate_no,
    p.name as project_name,
    a.subdivision,
    a.custody_status,
    a.lifecycle_status,
    a.sale_status,
    a.mortgage_status
  from assets a
  left join projects p on p.id = a.project_id
  where auth.uid() is not null
    and (
      a.certificate_no ilike '%' || p_query || '%'
      or a.subdivision ilike '%' || p_query || '%'
    )
  limit 50;
$$ language sql stable security definer;

-- ============================================================
-- Dữ liệu mẫu tối thiểu
-- ============================================================
insert into projects (name, area_id)
select 'Da Nang Downtown', id from areas where name = 'Đà Nẵng'
union all
select 'Quang Nam Riverside', id from areas where name = 'Quảng Nam'
union all
select 'Hue Lakeside', id from areas where name = 'Huế';
