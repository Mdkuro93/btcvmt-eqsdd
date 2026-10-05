-- 0068_lock_down_internal_declaration_function.sql
-- Lý do: public._process_single_declaration_approval(uuid,text,uuid) là hàm NỘI BỘ (0065), KHÔNG kiểm tra quyền duyệt
--        (chỉ lấy auth.uid()). Hàm bọc approve_asset_declaration_request(s_bulk) mới kiểm tra has_permission('request.approve').
--        Nhưng 0061 vẫn cấp EXECUTE cho authenticated -> MỌI tài khoản đăng nhập (viewer, investor...) có thể gọi RPC
--        trực tiếp để duyệt khai báo bất kỳ: tạo GCN vào kho, vô hiệu/giảm diện tích GCN gốc.
-- Sửa: thu hồi EXECUTE khỏi PUBLIC/anon/authenticated. Hai hàm bọc là SECURITY DEFINER nên vẫn gọi được hàm này.
-- Phạm vi: CHỈ đổi quyền EXECUTE của đúng 1 hàm. Không đổi nội dung hàm.
BEGIN;

DO $$
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.approve_asset_declaration_request(uuid,text,text,text)'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.approve_asset_declaration_requests_bulk(jsonb)'::regprocedure) THEN
    RAISE EXCEPTION '0068 dừng: hàm bọc không phải SECURITY DEFINER, thu hồi quyền sẽ làm hỏng luồng duyệt.';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public._process_single_declaration_approval(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._process_single_declaration_approval(uuid, text, uuid) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public._process_single_declaration_approval(uuid,text,uuid)', 'execute') THEN
    RAISE EXCEPTION '0068 dừng: authenticated vẫn gọi được hàm nội bộ.';
  END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- GRANT EXECUTE ON FUNCTION public._process_single_declaration_approval(uuid,text,uuid) TO authenticated;
