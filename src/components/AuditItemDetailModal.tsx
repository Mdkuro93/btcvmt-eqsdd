import React, { useState, useEffect } from 'react';
import { InventoryAuditItem, InventoryAuditFindingStatus } from '../types';
import { 
  X, 
  MapPin, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Tag, 
  Building2,
  ExternalLink,
  Eye,
  Loader2 
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryAuditItem | null;
  onSave: (itemId: string, data: {
    finding_status: InventoryAuditFindingStatus;
    actual_found: boolean;
    actual_location: string | null;
    note: string | null;
  }) => Promise<void>;
  onOpenPreviewDoc?: (url: string, certNo?: string) => void;
}

export const AuditItemDetailModal: React.FC<Props> = ({
  isOpen,
  onClose,
  item,
  onSave,
  onOpenPreviewDoc,
}) => {
  const [findingStatus, setFindingStatus] = useState<InventoryAuditFindingStatus>('matched');
  const [actualLocation, setActualLocation] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setFindingStatus(item.finding_status || 'matched');
      setActualLocation(item.actual_location || item.expected_location || '');
      setNote(item.note || '');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const asset = item.asset;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const actualFound = findingStatus === 'matched' || findingStatus === 'misplaced';
      await onSave(item.id, {
        finding_status: findingStatus,
        actual_found: actualFound,
        actual_location: findingStatus === 'missing' ? null : actualLocation.trim() || null,
        note: note.trim() || null,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <FileText className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Xác Nhận Hiện Trạng GCN</h3>
              <p className="text-xs text-gray-300">
                Số GCN: <span className="text-amber-400 font-semibold">{asset?.certificate_no || 'Chưa rõ'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Asset Info Card */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-500">Mã TS / Lô:</span>
                <p className="font-semibold text-gray-800">{asset?.asset_code || asset?.business_plot_code || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">Dự án:</span>
                <p className="font-semibold text-gray-800">{asset?.business_project_name || asset?.projects?.name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">Phân khu / Thửa:</span>
                <p className="font-medium text-gray-700">{asset?.subdivision ? `${asset.subdivision} - Lô ${asset.lot_no || asset.land_lot_no || ''}` : '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">Chủ sở hữu:</span>
                <p className="font-medium text-gray-700">{asset?.owner_name || '-'}</p>
              </div>
            </div>

            {asset?.scan_file_url && onOpenPreviewDoc && (
              <div className="pt-2 border-t border-gray-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => onOpenPreviewDoc(asset.scan_file_url!, asset.certificate_no)}
                  className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 mr-1 text-blue-500" /> Xem Bản Scan GCN Gốc
                </button>
              </div>
            )}
          </div>

          {/* Finding Status Selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Kết Quả Đối Soát Thực Tế <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Matched */}
              <button
                type="button"
                onClick={() => {
                  setFindingStatus('matched');
                  if (!actualLocation) setActualLocation(item.expected_location || '');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                  findingStatus === 'matched'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <CheckCircle2 className={`w-5 h-5 mb-1 ${findingStatus === 'matched' ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className="text-xs font-bold">Đúng Vị Trí</span>
                <span className="text-[10px] text-gray-500 mt-0.5">Khớp hồ sơ</span>
              </button>

              {/* Misplaced */}
              <button
                type="button"
                onClick={() => setFindingStatus('misplaced')}
                className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                  findingStatus === 'misplaced'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <AlertTriangle className={`w-5 h-5 mb-1 ${findingStatus === 'misplaced' ? 'text-amber-600' : 'text-gray-400'}`} />
                <span className="text-xs font-bold">Sai Vị Trí</span>
                <span className="text-[10px] text-gray-500 mt-0.5">Lệch kệ / ngăn</span>
              </button>

              {/* Missing */}
              <button
                type="button"
                onClick={() => setFindingStatus('missing')}
                className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                  findingStatus === 'missing'
                    ? 'bg-red-50 border-red-500 text-red-900 ring-2 ring-red-500/20 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <XCircle className={`w-5 h-5 mb-1 ${findingStatus === 'missing' ? 'text-red-600' : 'text-gray-400'}`} />
                <span className="text-xs font-bold">Không Tìm Thấy</span>
                <span className="text-[10px] text-gray-500 mt-0.5">Khuyết thiếu</span>
              </button>
            </div>
          </div>

          {/* Vị trí dự kiến vs Vị trí thực tế */}
          {findingStatus !== 'missing' && (
            <div className="space-y-3">
              <div>
                <span className="block text-[11px] text-gray-500 mb-1">Vị trí lưu kho dự kiến trên hệ thống:</span>
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium text-gray-700 border border-gray-200">
                  {item.expected_location || 'Vị trí kho tiêu chuẩn'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Vị Trí Thực Tế Tìm Thấy {findingStatus === 'misplaced' && <span className="text-amber-600 font-bold">* (Bắt buộc)</span>}
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={actualLocation}
                    onChange={(e) => setActualLocation(e.target.value)}
                    required={findingStatus === 'misplaced'}
                    placeholder="Ví dụ: Kệ B2 - Hộp 04, Ngăn kéo số 3..."
                    className="w-full pl-9 pr-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Ghi chú chi tiết */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Ghi Chú / Hiện Trạng Hồ Sơ
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={
                findingStatus === 'missing'
                  ? 'Ghi rõ nghi vấn: đã giao dịch, chưa hoàn tất nhập kho, đang gửi phòng chuyên môn...'
                  : 'Tình trạng tem niêm phong, bìa sổ, hiện trạng thực tế...'
              }
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-blue-700/20 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Lưu Kết Quả
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
