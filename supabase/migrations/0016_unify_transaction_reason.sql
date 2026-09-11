-- 0016_unify_transaction_reason.sql

-- 1. Bổ sung cột reason
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS reason text;

-- 2. Migrate dữ liệu cũ để không mất lịch sử (map type cũ sang type+reason mới)
UPDATE transaction_items SET reason = 'mượn' WHERE type = 'checkout' AND reason IS NULL;
UPDATE transaction_items SET reason = 'trả' WHERE type = 'checkin' AND reason IS NULL;
UPDATE transaction_items SET type = 'checkout', reason = 'thế chấp' WHERE type = 'mortgage';
UPDATE transaction_items SET type = 'checkout', reason = 'xuất bán' WHERE type = 'sale_update';
UPDATE transaction_items SET type = 'checkout', reason = 'tách sổ' WHERE type = 'split';

-- 3. Cập nhật CHECK constraint của cột type (chỉ còn 'checkout', 'checkin') và thêm constraint cho reason
ALTER TABLE transaction_items DROP CONSTRAINT IF EXISTS transaction_items_type_check;
ALTER TABLE transaction_items ADD CONSTRAINT transaction_items_type_check CHECK (type IN ('checkout', 'checkin'));

ALTER TABLE transaction_items DROP CONSTRAINT IF EXISTS transaction_items_reason_check;
ALTER TABLE transaction_items ADD CONSTRAINT transaction_items_reason_check CHECK (reason IN (
    'mượn','thế chấp','chuyển nhượng','xuất bán','tách sổ','thu hồi','đổi sổ','trả','giải chấp','nhập sau bán','cấp mới'
));

-- 4. Sửa lại RLS INSERT của transaction_items
DROP POLICY IF EXISTS "Tạo transaction_items cho user active" ON transaction_items;
CREATE POLICY "Tạo transaction_items cho user active"
ON transaction_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p 
    JOIN assets a ON a.id = transaction_items.asset_id
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
      OR (
        p.role = 'capital_dept' 
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason IN ('mượn','thế chấp','chuyển nhượng')) OR 
          (transaction_items.type = 'checkin' AND transaction_items.reason IN ('trả','giải chấp','chuyển nhượng'))
        )
        AND a.warehouse_id = ANY(p.assigned_warehouse_ids)
      )
      OR (
        p.role = 'project_dept' 
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason IN ('mượn','tách sổ','thu hồi','đổi sổ')) OR
          (transaction_items.type = 'checkin' AND transaction_items.reason IN ('trả','tách sổ','đổi sổ'))
        )
        AND a.warehouse_id = ANY(p.assigned_warehouse_ids)
      )
      OR (
        p.role = 're_dept' 
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason IN ('mượn','xuất bán')) OR
          (transaction_items.type = 'checkin' AND transaction_items.reason IN ('trả','nhập sau bán'))
        )
        AND a.warehouse_id = ANY(p.assigned_warehouse_ids)
      )
      OR (
        p.role = 'investor'
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason = 'mượn') OR
          (transaction_items.type = 'checkin' AND transaction_items.reason = 'trả')
        )
        AND a.current_owner_entity_id = ANY(p.owner_entity_ids)
      )
    )
  )
);
