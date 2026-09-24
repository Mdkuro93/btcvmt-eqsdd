-- Migration 0043: Thêm cột scan_url cho bảng requests và transactions
-- Hỗ trợ lưu trữ đường dẫn file scan OneDrive/SharePoint dùng chung cho nhiều GCN trong 1 phiếu yêu cầu

DO $$
BEGIN
  -- 1. Bổ sung cột scan_url vào bảng transactions (Bảng chính của Phiếu yêu cầu xuất/nhập kho)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'scan_url') THEN
      ALTER TABLE public.transactions ADD COLUMN scan_url TEXT;
      COMMENT ON COLUMN public.transactions.scan_url IS 'Link bản scan OneDrive/SharePoint đính kèm phiếu yêu cầu';
    END IF;
  END IF;

  -- 2. Bổ sung cột scan_url vào bảng requests (nếu hệ thống đã hoặc sẽ có bảng public.requests riêng)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'requests' AND column_name = 'scan_url') THEN
      ALTER TABLE public.requests ADD COLUMN scan_url TEXT;
      COMMENT ON COLUMN public.requests.scan_url IS 'Link bản scan OneDrive/SharePoint đính kèm';
    END IF;
  ELSE
    -- Tạo bảng requests với scan_url để tương thích hoàn toàn nếu client truy vấn trực tiếp
    CREATE TABLE IF NOT EXISTS public.requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL DEFAULT 'checkin',
      notes TEXT,
      scan_url TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  -- 3. Bổ sung cột scan_url vào bảng asset_declaration_requests (Đề xuất cấp mới/tách sổ)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'asset_declaration_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'asset_declaration_requests' AND column_name = 'scan_url') THEN
      ALTER TABLE public.asset_declaration_requests ADD COLUMN scan_url TEXT;
      COMMENT ON COLUMN public.asset_declaration_requests.scan_url IS 'Link bản scan tài liệu đính kèm đề xuất';
    END IF;
  END IF;
END $$;

-- 4. Cập nhật RPC atomic create_transaction_request để nhận thêm tham số p_scan_url
DROP FUNCTION IF EXISTS public.create_transaction_request(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_transaction_request(
  p_type text,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_scan_url text DEFAULT NULL
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

  -- 1. Insert master transaction kèm scan_url
  INSERT INTO public.transactions (type, notes, scan_url, created_by)
  VALUES (p_type, p_notes, p_scan_url, v_user_id)
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
    'scan_url', p_scan_url,
    'created_by', v_user_id,
    'items', v_items_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_request(text, text, jsonb, text) TO authenticated;
