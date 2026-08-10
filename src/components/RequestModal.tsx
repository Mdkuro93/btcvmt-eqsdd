import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Role } from '../contexts/AuthContext';
import { TransactionType, Asset } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (type: TransactionType, details: any) => Promise<void>;
  selectedAssets: Asset[];
  userRole: Role;
  warehouses: any[];
}

export const RequestModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedAssets,
  userRole,
  warehouses
}) => {
  const [type, setType] = useState<TransactionType | ''>('');
  const [loading, setLoading] = useState(false);
  
  // Checkout fields
  const [reason, setReason] = useState('');
  const [department, setDepartment] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  
  // Checkin fields
  const [checkinDate, setCheckinDate] = useState('');
  
  // Mortgage fields
  const [bank, setBank] = useState('');
  const [borrower, setBorrower] = useState('');
  const [valuation, setValuation] = useState('');
  const [collateralRatio, setCollateralRatio] = useState('');
  
  // Sale update fields
  const [saleStatus, setSaleStatus] = useState<'ready_for_sale' | 'sold'>('ready_for_sale');
  const [salePrice, setSalePrice] = useState('');

  // Split fields
  const [decisionNo, setDecisionNo] = useState('');
  const [splitNotes, setSplitNotes] = useState('');
  const [splitChildren, setSplitChildren] = useState<{ certificate_no: string, area: string, subdivision: string }[]>([
    { certificate_no: '', area: '', subdivision: '' }
  ]);

  const hasMortgagedAssets = selectedAssets.some(a => a.mortgage_status === 'mortgaged');

  // Filter allowed types based on role
  const allowedTypes: { value: TransactionType, label: string }[] = [];
  if (['capital_dept', 'project_dept'].includes(userRole)) {
    allowedTypes.push({ value: 'checkout', label: 'Mượn/Xuất sổ' });
    allowedTypes.push({ value: 'checkin', label: 'Nhập sổ' });
    allowedTypes.push({ value: 'split', label: 'Tách sổ' });
  }
  if (userRole === 'capital_dept') {
    allowedTypes.push({ value: 'mortgage', label: 'Thế chấp' });
  }
  if (userRole === 're_dept') {
    allowedTypes.push({ value: 'sale_update', label: 'Xuất bán' });
  }
  if (userRole === 'btc_manager') {
     // Allow everything for testing / manager?
     allowedTypes.push(
       { value: 'checkout', label: 'Mượn/Xuất sổ' },
       { value: 'checkin', label: 'Nhập sổ' },
       { value: 'split', label: 'Tách sổ' },
       { value: 'mortgage', label: 'Thế chấp' },
       { value: 'sale_update', label: 'Xuất bán' }
     );
  }

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setType(allowedTypes.length > 0 ? allowedTypes[0].value : '');
      setReason('');
      setDepartment('');
      setReturnDate('');
      setTargetWarehouseId('');
      setCheckinDate('');
      setBank('');
      setBorrower('');
      setValuation('');
      setCollateralRatio('');
      setSaleStatus('ready_for_sale');
      setSalePrice('');
      setDecisionNo('');
      setSplitNotes('');
      setSplitChildren([{ certificate_no: '', area: '', subdivision: '' }]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    
    setLoading(true);
    try {
      let details: any = {};
      switch (type) {
        case 'checkout':
          details = { reason, department, returnDate, targetWarehouseId };
          break;
        case 'checkin':
          details = { checkinDate };
          break;
        case 'mortgage':
          details = { bank, borrower, valuation: Number(valuation), collateralRatio: Number(collateralRatio) };
          break;
        case 'sale_update':
          details = { saleStatus, salePrice: salePrice ? Number(salePrice) : null };
          break;
        case 'split':
          details = { decisionNo, splitNotes, splitChildren };
          break;
      }
      await onSubmit(type as TransactionType, details);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            Tạo yêu cầu ({selectedAssets.length} GCN đã chọn)
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại yêu cầu</label>
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="" disabled>-- Chọn loại yêu cầu --</option>
              {allowedTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {type === 'checkout' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lý do mượn/xuất</label>
                <input required type="text" value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bộ phận sử dụng</label>
                  <input required type="text" value={department} onChange={e => setDepartment(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày dự kiến trả</label>
                  <input required type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kho nhận (nơi sổ sẽ được chuyển tới)</label>
                <select required value={targetWarehouseId} onChange={e => setTargetWarehouseId(e.target.value)} className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500">
                  <option value="">-- Chọn kho nhận --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.is_central ? ' (Kho trung tâm)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {type === 'checkin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày nhập thực tế</label>
              <input required type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)} className="w-full max-w-sm rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
          )}

          {type === 'mortgage' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
                <input required type="text" value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay</label>
                <input required type="text" value={borrower} onChange={e => setBorrower(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                <input required type="number" min="0" value={valuation} onChange={e => setValuation(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                <input required type="number" min="0" max="100" step="0.1" value={collateralRatio} onChange={e => setCollateralRatio(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {type === 'sale_update' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái mới</label>
                <select required value={saleStatus} onChange={e => setSaleStatus(e.target.value as any)} className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500">
                  <option value="ready_for_sale">Sẵn sàng bán</option>
                  <option value="sold">Đã bán</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giá bán (VNĐ) - Nếu có</label>
                <input type="number" min="0" value={salePrice} onChange={e => setSalePrice(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {type === 'split' && (
            <div className="space-y-4">
              {hasMortgagedAssets && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-md flex items-start">
                  <AlertTriangle className="h-5 w-5 text-red-600 mr-2 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-red-800">Cảnh báo: Có tài sản đang thế chấp</h4>
                    <p className="text-xs text-red-600 mt-1">
                      Một hoặc nhiều GCN bạn chọn đang được thế chấp. Vui lòng nhập lý do/ghi chú trước khi yêu cầu tách thửa.
                    </p>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số quyết định tách thửa</label>
                <input required type="text" value={decisionNo} onChange={e => setDecisionNo(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>

              {hasMortgagedAssets && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lý do tách khi đang thế chấp <span className="text-red-500">*</span></label>
                  <textarea required rows={2} value={splitNotes} onChange={e => setSplitNotes(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
                </div>
              )}

              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Danh sách GCN con</label>
                  <button type="button" onClick={() => setSplitChildren([...splitChildren, { certificate_no: '', area: '', subdivision: '' }])} className="text-xs flex items-center text-blue-600 hover:text-blue-800 font-medium">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Thêm GCN con
                  </button>
                </div>
                
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {splitChildren.map((child, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-gray-50 p-2 rounded-md border border-gray-100">
                      <div className="flex-1 space-y-2">
                        <input required type="text" placeholder="Số GCN" value={child.certificate_no} onChange={e => {
                          const newC = [...splitChildren]; newC[idx].certificate_no = e.target.value; setSplitChildren(newC);
                        }} className="w-full rounded border border-gray-300 p-1.5 text-xs" />
                        <div className="flex gap-2">
                           <input required type="number" step="0.01" placeholder="Diện tích" value={child.area} onChange={e => {
                            const newC = [...splitChildren]; newC[idx].area = e.target.value; setSplitChildren(newC);
                          }} className="w-1/2 rounded border border-gray-300 p-1.5 text-xs" />
                           <input type="text" placeholder="Phân khu" value={child.subdivision} onChange={e => {
                            const newC = [...splitChildren]; newC[idx].subdivision = e.target.value; setSplitChildren(newC);
                          }} className="w-1/2 rounded border border-gray-300 p-1.5 text-xs" />
                        </div>
                      </div>
                      <button type="button" onClick={() => {
                        if (splitChildren.length > 1) {
                           setSplitChildren(splitChildren.filter((_, i) => i !== idx));
                        }
                      }} className="p-1.5 text-gray-400 hover:text-red-600 shrink-0 mt-1" disabled={splitChildren.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !type}
              className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] border border-transparent rounded-md hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1E3A8A] disabled:opacity-50"
            >
              {loading ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
