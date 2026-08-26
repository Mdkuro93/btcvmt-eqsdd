import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, Save, Loader2, CheckCircle, XCircle, RefreshCw, FileText, Search, Printer } from 'lucide-react';
import { Asset, TransactionType, Warehouse } from '../types';
import { previewVoucherCode } from '../lib/voucherEngine';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';
import { fetchAssets } from '../api/assets';

interface DecideRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (decision: 'approved' | 'rejected', notes: string, finalDetails?: any, confirmedAssetId?: string) => Promise<void>;
  item: any; // The transaction_item containing asset, type, details, transaction
  decisionType: 'approved' | 'rejected';
  warehouses: Warehouse[];
  onOpenPrint?: (item: any) => void;
}

export const DecideRequestModal: React.FC<DecideRequestModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  decisionType,
  warehouses,
  onOpenPrint,
}) => {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [details, setDetails] = useState<any>({});
  
  // Asset swapping state
  const [isSwappingAsset, setIsSwappingAsset] = useState(false);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');

  // Diff detection
  const [hasMajorDiff, setHasMajorDiff] = useState(false);
  const [diffWarnings, setDiffWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && item) {
      setNotes(item.decision_notes || '');
      setDetails(item.details ? JSON.parse(JSON.stringify(item.details)) : {});
      setSelectedAssetId(item.confirmed_asset_id || item.asset_id || '');
      setIsSwappingAsset(false);
      setHasMajorDiff(false);
      setDiffWarnings([]);

      fetchAssets().then(res => setAllAssets(res?.data || [])).catch(() => {});
    }
  }, [isOpen, item]);

  const originalAsset: Asset = item?.asset;
  const currentAsset: Asset = useMemo(() => {
    if (selectedAssetId && selectedAssetId !== item?.asset_id) {
      return allAssets.find(a => a.id === selectedAssetId) || originalAsset;
    }
    return originalAsset;
  }, [selectedAssetId, allAssets, originalAsset, item]);

  // Determine current warehouse for voucher preview
  const currentWarehouse = useMemo(() => {
    const whId = getResponsibleWarehouseId({ ...item, asset: currentAsset, details }, item?.type);
    return warehouses.find(w => w.id === whId);
  }, [item, currentAsset, details, warehouses]);

  // Voucher preview
  const voucherPreview = useMemo(() => {
    if (!item?.type || !currentWarehouse) return '';
    return previewVoucherCode(currentWarehouse, item.type);
  }, [currentWarehouse, item]);

  // Track diffs
  useEffect(() => {
    if (!isOpen || !item || decisionType === 'rejected') return;

    const originalDetails = item.details || {};
    const diffs: string[] = [];
    let isMajor = false;

    if (selectedAssetId && selectedAssetId !== item.asset_id) {
      isMajor = true;
      diffs.push(`Thủ kho đã đổi GCN thực tế bàn giao sang: ${currentAsset?.certificate_no} (khác đề xuất ban đầu: ${originalAsset?.certificate_no}).`);
    }

    if (item.type === 'mortgage') {
      const origVal = Number(originalDetails.valuation) || 0;
      const newVal = Number(details.valuation) || 0;
      if (origVal > 0 && newVal > 0) {
        const diffPercent = Math.abs(newVal - origVal) / origVal;
        if (diffPercent > 0.05) {
          isMajor = true;
          diffs.push(`Giá trị định giá thay đổi (${(diffPercent * 100).toFixed(1)}%) so với đề xuất ban đầu.`);
        }
      }
    }

    if (item.type === 'checkout' && originalDetails.department !== details.department && details.department) {
      diffs.push(`Bộ phận nhận điều chỉnh thành: ${details.department}`);
    }

    if (details.targetWarehouseId && originalDetails.targetWarehouseId !== details.targetWarehouseId) {
      const wName = warehouses.find(w => w.id === details.targetWarehouseId)?.name;
      diffs.push(`Kho điều chỉnh sang: ${wName || details.targetWarehouseId}`);
    }

    setHasMajorDiff(isMajor || diffs.length > 0);
    setDiffWarnings(diffs);
  }, [details, isOpen, item, decisionType, selectedAssetId, currentAsset, originalAsset, warehouses]);

  if (!isOpen || !item) return null;

  const filteredAssets = allAssets.filter(a => {
    if (!assetSearch.trim()) return true;
    const term = assetSearch.toLowerCase();
    return (
      (a.certificate_no || '').toLowerCase().includes(term) ||
      (a.projects?.name || '').toLowerCase().includes(term) ||
      (a.subdivision || '').toLowerCase().includes(term) ||
      (a.lot_no || '').toLowerCase().includes(term)
    );
  }).slice(0, 15);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (decisionType === 'rejected' && !notes.trim()) {
      alert('Vui lòng nhập lý do từ chối.');
      return;
    }
    if (decisionType === 'approved' && hasMajorDiff && !notes.trim()) {
      alert('Dữ liệu hoặc GCN có thay đổi so với đề xuất. Vui lòng nhập lý do/ghi chú điều chỉnh.');
      return;
    }

    setLoading(true);
    try {
      const finalDetails = { ...details, notes: notes };
      await onConfirm(decisionType, notes, finalDetails, selectedAssetId !== item.asset_id ? selectedAssetId : undefined);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="relative w-full max-w-2xl bg-white shadow-2xl rounded-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {decisionType === 'approved' ? (
                <><CheckCircle className="w-5 h-5 text-emerald-600"/> Xác nhận duyệt phiếu</>
              ) : (
                <><XCircle className="w-5 h-5 text-red-600"/> Từ chối duyệt phiếu</>
              )}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Mã chứng từ xuất/nhập dự kiến: <span className="font-bold text-[#1E3A8A]">{voucherPreview}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          {/* Asset Info Card */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Thông tin Giấy chứng nhận QSDĐ</span>
              {decisionType === 'approved' && (
                <button
                  type="button"
                  onClick={() => setIsSwappingAsset(!isSwappingAsset)}
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {isSwappingAsset ? 'Đóng chọn lại GCN' : 'Đổi GCN thực tế bàn giao'}
                </button>
              )}
            </div>

            {/* Asset Swapper Box */}
            {isSwappingAsset && (
              <div className="p-3 bg-white rounded-lg border border-blue-200 shadow-sm space-y-2 mt-2">
                <div className="text-xs font-medium text-blue-900">Tìm & chọn GCN thay thế thực tế bàn giao:</div>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm theo số seri GCN, dự án, phân khu..."
                    value={assetSearch}
                    onChange={e => setAssetSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
                  {filteredAssets.map(a => {
                    const isSelected = a.id === selectedAssetId;
                    return (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAssetId(a.id)}
                        className={`p-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div>
                          <span>{a.certificate_no}</span>
                          <span className="text-gray-400 ml-2">({a.projects?.name || 'VMT'} - {a.subdivision || 'Lô'} {a.lot_no || ''})</span>
                        </div>
                        {isSelected && <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Số GCN:</span>{' '}
                <span className={`font-bold ${selectedAssetId !== item.asset_id ? 'text-amber-700 underline' : 'text-gray-900'}`}>
                  {currentAsset?.certificate_no}
                  {selectedAssetId !== item.asset_id && ' (Đã đổi)'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Dự án:</span>{' '}
                <span className="text-gray-900 font-medium">{currentAsset?.projects?.name || '---'}</span>
              </div>
              <div>
                <span className="text-gray-500">Phân khu / Lô:</span>{' '}
                <span className="text-gray-900">{currentAsset?.subdivision || '-'} / {currentAsset?.lot_no || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">Kho hiện tại:</span>{' '}
                <span className="text-gray-900">{currentWarehouse?.name || 'Kho Trung tâm'}</span>
              </div>
            </div>
          </div>

          {/* Form Fields by Transaction Type */}
          {decisionType === 'approved' && item.type === 'checkout' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Bộ phận nhận bàn giao</label>
                <input
                  type="text"
                  value={details.department || ''}
                  onChange={e => setDetails({ ...details, department: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Kho xuất thực tế</label>
                <select
                  value={details.targetWarehouseId || currentAsset?.warehouse_id || ''}
                  onChange={e => setDetails({ ...details, targetWarehouseId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-white"
                >
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name} {w.is_central ? '(Kho TT)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-gray-700 mb-1">Lý do / Căn cứ xuất mượn</label>
                <input
                  type="text"
                  value={details.reason || ''}
                  onChange={e => setDetails({ ...details, reason: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Hạn hoàn trả dự kiến</label>
                <input
                  type="date"
                  value={details.returnDate || ''}
                  onChange={e => setDetails({ ...details, returnDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          {decisionType === 'approved' && item.type === 'checkin' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Kho nhập thực tế</label>
                <select
                  value={details.targetWarehouseId || currentAsset?.warehouse_id || ''}
                  onChange={e => setDetails({ ...details, targetWarehouseId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-white"
                >
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name} {w.is_central ? '(Kho TT)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Ngày nhập thực tế</label>
                <input
                  type="date"
                  value={details.checkinDate || ''}
                  onChange={e => setDetails({ ...details, checkinDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          {decisionType === 'approved' && item.type === 'mortgage' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Ngân hàng thế chấp</label>
                <input
                  type="text"
                  value={details.bank || ''}
                  onChange={e => setDetails({ ...details, bank: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Đơn vị vay</label>
                <input
                  type="text"
                  value={details.mortgage_unit || ''}
                  onChange={e => setDetails({ ...details, mortgage_unit: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                <input
                  type="number"
                  value={details.valuation || ''}
                  onChange={e => setDetails({ ...details, valuation: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={details.collateral_ratio || ''}
                  onChange={e => setDetails({ ...details, collateral_ratio: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          {/* Diffs Warnings */}
          {hasMajorDiff && decisionType === 'approved' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-amber-900">Ghi nhận điều chỉnh thực tế:</div>
                  <ul className="text-[11px] text-amber-800 mt-1 list-disc pl-4 space-y-0.5">
                    {diffWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  <div className="text-[11px] text-amber-900 font-semibold mt-1">
                    * Bắt buộc nhập lý do điều chỉnh vào ô ghi chú bên dưới.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Decision Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {decisionType === 'rejected' ? 'Lý do từ chối (Bắt buộc)' : hasMajorDiff ? 'Lý do điều chỉnh (Bắt buộc)' : 'Ghi chú phê duyệt / Biên bản'}
              {(decisionType === 'rejected' || hasMajorDiff) && <span className="text-red-500 ml-1">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              required={decisionType === 'rejected' || hasMajorDiff}
              rows={3}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:ring-[#1E3A8A] focus:border-[#1E3A8A]"
              placeholder={decisionType === 'rejected' ? "Nhập chi tiết lý do từ chối..." : "Nhập lý do điều chỉnh hoặc hướng dẫn bàn giao..."}
            />
          </div>

          {/* Modal Actions */}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100">
            {decisionType === 'approved' && onOpenPrint ? (
              <button
                type="button"
                onClick={() => onOpenPrint({ ...item, confirmed_asset: currentAsset, details: { ...details, voucherCode: voucherPreview } })}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1E3A8A] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                <Printer className="w-3.5 h-3.5" /> Xem trước biên bản A4
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-5 py-2 text-xs font-semibold text-white rounded-lg flex items-center gap-1.5 shadow-sm ${
                  decisionType === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {decisionType === 'approved' ? 'Xác nhận Duyệt' : 'Từ chối yêu cầu'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
