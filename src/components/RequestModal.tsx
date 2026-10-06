import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, Plus, Trash2, FileCode2, Building2, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
import { useAuth, Role } from '../contexts/AuthContext';
import { TransactionType, TransactionReason, Asset } from '../types';
import { DEFAULT_WAREHOUSE_SLA_DAYS, DEFAULT_RETURN_DAYS } from '../lib/constants';
import { previewVoucherCode } from '../lib/voucherEngine';
import { fetchInvestorEntities } from '../api/investorEntities';
import { validateScanLink } from '../lib/scanLink';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (type: TransactionType, details: any, appliedAssets?: Asset[]) => Promise<void>;
  selectedAssets: Asset[];
  userRole: Role;
  warehouses: any[];
}

/**
 * Hàm kiểm tra thực tế GCN đang lưu kho hay đang ở ngoài kho
 * Dựa trên is_in_warehouse (chuẩn thực tế kho) hoặc fallback custody_status === 'in_stock'
 */
export const isAssetInWarehouse = (asset: Asset): boolean => {
  if (asset.is_in_warehouse !== undefined && asset.is_in_warehouse !== null) {
    return Boolean(asset.is_in_warehouse);
  }
  return asset.custody_status === 'in_stock';
};

export const RequestModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedAssets,
  userRole,
  warehouses,
}) => {
  const { profile, effectiveRole } = useAuth();
  const [requestKey, setRequestKey] = useState<string>('');
  const [desiredReceiveDate, setDesiredReceiveDate] = useState('');
  const [loading, setLoading] = useState(false);

  // Phân loại tài sản theo trạng thái kho
  const inWarehouseAssets = useMemo(
    () => selectedAssets.filter(isAssetInWarehouse),
    [selectedAssets]
  );
  const outWarehouseAssets = useMemo(
    () => selectedAssets.filter(a => !isAssetInWarehouse(a)),
    [selectedAssets]
  );

  const isMixedStatus = inWarehouseAssets.length > 0 && outWarehouseAssets.length > 0;
  const allInWarehouse = inWarehouseAssets.length > 0 && outWarehouseAssets.length === 0;
  const allOutOfWarehouse = outWarehouseAssets.length > 0 && inWarehouseAssets.length === 0;

  // Tab chọn nhóm tài sản khi ở trạng thái hỗn hợp
  const [activeGroupTab, setActiveGroupTab] = useState<'in_warehouse' | 'out_warehouse'>('in_warehouse');

  // Danh sách GCN thực tế áp dụng cho phiếu yêu cầu
  const activeAssets = useMemo(() => {
    if (isMixedStatus) {
      return activeGroupTab === 'in_warehouse' ? inWarehouseAssets : outWarehouseAssets;
    }
    if (allInWarehouse) return inWarehouseAssets;
    if (allOutOfWarehouse) return outWarehouseAssets;
    return selectedAssets;
  }, [isMixedStatus, activeGroupTab, inWarehouseAssets, outWarehouseAssets, allInWarehouse, allOutOfWarehouse, selectedAssets]);

  // Checkout fields
  const [department, setDepartment] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [concurrentMortgage, setConcurrentMortgage] = useState(false);

  // Checkin fields
  const [checkinDate, setCheckinDate] = useState('');
  const [updateOwnership, setUpdateOwnership] = useState(false);
  const [newOwnerEntityId, setNewOwnerEntityId] = useState('');
  const [newOwnerRole, setNewOwnerRole] = useState<'cdt' | 'ndt'>('cdt');
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
  const [splitChildren, setSplitChildren] = useState<
    { certificate_no: string; area: string; subdivision: string; land_lot_no?: string }[]
  >([{ certificate_no: '', area: '', subdivision: '', land_lot_no: '' }]);

  // "Nhập khác" / "Xuất khác" — diễn giải mục đích bắt buộc khi phát sinh trường hợp chưa có sẵn
  const [otherReasonDetail, setOtherReasonDetail] = useState('');
  const OTHER_REASON_MIN_LENGTH = 10;

  // Link bản scan OneDrive chung cho cả phiếu yêu cầu
  const [scanUrl, setScanUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchInvestorEntities().then(data => setInvestorEntities(data)).catch(console.error);
    }
  }, [isOpen]);

  const parentTotalArea = activeAssets.reduce((sum, a) => sum + (a.area || 0), 0);
  const childrenTotalArea = splitChildren.reduce((sum, c) => sum + (parseFloat(c.area) || 0), 0);
  const remainingArea = Math.max(0, parentTotalArea - childrenTotalArea);

  // Helper để lấy tên phòng ban mặc định theo vai trò / profile
  const getDefaultDepartment = () => {
    const roleForDept = userRole || effectiveRole || profile?.role;
    switch (roleForDept) {
      case 'project_dept':
        return 'Ban PTDA & Ban Đối Ngoại';
      case 'capital_dept':
        return 'Phòng Nguồn Vốn';
      case 're_dept':
        return 'Khối SPG';
      case 'investor':
        return 'Chủ đầu tư / Nhà đầu tư';
      case 'warehouse_manager':
        return profile?.organization?.trim() || 'Bộ phận Quản lý Kho';
      case 'btc_manager':
      case 'admin':
      case 'super_admin':
        return profile?.organization?.trim() || 'Ban Quản trị BTC VMT';
      case 'supervisor':
        return profile?.organization?.trim() || 'Bộ phận Giám sát';
      case 'viewer':
        return profile?.organization?.trim() || 'Bộ phận Tra cứu';
      default:
        return profile?.organization?.trim() || (profile?.purpose ? `Bộ phận ${profile.purpose}` : 'Bộ phận sử dụng');
    }
  };

  // Filter allowed types based on role
  const allowedOptions: { key: string; type: TransactionType; reason: TransactionReason; label: string }[] = [];

  const addOpt = (type: TransactionType, reason: TransactionReason, label: string) => {
    allowedOptions.push({ key: `${type}_${reason}`, type, reason, label });
  };

  const [selectedMainType, setSelectedMainType] = useState<TransactionType | ''>('');

  if (userRole === 'capital_dept') {
    addOpt('checkout', 'mượn', 'Xuất Mượn');
    addOpt('checkout', 'thế chấp', 'Xuất Thế chấp');
    addOpt('checkout', 'chuyển nhượng', 'Xuất Chuyển nhượng / Chuyển kho');
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
    addOpt('checkout', 'chuyển nhượng', 'Xuất Chuyển nhượng / Chuyển kho');
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

  // "Nhập khác" / "Xuất khác": áp dụng cho MỌI vai trò đã có quyền gửi yêu cầu
  addOpt('checkout', 'khác', 'Xuất khác');
  addOpt('checkin', 'khác', 'Nhập khác');

  const selectedOpt = allowedOptions.find(o => o.key === requestKey);

  // PHÂN LOẠI XUẤT KHO:
  // 1. Chỉ duy nhất khi "Xuất chuyển kho / Chuyển nhượng" (chuyển nhượng) mới cần chọn Kho nhận (targetWarehouseId)
  const isTransferToWarehouse =
    selectedOpt?.type === 'checkout' && selectedOpt?.reason === 'chuyển nhượng';

  // 2. Các trường hợp xuất ra bên ngoài / mượn / thế chấp KHÔNG cần kho nhận
  const isDirectCustomerExport =
    selectedOpt?.type === 'checkout' &&
    (selectedOpt?.reason === 'xuất bán' || selectedOpt?.reason === 'sang tên cho khách');

  // Reset & Tự động gán thao tác thông minh khi modal mở hoặc danh sách GCN thay đổi
  useEffect(() => {
    if (isOpen) {
      // Tự động phân loại thao tác dựa trên trạng thái kho của GCN
      if (inWarehouseAssets.length > 0) {
        setActiveGroupTab('in_warehouse');
        setSelectedMainType('checkout');
      } else if (outWarehouseAssets.length > 0) {
        setActiveGroupTab('out_warehouse');
        setSelectedMainType('checkin');
      } else {
        setSelectedMainType('');
      }

      setRequestKey('');
      setDepartment(getDefaultDepartment());

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
      setScanUrl('');
    }
  }, [isOpen, selectedAssets, inWarehouseAssets.length, outWarehouseAssets.length, userRole, effectiveRole, profile]);

  // Chuyển nhóm tab khi trạng thái hỗn hợp
  const handleSwitchTab = (tab: 'in_warehouse' | 'out_warehouse') => {
    setActiveGroupTab(tab);
    if (tab === 'in_warehouse') {
      setSelectedMainType('checkout');
    } else {
      setSelectedMainType('checkin');
    }
    setRequestKey('');
  };

  // Xử lý thông minh khi người dùng thay đổi lý do cụ thể
  const handleReasonChange = (key: string) => {
    setRequestKey(key);
    const opt = allowedOptions.find(o => o.key === key);
    if (opt && opt.type === 'checkout') {
      if (opt.reason === 'xuất bán' || opt.reason === 'sang tên cho khách') {
        setSaleStatus('sold');
      }
      // Chỉ giữ lại targetWarehouseId nếu lý do là chuyển kho / chuyển nhượng
      if (opt.reason !== 'chuyển nhượng') {
        setTargetWarehouseId('');
      }
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpt) return;
    if (selectedOpt.reason === 'khác' && otherReasonDetail.trim().length < OTHER_REASON_MIN_LENGTH) return;

    const scanValidation = validateScanLink(scanUrl);
    if (!scanValidation.ok) {
      toast.error(scanValidation.error || 'Link bản scan không hợp lệ.');
      return;
    }

    setLoading(true);
    try {
      let details: any = {
        reason: selectedOpt.reason,
        scan_url: scanValidation.url || null,
        scanUrl: scanValidation.url || null,
        appliedAssets: activeAssets,
        appliedAssetIds: activeAssets.map(a => a.id),
      };

      if (selectedOpt.reason === 'khác') {
        details.otherReasonDetail = otherReasonDetail.trim();
      }

      if (selectedOpt.type === 'checkout') {
        details.department = department.trim();

        // Chỉ lưu targetWarehouseId khi thực sự là giao dịch chuyển kho / chuyển nhượng
        if (isTransferToWarehouse || (selectedOpt.reason === 'khác' && targetWarehouseId)) {
          details.targetWarehouseId = targetWarehouseId;
        } else {
          details.targetWarehouseId = null;
        }

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
        details.targetWarehouseId = targetWarehouseId || activeAssets[0]?.warehouse_id || warehouses[0]?.id;

        if (selectedOpt.reason === 'chuyển nhượng' && newOwnerEntityId) {
          details.updateOwnership = true;
          details.newOwnerEntityId = newOwnerEntityId;
          details.newOwnerRole = newOwnerRole;
        }
      }

      await onSubmit(selectedOpt.type, details, activeAssets);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
      <div className="relative w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] flex flex-col border border-gray-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50 rounded-t-xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1E3A8A] text-white flex items-center justify-center font-bold text-xs">
              {activeAssets.length}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Tạo yêu cầu biến động ({activeAssets.length} GCN áp dụng{isMixedStatus ? ` / ${selectedAssets.length} đã chọn` : ''})
              </h3>
              <p className="text-xs text-gray-500">Lập phiếu đề xuất xuất kho hoặc nhập kho GCN</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* CẢNH BÁO & PHÂN NHÓM KHI TRẠNG THÁI KHO BỊ LẪN LỘN (Bulk Mixed Status) */}
          {isMixedStatus && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Trạng thái lưu kho không đồng nhất
                  </h4>
                  <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                    Danh sách gồm <strong className="font-bold text-amber-950">{selectedAssets.length} GCN</strong> đã chọn có{' '}
                    <strong className="font-bold text-emerald-800">{inWarehouseAssets.length} GCN đang trong kho</strong> và{' '}
                    <strong className="font-bold text-blue-800">{outWarehouseAssets.length} GCN đang ở ngoài kho</strong>.
                    Vui lòng chọn nhóm GCN bạn muốn xử lý trong phiếu này:
                  </p>
                </div>
              </div>

              {/* Segmented Filter Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-amber-100/70 rounded-lg border border-amber-200/80">
                <button
                  type="button"
                  onClick={() => handleSwitchTab('in_warehouse')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    activeGroupTab === 'in_warehouse'
                      ? 'bg-white text-[#1E3A8A] shadow-xs border border-amber-200/50'
                      : 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                    {inWarehouseAssets.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                    Phiếu Xuất kho ({inWarehouseAssets.length} GCN)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSwitchTab('out_warehouse')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    activeGroupTab === 'out_warehouse'
                      ? 'bg-white text-[#1E3A8A] shadow-xs border border-amber-200/50'
                      : 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">
                    {outWarehouseAssets.length}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-blue-600" />
                    Phiếu Nhập kho ({outWarehouseAssets.length} GCN)
                  </span>
                </button>
              </div>

              <div className="text-[11px] text-amber-800 pt-0.5 px-0.5 flex items-center justify-between">
                <span>
                  {activeGroupTab === 'in_warehouse' ? (
                    <>
                      Đang xử lý: <strong>{inWarehouseAssets.length} GCN đang trong kho</strong>.{' '}
                      <span className="text-amber-700/80">({outWarehouseAssets.length} GCN ngoài kho vẫn được bảo lưu ở bảng)</span>
                    </>
                  ) : (
                    <>
                      Đang xử lý: <strong>{outWarehouseAssets.length} GCN đang ngoài kho</strong>.{' '}
                      <span className="text-amber-700/80">({inWarehouseAssets.length} GCN trong kho vẫn được bảo lưu ở bảng)</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Danh sách GCN áp dụng (Visual chips preview) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
              <span className="font-semibold text-slate-800">
                Danh sách {activeAssets.length} GCN áp dụng cho phiếu:
              </span>
              <span className="text-[11px] text-slate-500 font-normal">
                {activeGroupTab === 'in_warehouse' || allInWarehouse ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đang lưu kho
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    Đang ở ngoài kho
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {activeAssets.map(asset => (
                <span
                  key={asset.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-white border border-slate-200 text-slate-800 shadow-2xs"
                  title={`Mã TS: ${asset.asset_code || '-'} | Trạng thái: ${isAssetInWarehouse(asset) ? 'Trong kho' : 'Ngoài kho'}`}
                >
                  <span className="font-semibold">{asset.certificate_no}</span>
                  {asset.asset_code && <span className="text-slate-400 text-[10px]">({asset.asset_code})</span>}
                </span>
              ))}
            </div>
          </div>

          {selectedOpt && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-blue-900 font-semibold">
                <FileCode2 className="w-4 h-4 text-[#1E3A8A]" />
                Mã chứng từ kho dự kiến sinh tự động:
              </div>
              <span className="font-mono text-sm font-bold text-[#1E3A8A] bg-white px-2.5 py-1 rounded border border-blue-300 shadow-xs">
                {previewVoucherCode(
                  warehouses.find(w => w.id === targetWarehouseId) ||
                    warehouses.find(w => w.id === activeAssets[0]?.warehouse_id) ||
                    warehouses[0],
                  selectedOpt.type,
                  selectedOpt.reason
                )}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Thao tác <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={selectedMainType}
                onChange={e => {
                  setSelectedMainType(e.target.value as TransactionType);
                  setRequestKey('');
                }}
                disabled={allInWarehouse || allOutOfWarehouse || isMixedStatus}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-xs bg-white focus:border-blue-500 focus:ring-blue-500 font-medium disabled:bg-slate-100 disabled:text-slate-800 disabled:cursor-not-allowed"
              >
                {!selectedMainType && (
                  <option value="" disabled>
                    -- Chọn thao tác --
                  </option>
                )}
                {/* Chỉ hiện Xuất kho khi GCN đang trong kho */}
                {(allInWarehouse || (isMixedStatus && activeGroupTab === 'in_warehouse') || (!allInWarehouse && !allOutOfWarehouse && !isMixedStatus)) && (
                  <option value="checkout">Xuất kho (Bàn giao / Mượn / Thế chấp / Xuất bán)</option>
                )}
                {/* Chỉ hiện Nhập kho khi GCN đang ngoài kho */}
                {(allOutOfWarehouse || (isMixedStatus && activeGroupTab === 'out_warehouse') || (!allInWarehouse && !allOutOfWarehouse && !isMixedStatus)) && (
                  <option value="checkin">Nhập kho (Nhập trả / Giải chấp / Cấp mới)</option>
                )}
              </select>
              {(allInWarehouse || (isMixedStatus && activeGroupTab === 'in_warehouse')) && (
                <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                  ✓ GCN đang lưu kho: Tự động chọn phiếu Xuất kho
                </p>
              )}
              {(allOutOfWarehouse || (isMixedStatus && activeGroupTab === 'out_warehouse')) && (
                <p className="text-[11px] text-blue-700 mt-1 font-medium">
                  ✓ GCN đang ở ngoài kho: Tự động chọn phiếu Nhập kho
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Lý do cụ thể <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={requestKey}
                onChange={e => handleReasonChange(e.target.value)}
                disabled={!selectedMainType}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-xs bg-white focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 font-medium"
              >
                <option value="" disabled>
                  -- Chọn lý do --
                </option>
                {allowedOptions
                  .filter(o => o.type === selectedMainType)
                  .map(t => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {selectedOpt && (
            <div className="pt-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ngày mong muốn nhận/trả GCN (Tùy chọn)
              </label>
              <input
                type="date"
                value={desiredReceiveDate}
                onChange={e => setDesiredReceiveDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}

          {selectedOpt && (
            <div className="pt-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Link bản scan OneDrive (Không bắt buộc)
              </label>
              <input
                type="url"
                value={scanUrl}
                onChange={e => setScanUrl(e.target.value)}
                placeholder="https://sun-my.sharepoint.com/... hoặc link OneDrive"
                className="w-full rounded-lg border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500 bg-white"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Đính kèm link bản scan OneDrive dùng chung cho toàn bộ {activeAssets.length} GCN trong phiếu này.
              </p>
            </div>
          )}

          {selectedOpt?.reason === 'khác' && (
            <div className="pt-2">
              <label className="block text-xs font-semibold text-amber-800 mb-1">
                Diễn giải mục đích *{' '}
                <span className="font-normal text-amber-700">
                  (bắt buộc, tối thiểu {OTHER_REASON_MIN_LENGTH} ký tự — dùng cho trường hợp chưa có sẵn lý do phù hợp ở
                  trên)
                </span>
              </label>
              <textarea
                required
                rows={3}
                value={otherReasonDetail}
                onChange={e => setOtherReasonDetail(e.target.value)}
                placeholder="Nhập chi tiết mục đích xuất/nhập kho cho trường hợp này (tối thiểu 10 ký tự)..."
                className="w-full rounded-lg border border-amber-300 p-2 text-xs focus:border-amber-500 focus:ring-amber-500 bg-amber-50/30"
              />
              <p
                className={`text-[11px] mt-1 ${
                  otherReasonDetail.trim().length >= OTHER_REASON_MIN_LENGTH ? 'text-emerald-700 font-medium' : 'text-amber-700'
                }`}
              >
                Đã nhập {otherReasonDetail.trim().length}/{OTHER_REASON_MIN_LENGTH} ký tự tối thiểu
              </p>
            </div>
          )}

          {/* CHECKOUT SPECIFIC FIELDS */}
          {selectedOpt?.type === 'checkout' && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Đơn vị / Phòng ban nhận GCN <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="VD: Phòng Nguồn Vốn / Khối SPG / Ban PTDA..."
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500 bg-white"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Tên phòng ban nội bộ hoặc đơn vị tiếp nhận bản gốc GCN.
                  </p>
                </div>

                {/* Hạn trả: chỉ hiện khi Xuất mượn */}
                {selectedOpt.reason === 'mượn' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Hạn trả mượn dự kiến <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="date"
                      value={returnDate}
                      onChange={e => setReturnDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Mặc định {DEFAULT_RETURN_DAYS} ngày kể từ hôm nay.</p>
                  </div>
                )}

                {/* Kho nhận: CHỈ hiện khi Xuất Chuyển nhượng / Chuyển kho */}
                {isTransferToWarehouse && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Kho nhận đích đến <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={targetWarehouseId}
                      onChange={e => setTargetWarehouseId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500 bg-white"
                    >
                      <option value="" disabled>
                        -- Chọn kho nhận --
                      </option>
                      {warehouses
                        .filter(w => w.id !== activeAssets[0]?.warehouse_id)
                        .map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name} {w.is_central ? '(Kho trung tâm)' : ''}
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-blue-600 mt-1">
                      Bắt buộc chọn Kho tiếp nhận khi làm thủ tục Chuyển kho / Điều chuyển.
                    </p>
                  </div>
                )}
              </div>

              {/* Thông tin hỗ trợ cho các lý do xuất khác: không cần kho nhận */}
              {isDirectCustomerExport && (
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-xs text-emerald-800">
                  <p className="font-semibold">Xuất bàn giao trực tiếp cho khách hàng:</p>
                  <p className="text-[11px] mt-0.5 text-emerald-700">
                    Bản gốc GCN sẽ được bàn giao cho Khách hàng/Đối tác, không lưu trữ tại kho công ty nữa.
                  </p>
                </div>
              )}

              {/* Thế chấp đồng thời khi chuyển nhượng */}
              {selectedOpt.reason === 'chuyển nhượng' && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={concurrentMortgage}
                      onChange={e => setConcurrentMortgage(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Thế chấp đồng thời (Chuyển nhượng kèm hồ sơ vay thế chấp mới)</span>
                  </label>
                </div>
              )}

              {/* Thông tin thế chấp */}
              {(selectedOpt.reason === 'thế chấp' || (selectedOpt.reason === 'chuyển nhượng' && concurrentMortgage)) && (
                <div className="space-y-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Thông tin Thế chấp Ngân hàng</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Ngân hàng nhận thế chấp <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="VD: Vietcombank - CN Đà Nẵng"
                        value={bank}
                        onChange={e => setBank(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Đơn vị vay vốn <span className="text-red-500">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Tên pháp nhân vay..."
                        value={borrower}
                        onChange={e => setBorrower(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                      <input
                        type="number"
                        placeholder="VD: 5000000000"
                        value={valuation}
                        onChange={e => setValuation(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                      <input
                        type="number"
                        placeholder="VD: 70"
                        value={collateralRatio}
                        onChange={e => setCollateralRatio(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Ngân hàng 2 (Tùy chọn)</label>
                      <input
                        type="text"
                        placeholder="Ngân hàng phụ/đồng tài trợ..."
                        value={bank2}
                        onChange={e => setBank2(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Đơn vị vay 2 (Tùy chọn)</label>
                      <input
                        type="text"
                        placeholder="Đơn vị vay phụ..."
                        value={mortgageUnit2}
                        onChange={e => setMortgageUnit2(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Ngày dự kiến giải chấp (Tùy chọn)
                      </label>
                      <input
                        type="date"
                        value={expectedReleaseDate}
                        onChange={e => setExpectedReleaseDate(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Thông tin xuất bán */}
              {(selectedOpt.reason === 'xuất bán' || selectedOpt.reason === 'sang tên cho khách') && (
                <div className="space-y-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Thông tin Bán hàng & Chuyển quyền</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Trạng thái kinh doanh</label>
                      <select
                        value={saleStatus}
                        onChange={e => setSaleStatus(e.target.value as any)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      >
                        <option value="ready_for_sale">Đủ điều kiện bán (Chờ ký HĐMB)</option>
                        <option value="sold">Đã xuất bán (Đã ký HĐMB / Bàn giao)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Giá bán dự kiến (VNĐ)</label>
                      <input
                        type="number"
                        placeholder="VD: 3500000000"
                        value={salePrice}
                        onChange={e => setSalePrice(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CHECKIN SPECIFIC FIELDS */}
          {selectedOpt?.type === 'checkin' && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Ngày nhập kho dự kiến <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="date"
                    value={checkinDate}
                    onChange={e => setCheckinDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Kho tiếp nhận GCN <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={targetWarehouseId}
                    onChange={e => setTargetWarehouseId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 p-2 text-xs focus:border-blue-500 focus:ring-blue-500 bg-white"
                  >
                    <option value="" disabled>
                      -- Chọn kho tiếp nhận --
                    </option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.is_central ? '(Kho trung tâm)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cập nhật chủ sở hữu khi nhập chuyển nhượng */}
              {selectedOpt.reason === 'chuyển nhượng' && (
                <div className="space-y-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      Cập nhật Chủ sở hữu mới (CĐT / NĐT)
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Pháp nhân chủ sở hữu mới <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={newOwnerEntityId}
                        onChange={e => setNewOwnerEntityId(e.target.value)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      >
                        <option value="">-- Chọn pháp nhân sở hữu --</option>
                        {investorEntities.map(e => (
                          <option key={e.id} value={e.id}>
                            [{e.company_code || 'DN'}] {e.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Vai trò sở hữu <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={newOwnerRole}
                        onChange={e => setNewOwnerRole(e.target.value as any)}
                        className="w-full rounded border p-2 text-xs bg-white"
                      >
                        <option value="cdt">Chủ đầu tư (CĐT)</option>
                        <option value="ndt">Nhà đầu tư (NĐT)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TÁCH SỔ / ĐỔI SỔ CHI TIẾT */}
          {selectedOpt && (selectedOpt.reason === 'tách sổ' || selectedOpt.reason === 'đổi sổ') && (
            <div className="space-y-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  {selectedOpt.reason === 'tách sổ' ? 'Hồ sơ Tách Sổ & Phân lô' : 'Hồ sơ Đổi sổ / Cấp đổi'}
                </h4>
                {selectedOpt.reason === 'tách sổ' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSplitType('partial')}
                      className={`px-2.5 py-1 text-xs rounded font-medium ${
                        splitType === 'partial' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      Tách 1 phần
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitType('full')}
                      className={`px-2.5 py-1 text-xs rounded font-medium ${
                        splitType === 'full' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      Tách toàn phần
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Số Quyết định / Văn bản pháp lý</label>
                  <input
                    type="text"
                    placeholder="VD: QĐ 123/QĐ-UBND..."
                    value={decisionNo}
                    onChange={e => setDecisionNo(e.target.value)}
                    className="w-full rounded border p-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Ghi chú phương án</label>
                  <input
                    type="text"
                    placeholder="Diễn giải thêm..."
                    value={splitNotes}
                    onChange={e => setSplitNotes(e.target.value)}
                    className="w-full rounded border p-2 text-xs bg-white"
                  />
                </div>
              </div>

              {selectedOpt.reason === 'đổi sổ' && (
                <div className="grid grid-cols-3 gap-3 bg-blue-50/50 p-3 rounded border border-blue-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Lý do cấp đổi</label>
                    <input
                      type="text"
                      placeholder="VD: Cấp đổi sang mẫu mới..."
                      value={reissueReason}
                      onChange={e => setReissueReason(e.target.value)}
                      className="w-full rounded border p-2 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Số GCN mới (nếu có)</label>
                    <input
                      type="text"
                      placeholder="VD: CQ 654321"
                      value={newCertificateNo}
                      onChange={e => setNewCertificateNo(e.target.value)}
                      className="w-full rounded border p-2 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Số vào sổ mới</label>
                    <input
                      type="text"
                      placeholder="VD: CH 09876"
                      value={newRegistryNo}
                      onChange={e => setNewRegistryNo(e.target.value)}
                      className="w-full rounded border p-2 text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              {selectedOpt.reason === 'tách sổ' && (
                <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">
                      Danh sách GCN con dự kiến tách ({splitChildren.length})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSplitChildren([
                          ...splitChildren,
                          { certificate_no: '', area: '', subdivision: '', land_lot_no: '' },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm sổ con
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-white p-2 rounded border">
                    <span>Tổng DT gốc: <b>{parentTotalArea} m²</b></span>
                    <span>Tổng DT con: <b>{childrenTotalArea} m²</b></span>
                    <span className={remainingArea < 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-semibold'}>
                      Còn lại: <b>{remainingArea} m²</b>
                    </span>
                  </div>

                  {splitChildren.map((child, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded border">
                      <span className="text-xs text-gray-400 font-mono w-4">{idx + 1}.</span>
                      <input
                        required
                        type="text"
                        placeholder="Số GCN con *"
                        value={child.certificate_no}
                        onChange={e => {
                          const n = [...splitChildren];
                          n[idx].certificate_no = e.target.value;
                          setSplitChildren(n);
                        }}
                        className="w-1/3 rounded border p-1.5 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Phân khu / Lô"
                        value={child.subdivision}
                        onChange={e => {
                          const n = [...splitChildren];
                          n[idx].subdivision = e.target.value;
                          setSplitChildren(n);
                        }}
                        className="w-1/3 rounded border p-1.5 text-xs"
                      />
                      <input
                        required
                        type="number"
                        placeholder="Diện tích *"
                        value={child.area}
                        onChange={e => {
                          const n = [...splitChildren];
                          n[idx].area = e.target.value;
                          setSplitChildren(n);
                        }}
                        className="w-1/4 rounded border p-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setSplitChildren(splitChildren.filter((_, i) => i !== idx))}
                        disabled={splitChildren.length === 1}
                        className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer Submit */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !selectedOpt ||
                (selectedOpt.reason === 'khác' && otherReasonDetail.trim().length < OTHER_REASON_MIN_LENGTH)
              }
              className="px-5 py-2 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default RequestModal;
