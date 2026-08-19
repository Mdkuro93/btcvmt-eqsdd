import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Save, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Asset, TransactionType, Warehouse } from '../types';

interface DecideRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (decision: 'approved' | 'rejected', notes: string, finalDetails?: any) => Promise<void>;
  item: any; // The transaction_item containing asset, type, details, transaction
  decisionType: 'approved' | 'rejected';
  warehouses: Warehouse[];
}

export const DecideRequestModal: React.FC<DecideRequestModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  decisionType,
  warehouses,
}) => {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [details, setDetails] = useState<any>({});
  
  // Diff detection
  const [hasMajorDiff, setHasMajorDiff] = useState(false);
  const [diffWarnings, setDiffWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && item) {
      setNotes('');
      setDetails(item.details ? JSON.parse(JSON.stringify(item.details)) : {});
      setHasMajorDiff(false);
      setDiffWarnings([]);
    }
  }, [isOpen, item]);

  useEffect(() => {
    if (!isOpen || !item || decisionType === 'rejected') return;

    // Calculate diffs
    const originalDetails = item.details || {};
    let diffs = [];
    let isMajor = false;

    if (item.type === 'mortgage') {
      const origVal = Number(originalDetails.valuation) || 0;
      const newVal = Number(details.valuation) || 0;
      if (origVal > 0 && newVal > 0) {
        const diffPercent = Math.abs(newVal - origVal) / origVal;
        if (diffPercent > 0.05) {
          isMajor = true;
          diffs.push(`Giá trị định giá thay đổi lớn (${(diffPercent * 100).toFixed(1)}%) so với đề xuất ban đầu.`);
        }
      }
    }

    setHasMajorDiff(isMajor);
    setDiffWarnings(diffs);
  }, [details, isOpen, item, decisionType]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (decisionType === 'rejected' && !notes.trim()) {
      alert('Vui lòng nhập lý do từ chối.');
      return;
    }
    if (decisionType === 'approved' && hasMajorDiff && !notes.trim()) {
      alert('Dữ liệu có thay đổi lớn so với đề xuất. Vui lòng nhập lý do điều chỉnh.');
      return;
    }

    setLoading(true);
    try {
      const finalDetails = { ...details, notes: notes };
      await onConfirm(decisionType, notes, finalDetails);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const asset = item.asset;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative inline-block w-full max-w-2xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {decisionType === 'approved' ? (
                <><CheckCircle className="w-5 h-5 text-green-600"/> Xác nhận duyệt yêu cầu</>
              ) : (
                <><XCircle className="w-5 h-5 text-red-600"/> Từ chối yêu cầu</>
              )}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Thông tin tài sản</h4>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Số GCN:</span> {asset?.certificate_no}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Dự án/Phân khu:</span> {asset?.projects?.name} {asset?.subdivision ? ` - ${asset.subdivision}` : ''}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Loại yêu cầu:</span> {
                item.type === 'checkout' ? 'Mượn/Xuất sổ' : 
                item.type === 'checkin' ? 'Nhập sổ' : 
                item.type === 'split' ? 'Tách sổ' : 
                item.type === 'mortgage' ? 'Thế chấp' : 
                item.type === 'sale_update' ? 'Xuất bán' : item.type
              }
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {decisionType === 'approved' && item.type === 'checkout' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bộ phận nhận (kho sửa)</label>
                  <input type="text" value={details.department || ''} onChange={e => setDetails({...details, department: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kho xuất (kho sửa)</label>
                  <select value={details.targetWarehouseId || ''} onChange={e => setDetails({...details, targetWarehouseId: e.target.value})} className="w-full px-3 py-2 border rounded-md">
                    <option value="">Chọn kho</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lý do mượn</label>
                  <input type="text" value={details.reason || ''} onChange={e => setDetails({...details, reason: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
              </div>
            )}

            {decisionType === 'approved' && item.type === 'mortgage' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 1</label>
                  <input type="text" value={details.bank || ''} onChange={e => setDetails({...details, bank: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 1</label>
                  <input type="text" value={details.mortgage_unit || ''} onChange={e => setDetails({...details, mortgage_unit: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 2</label>
                  <input type="text" value={details.bank_2 || ''} onChange={e => setDetails({...details, bank_2: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 2</label>
                  <input type="text" value={details.mortgage_unit_2 || ''} onChange={e => setDetails({...details, mortgage_unit_2: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                  <input type="number" value={details.valuation || ''} onChange={e => setDetails({...details, valuation: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                  <input type="number" step="0.01" value={details.collateral_ratio || ''} onChange={e => {
                    const ratio = e.target.value;
                    const val = details.valuation;
                    const autoColVal = (val && ratio) ? (Number(val) * Number(ratio) / 100) : details.collateral_value;
                    setDetails({...details, collateral_ratio: ratio, collateral_value: autoColVal});
                  }} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị đảm bảo (VNĐ)</label>
                  <input type="number" value={details.collateral_value || ''} onChange={e => setDetails({...details, collateral_value: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
              </div>
            )}

            {decisionType === 'approved' && item.type === 'sale_update' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái bán</label>
                  <select value={details.saleStatus || ''} onChange={e => {
                    const st = e.target.value;
                    let ut = details.usage_term_type;
                    if (st === 'sold' && asset?.usage_purpose?.toLowerCase().includes('đất ở')) {
                      ut = 'long_term';
                    }
                    setDetails({...details, saleStatus: st, usage_term_type: ut});
                  }} className="w-full px-3 py-2 border rounded-md">
                    <option value="not_ready">Chưa sẵn sàng</option>
                    <option value="ready_for_sale">Sẵn sàng bán</option>
                    <option value="sold">Đã bán</option>
                  </select>
                </div>
                {details.saleStatus === 'sold' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chuyển thời hạn sử dụng thành Lâu dài</label>
                    <div className="flex items-center h-10">
                      <input type="checkbox" checked={details.usage_term_type === 'long_term'} onChange={e => setDetails({...details, usage_term_type: e.target.checked ? 'long_term' : asset?.usage_term_type})} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-2 text-sm text-gray-600">(Áp dụng khi chuyển nhượng đất ở)</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {decisionType === 'approved' && item.type === 'split' && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs border-b pb-2 border-slate-200">
                  <span className="font-semibold text-gray-700">Loại biến động:</span>
                  <span className="px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800">
                    {details.splitType === 'reissue' ? 'Cấp đổi GCN' : details.splitType === 'partial' ? 'Tách một phần' : 'Tách toàn bộ'}
                  </span>
                </div>

                {details.splitType === 'reissue' ? (
                  <div className="text-xs space-y-1">
                    <p><span className="text-gray-500">Số GCN mới:</span> <span className="font-bold text-gray-900">{details.newCertificateNo}</span></p>
                    <p><span className="text-gray-500">Số vào sổ mới:</span> <span className="font-medium text-gray-900">{details.newRegistryNo || '(Không)'}</span></p>
                    <p><span className="text-gray-500">Lý do cấp đổi:</span> <span className="text-gray-900">{details.reissueReason}</span></p>
                    <p className="text-[11px] text-amber-700 mt-1">⚠️ Sổ gốc cũ sẽ tự động đóng (chuyển sang Hết hiệu lực) khi duyệt.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>Số quyết định: <b className="text-gray-900">{details.decisionNo}</b></span>
                      <span>Sổ con: <b className="text-blue-700">{details.splitChildren?.length || 0} GCN</b></span>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 bg-white p-2 rounded border border-gray-200 text-xs">
                      {(details.splitChildren || []).map((child: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-b-0">
                          <span className="font-medium text-gray-800">{idx + 1}. GCN: {child.certificate_no}</span>
                          <span className="text-blue-600 font-semibold">{child.area} m²</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between text-xs font-semibold pt-1">
                      <span className="text-gray-600">
                        {details.splitType === 'partial' ? 'Diện tích sổ gốc còn lại:' : 'Trạng thái sổ mẹ:'}
                      </span>
                      <span className={details.splitType === 'partial' ? 'text-emerald-700' : 'text-red-600'}>
                        {details.splitType === 'partial' ? `${Number(details.remainingArea || 0).toLocaleString('vi-VN')} m²` : 'Hết hiệu lực'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasMajorDiff && decisionType === 'approved' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mr-2 flex-shrink-0" />
                  <div>
                    <h5 className="text-sm font-medium text-amber-800">Cảnh báo lệch dữ liệu</h5>
                    <ul className="text-xs text-amber-700 mt-1 list-disc pl-4">
                      {diffWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                    <p className="text-xs text-amber-700 mt-1 font-semibold">Vui lòng nhập lý do điều chỉnh bên dưới.</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {decisionType === 'rejected' ? 'Lý do từ chối (Bắt buộc)' : hasMajorDiff ? 'Lý do điều chỉnh (Bắt buộc)' : 'Ghi chú thêm (Tùy chọn)'}
                {(decisionType === 'rejected' || hasMajorDiff) && <span className="text-red-500 ml-1">*</span>}
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                required={decisionType === 'rejected' || hasMajorDiff}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder={decisionType === 'rejected' ? "Nhập lý do từ chối..." : "Nhập ghi chú hoặc lý do thay đổi dữ liệu..."}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md flex items-center gap-2 ${
                  decisionType === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {decisionType === 'approved' ? 'Xác nhận Duyệt' : 'Từ chối'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
