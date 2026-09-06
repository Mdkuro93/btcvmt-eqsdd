-- 0013_fix_re_dept_permissions.sql
-- Cập nhật lại quyền mặc định (default_permissions_for_role) cho role re_dept
-- Bổ sung thêm quyền 'asset.checkout' và 'asset.checkin' để khối SPG có thể mượn/trả GCN.

CREATE OR REPLACE FUNCTION default_permissions_for_role(p_role text)
RETURNS text[] AS $$
  SELECT CASE p_role
    WHEN 'btc_manager' THEN array['asset.checkout','asset.checkin','asset.split','asset.mortgage','asset.sale_update','request.approve','asset.manage','log.view','report.view','admin.manage']
    WHEN 'capital_dept' THEN array['asset.checkout','asset.checkin','asset.split','asset.mortgage','report.view']
    WHEN 'project_dept' THEN array['asset.checkout','asset.checkin','asset.split','report.view']
    WHEN 're_dept' THEN array['asset.checkout','asset.checkin','asset.sale_update','report.view']
    WHEN 'supervisor' THEN array['report.view','access.view']
    WHEN 'investor' THEN array['asset.view','asset.checkout','asset.checkin']
    ELSE array[]::text[]
  END;
$$ LANGUAGE sql IMMUTABLE;
