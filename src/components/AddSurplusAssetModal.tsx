import React, { useState } from 'react';
import { Asset, Warehouse } from '../types';
import { fetchAssets } from '../api/assets';
import { addSurplusAuditItem } from '../api/inventoryAudits';
import { 
  X, 
  Search, 
  PackagePlus, 
  AlertTriangle, 
  CheckCircle2, 
  MapPin, 
  Loader2,
  Building2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  auditId: string;
  currentWarehouseId: string;
  currentWarehouseName: string;
  onAdded: () => void;
}

export const AddSurplusAssetModal: React.FC<Props> = ({
  isOpen,
  onClose,
  auditId,
  currentWarehouseId,
  currentWarehouseName,
  onAdded,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [actualLocation, setActualLocation] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setSearching(true);
    try {
      const res = await fetchAssets({ search: searchTerm.trim() }, 1, 20);
      setSearchResults(res.data || []);
      if (!res.data || res.data.length === 0) {
        toast.error('Không tìm thấy GCN nào khớp với từ khóa.');
      }
    } catch (err: any) {
      console.error('Lỗi tìm kiếm GCN thừa:', err);
      toast.error('Lỗi khi tra cứu tài sản.');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) {
      toast.error('Vui lòng chọn một GCN từ kết quả tìm kiếm.');
      return;
    }

    setSubmitting(true);
    try {
      const finalNote = note.trim() || (selectedAsset.warehouse_id !== currentWarehouseId 
        ? `Phát hiện GCN thuộc kho khác (${(selectedAsset as any).warehouses?.name || 'Kho khác'})` 
        : 'Phát hiện GCN thừa thực tế trong kho');

      await addSurplusAuditItem(
        auditId,
        selectedAsset.id,
        actualLocation.trim() || 'Tại kho đang kiểm',
        finalNote
      );

      toast.success(`Đã thêm thành công GCN "${selectedAsset.certificate_no}" vào đợt kiểm kê!`);
      onAdded();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Không thể thêm GCN thừa vào đợt kiểm kê.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-purple-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <PackagePlus className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h3 className="font-bold text-base">Quét / Thêm GCN Thừa Thực Tế</h3>
              <p className="text-xs text-purple-200/80 mt-0.5">
                Ghi nhận GCN phát hiện trong két nhưng ngoài danh mục sổ sách
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Search Box */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nhập số GCN hoặc mã tài sản cần quét..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Tìm GCN
            </button>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && !selectedAsset && (
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-gray-50">
              {searchResults.map((ast) => {
                const isOtherWh = ast.warehouse_id !== currentWarehouseId;
                return (
                  <div
                    key={ast.id}
                    onClick={() => setSelectedAsset(ast)}
                    className="p-3 hover:bg-white cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-gray-900 text-xs">{ast.certificate_no}</p>
                      <p className="text-[11px] text-gray-500">
                        {ast.asset_code} | {ast.projects?.name || ast.business_project_name || 'Chưa rõ dự án'}
                      </p>
                    </div>
                    <div className="text-right">
                      {isOtherWh ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
                          Thuộc {(ast as any).warehouses?.name || 'Kho khác'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                          Đúng kho này
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Asset Form */}
          {selectedAsset && (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-purple-700 tracking-wider">GCN ĐÃ CHỌN:</span>
                    <h4 className="font-bold text-sm text-gray-900">{selectedAsset.certificate_no}</h4>
                    <p className="text-gray-600 text-xs mt-0.5">
                      {selectedAsset.asset_code} | {selectedAsset.projects?.name || selectedAsset.business_project_name || '-'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAsset(null)}
                    className="text-xs text-purple-600 hover:underline font-semibold"
                  >
                    Đổi GCN
                  </button>
                </div>

                {selectedAsset.warehouse_id !== currentWarehouseId && (
                  <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Cảnh báo: Sổ này trên hệ thống thuộc <strong>{(selectedAsset as any).warehouses?.name || 'kho khác'}</strong>. Hệ thống sẽ ghi nhận trạng thái <strong>Thừa / Sai kho</strong>.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Vị trí thực tế tìm thấy trong kho <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={actualLocation}
                    onChange={(e) => setActualLocation(e.target.value)}
                    placeholder="Ví dụ: Kệ B2 - Hộp 01, Ngăn kéo số 2..."
                    className="w-full pl-9 pr-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú hiện trạng
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ghi rõ tình trạng bìa sổ, tem niêm phong, nghi vấn phát sinh thừa..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <PackagePlus className="w-4 h-4 mr-1.5" />}
                  Thêm Vào Đợt Kiểm Kê
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddSurplusAssetModal;
