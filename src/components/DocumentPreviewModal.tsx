import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Download, FileText, Image as ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { getAssetDocumentUrl, getFriendlyFileName, isPdfFile, isImageFile } from '../lib/storage';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrlOrPath: string;
  title?: string;
  certificateNo?: string;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  fileUrlOrPath,
  title = 'Xem Bản Scan Giấy Chứng Nhận',
  certificateNo,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const friendlyName = getFriendlyFileName(fileUrlOrPath);
  const isPdf = isPdfFile(fileUrlOrPath) || isPdfFile(resolvedUrl);
  const isImg = isImageFile(fileUrlOrPath) || isImageFile(resolvedUrl);

  useEffect(() => {
    let isMounted = true;
    if (isOpen && fileUrlOrPath) {
      setLoading(true);
      setLoadError(null);
      getAssetDocumentUrl(fileUrlOrPath)
        .then((url) => {
          if (isMounted) {
            if (!url) {
              setLoadError('Không tìm thấy đường dẫn tài liệu.');
            } else {
              setResolvedUrl(url);
            }
          }
        })
        .catch((err) => {
          if (isMounted) {
            setLoadError(err.message || 'Lỗi khi tạo đường dẫn xem tài liệu.');
          }
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setResolvedUrl('');
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, fileUrlOrPath]);

  if (!isOpen) return null;

  const handleOpenInNewTab = () => {
    if (resolvedUrl) {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 md:p-6 overflow-hidden">
      <div className="relative w-full max-w-5xl h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-lg shrink-0">
              {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm md:text-base font-bold text-gray-900 truncate">
                {title} {certificateNo ? `(${certificateNo})` : ''}
              </h3>
              <p className="text-xs text-gray-500 truncate">
                {friendlyName || 'Tài liệu đính kèm'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {resolvedUrl && (
              <>
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                  title="Mở trong tab mới"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  Mở tab mới
                </button>
                <a
                  href={resolvedUrl}
                  download={friendlyName || 'tai-lieu-gcn'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors"
                  title="Tải về máy"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Tải về
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body / Preview Area */}
        <div className="flex-1 bg-gray-100 overflow-auto flex items-center justify-center p-4 relative">
          {loading && (
            <div className="flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#1E3A8A] animate-spin" />
              <p className="text-xs font-medium text-gray-600">Đang tải và xác thực tài liệu...</p>
            </div>
          )}

          {!loading && loadError && (
            <div className="bg-white p-6 rounded-xl border border-red-200 max-w-md text-center shadow-sm">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-gray-900 mb-1">Không thể hiển thị tài liệu</h4>
              <p className="text-xs text-red-600 mb-4">{loadError}</p>
              {fileUrlOrPath && (
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Thử mở liên kết trực tiếp
                </button>
              )}
            </div>
          )}

          {!loading && !loadError && resolvedUrl && (
            <>
              {isPdf ? (
                <iframe
                  src={`${resolvedUrl}#toolbar=1&navpanes=0&view=FitH`}
                  className="w-full h-full rounded-lg bg-white border border-gray-300 shadow-inner"
                  title="PDF Preview"
                />
              ) : isImg ? (
                <div className="max-w-full max-h-full flex items-center justify-center p-2 bg-white rounded-lg shadow-sm border border-gray-200">
                  <img
                    src={resolvedUrl}
                    alt="Scan GCN Preview"
                    className="max-h-[75vh] max-w-full object-contain rounded"
                  />
                </div>
              ) : (
                <iframe
                  src={resolvedUrl}
                  className="w-full h-full rounded-lg bg-white border border-gray-300"
                  title="Document Preview"
                />
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-2.5 bg-white border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between shrink-0">
          <span>Định dạng: {isPdf ? 'Tài liệu PDF' : isImg ? 'Hình ảnh' : 'Tài liệu đính kèm'}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-medium rounded-md transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
