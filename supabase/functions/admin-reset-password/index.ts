// Edge Function: admin-reset-password
// Đặt lại mật khẩu cho tài khoản khác. Chạy với Service Role Key (chỉ tồn tại phía server).
// Quy tắc: người gọi phải đăng nhập, đang active, thuộc nhóm được phép, và có cấp bậc CAO HƠN người bị đặt lại
// (riêng super_admin được đặt lại cho mọi người khác). Không cho tự đặt lại mật khẩu của chính mình.
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

// Cấp bậc: số càng lớn quyền càng cao. Role không liệt kê = 0 (thấp nhất).
const ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  btc_manager: 60,
  warehouse_manager: 40,
}
const rankOf = (role?: string | null) => ROLE_RANK[role ?? ''] ?? 0

// Nhóm được phép đặt lại mật khẩu. (Quản lý kho KHÔNG nằm trong nhóm này.)
const ALLOWED_CALLER_ROLES = ['super_admin', 'admin', 'btc_manager']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_PASSWORD_LENGTH = 6

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { success: false, message: 'Method not allowed' })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      return json(500, { success: false, message: 'Cấu hình máy chủ thiếu khóa Supabase.' })
    }

    // 1. Xác thực người gọi bằng JWT của chính họ
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

    // 2. Đọc hồ sơ người gọi bằng service client (id lấy từ JWT đã xác thực, không lấy từ body)
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
      return json(403, { success: false, message: `Vai trò hiện tại của bạn ("${caller.role}") không được phép đặt lại mật khẩu người dùng.` })
    }

    // 3. Kiểm tra dữ liệu đầu vào
    let body: any
    try {
      body = await req.json()
    } catch {
      return json(400, { success: false, message: 'Dữ liệu gửi lên không hợp lệ.' })
    }
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword.trim() : ''

    if (!UUID_RE.test(userId)) return json(400, { success: false, message: 'ID người dùng không hợp lệ.' })
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return json(400, { success: false, message: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` })
    }
    if (userId === callerUser.id) {
      return json(400, { success: false, message: 'Hãy dùng chức năng "Đổi mật khẩu" để đổi mật khẩu của chính bạn.' })
    }

    // 4. Kiểm tra cấp bậc với người bị đặt lại
    const { data: target } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle()
    if (!target) return json(404, { success: false, message: 'Không tìm thấy tài khoản cần đặt lại mật khẩu.' })

    if (caller.role !== 'super_admin' && rankOf(caller.role) <= rankOf(target.role)) {
      return json(403, { success: false, message: 'Bạn không được đặt lại mật khẩu của tài khoản có cấp bậc ngang hoặc cao hơn.' })
    }

    // 5. Đặt lại mật khẩu qua API chính thức của Supabase Auth
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword })
    if (updateError) return json(400, { success: false, message: updateError.message })

    // Không log và không trả lại mật khẩu / thông tin user
    return json(200, { success: true, message: 'Đã đặt lại mật khẩu thành công.' })
  } catch (err: any) {
    return json(500, { success: false, message: err?.message || 'Internal Server Error' })
  }
})