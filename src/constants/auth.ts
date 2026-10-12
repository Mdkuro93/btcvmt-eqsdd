/**
 * Cấu hình an toàn phiên đăng nhập & thời gian nhàn rỗi (Prompt 22)
 * Tuân thủ bảo mật dữ liệu pháp lý & nghiệp vụ kho GCN.
 */

// Thời gian nhàn rỗi tối đa trước khi tự động đăng xuất: 30 phút
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Thời gian cảnh báo đếm ngược trước khi hết hạn nhàn rỗi: 60 giây
export const IDLE_WARNING_MS = 60 * 1000;

// Thời gian tối đa của một phiên làm việc liên tục: 12 giờ
export const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

// Tên kênh BroadcastChannel đồng bộ đăng xuất giữa các tab
export const AUTH_BROADCAST_CHANNEL = 'btcvmt_auth_broadcast';

// Storage key cho phiên Supabase Auth trong sessionStorage
export const AUTH_STORAGE_KEY = 'btcvmt-auth';

// Storage key lưu mốc thời gian bắt đầu phiên trong sessionStorage
export const SESSION_START_TIME_KEY = 'btcvmt_session_start_time';

// Storage key lưu vai trò đang mô phỏng trong sessionStorage
export const EFFECTIVE_ROLE_KEY = 'btcvmt_effective_role';

// Storage key cho mock user id trong sessionStorage (chế độ demo/dev)
export const MOCK_USER_ID_KEY = 'btcvmt_auth_user_id';
