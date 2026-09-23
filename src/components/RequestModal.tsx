import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Plus, Trash2, FileCode2 } from 'lucide-react';
import { Role } from '../contexts/AuthContext';
import { TransactionType, TransactionReason, Asset } from '../types';
import { DEFAULT_WAREHOUSE_SLA_DAYS, DEFAULT_RETURN_DAYS } from '../lib/constants';
import { previewVoucherCode } from '../lib/voucherEngine';
import { fetchInvestorEntities } from '../api/investorEntities';

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
  const [requestKey, setRequestKey] = useState<string>('');
  const [desiredReceiveDate, setDesiredReceiveDate] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Checkout fields
  const [department, setDepartment] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [concurrentMortgage, setConcurrentMortgage] = useState(false);
  
  // Checkin fields
  const [checkinDate, setCheckinDate] = useState('');
  const [updateOwnership, setUpdateOwnership] = useState(false);
  const [newOwnerEntityId, setNewOwnerEntityId] = useState('');
  const [newOwnerRole, setNewOwnerRole] = useState<'cdt'|'ndt'>('cdt');
  const [investorEntities, setInvestorEntities] = useState<any[]>([]);
  
  // Mortgage fields
  const [bank, setBank] = useState('');
  const [borrower, setBorrower] = useState('');
  const [valuation, setValuation] = useState('');
  const [collateralRatio, setCollateralRatio] = useState('');
  const [bank2, setBank2] = useState('');
  const [mortgageUnit2, setMortgageUnit2] = useState('');
  const [expectedReleaseDate, setExpectedReleaseDate] = useState('');
  
  // Sale update fields
  const [saleStatus, setSaleStatus] = useState<'ready_for_sale' | 'sold'>('ready_for_sale');
  const [salePrice, setSalePrice] = useState('');

  // Split / Reissue fields
  const [splitType, setSplitType] = useState<'partial' | 'full' | 'reissue'>('partial');
  const [decisionNo, setDecisionNo] = useState('');
  const [splitNotes, setSplitNotes] = useState('');
  const [reissueReason, setReissueReason] = useState('');
  const [newCertificateNo, setNewCertificateNo] = useState('');
  const [newRegistryNo, setNewRegistryNo] = useState('');
  const [splitChildren, setSplitChildren] = useState<{ certificate_no: string, area: string, subdivision: string, land_lot_no?: string }[]>([
    { certificate_no: '', area: '', subdivision: '', land_lot_no: '' }
  ]);

  // "Nhập khác" / "Xuất khác" — diễn giải mục đích bắt buộc khi phát sinh trường hợp chưa có sẵn
  const [otherReasonDetail, setOtherReasonDetail] = useState('');
  const OTHER_REASON_MIN_LENGTH = 10;

  useEffect(() => {
    if (isOpen) {
      fetchInvestorEntities().then(data => setInvestorEntities(data)).catch(console.error);
    }
  }, [isOpen]);

  const parentTotalArea = selectedAssets.reduce((sum, a) => sum + (a.area || 0), 0);
  const childrenTotalArea = splitChildren.reduce((sum, c) => sum + (parseFloat(c.area) || 0), 0);
  const remainingArea = Math.max(0, parentTotalArea - childrenTotalArea);

  // Filter allowed types based on role
  const allowedOptions: { key: string, type: TransactionType, reason: TransactionReason, label: string }[] = [];
  
  const addOpt = (type: TransactionType, reason: TransactionReason, label: string) => {
    allowedOptions.push({ key: `${type}_${reason}`, type, reason, label });
  };
  
  const [selectedMainType, setSelectedMainType] = useState<TransactionType | ''>('');

  if (userRole === 'capital_dept') {
    addOpt('checkout', 'mượn', 'Xuất Mượn');
    addOpt('checkout', 'thế chấp', 'Xuất Thế chấp');
    addOpt('checkout', 'chuyển nhượng', 'Xuất Chuyển nhượng');
    addOpt('checkin', 'trả', 'Nhập Trả');
    addOpt('checkin', 'giải chấp', 'Nhập Giải chấp');
    addOpt('checkin', 'chuyển nhượng', 'Nhập Chuyển nhượng');
  } else if (userRole === 're_dept') {
    addOpt('checkout', 'mượn', 'Xuất Mượn');
    addOpt('checkout', 'xuất bán', 'Xuất Bán');
    addOpt('checkin', 'trả', 'Nhập Trả');
    addOpt('checkin', 'nhập sau bán', 'Nhập Sau bán');
  } else if (userRole === 'project_dept') {
    addOpt('checkout', 'mượn', 'Xuất Mượn');
    addOpt('checkout', 'sang tên cho khách', 'Xuất Sang tên cho khách');
    addOpt('checkout', 'tách sổ', 'Xuất Tách sổ');
    addOpt('checkout', 'thu hồi', 'Xuất Thu hồi');
    addOpt('checkout', 'đổi sổ', 'Xuất Đổi sổ');
    addOpt('checkin', 'trả', 'Nhập Trả');
    addOpt('checkin', 'tách sổ', 'Nhập Tách sổ');
    addOpt('checkin', 'đổi sổ', 'Nhập Đổi sổ');
  } else if (userRole === 'investor') {
    addOpt('checkout', 'mượn', 'Xuất Mượn');
    addOpt('checkin', 'trả', 'Nhập Trả');
  } else {
    // admins
    addOpt('checkout', 'mượn', 'Xuất Mượn');
    addOpt('checkout', 'thế chấp', 'Xuất Thế chấp');
    addOpt('checkout', 'chuyển nhượng', 'Xuất Chuyển nhượng');
    addOpt('checkout', 'xuất bán', 'Xuất Bán');
    addOpt('checkout', 'sang tên cho khách', 'Xuất Sang tên cho khách');
    addOpt('checkout', 'tách sổ', 'Xuất Tách sổ');
    addOpt('checkout', 'thu hồi', 'Xuất Thu hồi');
    addOpt('checkout', 'đổi sổ', 'Xuất Đổi sổ');
    addOpt('checkin', 'trả', 'Nhập Trả');
    addOpt('checkin', 'giải chấp', 'Nhập Giải chấp');
    addOpt('checkin', 'chuyển nhượng', 'Nhập Chuyển nhượng');
    addOpt('checkin', 'nhập sau bán', 'Nhập Sau bán');
    addOpt('checkin', 'tách sổ', 'Nhập Tách sổ');
    addOpt('checkin', 'đổi sổ', 'Nhập Đổi sổ');
    addOpt('checkin', 'cấp mới', 'Nhập Cấp mới');
  }

  // "Nhập khác" / "Xuất khác": áp dụng cho MỌI vai trò đã có quyền gửi yêu cầu, để dự phòng
  // các trường hợp phát sinh chưa có sẵn trong danh sách lý do cố định ở trên.
  // Bắt buộc phải nhập diễn giải mục đích (xem ô "Diễn giải mục đích *" phía dưới).
  addOpt('checkout', 'khác', 'Xuất khác');
  addOpt('checkin', 'khác', 'Nhập khác');

  const selectedOpt = allowedOptions.find(o => o.key === requestKey);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMainType('');
      setRequestKey('');
      setDepartment('');
      
      const defaultReturn = new Date();
      defaultReturn.setDate(defaultReturn.getDate() + DEFAULT_RETURN_DAYS);
      setReturnDate(defaultReturn.toISOString().split('T')[0]);
      
      setTargetWarehouseId('');
      setCheckinDate(new Date().toISOString().split('T')[0]);
      setBank('');
      setBorrower('');
      setValuation('');
      setCollateralRatio('');
      setSaleStatus('ready_for_sale');
      setSalePrice('');
      setDecisionNo('');
      setSplitNotes('');
      setSplitChildren([{ certificate_no: '', area: '', subdivision: '' }]);
      setConcurrentMortgage(false);
      setUpdateOwnership(false);
      setNewOwnerEntityId('');
      setNewOwnerRole('cdt');
      setOtherReasonDetail('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpt) return;
    if (selectedOpt.reason === 'khác' && otherReasonDetail.trim().length < OTHER_REASON_MIN_LENGTH) return;
    
    setLoading(true);
    try {
      let details: any = {
        reason: selectedOpt.reason
      };

      if (selectedOpt.reason === 'khác') {
        details.otherReasonDetail = otherReasonDetail.trim();
      }

      if (selectedOpt.type === 'checkout') {
        details.department = department;
        details.targetWarehouseId = targetWarehouseId;
        
        if (selectedOpt.reason === 'mượn') {
          details.returnDate = returnDate;
        }
        
        if (selectedOpt.reason === 'chuyển nhượng') {
          details.concurrentMortgage = concurrentMortgage;
        }

        if (selectedOpt.reason === 'thế chấp' || (selectedOpt.reason === 'chuyển nhượng' && concurrentMortgage)) {
          details.bank = bank;
          details.mortgage_unit = borrower;
          details.bank_2 = bank2 || null;
          details.mortgage_unit_2 = mortgageUnit2 || null;
          details.valuation = valuation ? Number(valuation) : null;
          details.collateral_ratio = collateralRatio ? Number(collateralRatio) : null;
          details.expected_release_date = expectedReleaseDate || null;
        }

        if (selectedOpt.reason === 'xuất bán' || selectedOpt.reason === 'sang tên cho khách') {
          details.saleStatus = saleStatus;
          details.salePrice = salePrice ? Number(salePrice) : null;
        }

        if (selectedOpt.reason === 'tách sổ' || selectedOpt.reason === 'đổi sổ') {
          details.splitType = splitType;
          details.decisionNo = decisionNo;
          details.splitNotes = splitNotes;
          details.splitChildren = splitChildren;
          details.newCertificateNo = newCertificateNo;
          details.newRegistryNo = newRegistryNo;
          details.reissueReason = reissueReason;
          details.parentTotalArea = parentTotalArea;
          details.childrenTotalArea = childrenTotalArea;
          details.remainingArea = remainingArea;
        }

      } else if (selectedOpt.type === 'checkin') {
        details.checkinDate = checkinDate;
        details.targetWarehouseId = targetWarehouseId || (selectedAssets[0]?.warehouse_id || warehouses[0]?.id);
        
        if (selectedOpt.reason === 'chuyển nhượng' && newOwnerEntityId) {
          details.updateOwnership = true;
          details.newOwnerEntityId = newOwnerEntityId;
          details.newOwnerRole = newOwnerRole;
        }
      }

      await onSubmit(selectedOpt.type, details);
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
          {selectedOpt && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-md flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-blue-900 font-semibold">
                <FileCode2 className="w-4 h-4 text-[#1E3A8A]" />
                Mã chứng từ kho dự kiến sinh tự động:
              </div>
              <span className="font-mono text-sm font-bold text-[#1E3A8A] bg-white px-2.5 py-1 rounded border border-blue-300 shadow-sm">
                {previewVoucherCode(
                  warehouses.find(w => w.id === targetWarehouseId) || warehouses.find(w => w.id === selectedAssets[0]?.warehouse_id) || warehouses[0],
                  selectedOpt.type,
                  selectedOpt.reason
                )}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thao tác</label>
              <select
                required
                value={selectedMainType}
                onChange={(e) => {
                  setSelectedMainType(e.target.value as TransactionType);
                  setRequestKey('');
                }}
                className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="" disabled>-- Chọn thao tác --</option>
                <option value="checkout">Xuất kho</option>
                <option value="checkin">Nhập kho</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lý do cụ thể</label>
              <select
                required
                value={requestKey}
                onChange={(e) => setRequestKey(e.target.value)}
                disabled={!selectedMainType}
                className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="" disabled>-- Chọn lý do --</option>
                {allowedOptions.filter(o => o.type === selectedMainType).map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedOpt && (
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Ngày mong muốn nhận/trả GCN (Tùy chọn)
              </label>
              <input
                type="date"
                value={desiredReceiveDate}
                onChange={(e) => setDesiredReceiveDate(e.target.value)}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}

          {selectedOpt?.reason === 'khác' && (
            <div className="pt-2">
              <label className="block text-sm font-semibold text-amber-800 mb-1">
                Diễn giải mục đích * <span className="font-normal text-amber-700">(bắt buộc, tối thiểu {OTHER_REASON_MIN_LENGTH} ký tự — dùng cho trường hợp chưa có sẵn lý do phù hợp ở trên)</span>
              </label>
              <textarea
                required
                minLength={OTHER_REASON_MIN_LENGTH}
                rows={3}
                value={otherReasonDetail}
                onChange={e => setOtherReasonDetail(e.target.value)}
                placeholder="Nêu rõ lý do và mục đích của việc nhập/xuất này..."
                className="w-full rounded-md border border-amber-300 bg-amber-50/50 p-2.5 text-sm focus:border-amber-500 focus:ring-amber-500"
              />
              {otherReasonDetail.trim().length > 0 && otherReasonDetail.trim().length < OTHER_REASON_MIN_LENGTH && (
                <p className="text-xs text-red-600 mt-1">Vui lòng nhập ít nhất {OTHER_REASON_MIN_LENGTH} ký tự ({otherReasonDetail.trim().length}/{OTHER_REASON_MIN_LENGTH}).</p>
              )}
            </div>
          )}

          {selectedOpt?.type === 'checkout' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bộ phận sử dụng</label>
                  <input required type="text" value={department} onChange={e => setDepartment(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
                </div>
                {selectedOpt.reason === 'mượn' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày dự kiến trả</label>
                    <input required type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
                  </div>
                )}
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

              {selectedOpt.reason === 'chuyển nhượng' && userRole === 'capital_dept' && (
                <div className="pt-2">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" checked={concurrentMortgage} onChange={e => setConcurrentMortgage(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-700">Đồng thời xuất thế chấp</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {selectedOpt?.type === 'checkin' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày nhập thực tế *</label>
                  <input required type="date" value={checkinDate} onChange={e => setCheckinDate(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kho nhập sổ *</label>
                  <select
                    value={targetWarehouseId || (selectedAssets[0]?.warehouse_id || '')}
                    onChange={e => setTargetWarehouseId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">-- Chọn kho lưu trữ --</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.is_central ? '(Kho TT)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedOpt.reason === 'chuyển nhượng' && ['capital_dept', 'admin', 'super_admin'].includes(userRole) && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Pháp nhân đích (Chủ sở hữu mới) *</label>
                      <select required value={newOwnerEntityId} onChange={e => {
                        setNewOwnerEntityId(e.target.value);
                        setUpdateOwnership(true);
                      }} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                        <option value="">-- Chọn pháp nhân --</option>
                        {investorEntities.map(e => (
                          <option key={e.id} value={e.id}>{e.name} ({e.company_code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Phân loại *</label>
                      <select required value={newOwnerRole} onChange={e => setNewOwnerRole(e.target.value as any)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                        <option value="cdt">Chủ đầu tư (CĐT)</option>
                        <option value="ndt">Nhà đầu tư (NĐT)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Special forms based on reason */}
          {(selectedOpt?.reason === 'thế chấp' || (selectedOpt?.reason === 'chuyển nhượng' && concurrentMortgage)) && (
            <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-3 rounded border border-blue-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 1 *</label>
                <input required type="text" value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 1 *</label>
                <input required type="text" value={borrower} onChange={e => setBorrower(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {(selectedOpt?.reason === 'xuất bán' || selectedOpt?.reason === 'sang tên cho khách') && (
            <div className="grid grid-cols-2 gap-4 bg-orange-50 p-3 rounded border border-orange-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cập nhật Trạng thái bán *</label>
                <select value={saleStatus} onChange={e => setSaleStatus(e.target.value as any)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                  <option value="ready_for_sale">Sẵn sàng bán</option>
                  <option value="sold">Đã bán</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị giao dịch (Tùy chọn)</label>
                <input type="number" placeholder="VNĐ" value={salePrice} onChange={e => setSalePrice(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {(selectedOpt?.reason === 'tách sổ' || selectedOpt?.reason === 'đổi sổ') && (
            <div className="space-y-4">
              {/* Similar to existing split logic, simplified for constraints */}
              <div className="bg-indigo-50/50 p-3 rounded border border-indigo-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Loại hình xử lý</label>
                <div className="flex gap-4">
                  <label className="flex items-center text-sm"><input type="radio" checked={splitType==='partial'} onChange={()=>setSplitType('partial')} className="mr-2"/>Tách một phần</label>
                  <label className="flex items-center text-sm"><input type="radio" checked={splitType==='full'} onChange={()=>setSplitType('full')} className="mr-2"/>Tách toàn bộ</label>
                  <label className="flex items-center text-sm"><input type="radio" checked={splitType==='reissue'} onChange={()=>setSplitType('reissue')} className="mr-2"/>Cấp đổi/Cấp lại</label>
                </div>
              </div>
              
              {splitType !== 'reissue' && (
                <div className="space-y-2">
                  <button type="button" onClick={() => setSplitChildren([...splitChildren, { certificate_no: '', area: '', subdivision: '', land_lot_no: '' }])} className="text-xs text-blue-600 font-semibold flex items-center">
                    <Plus className="w-4 h-4 mr-1"/> Thêm GCN con
                  </button>
                  {splitChildren.map((child, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input required type="text" placeholder="Số GCN mới *" value={child.certificate_no} onChange={e => { const n = [...splitChildren]; n[idx].certificate_no = e.target.value; setSplitChildren(n); }} className="w-1/3 rounded border p-1 text-xs"/>
                      <input required type="number" placeholder="Diện tích *" value={child.area} onChange={e => { const n = [...splitChildren]; n[idx].area = e.target.value; setSplitChildren(n); }} className="w-1/4 rounded border p-1 text-xs"/>
                      <button type="button" onClick={() => setSplitChildren(splitChildren.filter((_,i) => i!==idx))} disabled={splitChildren.length===1} className="text-red-500"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  ))}
                </div>
              )}
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
              disabled={loading || !selectedOpt || (selectedOpt.reason === 'khác' && otherReasonDetail.trim().length < OTHER_REASON_MIN_LENGTH)}
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