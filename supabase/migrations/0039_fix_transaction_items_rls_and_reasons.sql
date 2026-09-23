-- ==============================================================================
-- Migration 0039: Sửa lỗi RLS 42501 khi tạo transaction_items và bổ sung RPC tạo giao dịch
-- ==============================================================================
-- 1. NGUYÊN NHÂN GỐC RỄ:
--    - Constraint `transaction_items_reason_check` và policy RLS INSERT trên `transaction_items`
--      trong migration 0016 trước đây thiếu lý do 'sang tên cho khách' và 'khác'.
--    - Policy RLS INSERT trên `transaction_items` trước đây yêu cầu `a.warehouse_id = ANY(p.assigned_warehouse_ids)`
--      mà không xử lý trường hợp user chưa bị gán cứng giới hạn kho (assigned_warehouse_ids IS NULL hoặc rỗng),
--      khiến các tài khoản chuyên môn không tạo được yêu cầu xuất/nhập kho.
--    - Role 'investor' và 'warehouse_manager' thiếu quyền tạo phiếu trong policy `transactions`.
--
-- 2. GIẢI PHÁP:
--    - Cập nhật CHECK constraint `transaction_items_reason_check` hỗ trợ đầy đủ 13 lý do chuẩn.
--    - Cập nhật RLS INSERT trên bảng `transactions` và `transaction_items` theo đúng phân quyền Rule 4.
--    - Bổ sung RPC atomic `create_transaction_request` để tạo transaction và transaction_items trong 1 lệnh duy nhất.
-- ==============================================================================

-- 1. CẬP NHẬT CHECK CONSTRAINT CHO transaction_items.reason
ALTER TABLE public.transaction_items DROP CONSTRAINT IF EXISTS transaction_items_reason_check;
ALTER TABLE public.transaction_items ADD CONSTRAINT transaction_items_reason_check CHECK (
  reason IS NULL OR reason IN (
    'mượn',
    'thế chấp',
    'chuyển nhượng',
    'xuất bán',
    'sang tên cho khách',
    'tách sổ',
    'thu hồi',
    'đổi sổ',
    'trả',
    'giải chấp',
    'nhập sau bán',
    'cấp mới',
    'khác'
  )
);

-- 2. CẬP NHẬT RLS INSERT CHO BẢNG transactions
DROP POLICY IF EXISTS "Tạo transaction đúng theo permission của role" ON public.transactions;
CREATE POLICY "Tạo transaction đúng theo permission của role"
ON public.transactions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
      OR (p.role IN ('capital_dept', 'project_dept', 're_dept', 'investor') AND type IN ('checkout', 'checkin'))
    )
  )
);

-- 3. CẬP NHẬT RLS INSERT CHO BẢNG transaction_items
DROP POLICY IF EXISTS "Tạo transaction_items cho user active" ON public.transaction_items;
CREATE POLICY "Tạo transaction_items cho user active"
ON public.transaction_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    JOIN public.assets a ON a.id = transaction_items.asset_id
    WHERE p.id = auth.uid() 
    AND p.status = 'active'
    AND (
      p.role IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager')
      OR (
        p.role = 'capital_dept' 
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason IN ('mượn', 'thế chấp', 'chuyển nhượng', 'khác')) OR 
          (transaction_items.type = 'checkin' AND transaction_items.reason IN ('trả', 'giải chấp', 'chuyển nhượng', 'khác'))
        )
        AND (
          p.assigned_warehouse_ids IS NULL 
          OR cardinality(p.assigned_warehouse_ids) = 0 
          OR a.warehouse_id IS NULL 
          OR a.warehouse_id = ANY(p.assigned_warehouse_ids)
        )
      )
      OR (
        p.role = 'project_dept' 
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason IN ('mượn', 'sang tên cho khách', 'tách sổ', 'thu hồi', 'đổi sổ', 'khác')) OR
          (transaction_items.type = 'checkin' AND transaction_items.reason IN ('trả', 'tách sổ', 'đổi sổ', 'khác'))
        )
        AND (
          p.assigned_warehouse_ids IS NULL 
          OR cardinality(p.assigned_warehouse_ids) = 0 
          OR a.warehouse_id IS NULL 
          OR a.warehouse_id = ANY(p.assigned_warehouse_ids)
        )
      )
      OR (
        p.role = 're_dept' 
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason IN ('mượn', 'xuất bán', 'khác')) OR
          (transaction_items.type = 'checkin' AND transaction_items.reason IN ('trả', 'nhập sau bán', 'khác'))
        )
        AND (
          p.assigned_warehouse_ids IS NULL 
          OR cardinality(p.assigned_warehouse_ids) = 0 
          OR a.warehouse_id IS NULL 
          OR a.warehouse_id = ANY(p.assigned_warehouse_ids)
        )
      )
      OR (
        p.role = 'investor'
        AND (
          (transaction_items.type = 'checkout' AND transaction_items.reason IN ('mượn', 'khác')) OR
          (transaction_items.type = 'checkin' AND transaction_items.reason IN ('trả', 'khác'))
        )
        AND (
          p.owner_entity_ids IS NULL 
          OR cardinality(p.owner_entity_ids) = 0 
          OR a.current_owner_entity_id = ANY(p.owner_entity_ids)
        )
      )
    )
  )
);

-- 4. RPC TẠO PHIẾU YÊU CẦU ATOMIC (create_transaction_request)
CREATE OR REPLACE FUNCTION public.create_transaction_request(
  p_type text,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_tx_id uuid;
  v_item jsonb;
  v_asset_id uuid;
  v_item_type text;
  v_item_reason text;
  v_item_details jsonb;
  v_new_item_id uuid;
  v_items_result jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa xác thực người dùng (unauthenticated)';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hồ sơ người dùng không hợp lệ hoặc tài khoản chưa được kích hoạt';
  END IF;

  IF v_profile.role NOT IN ('super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'investor') THEN
    RAISE EXCEPTION 'Tài khoản không có quyền gửi yêu cầu giao dịch kho';
  END IF;

  -- 1. Insert master transaction
  INSERT INTO public.transactions (type, notes, created_by)
  VALUES (p_type, p_notes, v_user_id)
  RETURNING id INTO v_tx_id;

  -- 2. Insert transaction items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_asset_id := (v_item->>'asset_id')::uuid;
    v_item_type := coalesce(v_item->>'type', p_type);
    v_item_details := coalesce(v_item->'details', '{}'::jsonb);
    v_item_reason := coalesce(v_item->>'reason', v_item_details->>'reason');

    INSERT INTO public.transaction_items (
      transaction_id,
      asset_id,
      type,
      reason,
      details,
      status
    )
    VALUES (
      v_tx_id,
      v_asset_id,
      v_item_type,
      v_item_reason,
      v_item_details,
      'pending'
    )
    RETURNING id INTO v_new_item_id;

    v_items_result := v_items_result || jsonb_build_object(
      'id', v_new_item_id,
      'transaction_id', v_tx_id,
      'asset_id', v_asset_id,
      'type', v_item_type,
      'reason', v_item_reason,
      'details', v_item_details,
      'status', 'pending'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_tx_id,
    'type', p_type,
    'notes', p_notes,
    'created_by', v_user_id,
    'items', v_items_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_request(text, text, jsonb) TO authenticated;
