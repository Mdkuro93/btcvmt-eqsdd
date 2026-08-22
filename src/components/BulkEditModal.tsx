import React, { useState } from 'react';
import { Asset, SaleStatus, CustodyStatus } from '../types';
import { bulkUpdateAssets } from '../api/assets';
import { X, Loader2, CheckSquare, Sparkles, Building2, Layers, Tag, Warehouse } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  selectedAssets: Asset[];
  currentUser?: { id: string; email?: string; full_name?: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkEditModal: React.FC<Props> = ({
  selectedAssets,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);

  // Field toggles
  const [applyBusinessProject, setApplyBusinessProject] = useState(true);
  const [businessProjectName, setBusinessProjectName] = useState('');

  const [applyBusinessPlot, setApplyBusinessPlot] = useState(false);
  const [businessPlotCode, setBusinessPlotCode] = useState('');

  const [applySubdivision, setApplySubdivision] = useState(false);
  const [subdivision, setSubdivision] = useState('');

  const [applySaleStatus, setApplySaleStatus] = useState(false);
  const [saleStatus, setSaleStatus] = useState<SaleStatus>('ready_for_sale');

  const [applyCustodyStatus, setApplyCustodyStatus] = useState(false);
  const [custodyStatus, setCustodyStatus] = useState<CustodyStatus>('in_stock');

  const [notes, setNotes] = useState(`Cập nhật hàng loạt ${selectedAssets.length} tài sản`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!applyBusinessProject && !applyBusinessPlot && !applySubdivision && !applySaleStatus && !applyCustodyStatus) {
      toast.error('Vui lòng chọn ít nhất một trường dữ liệu cần cập nhật');
      return;
    }

    setLoading(true);
    try {
      const updates: Partial<Asset> = {};

      if (applyBusinessProject) {
        updates.business_project_name = businessProjectName.trim() || null;
      }
      if (applyBusinessPlot) {
        updates.business_plot_code = businessPlotCode.trim() || null;
      }
      if (applySubdivision) {
        updates.subdivision = subdivision.trim() || null;
      }
      if (applySaleStatus) {
        updates.sale_status = saleStatus;
      }
      if (applyCustodyStatus) {
        updates.custody_status = custodyStatus;
      }

      const ids = selectedAssets.map(a => a.id);
      const res = await bulkUpdateAssets(ids, updates, currentUser, notes);

      toast.success(`Đã cập nhật hàng loạt thành công ${res.count} tài sản và ghi nhận lịch sử!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Lỗi bulk update:', err);
      toast.error('Lỗi cập nhật hàng loạt: ' + (err.message || 'Không xác định'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <CheckSquare className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="text-base font-bold">Cập Nhật Hàng Loạt Dữ Liệu</h3>
              <p className="text-xs text-blue-200">
                Đang áp dụng cho <span className="font-bold underline">{selectedAssets.length}</span> tài sản / GCN đã chọn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected preview chips */}
        <div className="px-6 py-3 bg-blue-50/70 border-b border-blue-100 flex items-center gap-2 overflow-x-auto text-xs text-blue-900">
          <span className="font-semibold shrink-0">Danh sách GCN:</span>
          <div className="flex gap-1.5 flex-wrap max-h-16 overflow-y-auto">
            {selectedAssets.map(a => (
              <span
                key={a.id}
                className="bg-white px-2 py-0.5 rounded border border-blue-200 text-[11px] font-mono font-medium text-blue-800"
              >
                {a.certificate_no} {a.subdivision ? `(${a.subdivision})` : ''}
              </span>
            ))}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý lưu vết:</strong> Mọi thay đổi qua tính năng này sẽ tự động ghi nhận vào bảng{' '}
              <span className="font-mono font-semibold">audit_logs</span> kèm thông tin tài khoản người thực hiện và giá trị cũ/mới.
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. Tên dự án kinh doanh */}
            <div className="border border-gray-200 rounded-xl p-4 transition-colors hover:border-blue-300">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={applyBusinessProject}
                  onChange={e => setApplyBusinessProject(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  Cập nhật Tên Dự Án Kinh Doanh (Tên bán hàng)
                </span>
              </label>

              {applyBusinessProject && (
                <div className="mt-2 pl-6">
                  <input
                    type="text"
                    value={businessProjectName}
                    onChange={e => setBusinessProjectName(e.target.value)}
                    placeholder="VD: Cồn Dầu Riverside, Spana Central, Cora Beach..."
                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Để trống nếu muốn xóa tên dự án kinh doanh của các GCN đã chọn.</p>
                </div>
              )}
            </div>

            {/* 2. Mã lô kinh doanh */}
            <div className="border border-gray-200 rounded-xl p-4 transition-colors hover:border-blue-300">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={applyBusinessPlot}
                  onChange={e => setApplyBusinessPlot(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  Cập nhật Mã Lô Kinh Doanh (Mã bán hàng)
                </span>
              </label>

              {applyBusinessPlot && (
                <div className="mt-2 pl-6">
                  <input
                    type="text"
                    value={businessPlotCode}
                    onChange={e => setBusinessPlotCode(e.target.value)}
                    placeholder="VD: LK02-15, SP-BT-09, CORA-VIP..."
                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Áp dụng chung mã lô thương mại cho các dòng đã chọn.</p>
                </div>
              )}
            </div>

            {/* 3. Phân khu */}
            <div className="border border-gray-200 rounded-xl p-4 transition-colors hover:border-blue-300">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={applySubdivision}
                  onChange={e => setApplySubdivision(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Cập nhật Phân Khu
                </span>
              </label>

              {applySubdivision && (
                <div className="mt-2 pl-6">
                  <input
                    type="text"
                    value={subdivision}
                    onChange={e => setSubdivision(e.target.value)}
                    placeholder="VD: Phân khu A, Block 3, Khu Biệt Thự..."
                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            {/* 4. Trạng thái kinh doanh */}
            <div className="border border-gray-200 rounded-xl p-4 transition-colors hover:border-blue-300">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={applySaleStatus}
                  onChange={e => setApplySaleStatus(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-emerald-600" />
                  Cập nhật Trạng Thái Bán Hàng
                </span>
              </label>

              {applySaleStatus && (
                <div className="mt-2 pl-6">
                  <select
                    value={saleStatus}
                    onChange={e => setSaleStatus(e.target.value as SaleStatus)}
                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="not_ready">Chưa sẵn sàng bán</option>
                    <option value="ready_for_sale">Sẵn sàng bán (Đã mở bán)</option>
                    <option value="sold">Đã bán (Khách hàng đã ký HĐ)</option>
                  </select>
                </div>
              )}
            </div>

            {/* 5. Ghi chú lý do cập nhật */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Lý do / Ghi chú thay đổi (Lưu vào Audit Log):
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Nhập lý do điều chỉnh để thuận tiện tra cứu lịch sử sau này..."
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang cập nhật {selectedAssets.length} GCN...
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4 mr-1.5" />
                  Xác nhận Cập nhật ({selectedAssets.length})
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
