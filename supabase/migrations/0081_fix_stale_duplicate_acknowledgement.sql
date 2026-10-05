-- 0081_fix_stale_duplicate_acknowledgement.sql
-- Sửa lỗi phát hiện khi kiểm thử 0080 (dòng 8): lý do xác nhận trùng của lần trước vẫn nằm lại trên GCN sau khi GCN đổi sang
-- số không trùng; về sau đổi lại thành một số trùng khác thì trigger thấy "đã có lý do" và cho qua mà không hỏi xác nhận mới.
-- Sửa: khi số GCN/dự án thay đổi và KHÔNG còn trùng, xóa duplicate_ack_reason/by/at cũ (trừ khi lý do được gửi mới trong cùng lần cập nhật).
-- Phạm vi: CHỈ viết lại public.assets_certificate_duplicate_guard() (trigger đã gắn từ 0080, không cần gắn lại).
-- Hạn chế đã biết: nếu GCN đang trùng được đổi dự án mà VẪN còn trùng, xác nhận hiện có vẫn được giữ.
BEGIN;

CREATE OR REPLACE FUNCTION public.assets_certificate_duplicate_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_reason   text := NULLIF(btrim(COALESCE(NEW.duplicate_ack_reason, '')), '');
  v_has_ack  boolean := false;
  v_key_changed boolean := false;
  v_hit      record;
BEGIN
  v_has_ack := v_reason IS NOT NULL AND char_length(v_reason) >= 10;

  -- Ghi nhận xác nhận: người/thời điểm do máy chủ quyết định
  IF TG_OP = 'INSERT' THEN
    IF v_has_ack THEN
      NEW.duplicate_ack_reason := v_reason;
      NEW.duplicate_ack_by := COALESCE(auth.uid(), NEW.duplicate_ack_by);
      NEW.duplicate_ack_at := now();
    ELSE
      NEW.duplicate_ack_reason := NULL;
      NEW.duplicate_ack_by := NULL;
      NEW.duplicate_ack_at := NULL;
    END IF;
    v_key_changed := true;
  ELSE
    IF NEW.duplicate_ack_reason IS DISTINCT FROM OLD.duplicate_ack_reason THEN
      IF v_has_ack THEN
        NEW.duplicate_ack_reason := v_reason;
        NEW.duplicate_ack_by := COALESCE(auth.uid(), NEW.duplicate_ack_by);
        NEW.duplicate_ack_at := now();
      ELSE
        NEW.duplicate_ack_reason := NULL;
        NEW.duplicate_ack_by := NULL;
        NEW.duplicate_ack_at := NULL;
      END IF;
    ELSE
      NEW.duplicate_ack_by := OLD.duplicate_ack_by;
      NEW.duplicate_ack_at := OLD.duplicate_ack_at;
    END IF;
    v_key_changed := lower(btrim(COALESCE(NEW.certificate_no, ''))) IS DISTINCT FROM lower(btrim(COALESCE(OLD.certificate_no, '')))
                     OR NEW.project_id IS DISTINCT FROM OLD.project_id;
  END IF;

  IF NOT v_key_changed THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_hit FROM public._find_certificate_duplicate(NEW.certificate_no, NEW.project_id, NEW.id);
  IF FOUND THEN
    IF NOT v_has_ack THEN
      RAISE EXCEPTION 'DUPLICATE_UNCONFIRMED: Số GCN đã tồn tại trong hệ thống. Cần xác nhận đây là trường hợp trùng thật (do cơ quan cấp) kèm lý do tối thiểu 10 ký tự.'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.duplicate_rule := 'certificate_no';
  ELSE
    NEW.duplicate_rule := NULL;
    -- Số GCN không còn trùng: xóa xác nhận cũ để không bị dùng lại cho một trường hợp trùng khác về sau
    -- (trừ khi lý do được gửi mới ngay trong chính lần cập nhật này, vd. xác nhận trùng mã lô / tờ bản đồ).
    IF TG_OP = 'UPDATE' AND NEW.duplicate_ack_reason IS NOT DISTINCT FROM OLD.duplicate_ack_reason THEN
      NEW.duplicate_ack_reason := NULL;
      NEW.duplicate_ack_by := NULL;
      NEW.duplicate_ack_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

-- ROLLBACK: chạy lại nội dung hàm trong 0080_allow_confirmed_duplicate_certificate.sql.