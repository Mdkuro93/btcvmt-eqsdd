import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, Database, AlertCircle } from 'lucide-react';

interface LoadingFallbackProps {
  message?: string;
  onForceLocal?: () => void;
  onRetry?: () => void;
  timeoutSeconds?: number;
  className?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({
  message = 'Đang tải dữ liệu...',
  onForceLocal,
  onRetry,
  timeoutSeconds = 5,
  className = '',
}) => {
  const [showEscapeOption, setShowEscapeOption] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowEscapeOption(true);
    }, timeoutSeconds * 1000);

    return () => clearTimeout(timer);
  }, [timeoutSeconds]);

  return (
    <div className={`bg-white p-10 text-center rounded-xl border border-gray-200 shadow-xs flex flex-col items-center justify-center space-y-4 my-3 ${className}`}>
      <div className="relative">
        <Loader2 className="w-9 h-9 animate-spin text-[#1E3A8A]" />
      </div>
      <p className="text-sm font-medium text-gray-600">{message}</p>

      {showEscapeOption && (
        <div className="mt-2 p-4 max-w-md w-full bg-amber-50 border border-amber-200 rounded-lg text-left transition-all">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-semibold text-amber-900">Máy chủ phản hồi chậm hoặc đang bận</p>
              <p className="text-amber-700">Bạn có thể thử lại hoặc dùng ngay dữ liệu cục bộ để không bị gián đoạn công việc.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 justify-end">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
            )}
            {onForceLocal && (
              <button
                type="button"
                onClick={onForceLocal}
                className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[#1E3A8A] text-white hover:bg-blue-800 flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Database className="w-3.5 h-3.5" /> Dùng dữ liệu cục bộ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
