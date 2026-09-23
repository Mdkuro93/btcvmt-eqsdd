-- Migration 0030: has_permission() — nhóm quản trị (super_admin, admin, btc_manager) luôn có toàn bộ quyền
--
-- Nguyên nhân lỗi "Permission denied" khi Admin duyệt đề xuất GCN:
--   * Giao diện (src/lib/permissions.ts, getEffectivePermissions) quy định super_admin / admin / btc_manager
--     LUÔN có toàn bộ quyền -> nút "Duyệt" hiện ra.
--   * Nhưng hàm has_permission() trong DB chỉ đọc mảng permissions lưu trong hồ sơ. Hồ sơ admin@btcvmt.vn
--     có permissions = {} (mảng rỗng) nên has_permission('request.approve') = false -> RPC từ chối.
--
-- Phạm vi thay đổi: CHỈ nhóm super_admin / admin / btc_manager (và chỉ khi status = 'active').
-- Với mọi vai trò khác, kết quả giữ NGUYÊN như hàm cũ (0000_initial_schema.sql).

CREATE OR REPLACE FUNCTION public.has_permission(perm text) RETURNS boolean AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN p.role IN ('super_admin', 'admin', 'btc_manager') THEN (p.status = 'active')
        ELSE perm = ANY(COALESCE(p.permissions, public.default_permissions_for_role(p.role)))
      END
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- ROLLBACK (bản gốc trong 0000_initial_schema.sql) — chỉ chạy nếu có sự cố:
--
-- create or replace function has_permission(perm text) returns boolean as $$
--   select perm = any(coalesce(
--     (select permissions from profiles where id = auth.uid()),
--     default_permissions_for_role((select role from profiles where id = auth.uid()))
--   ));
-- $$ language sql stable security definer;
-- ==============================================================================