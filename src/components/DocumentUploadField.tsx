import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Eye,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  uploadAssetDocument,
  getFriendlyFileName,
  isPdfFile,
  isImageFile,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
} from '../lib/storage';

interface DocumentUploadFieldProps {
  value: string;
  onChange: (newUrlOrPath: string) => void;
  assetId?: string;
  onPreview?: (urlOrPath: string) => void;
  disabled?: boolean;
}

export const DocumentUploadField: React.FC<DocumentUploadFieldProps> = ({
  value,
  onChange,
  assetId,
  onPreview,
  disabled = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFileName = uploadedFileName || getFriendlyFileName(value);
  const isPdf = isPdfFile(value) || isPdfFile(currentFileName);
  const isImg = isImageFile(value) || isImageFile(currentFileName);

  const handleFile = async (file: File) => {
    // 1. Kiểm tra kích thước file
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      toast.error(`File "${file.name}" quá lớn (${sizeMb}MB). Giới hạn tối đa là 10MB.`);
      return;
    }

    // 2. Kiểm tra phần mở rộng
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(`Định dạng "${ext}" không được hỗ trợ. Vui lòng chọn file .pdf, .jpg, .jpeg hoặc .png.`);
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading(`Đang tải lên file "${file.name}"...`);

    try {
      const result = await uploadAssetDocument(file, assetId);
      // Lưu signedUrl hoặc path
      onChange(result.signedUrl || result.path);
      setUploadedFileName(file.name);
      toast.success(`Tải lên "${file.name}" thành công!`, { id: toastId });
    } catch (error: any) {
      console.error('File upload error:', error);
      const errMsg = error?.message || 'Tải file lên thất bại. Vui lòng thử lại!';
      toast.error(errMsg, { id: toastId, duration: 5000 });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleRemove = () => {
    onChange('');
    setUploadedFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.success('Đã gỡ bỏ file đính kèm.');
  };

  return (
    <div className="space-y-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        onChange={handleInputChange}
        disabled={disabled || isUploading}
        className="hidden"
      />

      {/* Case 1: Đang có file đính kèm */}
      {value ? (
        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 bg-white text-[#1E3A8A] rounded-md shadow-xs border border-blue-100 shrink-0">
              {isPdf ? <FileText className="w-5 h-5 text-red-500" /> : <ImageIcon className="w-5 h-5 text-blue-600" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-gray-900 truncate max-w-[220px] md:max-w-[320px]">
                  {currentFileName || 'Bản scan Giấy chứng nhận'}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded">
                  <CheckCircle2 className="w-3 h-3 mr-0.5" /> Đã đính kèm
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {isPdf ? 'Định dạng tài liệu PDF' : isImg ? 'Định dạng hình ảnh' : 'Tệp đính kèm'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {onPreview && (
              <button
                type="button"
                onClick={() => onPreview(value)}
                className="px-2.5 py-1.5 bg-white text-[#1E3A8A] text-xs font-semibold rounded border border-blue-200 hover:bg-blue-100 hover:text-blue-900 transition-colors flex items-center shadow-xs cursor-pointer"
                title="Xem trước file"
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                Xem trước
              </button>
            )}

            <button
              type="button"
              disabled={disabled || isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-100 transition-colors flex items-center shadow-xs cursor-pointer disabled:opacity-50"
              title="Tải lên file khác thay thế"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1 text-gray-500" />
              Đổi file
            </button>

            <button
              type="button"
              disabled={disabled || isUploading}
              onClick={handleRemove}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer disabled:opacity-50"
              title="Xóa file này"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Case 2: Chưa có file đính kèm - Dropzone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled && !isUploading) {
              fileInputRef.current?.click();
            }
          }}
          className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50 scale-[1.01]'
              : 'border-gray-300 hover:border-blue-400 bg-gray-50/60 hover:bg-blue-50/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-2 space-y-2">
              <Loader2 className="w-6 h-6 text-[#1E3A8A] animate-spin" />
              <p className="text-xs font-semibold text-gray-700">Đang tải tài liệu lên hệ thống lưu trữ...</p>
              <p className="text-[11px] text-gray-500">Vui lòng chờ trong giây lát</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-1 space-y-1.5">
              <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-full">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">
                  Nhấn để chọn file hoặc kéo thả file vào đây
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Chấp nhận file <strong className="text-gray-700">PDF, JPG, JPEG, PNG</strong> (Dung lượng tối đa: <strong className="text-gray-700">10MB</strong>)
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
