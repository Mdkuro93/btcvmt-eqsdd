import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  Cloud,
} from 'lucide-react';
import { getAssetDocumentUrl, getFriendlyFileName, isPdfFile, isImageFile } from '../lib/storage';
import { validateScanLink } from '../lib/scanLink';
import toast from 'react-hot-toast';

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
  const [copied, setCopied] = useState(false);

  // Kiểm tra tính hợp lệ & phân loại link qua validateScanLink
  const validation = validateScanLink(fileUrlOrPath);
  const isLinkValid = validation.ok && Boolean(validation.url);
  const isExternal = Boolean(validation.isExternal);
  const safeTargetUrl = validation.url || '';

  const friendlyName = getFriendlyFileName(fileUrlOrPath);
  const isPdf = isPdfFile(fileUrlOrPath) || isPdfFile(resolvedUrl);
  const isImg = isImageFile(fileUrlOrPath) || isImageFile(resolvedUrl);

  useEffect(() => {
    let isMounted = true;
    setCopied(false);

    if (!isOpen) {
      setResolvedUrl('');
      setLoading(false);
      setLoadError(null);
      return;
    }

    // Nếu đường dẫn không hợp lệ
    if (!validation.ok) {
      setLoading(false);
      setLoadError(validation.error || 'Link bản scan không hợp lệ.');
      return;
    }

    if (!safeTargetUrl) {
      setLoading(false);
      setLoadError('Chưa có đường dẫn bản scan cho tài sản này.');
      return;
    }

    // Nếu là link ngoài SharePoint/OneDrive: không cần gọi Supabase Storage, không nhúng iframe
    if (isExternal) {
      setResolvedUrl(safeTargetUrl);
      setLoading(false);
      setLoadError(null);
      return;
    }

    // Nếu là đường dẫn Storage nội bộ: lấy signed url để xem
    setLoading(true);
    setLoadError(null);
    getAssetDocumentUrl(safeTargetUrl)
      .then((url) => {
        if (isMounted) {
          if (!url) {
            setLoadError('Không tìm thấy đường dẫn tài liệu trong hệ thống lưu trữ.');
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

    return () => {
      isMounted = false;
    };
  }, [isOpen, fileUrlOrPath, isExternal, safeTargetUrl, validation.ok, validation.error]);

  if (!isOpen) return null;

  const handleOpenScan = () => {
    if (isLinkValid && safeTargetUrl) {
      window.open(safeTargetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyLink = async () => {
    if (isLinkValid && safeTargetUrl) {
      try {
        await navigator.clipboard.writeText(safeTargetUrl);
        setCopied(true);
        toast.success('Đã sao chép link bản scan!');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error('Không thể sao chép liên kết.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 md:p-6 overflow-hidden">
      <div className="relative w-full max-w-5xl h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-lg shrink-0">
              {isExternal ? (
                <Cloud className="w-5 h-5 text-blue-600" />
              ) : isPdf ? (
                <FileText className="w-5 h-5" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm md:text-base font-bold text-gray-900 truncate">
                {title} {certificateNo ? `(${certificateNo})` : ''}
              </h3>
              <p className="text-xs text-gray-500 truncate">
                {isExternal ? 'Lưu trữ đám mây SharePoint / OneDrive' : friendlyName || 'Tài liệu nội bộ'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {isLinkValid && (
              <>
                <button
                  type="button"
                  onClick={handleOpenScan}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg shadow-xs transition-colors cursor-pointer"
                  title="Mở bản scan trong tab mới"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  Mở bản scan
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors cursor-pointer"
                  title="Sao chép liên kết"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      <span className="text-emerald-700">Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1 text-gray-500" />
                      Sao chép link
                    </>
                  )}
                </button>
                {!isExternal && resolvedUrl && (
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
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
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

          {/* Trường hợp URL KHÔNG HỢP LỆ hoặc có lỗi tải */}
          {!loading && (!validation.ok || loadError) && (
            <div className="bg-white p-6 rounded-xl border border-red-200 max-w-md text-center shadow-sm">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-gray-900 mb-1">Link bản scan không hợp lệ</h4>
              <p className="text-xs text-red-600 mb-2">
                {!validation.ok ? validation.error : loadError}
              </p>
              <p className="text-[11px] text-gray-500">
                Chỉ chấp nhận link an toàn (HTTPS) từ Microsoft SharePoint (*.sharepoint.com), OneDrive (*.1drv.ms, *.onedrive.live.com) hoặc file Storage nội bộ.
              </p>
            </div>
          )}

          {/* Trường hợp LINK NGOÀI SharePoint / OneDrive: KHÔNG NHÚNG IFRAME */}
          {!loading && isLinkValid && !loadError && isExternal && (
            <div className="bg-white p-8 rounded-2xl border border-blue-200 max-w-lg w-full text-center shadow-md space-y-5">
              <div className="w-16 h-16 bg-blue-50 text-[#1E3A8A] rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-blue-100">
                <Cloud className="w-8 h-8 text-blue-600" />
              </div>

              <div>
                <h4 className="text-base font-bold text-gray-900">
                  Bản Scan Đám Mây (SharePoint / OneDrive)
                </h4>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  Microsoft SharePoint và OneDrive không cho phép nhúng trực tiếp trong trình duyệt vì chính sách bảo mật nội bộ (X-Frame-Options / CSP).
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left">
                <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Đường dẫn liên kết:
                </span>
                <span className="text-xs text-blue-700 font-mono break-all line-clamp-2">
                  {safeTargetUrl}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleOpenScan}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 bg-[#1E3A8A] hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Mở bản scan
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-semibold transition-all border border-gray-300 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1.5 text-emerald-600" />
                      <span className="text-emerald-700">Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1.5 text-gray-600" />
                      Sao chép link
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Trường hợp FILE STORAGE NỘI BỘ: NHÚNG IFRAME / IMG BÌNH THƯỜNG */}
          {!loading && isLinkValid && !loadError && !isExternal && resolvedUrl && (
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
          <span>
            {isExternal
              ? 'Nguồn: Đám mây Microsoft'
              : `Định dạng: ${isPdf ? 'Tài liệu PDF' : isImg ? 'Hình ảnh' : 'Tài liệu đính kèm'}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-medium rounded-md transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
