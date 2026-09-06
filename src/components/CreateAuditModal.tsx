import React, { useState, useEffect } from 'react';
import { Warehouse, Profile } from '../types';
import { fetchWarehouses, fetchAssets } from '../api/assets';
import { createInventoryAudit } from '../api/inventoryAudits';
import { 
  X, 
  ClipboardCheck, 
  Building2, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Boxes,
  Loader2 
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  onCreated: (auditId: string) => void;
}

export const CreateAuditModal: React.FC<Props> = ({
  isOpen,
  onClose,
  profile,
  onCreated,
}) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [stockCount, setStockCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadWarehouses();
  }, [isOpen]);

  const loadWarehouses = async () => {
    try {
      const whList = await fetchWarehouses();
      let filtered = whList;

      // Filter for warehouse manager if assigned specific warehouses
      if (profile.role === 'warehouse_manager' && profile.managed_warehouse_ids && profile.managed_warehouse_ids.length > 0) {
        filtered = whList.filter(w => profile.managed_warehouse_ids?.includes(w.id));
      }

      setWarehouses(filtered);
      if (filtered.length > 0) {
        setSelectedWarehouseId(filtered[0].id);
      }
    } catch (err) {
      console.error('Error fetching warehouses:', err);
    }
  };

  useEffect(() => {
    if (!selectedWarehouseId) {
      setStockCount(null);
      return;
    }

    const checkStockCount = async () => {
      setLoadingCounts(true);
      try {
        const res = await fetchAssets({ warehouse_id: selectedWarehouseId, custody_status: 'in_stock' });
        setStockCount(res.totalCount ?? (res.data ? res.data.length : 0));
      } catch (err) {
        console.warn('Error checking asset count:', err);
      } finally {
        setLoadingCounts(false);
      }
    };

    checkStockCount();
  }, [selectedWarehouseId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId) {
      toast.error('Vui lòng chọn kho cần kiểm kê.');
      return;
    }

    setLoading(true);
    try {
      const newAudit = await createInventoryAudit(selectedWarehouseId, profile, notes.trim());
      toast.success('Đã tạo đợt kiểm kê mới thành công!');
      onCreated(newAudit.id);
    } catch (err: any) {
      console.error('Create audit error:', err);
      toast.error(err?.message || 'Có lỗi xảy ra khi tạo đợt kiểm kê.');
    } finally {
      setLoading(false);
    }
  };

  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-[#1E3A8A] to-blue-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md">
              <ClipboardCheck className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Bắt Đầu Đợt Kiểm Kê Kho</h2>
              <p className="text-xs text-blue-100/80 mt-0.5">Đối soát hiện trạng thực tế toàn bộ GCN QSDĐ & TSĐB</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Chọn Kho */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Chọn Kho Cần Kiểm Kê <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ''} {w.is_central ? '⭐ [Kho Tổng]' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Asset Stock Preview Box */}
          <div className="p-4 bg-blue-50/80 border border-blue-100 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 text-white rounded-lg">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-blue-900 font-medium">GCN đang lưu trong kho</p>
                <p className="text-xs text-blue-700/80">Số lượng tài sản có trạng thái <strong>Trong kho</strong></p>
              </div>
            </div>
            <div className="text-right">
              {loadingCounts ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              ) : (
                <div className="flex items-baseline space-x-1">
                  <span className="text-2xl font-black text-blue-900">{stockCount !== null ? stockCount : '--'}</span>
                  <span className="text-xs font-semibold text-blue-700">GCN</span>
                </div>
              )}
            </div>
          </div>

          {stockCount === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2.5 text-amber-800 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Kho hiện chưa có tài sản nào ở trạng thái "Trong kho". Bạn vẫn có thể tạo đợt kiểm kê trống hoặc kiểm tra lại bộ lọc tài sản.</span>
            </div>
          )}

          {/* Ghi chú / Mục đích kiểm kê */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Mục Đích / Ghi Chú Đợt Kiểm Kê
            </label>
            <div className="relative">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ví dụ: Kiểm kê định kỳ tháng 09/2026 theo Quyết định số 45/QĐ-BTC..."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Quy tắc kiểm kê info */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5 text-xs text-gray-600">
            <div className="flex items-center font-semibold text-gray-800 space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Cơ chế kiểm đếm thông minh:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-gray-600 text-[11px] leading-relaxed">
              <li>Hệ thống tự động chốt danh sách toàn bộ GCN tại kho tại thời điểm tạo đợt.</li>
              <li>Thủ kho tick xác nhận từng hồ sơ: <strong>Đúng vị trí</strong>, <strong>Sai vị trí</strong> (ghi nhận vị trí thực tế), hoặc <strong>Không tìm thấy</strong>.</li>
              <li>Hệ thống tự động xuất bảng tổng hợp chênh lệch để lập biên bản xử lý sau kiểm kê.</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading || !selectedWarehouseId}
              className="inline-flex items-center px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-blue-700/20 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang khởi tạo...
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Bắt Đầu Kiểm Kê
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
