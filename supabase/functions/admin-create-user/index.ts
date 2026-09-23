import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-application-name: app (src/lib/supabase.ts) gửi kèm header này trên MỌI request, kể cả gọi Edge Function.
  // Thiếu nó trong danh sách -> trình duyệt chặn ở bước preflight -> "Failed to send a request to the Edge Function".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
}

// Cấp bậc: số càng lớn quyền càng cao. Role không liệt kê = 0 (thấp nhất).
const ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  btc_manager: 60,
  warehouse_manager: 40,
}
const rankOf = (role?: string | null) => ROLE_RANK[role ?? ''] ?? 0

// Khớp với CHECK constraint profiles_role_check (migration 0012 — bản mới nhất, có 'supervisor' và 'investor')
const VALID_ROLES = [
  'super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'quan_ly',
  'capital_dept', 'project_dept', 're_dept', 'chuyen_vien', 'supervisor', 'investor',
  'viewer', 'nguoi_dung', 'user',
]

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error: Missing Supabase keys.')
    }

    // 1. Create a Supabase client with the caller's JWT to verify their identity and role
    const authHeader = req.headers.get('Authorization')!
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Xác thực JWT bằng cách TRUYỀN TRỰC TIẾP token vào getUser(token) (cách chính thức cho Edge Function).
    // Không dùng getUser() không tham số: bản supabase-js cũ không đọc được header Authorization -> luôn báo "session missing".
    const authClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const { data: userData, error: userError } = await authClient.auth.getUser(token)
    const user = userData?.user
    if (userError || !user) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Phiên đăng nhập không hợp lệ' + (userError?.message ? ` (${userError.message})` : '') + '. Hãy đăng xuất và đăng nhập lại.',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check caller's role in profiles (id lấy từ JWT đã xác thực)
    const { data: callerProfile, error: profileError } = await authClient
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    // Mỗi lý do từ chối có một thông báo riêng để biết chính xác đang vướng ở đâu
    const deny = (status: number, message: string) =>
      new Response(JSON.stringify({ success: false, message }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    if (profileError) {
      return deny(500, 'Không đọc được hồ sơ người gọi: ' + profileError.message)
    }
    if (!callerProfile) {
      return deny(403, 'Không tìm thấy hồ sơ ứng với tài khoản đang đăng nhập (id không khớp bảng profiles).')
    }
    if (callerProfile.status !== 'active') {
      return deny(403, `Tài khoản của bạn đang ở trạng thái "${callerProfile.status}", không phải "active".`)
    }

    const allowedRoles = ['super_admin', 'admin', 'btc_manager', 'warehouse_manager']
    if (!allowedRoles.includes(callerProfile.role)) {
      return deny(403, `Vai trò hiện tại của bạn ("${callerProfile.role}") không được phép tạo tài khoản người dùng.`)
    }

    // 2. Extract user data from request body
    const body = await req.json()

    // 3. Create a Supabase client with the Service Role key to perform admin actions
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { 
      email, 
      password, 
      full_name, 
      username, 
      role, 
      permissions, 
      status, 
      phone, 
      organization, 
      purpose,
      region_id, 
      area_id, 
      managed_warehouse_ids,
      assigned_warehouse_ids,
      owner_entity_ids,
      access_expires_at
    } = body

    const requestedRole = role || 'viewer'
    if (!VALID_ROLES.includes(requestedRole)) {
      return new Response(JSON.stringify({ success: false, message: 'Vai trò không hợp lệ' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (callerProfile.role !== 'super_admin' && rankOf(callerProfile.role) <= rankOf(requestedRole)) {
      return new Response(JSON.stringify({ success: false, message: 'Forbidden: Không được tạo tài khoản có vai trò ngang hoặc cao hơn vai trò của bạn' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ success: false, message: 'Missing required fields (email, password, full_name)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Create the user using admin API
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        username,
        role: requestedRole
      }
    })

    if (authError) {
      return new Response(JSON.stringify({ success: false, message: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newUserId = authData.user.id

    // 5. Update the profile that was auto-generated by the handle_new_user trigger
    const profileUpdates = {
      role: requestedRole,
      permissions: permissions || ['asset.view'],
      status: status || 'active',
      phone: phone || null,
      organization: organization || null,
      purpose: purpose || null,
      region_id: region_id || null,
      area_id: area_id || null,
      managed_warehouse_ids: managed_warehouse_ids || null,
      assigned_warehouse_ids: assigned_warehouse_ids || null,
      owner_entity_ids: owner_entity_ids || null,
      access_expires_at: access_expires_at || null,
    }

    const { data: updatedProfile, error: updateError } = await adminClient
      .from('profiles')
      .update(profileUpdates)
      .eq('id', newUserId)
      .select()
      .single()

    if (updateError) {
      // Hoàn tác: xóa tài khoản đăng nhập vừa tạo để không để lại tài khoản "nửa vời" (có Auth nhưng hồ sơ sai)
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(newUserId)
      return new Response(JSON.stringify({
        success: false,
        message: 'Không thể lưu hồ sơ tài khoản: ' + updateError.message +
          (rollbackError
            ? ' (Cảnh báo: chưa dọn được tài khoản đăng nhập vừa tạo, cần xóa thủ công trong Authentication > Users.)'
            : ' Tài khoản chưa được tạo, bạn có thể thử lại.'),
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, profile: updatedProfile }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, message: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})