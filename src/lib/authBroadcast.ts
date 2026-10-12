import { AUTH_BROADCAST_CHANNEL } from '../constants/auth';

export interface AuthBroadcastMessage {
  type: 'LOGOUT';
  reason?: string;
  timestamp: number;
}

/**
 * Gửi thông báo đăng xuất tới tất cả các tab khác đang mở cùng trình duyệt
 */
export function broadcastLogout(reason?: string): void {
  if (typeof window === 'undefined') return;

  const payload: AuthBroadcastMessage = {
    type: 'LOGOUT',
    reason,
    timestamp: Date.now(),
  };

  // 1. Thử dùng BroadcastChannel (chuẩn hiện đại)
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    }
  } catch (err) {
    console.warn('Lỗi khi phát tín hiệu BroadcastChannel:', err);
  }

  // 2. Fallback qua localStorage storage event cho các trình duyệt cũ / môi trường hạn chế
  try {
    localStorage.setItem('btcvmt_broadcast_sync', JSON.stringify(payload));
    localStorage.removeItem('btcvmt_broadcast_sync');
  } catch {
    // Bỏ qua nếu localStorage bị vô hiệu hóa
  }
}

/**
 * Lắng nghe thông báo đăng xuất từ các tab khác
 */
export function subscribeAuthBroadcast(onMessage: (msg: AuthBroadcastMessage) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let channel: BroadcastChannel | null = null;

  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'btcvmt_broadcast_sync' && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        if (data?.type === 'LOGOUT') {
          onMessage(data);
        }
      } catch {
        // Bỏ qua lỗi parse
      }
    }
  };

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.type === 'LOGOUT') {
          onMessage(event.data);
        }
      };
    } catch (err) {
      console.warn('Không thể khởi tạo BroadcastChannel, dùng fallback StorageEvent:', err);
      window.addEventListener('storage', handleStorage);
    }
  } else {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    if (channel) {
      channel.close();
      channel = null;
    }
    window.removeEventListener('storage', handleStorage);
  };
}
