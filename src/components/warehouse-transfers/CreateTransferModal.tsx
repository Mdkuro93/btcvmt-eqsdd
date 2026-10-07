import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ArrowLeftRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Building2,
  FileText,
  Link as LinkIcon,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchWarehouses, fetchAssets } from '../../api/assets';
import { createWarehouseTransfer, TransferItemResult } from '../../api/warehouseTransfers';
import { validateScanLink } from '../../lib/scanLink';
import { Asset, Warehouse } from '../../types';
import toast from 'react-hot-toast';

export interface CreateTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preSelectedAssets?: Asset[];
}

export const CreateTransferModal: React.FC<CreateTransferModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preSelectedAssets = [],
}) => {
  const { profile } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [scanUrl, setScanUrl] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);

  // Asset search & selection
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchedAssets, setSearchedAssets] = useState<Asset[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  // Execution & results
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [results, setResults] = useState<TransferItemResult[] | null>(null);

  const isAdminOrBtc = ['admin', 'super_admin', 'btc_manager'].includes(profile?.role || '');
  const managedWarehouseIds = profile?.managed_warehouse_ids || [];

  // Load warehouses
  useEffect(() => {
    if (isOpen) {
      fetchWarehouses()
        .then(setWarehouses)
        .catch((err) => console.error('Lỗi tải danh mục kho:', err));
    }
  }, [isOpen]);

  // Handle pre-selected assets
  useEffect(() => {
    if (isOpen) {
      setResults(null);
      setNotes('');
      setScanUrl('');
      setScanError(null);
      setTargetWarehouseId('');
      setSearchQuery('');

      if (preSelectedAssets && preSelectedAssets.length > 0) {
        // Filter out assets not in stock or not belonging to managed warehouse if not admin
        const valid = preSelectedAssets.filter((a) => {
          if (a.custody_status !== 'in_stock') return false;
          if (!isAdminOrBtc && a.warehouse_id && !managedWarehouseIds.includes(a.warehouse_id)) return false;
          return true;
        });
        setSelectedAssets(valid);
      } else {
        setSelectedAssets([]);
      }
    }
  }, [isOpen, preSelectedAssets, isAdminOrBtc]);

  // Debounced search for assets
  useEffect(() => {
    if (!isOpen || results !== null) return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchedAssets([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const filters: any = {
          search: query,
          custodyStatus: 'in_stock',
          lifecycleStatus: 'active',
        };
        const res = await fetchAssets(filters, 1, 20);
        let items: Asset[] = res.data || [];
        if (!isAdminOrBtc) {
          items = items.filter((a) => a.warehouse_id && managedWarehouseIds.includes(a.warehouse_id));
        }
        setSearchedAssets(items);
      } catch (err) {
        console.error('Lỗi tìm kiếm GCN:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, results, isAdminOrBtc, managedWarehouseIds]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  // Validate Scan Link
  const handleScanChange = (val: string) => {
    setScanUrl(val);
    if (!val.trim()) {
      setScanError(null);
      return;
    }
    const check = validateScanLink(val);
    if (!check.ok) {
      setScanError(check.error || 'Link không hợp lệ');
    } else {
      setScanError(null);
    }
  };

  const handleAddAsset = (asset: Asset) => {
    if (selectedAssets.some((a) => a.id === asset.id)) return;
    if (selectedAssets.length >= 200) {
      toast.error('Tối đa 200 GCN cho mỗi lệnh luân chuyển.');
      return;
    }
    setSelectedAssets((prev) => [...prev, asset]);
  };

  const handleRemoveAsset = (id: string) => {
    setSelectedAssets((prev) => prev.filter((a) => a.id !== id));
  };

  // Check if any selected asset is in the target warehouse
  const hasSameWarehouseAsset = selectedAssets.some(
    (a) => a.warehouse_id && a.warehouse_id === targetWarehouseId
  );

  const canSubmit =
    targetWarehouseId &&
    selectedAssets.length > 0 &&
    selectedAssets.length <= 200 &&
    !scanError &&
    !hasSameWarehouseAsset &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const assetIds = selectedAssets.map((a) => a.id);
      const res = await createWarehouseTransfer(
        assetIds,
        targetWarehouseId,
        notes.trim() || null,
        scanUrl.trim() || null
      );
      setResults(res);
      const createdCount = res.filter((r) => r.result === 'created').length;
      const errorCount = res.filter((r) => r.result === 'error').length;

      if (errorCount === 0) {
        toast.success(`Đã lập lệnh xuất luân chuyển cho ${createdCount} GCN thành công!`);
        onSuccess();
      } else {
        toast.error(`Có ${errorCount}/${res.length} GCN bị lỗi khi lập lệnh.`);
        onSuccess();
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi tạo lệnh luân chuyển');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border-b border-blue-100 dark:border-blue-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#1E3A8A] text-white rounded-xl shadow-xs">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                Tạo lệnh xuất luân chuyển kho
              </h2>
              <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                Luồng hai bước: kho xuất lập lệnh xuất (tự sinh mã PX), kho đích xác nhận nhận (sinh mã PN).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Screen */}
        {results !== null ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs text-blue-900 dark:text-blue-300">
              <p className="font-semibold text-sm mb-1">Kết quả lập lệnh luân chuyển kho</p>
              <p>
                Thành công: <strong>{results.filter((r) => r.result === 'created').length}</strong> · Bị lỗi:{' '}
                <strong>{results.filter((r) => r.result === 'error').length}</strong>
              </p>
            </div>

            <div className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">STT</th>
                    <th className="py-2.5 px-3">Số GCN</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                    <th className="py-2.5 px-3">Mã phiếu xuất (PX)</th>
                    <th className="py-2.5 px-3">Thông điệp / Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {results.map((r, idx) => {
                    const isSuccess = r.result === 'created';
                    return (
                      <tr key={r.asset_id || idx} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 text-gray-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-gray-900 dark:text-slate-100">
                          {r.certificate_no || 'N/A'}
                        </td>
                        <td className="py-2 px-3">
                          {isSuccess ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 text-[11px]">
                              <Check className="w-3 h-3" /> Thành công
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 text-[11px]">
                              <AlertCircle className="w-3 h-3" /> Lỗi
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                          {r.out_voucher || '-'}
                        </td>
                        <td className="py-2 px-3 text-gray-600 dark:text-slate-300">
                          {r.message || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSuccess();
                }}
                className="px-5 py-2 bg-[#1E3A8A] hover:bg-blue-900 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
              >
                Đóng & Xem danh sách
              </button>
            </div>
          </div>
        ) : (
          /* Form Screen */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Box nhắc nhở */}
            <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl text-xs text-blue-900 dark:text-blue-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Sau khi lập lệnh, GCN sẽ chuyển sang trạng thái <strong>Đang luân chuyển</strong> và vẫn thuộc kho xuất cho tới khi kho đích xác nhận nhận hoàn tất.
              </p>
            </div>

            {/* Bước 1: Chọn Kho đích */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-800 dark:text-slate-200">
                1. Kho nhận đích đến <span className="text-rose-600">*</span>:
              </label>
              <select
                required
                value={targetWarehouseId}
                onChange={(e) => setTargetWarehouseId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn kho tiếp nhận đích --</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ''}
                  </option>
                ))}
              </select>
              {hasSameWarehouseAsset && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Có GCN đã chọn đang thuộc chính kho này. Không thể luân chuyển sang cùng một kho.
                </p>
              )}
            </div>

            {/* Bước 2: Chọn GCN */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-800 dark:text-slate-200">
                  2. Danh sách GCN cần luân chuyển <span className="text-rose-600">*</span> ({selectedAssets.length}/200 GCN):
                </label>
                {selectedAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAssets([])}
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-medium"
                  >
                    Xóa tất cả ({selectedAssets.length})
                  </button>
                )}
              </div>

              {/* Ô tìm kiếm GCN */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Gõ số GCN, mã tài sản hoặc mã lô để tìm..."
                  className="w-full pl-8 pr-8 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {isSearching && (
                  <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Danh sách kết quả tìm kiếm */}
              {searchedAssets.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-blue-200 dark:border-blue-900/60 rounded-lg bg-blue-50/40 dark:bg-blue-950/20 p-2 space-y-1">
                  <div className="text-[11px] text-gray-500 dark:text-slate-400 font-medium px-1">
                    Kết quả tìm thấy (bấm để thêm vào danh sách luân chuyển):
                  </div>
                  {searchedAssets.map((a) => {
                    const isSelected = selectedAssets.some((s) => s.id === a.id);
                    const whName = warehouses.find((w) => w.id === a.warehouse_id)?.name || 'Chưa gán kho';
                    return (
                      <div
                        key={a.id}
                        onClick={() => !isSelected && handleAddAsset(a)}
                        className={`flex items-center justify-between p-2 rounded-md text-xs transition-colors ${
                          isSelected
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 opacity-60 cursor-not-allowed'
                            : 'bg-white dark:bg-slate-800 hover:bg-blue-100/70 dark:hover:bg-blue-900/50 cursor-pointer shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-900 dark:text-slate-100">
                            {a.certificate_no}
                          </span>
                          <span className="text-[11px] text-gray-500 dark:text-slate-400 font-mono">
                            [{a.asset_code || 'Chưa có mã'}]
                          </span>
                          <span className="text-[11px] text-gray-600 dark:text-slate-400">
                            · Kho xuất: <strong>{whName}</strong>
                          </span>
                        </div>
                        <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                          {isSelected ? 'Đã chọn' : '+ Thêm'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Danh sách GCN đã chọn */}
              {selectedAssets.length > 0 ? (
                <div className="max-h-44 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg p-2 space-y-1.5 bg-gray-50/50 dark:bg-slate-800/40">
                  {selectedAssets.map((a, idx) => {
                    const wh = warehouses.find((w) => w.id === a.warehouse_id);
                    const isConflict = targetWarehouseId && a.warehouse_id === targetWarehouseId;
                    return (
                      <div
                        key={a.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${
                          isConflict
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-900 dark:text-rose-200'
                            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-4 text-[10px] text-gray-400 font-mono">{idx + 1}.</span>
                          <span className="font-mono font-bold">{a.certificate_no}</span>
                          <span className="text-[11px] text-gray-500 dark:text-slate-400 font-mono truncate">
                            [{a.asset_code || 'Chưa cấp mã'}]
                          </span>
                          <span className="text-[11px] text-gray-600 dark:text-slate-400 truncate">
                            · Kho xuất: <strong>{wh?.name || 'N/A'}</strong>
                          </span>
                          {isConflict && (
                            <span className="text-[10px] text-rose-600 font-bold bg-rose-100 dark:bg-rose-900/60 px-1.5 py-0.5 rounded">
                              Trùng kho đích
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAsset(a.id)}
                          className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors"
                          title="Gỡ khỏi danh sách"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-gray-400 dark:text-slate-500 border border-dashed border-gray-300 dark:border-slate-700 rounded-lg">
                  Chưa chọn GCN nào. Hãy tìm kiếm ở trên hoặc chọn GCN từ màn hình Danh sách GCN.
                </div>
              )}
            </div>

            {/* Bước 3: Ghi chú & Link bản scan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Ghi chú xuất luân chuyển (tùy chọn):
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ví dụ: Bàn giao bảo quản cho dự án mới..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Link bản scan OneDrive/SharePoint (tùy chọn):
                </label>
                <input
                  type="text"
                  value={scanUrl}
                  onChange={(e) => handleScanChange(e.target.value)}
                  placeholder="https://...sharepoint.com/..."
                  className={`w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 ${
                    scanError
                      ? 'border-rose-400 focus:ring-rose-500'
                      : 'border-gray-300 dark:border-slate-700 focus:ring-blue-500'
                  }`}
                />
                {scanError && <p className="text-[11px] text-rose-600 mt-0.5">{scanError}</p>}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="pt-4 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Hủy
              </button>

              <button
                type="submit"
                disabled={!canSubmit}
                className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors ${
                  canSubmit
                    ? 'bg-[#1E3A8A] hover:bg-blue-900 text-white cursor-pointer'
                    : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang lập lệnh...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>Lập lệnh xuất luân chuyển ({selectedAssets.length})</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
