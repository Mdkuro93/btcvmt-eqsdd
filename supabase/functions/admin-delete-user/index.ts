// Edge Function: admin-delete-user
// Xóa HẲN tài khoản (cả public.profiles lẫn auth.users). Chạy với Service Role Key.
// Quy tắc: chỉ super_admin / admin; cấp bậc phải CAO HƠN người bị xóa (super_admin xóa được mọi người khác);
// không cho tự xóa chính mình. Vì không cho tự xóa, super_admin cuối cùng không bao giờ bị xóa.
// Nếu tài khoản đã có dữ liệu nghiệp vụ liên quan (phiếu, yêu cầu, kiểm kê...) thì KHÔNG xóa và báo rõ lý do.
import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-application-name: app (src/lib/supabase.ts) gửi kèm header này trên MỌI request, kể cả gọi Edge Function.
  // Thiếu nó trong danh sách -> trình duyệt chặn ở bước preflight -> "Failed to send a request to the Edge Function".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  btc_manager: 60,
  warehouse_manager: 40,
}
const rankOf = (role?: string | null) => ROLE_RANK[role ?? ''] ?? 0

const ALLOWED_CALLER_ROLES = ['super_admin', 'admin']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const HAS_HISTORY_MESSAGE =
  'Không thể xóa vì tài khoản này đã phát sinh dữ liệu nghiệp vụ (phiếu, yêu cầu, kiểm kê...). ' +
  'Hãy chuyển trạng thái sang "Vô hiệu hóa" thay vì xóa.'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { success: false, message: 'Method not allowed' })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      return json(500, { success: false, message: 'Cấu hình máy chủ thiếu khóa Supabase.' })
    }

    // 1. Xác thực người gọi
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { success: false, message: 'Thiếu thông tin xác thực.' })

    // Xác thực JWT bằng cách TRUYỀN TRỰC TIẾP token vào getUser(token) (cách chính thức cho Edge Function).
    // Không dùng getUser() không tham số: bản supabase-js cũ không đọc được header Authorization -> luôn báo "session missing".
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const { data: userData, error: userError } = await adminClient.auth.getUser(token)
    const callerUser = userData?.user
    if (userError || !callerUser) {
      return json(401, {
        success: false,
        message: 'Phiên đăng nhập không hợp lệ' + (userError?.message ? ` (${userError.message})` : '') + '. Hãy đăng xuất và đăng nhập lại.',
      })
    }

    const { data: caller, error: callerError } = await adminClient
      .from('profiles')
      .select('id, role, status')
      .eq('id', callerUser.id)
      .maybeSingle()

    // Mỗi lý do từ chối có một thông báo riêng để biết chính xác đang vướng ở đâu
    if (callerError) {
      return json(500, { success: false, message: 'Không đọc được hồ sơ người gọi: ' + callerError.message })
    }
    if (!caller) {
      return json(403, { success: false, message: 'Không tìm thấy hồ sơ ứng với tài khoản đang đăng nhập (id không khớp bảng profiles).' })
    }
    if (caller.status !== 'active') {
      return json(403, { success: false, message: `Tài khoản của bạn đang ở trạng thái "${caller.status}", không phải "active".` })
    }
    if (!ALLOWED_CALLER_ROLES.includes(caller.role)) {
      return json(403, { success: false, message: `Vai trò hiện tại của bạn ("${caller.role}") không được phép xóa tài khoản người dùng.` })
    }

    // 2. Đầu vào
    let body: any
    try {
      body = await req.json()
    } catch {
      return json(400, { success: false, message: 'Dữ liệu gửi lên không hợp lệ.' })
    }
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    if (!UUID_RE.test(userId)) return json(400, { success: false, message: 'ID người dùng không hợp lệ.' })
    if (userId === callerUser.id) {
      return json(400, { success: false, message: 'Bạn không thể tự xóa tài khoản của chính mình.' })
    }

    // 3. Kiểm tra cấp bậc
    const { data: target } = await adminClient.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (!target) return json(404, { success: false, message: 'Không tìm thấy tài khoản cần xóa.' })

    if (caller.role !== 'super_admin' && rankOf(caller.role) <= rankOf(target.role)) {
      return json(403, { success: false, message: 'Bạn không được xóa tài khoản có cấp bậc ngang hoặc cao hơn.' })
    }

    // 4. Xóa profile trước: nếu còn dữ liệu nghiệp vụ tham chiếu (FK) thì dừng ngay, chưa đụng tới auth.users
    const { error: profileDeleteError } = await adminClient.from('profiles').delete().eq('id', userId)
    if (profileDeleteError) {
      const isFkViolation =
        profileDeleteError.code === '23503' || /foreign key|violates/i.test(profileDeleteError.message || '')
      return json(isFkViolation ? 409 : 400, {
        success: false,
        message: isFkViolation ? HAS_HISTORY_MESSAGE : profileDeleteError.message,
      })
    }

    // 5. Xóa tài khoản đăng nhập trong auth.users
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      const notFound = (authDeleteError as any).status === 404 || /not found/i.test(authDeleteError.message || '')
      if (!notFound) {
        // Hoàn tác: khôi phục lại hồ sơ đã xóa để không tạo trạng thái nửa vời
        const { error: restoreError } = await adminClient.from('profiles').insert(target)
        return json(500, {
          success: false,
          message:
            'Xóa tài khoản đăng nhập thất bại: ' + authDeleteError.message +
            (restoreError ? ' (Cảnh báo: không khôi phục được hồ sơ, cần kiểm tra thủ công.)' : ' Hồ sơ đã được giữ nguyên.'),
        })
      }
      // notFound: tài khoản auth vốn không tồn tại (hồ sơ mồ côi) -> coi như đã dọn xong
    }

    return json(200, { success: true, message: 'Đã xóa tài khoản.' })
  } catch (err: any) {
    return json(500, { success: false, message: err?.message || 'Internal Server Error' })
  }
})