import { useState, useEffect, useRef, useCallback } from 'react';
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  MAX_SESSION_DURATION_MS,
  SESSION_START_TIME_KEY,
} from '../constants/auth';

export interface UseIdleLogoutOptions {
  onLogout: (reason?: string) => Promise<void> | void;
  idleTimeoutMs?: number;
  warningMs?: number;
  maxSessionDurationMs?: number;
  enabled?: boolean;
}

export interface UseIdleLogoutReturn {
  showWarning: boolean;
  secondsRemaining: number;
  stayLoggedIn: () => void;
  manualLogout: () => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

export function useIdleLogout({
  onLogout,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  warningMs = IDLE_WARNING_MS,
  maxSessionDurationMs = MAX_SESSION_DURATION_MS,
  enabled = true,
}: UseIdleLogoutOptions): UseIdleLogoutReturn {
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(Math.ceil(warningMs / 1000));

  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottleRef = useRef<number>(Date.now());
  const isLoggingOutRef = useRef<boolean>(false);

  // Cập nhật mốc hoạt động người dùng (throttle 1000ms để tối ưu hiệu năng)
  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottleRef.current > 1000) {
      lastThrottleRef.current = now;
      lastActivityRef.current = now;
    }
  }, []);

  // Người dùng chọn tiếp tục phiên làm việc
  const stayLoggedIn = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastThrottleRef.current = now;
    setShowWarning(false);
  }, []);

  // Người dùng chủ động chọn đăng xuất từ cảnh báo
  const manualLogout = useCallback(() => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    setShowWarning(false);
    onLogout('Người dùng chủ động đăng xuất khi nhận cảnh báo nhàn rỗi.');
  }, [onLogout]);

  // Đăng ký lắng nghe sự kiện thao tác
  useEffect(() => {
    if (!enabled) return;

    isLoggingOutRef.current = false;
    lastActivityRef.current = Date.now();
    lastThrottleRef.current = Date.now();

    const listeners = ACTIVITY_EVENTS.map((event) => {
      const handler = () => handleActivity();
      window.addEventListener(event, handler, { passive: true });
      return { event, handler };
    });

    return () => {
      listeners.forEach(({ event, handler }) => {
        window.removeEventListener(event, handler);
      });
    };
  }, [enabled, handleActivity]);

  // Vòng lặp kiểm tra thời gian nhàn rỗi & phiên tối đa 12 giờ (mỗi 1 giây)
  useEffect(() => {
    if (!enabled) {
      setShowWarning(false);
      return;
    }

    const intervalId = window.setInterval(() => {
      if (isLoggingOutRef.current) return;

      const now = Date.now();

      // 1. Kiểm tra thời gian tối đa của phiên làm việc (12 giờ)
      const sessionStartTimeStr =
        typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_START_TIME_KEY) : null;
      if (sessionStartTimeStr) {
        const sessionStartTime = Number(sessionStartTimeStr);
        if (!isNaN(sessionStartTime) && now - sessionStartTime >= maxSessionDurationMs) {
          isLoggingOutRef.current = true;
          setShowWarning(false);
          onLogout('Phiên đăng nhập đã đạt giới hạn tối đa (12 giờ). Vui lòng đăng nhập lại.');
          return;
        }
      }

      // 2. Kiểm tra thời gian không thao tác (nhàn rỗi)
      const idleTime = now - lastActivityRef.current;
      const timeLeft = idleTimeoutMs - idleTime;

      if (timeLeft <= 0) {
        // Đã hết thời gian nhàn rỗi cho phép
        isLoggingOutRef.current = true;
        setShowWarning(false);
        onLogout('Phiên đã hết hạn do không hoạt động.');
        return;
      }

      if (timeLeft <= warningMs) {
        // Trong khoảng thời gian cảnh báo
        setShowWarning(true);
        setSecondsRemaining(Math.max(1, Math.ceil(timeLeft / 1000)));
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, idleTimeoutMs, warningMs, maxSessionDurationMs, onLogout]);

  return {
    showWarning,
    secondsRemaining,
    stayLoggedIn,
    manualLogout,
  };
}
