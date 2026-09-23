import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Lỗi giao diện bị bắt bởi ErrorBoundary:', error, errorInfo);

    const errorMsg = error?.message || '';
    const isMismatchOrChunkError =
      errorMsg.includes('Invalid hook call') ||
      errorMsg.includes("reading 'useState'") ||
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('dynamically imported module') ||
      error?.name === 'ChunkLoadError';

    if (isMismatchOrChunkError && typeof window !== 'undefined') {
      const reloadKey = `err_mismatch_${window.location.pathname}`;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    sessionStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || '';
      const isChunkError =
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('dynamically imported module') ||
        errorMsg.includes('Invalid hook call') ||
        errorMsg.includes("reading 'useState'") ||
        this.state.error?.name === 'ChunkLoadError';

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-200 text-center">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
              {isChunkError ? 'Cần làm mới giao diện' : 'Đã xảy ra lỗi tải giao diện'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
              {isChunkError
                ? 'Hệ thống vừa cập nhật mã nguồn hoặc kết nối mạng bị gián đoạn. Vui lòng bấm nút dưới đây để làm mới ứng dụng.'
                : (errorMsg || 'Không thể hiển thị trang vào lúc này. Vui lòng thử lại.')}
            </p>
            <button
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1E3A8A] hover:bg-blue-800 text-white text-sm font-semibold rounded-xl shadow-sm transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
