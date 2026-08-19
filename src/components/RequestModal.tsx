import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Plus, Trash2, FileCode2 } from 'lucide-react';
import { Role } from '../contexts/AuthContext';
import { TransactionType, Asset } from '../types';
import { previewVoucherCode } from '../lib/voucherEngine';

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

  const parentTotalArea = selectedAssets.reduce((sum, a) => sum + (a.area || 0), 0);
  const childrenTotalArea = splitChildren.reduce((sum, c) => sum + (parseFloat(c.area) || 0), 0);
  const remainingArea = Math.max(0, parentTotalArea - childrenTotalArea);

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
          details = { 
            bank, 
            mortgage_unit: borrower, 
            bank_2: bank2 || null,
            mortgage_unit_2: mortgageUnit2 || null,
            valuation: Number(valuation), 
            collateral_ratio: Number(collateralRatio),
            expected_release_date: expectedReleaseDate || null 
          };
          break;
        case 'sale_update':
          details = { saleStatus, salePrice: salePrice ? Number(salePrice) : null };
          break;
        case 'split':
          details = { 
            splitType, 
            decisionNo, 
            splitNotes, 
            splitChildren,
            newCertificateNo,
            newRegistryNo,
            reissueReason,
            parentTotalArea,
            childrenTotalArea,
            remainingArea
          };
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
          {/* Voucher Preview Banner */}
          {type && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-md flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-blue-900 font-semibold">
                <FileCode2 className="w-4 h-4 text-[#1E3A8A]" />
                Mã chứng từ kho dự kiến sinh tự động:
              </div>
              <span className="font-mono text-sm font-bold text-[#1E3A8A] bg-white px-2.5 py-1 rounded border border-blue-300 shadow-sm">
                {previewVoucherCode(
                  warehouses.find(w => w.id === targetWarehouseId) || warehouses.find(w => w.id === selectedAssets[0]?.warehouse_id) || warehouses[0],
                  type
                )}
              </span>
            </div>
          )}

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
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 1 *</label>
                <input required type="text" value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 1 *</label>
                <input required type="text" value={borrower} onChange={e => setBorrower(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 2</label>
                <input type="text" value={bank2} onChange={e => setBank2(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 2</label>
                <input type="text" value={mortgageUnit2} onChange={e => setMortgageUnit2(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                <input required type="number" min="0" value={valuation} onChange={e => setValuation(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                <input required type="number" min="0" max="100" step="0.01" value={collateralRatio} onChange={e => setCollateralRatio(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày dự kiến giải chấp</label>
                <input type="date" value={expectedReleaseDate} onChange={e => setExpectedReleaseDate(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
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
                      Một hoặc nhiều GCN bạn chọn đang được thế chấp ngân hàng. Vui lòng giải chấp hoặc nhập lý do/chủ trương phê duyệt trước khi yêu cầu.
                    </p>
                  </div>
                </div>
              )}

              {/* CHỌN LOẠI NGHIỆP VỤ TÁCH / CẤP ĐỔI */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Hình thức nghiệp vụ</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSplitType('partial')}
                    className={`px-3 py-2.5 text-xs font-semibold rounded-lg border text-left flex flex-col transition-all ${
                      splitType === 'partial'
                        ? 'bg-blue-50 border-[#1E3A8A] text-[#1E3A8A] shadow-sm ring-1 ring-[#1E3A8A]'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span> Tách 1 phần
                    </span>
                    <span className="text-[10px] text-gray-500 mt-1">Sổ gốc còn hiệu lực, giảm diện tích còn lại</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSplitType('full')}
                    className={`px-3 py-2.5 text-xs font-semibold rounded-lg border text-left flex flex-col transition-all ${
                      splitType === 'full'
                        ? 'bg-purple-50 border-purple-700 text-purple-900 shadow-sm ring-1 ring-purple-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-600"></span> Tách toàn bộ
                    </span>
                    <span className="text-[10px] text-gray-500 mt-1">Sổ cũ hết hiệu lực, tách thành nhiều sổ con</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSplitType('reissue')}
                    className={`px-3 py-2.5 text-xs font-semibold rounded-lg border text-left flex flex-col transition-all ${
                      splitType === 'reissue'
                        ? 'bg-amber-50 border-amber-600 text-amber-900 shadow-sm ring-1 ring-amber-600'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-600"></span> Cấp đổi / Cấp lại
                    </span>
                    <span className="text-[10px] text-gray-500 mt-1">Thu hồi sổ cũ, cấp số GCN mới kế thừa</span>
                  </button>
                </div>
              </div>

              {splitType !== 'reissue' ? (
                <>
                  {/* TÁCH 1 PHẦN HOẶC TÁCH TOÀN BỘ */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Số quyết định / Văn bản pháp lý <span className="text-red-500">*</span></label>
                      <input 
                        required 
                        type="text" 
                        placeholder="VD: QĐ-128/UBND-TNMT"
                        value={decisionNo} 
                        onChange={e => setDecisionNo(e.target.value)} 
                        className="w-full rounded-md border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú biến động</label>
                      <input 
                        type="text" 
                        placeholder="VD: Tách thửa bàn giao khách hàng..."
                        value={splitNotes} 
                        onChange={e => setSplitNotes(e.target.value)} 
                        className="w-full rounded-md border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500" 
                      />
                    </div>
                  </div>

                  {/* THỐNG KÊ DIỆN TÍCH TRỰC QUAN */}
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <span className="text-gray-500 block">Diện tích sổ gốc ban đầu:</span>
                      <span className="font-bold text-gray-800 text-sm">{parentTotalArea.toLocaleString('vi-VN')} m²</span>
                    </div>
                    <div className="text-center">
                      <span className="text-gray-500 block">Tổng DT tách ra:</span>
                      <span className="font-bold text-blue-700 text-sm">{childrenTotalArea.toLocaleString('vi-VN')} m²</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-500 block">
                        {splitType === 'partial' ? 'DT còn lại của sổ gốc:' : 'Trạng thái sổ gốc sau tách:'}
                      </span>
                      {splitType === 'partial' ? (
                        <span className={`font-bold text-sm ${remainingArea < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {remainingArea.toLocaleString('vi-VN')} m² {remainingArea < 0 && '(Vượt quá DT gốc!)'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">
                          Hết hiệu lực (Đã tách hết)
                        </span>
                      )}
                    </div>
                  </div>

                  {hasMortgagedAssets && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Lý do tách khi đang thế chấp <span className="text-red-500">*</span></label>
                      <textarea required rows={2} value={splitNotes} onChange={e => setSplitNotes(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500"></textarea>
                    </div>
                  )}

                  {/* DANH SÁCH SỔ CON */}
                  <div className="pt-2 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Danh sách GCN con phát sinh</label>
                      <button 
                        type="button" 
                        onClick={() => setSplitChildren([...splitChildren, { certificate_no: '', area: '', subdivision: '', land_lot_no: '' }])} 
                        className="text-xs flex items-center text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Thêm GCN con
                      </button>
                    </div>
                    
                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                      {splitChildren.map((child, idx) => (
                        <div key={idx} className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                          <span className="text-xs font-bold text-gray-400 mt-2 w-4">{idx + 1}.</span>
                          <div className="flex-1 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input 
                                required 
                                type="text" 
                                placeholder="Số GCN mới *" 
                                value={child.certificate_no} 
                                onChange={e => {
                                  const newC = [...splitChildren]; newC[idx].certificate_no = e.target.value; setSplitChildren(newC);
                                }} 
                                className="w-full rounded border border-gray-300 p-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-500" 
                              />
                              <input 
                                required 
                                type="number" 
                                step="0.01" 
                                placeholder="Diện tích (m²) *" 
                                value={child.area} 
                                onChange={e => {
                                  const newC = [...splitChildren]; newC[idx].area = e.target.value; setSplitChildren(newC);
                                }} 
                                className="w-full rounded border border-gray-300 p-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-500" 
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input 
                                type="text" 
                                placeholder="Thửa đất số / Lô" 
                                value={child.land_lot_no || ''} 
                                onChange={e => {
                                  const newC = [...splitChildren]; newC[idx].land_lot_no = e.target.value; setSplitChildren(newC);
                                }} 
                                className="w-full rounded border border-gray-300 p-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-500" 
                              />
                              <input 
                                type="text" 
                                placeholder="Phân khu (nếu khác)" 
                                value={child.subdivision} 
                                onChange={e => {
                                  const newC = [...splitChildren]; newC[idx].subdivision = e.target.value; setSplitChildren(newC);
                                }} 
                                className="w-full rounded border border-gray-300 p-1.5 text-xs bg-white focus:ring-1 focus:ring-blue-500" 
                              />
                            </div>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => {
                              if (splitChildren.length > 1) {
                                setSplitChildren(splitChildren.filter((_, i) => i !== idx));
                              }
                            }} 
                            className="p-1.5 text-gray-400 hover:text-red-600 shrink-0 mt-1" 
                            disabled={splitChildren.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* CẤP ĐỔI / CẤP LẠI GCN */
                <div className="space-y-3 bg-amber-50/50 p-3 rounded-lg border border-amber-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Số GCN mới <span className="text-red-500">*</span></label>
                      <input 
                        required 
                        type="text" 
                        placeholder="VD: CN 998877..." 
                        value={newCertificateNo} 
                        onChange={e => setNewCertificateNo(e.target.value)} 
                        className="w-full rounded-md border border-gray-300 p-2 text-xs bg-white focus:border-blue-500 focus:ring-blue-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Số vào sổ cấp GCN mới</label>
                      <input 
                        type="text" 
                        placeholder="VD: CS-01234" 
                        value={newRegistryNo} 
                        onChange={e => setNewRegistryNo(e.target.value)} 
                        className="w-full rounded-md border border-gray-300 p-2 text-xs bg-white focus:border-blue-500 focus:ring-blue-500" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Lý do cấp đổi / cấp lại <span className="text-red-500">*</span></label>
                    <textarea 
                      required 
                      rows={2} 
                      placeholder="VD: Cấp đổi do GCN cũ bị rách nát / Đổi sang mẫu phôi mới theo Luật Đất Đai..." 
                      value={reissueReason} 
                      onChange={e => setReissueReason(e.target.value)} 
                      className="w-full rounded-md border border-gray-300 p-2 text-xs bg-white focus:border-blue-500 focus:ring-blue-500" 
                    />
                  </div>

                  <div className="p-2.5 bg-amber-100/70 rounded text-[11px] text-amber-900 leading-relaxed">
                    💡 <b>Quy trình tự động:</b> Sau khi phê duyệt, hệ thống sẽ lưu trữ và đóng sổ cũ (chuyển sang trạng thái Hết hiệu lực), đồng thời tạo GCN mới kế thừa nguyên vẹn diện tích ({parentTotalArea.toLocaleString('vi-VN')} m²), dự án và hồ sơ liên quan.
                  </div>
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
