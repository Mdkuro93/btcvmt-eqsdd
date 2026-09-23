import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  FileText,
  Building2,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  Save,
  Check,
  Building,
  GitFork,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchProjects, fetchWarehouses, fetchAssetIdentifierCandidates, fetchAssets } from '../api/assets';
import { updateDeclarationRequest, approveDeclarationRequest } from '../api/assetDeclarationRequests';
import { fetchInvestorEntities } from '../api/investorEntities';
import { PROPERTY_TYPES, COLLATERAL_TYPES, checkAssetDuplicate, generateNextAssetCode } from '../lib/assetIdentifier';
import { DocumentUploadField } from './DocumentUploadField';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  request: any;
}

export const ReviewDeclarationRequestModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  request,
}) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [investorEntities, setInvestorEntities] = useState<any[]>([]);

  // Request & Old Asset
  const [requestType, setRequestType] = useState<'cap_moi' | 'tach_so' | 'cap_doi'>('cap_moi');
  const [relationshipType, setRelationshipType] = useState<'SPLIT_FULL' | 'SPLIT_PARTIAL' | 'RENEW' | 'MERGE'>('SPLIT_FULL');
  const [remainingArea, setRemainingArea] = useState('');
  const [oldAssetId, setOldAssetId] = useState('');
  const [searchOldAsset, setSearchOldAsset] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Search state for entity
  const [searchEntityText, setSearchEntityText] = useState('');
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);

  // Toggle expand for section 27 attributes
  const [isAttributesExpanded, setIsAttributesExpanded] = useState(true);

  // 1. THÔNG TIN CHUNG & CƠ BẢN
  const [collateralType, setCollateralType] = useState('BDS');
  const [projectId, setProjectId] = useState('');
  const [businessProjectName, setBusinessProjectName] = useState('');
  const [assetType, setAssetType] = useState('Đất nền');
  const [certificateGroup, setCertificateGroup] = useState<'so_lon' | 'so_nho'>('so_nho');
  const [legalLotCode, setLegalLotCode] = useState('');
  const [businessPlotCode, setBusinessPlotCode] = useState('');
  const [area, setArea] = useState('');

  // 2. THÔNG TIN PHÁP LÝ & GCN
  const [currentOwnerEntityId, setCurrentOwnerEntityId] = useState('');
  const [landLotNo, setLandLotNo] = useState('');
  const [mapSheetNo, setMapSheetNo] = useState('');
  const [certificateNo, setCertificateNo] = useState('');
  const [registryNo, setRegistryNo] = useState('');
  const [registryDate, setRegistryDate] = useState('');
  const [usagePurpose, setUsagePurpose] = useState('Đất ở tại đô thị (ODT)');
  const [usageTermType, setUsageTermType] = useState<'fixed_date' | 'long_term'>('long_term');
  const [usageTermDate, setUsageTermDate] = useState('');

  // 3. THÔNG TIN CẦM CỐ / THẾ CHẤP
  const [isMortgaged, setIsMortgaged] = useState(false);
  const [mortgageBank, setMortgageBank] = useState('');
  const [mortgageUnit, setMortgageUnit] = useState('');
  const [mortgageValuation, setMortgageValuation] = useState('');
  const [collateralRatio, setCollateralRatio] = useState('');
  const [collateralValue, setCollateralValue] = useState('');
  const [mortgageReleaseDate, setMortgageReleaseDate] = useState('');

  // 4. TRẠNG THÁI & KHO QUẢN LÝ
  const [warehouseId, setWarehouseId] = useState('');
  const [managingUnit, setManagingUnit] = useState('');
  const [scanFileUrl, setScanFileUrl] = useState('');
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // Duplicate Warning
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (request && isOpen) {
      setRequestType(request.request_type || 'cap_moi');
      const rel = request.relationship_type || (request.request_type === 'tach_so' ? 'SPLIT_FULL' : (request.request_type === 'cap_doi' ? 'RENEW' : null));
      if (rel) setRelationshipType(rel);
      setRemainingArea(request.remaining_area !== null && request.remaining_area !== undefined ? request.remaining_area.toString() : '');

      const pId = request.parent_asset_id || request.old_asset_id || '';
      setOldAssetId(pId);
      if (pId && allAssets.length > 0) {
        const oldAsset = allAssets.find(a => a.id === pId);
        if (oldAsset) {
          const inWh = oldAsset.is_in_warehouse !== undefined ? Boolean(oldAsset.is_in_warehouse) : (oldAsset.custody_status === 'in_stock');
          const whName = oldAsset.warehouses?.name || 'Kho lưu trữ';
          setSearchOldAsset(`[${oldAsset.asset_code || 'Chưa cấp mã'}] - ${oldAsset.certificate_no} - ${inWh ? `🔴 Đang lưu tại ${whName}` : '🟢 Đã xuất kho'}`);
        }
      }

      setCollateralType(request.collateral_type || 'BDS');
      setCertificateNo(request.certificate_no || '');
      setRegistryNo(request.registry_no || '');
      setRegistryDate(request.registry_date ? request.registry_date.substring(0, 10) : '');
      setProjectId(request.project_id || '');
      setLegalLotCode(request.legal_lot_code || '');
      setLandLotNo(request.land_lot_no || '');
      setMapSheetNo(request.map_sheet_no || '');
      setBusinessProjectName(request.business_project_name || '');
      setBusinessPlotCode(request.business_plot_code || '');
      setArea(request.area !== null && request.area !== undefined ? request.area.toString() : '');
      setCurrentOwnerEntityId(request.current_owner_entity_id || '');
      setCertificateGroup(request.certificate_group || 'so_nho');

      if (request.current_owner_entity_id) {
        const entity = investorEntities.find(e => e.id === request.current_owner_entity_id);
        if (entity) {
          setSearchEntityText(entity.company_code ? `[${entity.company_code}] ${entity.name}` : entity.name);
        } else {
          setSearchEntityText('ID: ' + request.current_owner_entity_id);
        }
      } else {
        setSearchEntityText('');
      }

      setUsagePurpose(request.usage_purpose || 'Đất ở tại đô thị (ODT)');
      setUsageTermType(request.usage_term_type || 'long_term');
      setUsageTermDate(request.usage_term_date ? request.usage_term_date.substring(0, 10) : '');
      setAssetType(request.asset_type || 'Đất nền');
      setWarehouseId(request.warehouse_id || '');
      setManagingUnit(request.managing_unit || '');
      setScanFileUrl(request.scan_file_url || '');

      const isMort = request.mortgage_status === 'mortgaged';
      setIsMortgaged(isMort);
      setMortgageBank(request.mortgage_bank || '');
      setMortgageUnit(request.mortgage_unit || '');
      setMortgageValuation(request.mortgage_valuation ? String(request.mortgage_valuation) : '');
      setCollateralRatio(request.collateral_ratio ? String(request.collateral_ratio) : '');
      setCollateralValue(request.collateral_value ? String(request.collateral_value) : '');
      setMortgageReleaseDate(request.mortgage_expected_release_date ? request.mortgage_expected_release_date.substring(0, 10) : '');

      setNotes(request.notes || '');
      setDuplicateWarning(null);
    }
  }, [request, isOpen, investorEntities, allAssets]);

  const loadData = async () => {
    try {
      const [p, w, a, e] = await Promise.all([
        fetchProjects(),
        fetchWarehouses(),
        fetchAssetIdentifierCandidates(),
        fetchInvestorEntities(),
      ]);
      setProjects(p);
      setWarehouses(w);
      setAllAssets(a);
      setInvestorEntities(e);
    } catch (err) {
      console.error(err);
    }
  };

  // Live duplicate warning check
  useEffect(() => {
    if (!isOpen) return;
    const dup = checkAssetDuplicate(
      {
        certificate_no: certificateNo,
        project_id: projectId || null,
        legal_lot_code: legalLotCode || null,
        map_sheet_no: mapSheetNo || null,
        land_lot_no: landLotNo || null,
      },
      allAssets,
      undefined,
      projects.find(p => p.id === projectId)?.name
    );

    if (dup.isDuplicate) {
      setDuplicateWarning(dup.reason || 'Trùng lặp dữ liệu GCN trong hệ thống!');
    } else {
      setDuplicateWarning(null);
    }
  }, [certificateNo, projectId, legalLotCode, mapSheetNo, landLotNo, allAssets, isOpen, projects]);

  const filteredEntities = investorEntities
    .filter(e => {
      const s = searchEntityText.toLowerCase();
      return e.name?.toLowerCase().includes(s) || e.company_code?.toLowerCase().includes(s);
    })
    .slice(0, 50);

  const filteredAssets = allAssets
    .filter(a => {
      if (!searchOldAsset) return false;
      const s = searchOldAsset.toLowerCase();
      return a.certificate_no?.toLowerCase().includes(s) || a.asset_code?.toLowerCase().includes(s) || a.legal_lot_code?.toLowerCase().includes(s);
    })
    .slice(0, 20);

  const selectedParentAsset = allAssets.find(a => a.id === oldAssetId);
  const isParentInWarehouse = selectedParentAsset ? (
    selectedParentAsset.is_in_warehouse !== undefined
      ? Boolean(selectedParentAsset.is_in_warehouse)
      : (selectedParentAsset.custody_status === 'in_stock')
  ) : false;

  const handleChildAreaChange = (newAreaStr: string) => {
    setArea(newAreaStr);
    if (requestType === 'tach_so' && relationshipType === 'SPLIT_PARTIAL' && selectedParentAsset?.area) {
      const childVal = Number(newAreaStr);
      if (!isNaN(childVal) && childVal > 0) {
        const rem = Math.max(0, Number((selectedParentAsset.area - childVal).toFixed(2)));
        setRemainingArea(rem.toString());
      }
    }
  };

  const handleValuationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMortgageValuation(val);
    if (val && collateralRatio) {
      setCollateralValue(((Number(val) * Number(collateralRatio)) / 100).toString());
    }
  };

  const handleRatioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCollateralRatio(val);
    if (mortgageValuation && val) {
      setCollateralValue(((Number(mortgageValuation) * Number(val)) / 100).toString());
    }
  };

  // Chuẩn hóa payload 27 thuộc tính để cập nhật
  const buildPayload = () => {
    const rel = requestType === 'cap_doi' ? 'RENEW' : (requestType === 'tach_so' ? relationshipType : null);
    const inval = requestType === 'cap_doi' ? 'FULL' : (requestType === 'tach_so' ? (relationshipType === 'SPLIT_PARTIAL' ? 'PARTIAL' : 'FULL') : 'NONE');

    return {
      request_type: requestType,
      relationship_type: rel,
      invalidation_type: inval,
      parent_asset_id: (requestType === 'tach_so' || requestType === 'cap_doi') ? oldAssetId : null,
      old_asset_id: (requestType === 'tach_so' || requestType === 'cap_doi') ? oldAssetId : null,
      remaining_area: (requestType === 'tach_so' && relationshipType === 'SPLIT_PARTIAL' && remainingArea) ? Number(remainingArea) : null,
      certificate_no: certificateNo.trim(),
      registry_no: registryNo.trim() || null,
      registry_date: registryDate || null,
      project_id: projectId || null,
      legal_lot_code: legalLotCode.trim() || null,
      land_lot_no: landLotNo.trim() || null,
      map_sheet_no: mapSheetNo.trim() || null,
      business_project_name: businessProjectName.trim() || null,
      business_plot_code: businessPlotCode.trim() || null,
      area: area ? Number(area) : null,
      current_owner_entity_id: currentOwnerEntityId || null,
      certificate_group: certificateGroup,
      usage_purpose: usagePurpose.trim() || null,
      usage_term_type: usageTermType.trim() || null,
      usage_term_date: usageTermType === 'fixed_date' ? (usageTermDate || null) : null,
      asset_type: assetType.trim() || null,
      collateral_type: collateralType || 'BDS',
      warehouse_id: warehouseId || null,
      managing_unit: managingUnit.trim() || null,
      scan_file_url: scanFileUrl.trim() || null,
      mortgage_status: isMortgaged ? 'mortgaged' : 'none',
      mortgage_bank: isMortgaged ? (mortgageBank.trim() || null) : null,
      mortgage_unit: isMortgaged ? (mortgageUnit.trim() || null) : null,
      mortgage_valuation: isMortgaged && mortgageValuation ? Number(mortgageValuation) : null,
      collateral_ratio: isMortgaged && collateralRatio ? Number(collateralRatio) : null,
      collateral_value: isMortgaged && collateralValue ? Number(collateralValue) : null,
      mortgage_expected_release_date: isMortgaged ? (mortgageReleaseDate || null) : null,
      notes: notes.trim() || null,
    };
  };

  // Lưu thông tin bổ sung (không duyệt ngay)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!certificateNo.trim()) {
      toast.error('Vui lòng nhập số GCN');
      return;
    }
    if ((requestType === 'tach_so' || requestType === 'cap_doi')) {
      if (!oldAssetId) {
        toast.error('Vui lòng chọn sổ gốc / GCN cũ');
        return;
      }
      if (isParentInWarehouse) {
        toast.error(
          '⚠️ KHÔNG THỂ THỰC HIỆN: GCN gốc hiện vẫn đang LƯU KHO.\n' +
          'Nếu chọn nhầm sổ: Vui lòng chọn lại đúng Mã TSĐB.\n' +
          'Nếu đúng sổ: Vui lòng lập Phiếu Xuất Kho cho GCN gốc trước khi làm thủ tục nhập kho GCN mới!',
          { duration: 7000 }
        );
        return;
      }
      if (relationshipType === 'SPLIT_PARTIAL' && (!remainingArea || Number(remainingArea) <= 0)) {
        toast.error('Vui lòng nhập diện tích còn lại hợp lệ cho Sổ gốc khi tách 1 phần');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = buildPayload();
      await updateDeclarationRequest(request.id, payload);
      toast.success('Đã lưu thông tin bổ sung của GCN!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi cập nhật yêu cầu');
    } finally {
      setLoading(false);
    }
  };

  // Duyệt và Nhập kho ngay sau khi lưu
  const handleApproveAndImport = async () => {
    if (!certificateNo.trim()) {
      toast.error('Vui lòng nhập số GCN trước khi duyệt');
      return;
    }
    if (!warehouseId) {
      toast.error('Vui lòng chọn Kho lưu trữ tiếp nhận sổ');
      return;
    }
    if ((requestType === 'tach_so' || requestType === 'cap_doi')) {
      if (!oldAssetId) {
        toast.error('Vui lòng chọn sổ gốc / GCN cũ');
        return;
      }
      // CHẶN CỨNG BẢO VỆ KHI DUYỆT
      if (isParentInWarehouse) {
        toast.error(
          '⚠️ KHÔNG THỂ THỰC HIỆN: GCN gốc hiện vẫn đang LƯU KHO.\n' +
          'Nếu chọn nhầm sổ: Vui lòng chọn lại đúng Mã TSĐB.\n' +
          'Nếu đúng sổ: Vui lòng lập Phiếu Xuất Kho cho GCN gốc trước khi làm thủ tục nhập kho GCN mới!',
          { duration: 7000 }
        );
        return;
      }
      if (relationshipType === 'SPLIT_PARTIAL' && (!remainingArea || Number(remainingArea) <= 0)) {
        toast.error('Vui lòng nhập diện tích còn lại hợp lệ cho Sổ gốc khi tách 1 phần');
        return;
      }
    }

    if (duplicateWarning) {
      const confirmDup = window.confirm(`${duplicateWarning}\n\nBạn có chắc chắn muốn tiếp tục duyệt và nhập kho GCN này?`);
      if (!confirmDup) return;
    }

    setApproving(true);
    try {
      // 1. Cập nhật đầy đủ 27 thuộc tính trước
      const payload = buildPayload();
      await updateDeclarationRequest(request.id, payload);

      // 2. Tính tiền tố mã tài sản (nếu cấp mới hoặc tách sổ)
      let prefix = null;
      if (requestType === 'cap_moi' || requestType === 'tach_so') {
        const assetsRes = await fetchAssets({ projectId: projectId || undefined, collateralType });
        const existingAssets = assetsRes.data || [];
        const selectedProj = projects.find(p => p.id === projectId);
        const provCode = selectedProj?.areas?.province_code || selectedProj?.areas?.name;
        const fullCode = generateNextAssetCode(undefined, provCode, collateralType, existingAssets);
        prefix = fullCode.substring(0, fullCode.lastIndexOf('_') + 1);
      }

      // 3. Gọi RPC duyệt và sinh phiếu nhập kho (PN)
      await approveDeclarationRequest(request.id, prefix);
      toast.success('Đã phê duyệt và nhập kho GCN thành công!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi duyệt và nhập kho GCN');
    } finally {
      setApproving(false);
    }
  };

  const isApprover =
    ['admin', 'super_admin', 'btc_manager', 'warehouse_manager'].includes(profile?.role || '') ||
    profile?.permissions?.includes('request.approve');

  const canEdit = isApprover && request?.status === 'pending';

  const isDept = profile?.role === 'capital_dept' || profile?.role === 'project_dept' || profile?.role === 're_dept';
  const availableWarehouses = isDept
    ? warehouses.filter(w => profile?.assigned_warehouse_ids?.includes(w.id))
    : warehouses;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col border border-gray-200">
        
        {/* HEADER MODAL */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-blue-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E3A8A] flex items-center justify-center text-white shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-gray-900">
                  {canEdit ? 'Phê Duyệt & Bổ Sung Chi Tiết GCN Mới' : 'Chi Tiết Đề Xuất Khai Báo GCN'}
                </h2>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                  #{request?.certificate_no || 'Đề xuất mới'}
                </span>
                {request?.status === 'pending' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Chờ phê duyệt
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                    Trạng thái: {request?.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {canEdit
                  ? 'Bổ sung đầy đủ 27 thuộc tính tiêu chuẩn theo chuẩn dữ liệu BĐS trước khi xác nhận nhập kho'
                  : 'Xem thông tin đề xuất khai báo Giấy chứng nhận quyền sử dụng đất'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-200/80 p-2 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* DUPLICATE WARNING BANNER */}
        {duplicateWarning && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Cảnh báo trùng lặp thông tin:</div>
              <div>{duplicateWarning}</div>
            </div>
          </div>
        )}

        {/* FORM CONTENT */}
        <div className="p-6 overflow-y-auto space-y-6">
          <form id="review-declare-form" onSubmit={handleSave} className="space-y-6">
            
            {/* THÔNG TIN LOẠI ĐỀ XUẤT & PHẢ HỆ TÁCH SỔ */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1.5">
                  <GitFork className="w-4 h-4 text-[#1E3A8A]" />
                  <span>Hình Thức Khai Báo, Cấp Đổi & Phả Hệ Tách Sổ</span>
                </div>
                <span className="text-[11px] font-normal text-slate-500">Quy chuẩn quản lý vòng đời tài sản</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Loại yêu cầu <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={requestType}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setRequestType(val);
                      if (val === 'cap_moi') {
                        setOldAssetId('');
                        setSearchOldAsset('');
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100 font-medium"
                    required
                    disabled={!canEdit}
                  >
                    <option value="cap_moi">Cấp mới (GCN lần đầu vào kho)</option>
                    <option value="tach_so">Tách sổ (Từ GCN mẹ đang có)</option>
                    <option value="cap_doi">Cấp đổi (Đổi số GCN, giữ nguyên tài sản)</option>
                  </select>
                </div>

                {/* HÌNH THỨC TÁCH SỔ */}
                {requestType === 'tach_so' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Hình thức tách sổ <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={relationshipType}
                      onChange={(e) => setRelationshipType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100 font-medium"
                      disabled={!canEdit}
                    >
                      <option value="SPLIT_FULL">Tách toàn phần (Vô hiệu / Thu hồi toàn bộ Sổ gốc)</option>
                      <option value="SPLIT_PARTIAL">Tách 1 phần (Giảm diện tích Sổ gốc, Sổ gốc tiếp tục lưu hành)</option>
                    </select>
                  </div>
                )}

                {/* CHỌN SỔ GỐC / SỔ CŨ */}
                {(requestType === 'tach_so' || requestType === 'cap_doi') && (
                  <div className="relative md:col-span-2 bg-white p-3.5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                        <GitFork className="w-3.5 h-3.5 text-blue-600" />
                        Chọn Sổ gốc / GCN cũ (parent_asset_id) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] text-gray-500">Chỉ chọn GCN đã làm thủ tục xuất kho</span>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Tìm theo Mã TSĐB, Số GCN, Mã lô pháp lý..."
                        value={searchOldAsset}
                        onChange={(e) => {
                          setSearchOldAsset(e.target.value);
                          setShowDropdown(true);
                          setOldAssetId('');
                        }}
                        onFocus={() => setShowDropdown(true)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100 bg-white focus:ring-2 focus:ring-blue-500"
                        required={!oldAssetId}
                        disabled={!canEdit}
                      />
                    </div>

                    {canEdit && showDropdown && filteredAssets.length > 0 && (
                      <div className="absolute z-20 left-3 right-3 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                        {filteredAssets.map(a => {
                          const inWh = a.is_in_warehouse !== undefined ? Boolean(a.is_in_warehouse) : (a.custody_status === 'in_stock');
                          const whName = a.warehouses?.name || 'Kho lưu trữ';
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                setOldAssetId(a.id);
                                setSearchOldAsset(`[${a.asset_code || 'Chưa cấp mã'}] - ${a.certificate_no} - ${inWh ? `🔴 Đang lưu tại ${whName}` : '🟢 Đã xuất kho'}`);
                                setShowDropdown(false);
                                if (requestType === 'tach_so' && relationshipType === 'SPLIT_PARTIAL' && a.area && area) {
                                  const rem = Math.max(0, Number((a.area - Number(area)).toFixed(2)));
                                  setRemainingArea(rem.toString());
                                }
                              }}
                              className={`w-full text-left px-3.5 py-2.5 hover:bg-blue-50/50 text-xs border-b last:border-0 transition-colors ${
                                inWh ? 'bg-red-50/20' : 'bg-green-50/20'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-gray-900 font-mono text-xs">
                                  [{a.asset_code || 'Chưa cấp mã'}] - {a.certificate_no}
                                </span>
                                {inWh ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200 shrink-0">
                                    🔴 Đang lưu tại {whName}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200 shrink-0">
                                    🟢 Đã xuất kho
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                                <span>Diện tích: <strong className="text-gray-800">{a.area ? `${a.area} m²` : 'Chưa có'}</strong></span>
                                <span>·</span>
                                <span>Dự án: {a.projects?.name || 'Chưa gán DA'}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* THÔNG TIN SỔ GỐC ĐÃ CHỌN & CẢNH BÁO CHẶN CỨNG */}
                    {selectedParentAsset && (
                      <div className="mt-3">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-gray-900">Sổ gốc: [{selectedParentAsset.asset_code || 'Chưa có mã'}] - {selectedParentAsset.certificate_no}</span>
                            <span className="text-gray-500 ml-2">({selectedParentAsset.area ? `${selectedParentAsset.area} m²` : 'Chưa rõ DT'})</span>
                          </div>
                          {isParentInWarehouse ? (
                            <span className="px-2.5 py-1 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                              🔴 Đang lưu tại {selectedParentAsset.warehouses?.name || 'Kho'}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                              🟢 Đã xuất kho (Hợp lệ để xử lý)
                            </span>
                          )}
                        </div>

                        {/* CHẶN CỨNG AN TOÀN KHO */}
                        {isParentInWarehouse && (
                          <div className="mt-2.5 p-3.5 bg-red-50 border-2 border-red-500 rounded-lg text-red-900 text-xs leading-relaxed space-y-1 shadow-sm">
                            <div className="font-bold flex items-center gap-2 text-red-700 text-sm">
                              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                              ⚠️ KHÔNG THỂ THỰC HIỆN: GCN gốc hiện vẫn đang LƯU KHO.
                            </div>
                            <p>• <strong>Nếu chọn nhầm sổ:</strong> Vui lòng chọn lại đúng Mã TSĐB / Số GCN khác.</p>
                            <p>• <strong>Nếu đúng sổ:</strong> Vui lòng lập <strong>Phiếu Xuất Kho</strong> cho GCN gốc trước khi làm thủ tục nhập kho GCN mới!</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* DIỆN TÍCH VÀ DIỆN TÍCH CÒN LẠI KHI TÁCH 1 PHẦN */}
              {requestType === 'tach_so' && relationshipType === 'SPLIT_PARTIAL' && (
                <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2.5">
                  <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Cân Đối Diện Tích Tách Sổ Một Phần
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-amber-200">
                      <span className="text-gray-500 block text-[11px]">Diện tích Sổ gốc (m²)</span>
                      <span className="text-sm font-bold text-gray-900">
                        {selectedParentAsset?.area ? `${selectedParentAsset.area} m²` : 'Chưa có thông tin'}
                      </span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                        Diện tích Sổ con mới tách (m²) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="VD: 150.5"
                        value={area}
                        onChange={(e) => handleChildAreaChange(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-medium"
                        required
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                        Diện tích còn lại của Sổ gốc (m²) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Tự động tính hoặc nhập tay..."
                        value={remainingArea}
                        onChange={(e) => setRemainingArea(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-semibold text-amber-900"
                        required
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  {selectedParentAsset?.area && area && remainingArea && (
                    <p className="text-[11px] text-amber-800 italic">
                      Công thức: {selectedParentAsset.area} m² (Gốc) - {area} m² (Mới) = {remainingArea} m² (Sổ gốc sau khi tách)
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* BỔ SUNG THÔNG TIN GCN ĐẦY ĐỦ (CHUẨN 27 THUỘC TÍNH) */}
            <div className="border border-blue-200 rounded-xl overflow-hidden shadow-xs">
              <div
                className="bg-blue-50/80 px-4 py-3 flex items-center justify-between cursor-pointer border-b border-blue-200"
                onClick={() => setIsAttributesExpanded(!isAttributesExpanded)}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#1E3A8A]" />
                  <span className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wide">
                    Bổ sung thông tin GCN đầy đủ (Chuẩn 27 thuộc tính)
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-200/60 text-[#1E3A8A]">
                    Tiêu chuẩn dữ liệu BĐS
                  </span>
                </div>
                <button
                  type="button"
                  className="text-blue-700 hover:text-blue-900 p-1 rounded transition-colors"
                >
                  {isAttributesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {isAttributesExpanded && (
                <div className="p-4 sm:p-5 space-y-6 bg-white">
                  
                  {/* PHẦN 1: THÔNG TIN CHUNG */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-amber-200 pb-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      1. Thông Tin Chung & Định Danh Dự Án
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Số GCN QSDĐ <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={certificateNo}
                          onChange={(e) => setCertificateNo(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold text-[#1E3A8A] disabled:bg-gray-100"
                          placeholder="VD: GCN-HCM-2024-001..."
                          required
                          disabled={!canEdit}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Dự Án (Pháp lý)
                        </label>
                        <select
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100 font-medium"
                          disabled={!canEdit}
                        >
                          <option value="">-- Chọn dự án --</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Loại TSĐB (Collateral Type)
                        </label>
                        <select
                          value={collateralType}
                          onChange={(e) => setCollateralType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                          disabled={!canEdit}
                        >
                          {COLLATERAL_TYPES.map(ct => (
                            <option key={ct.code} value={ct.code}>{ct.name} ({ct.code})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tên Dự Án Kinh Doanh</label>
                        <input
                          type="text"
                          value={businessProjectName}
                          onChange={e => setBusinessProjectName(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: Khu Đô Thị Sun Riverside..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Mã Lô Kinh Doanh</label>
                        <input
                          type="text"
                          value={businessPlotCode}
                          onChange={e => setBusinessPlotCode(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: RIVER-LK08..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Mã Lô Pháp Lý (Mã lô đất)</label>
                        <input
                          type="text"
                          value={legalLotCode}
                          onChange={e => setLegalLotCode(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: Phân khu 1 - Lô 25..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Loại Tài Sản</label>
                        <select
                          value={assetType}
                          onChange={e => setAssetType(e.target.value)}
                          disabled={!canEdit}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                        >
                          {PROPERTY_TYPES.map(pt => (
                            <option key={pt} value={pt}>{pt}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Nhóm Sổ</label>
                        <select
                          value={certificateGroup}
                          onChange={e => setCertificateGroup(e.target.value as 'so_lon' | 'so_nho')}
                          disabled={!canEdit}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100 font-medium"
                        >
                          <option value="so_nho">Sổ nhỏ (Sổ lẻ / Từng căn / Lô)</option>
                          <option value="so_lon">Sổ lớn (Sổ tổng dự án / Đất mẹ)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Diện tích (m²)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={area}
                          onChange={e => setArea(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: 150.5"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 disabled:bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* PHẦN 2: THÔNG TIN PHÁP LÝ & SỞ HỮU */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-emerald-200 pb-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      2. Thông Tin Pháp Lý & Quyền Sở Hữu
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="relative">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Chủ Sở Hữu / Pháp Nhân</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={searchEntityText}
                            onChange={(e) => {
                              setSearchEntityText(e.target.value);
                              setShowEntityDropdown(true);
                              setCurrentOwnerEntityId('');
                            }}
                            onFocus={() => setShowEntityDropdown(true)}
                            onBlur={() => setTimeout(() => setShowEntityDropdown(false), 250)}
                            placeholder="Gõ tìm pháp nhân / CĐT..."
                            disabled={!canEdit}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                          />
                        </div>
                        {canEdit && showEntityDropdown && filteredEntities.length > 0 && (
                          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredEntities.map(e => (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => {
                                  setCurrentOwnerEntityId(e.id);
                                  setSearchEntityText(e.company_code ? `[${e.company_code}] ${e.name}` : e.name);
                                  setShowEntityDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs border-b last:border-0"
                              >
                                <div className="font-semibold text-gray-900">{e.name}</div>
                                {e.company_code && <div className="text-[10px] text-gray-500">Mã: {e.company_code}</div>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Số Thửa Đất</label>
                        <input
                          type="text"
                          value={landLotNo}
                          onChange={e => setLandLotNo(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: 145"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Số Tờ Bản Đồ</label>
                        <input
                          type="text"
                          value={mapSheetNo}
                          onChange={e => setMapSheetNo(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: 12"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Số vào sổ cấp GCN</label>
                        <input
                          type="text"
                          value={registryNo}
                          onChange={e => setRegistryNo(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: CS-00215..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Ngày vào sổ cấp</label>
                        <input
                          type="date"
                          value={registryDate}
                          onChange={e => setRegistryDate(e.target.value)}
                          disabled={!canEdit}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Mục Đích Sử Dụng Đất</label>
                        <input
                          type="text"
                          value={usagePurpose}
                          onChange={e => setUsagePurpose(e.target.value)}
                          disabled={!canEdit}
                          placeholder="Đất ở tại đô thị (ODT)..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Thời Hạn Sử Dụng</label>
                        <div className="flex space-x-2">
                          <select
                            value={usageTermType}
                            onChange={e => setUsageTermType(e.target.value as any)}
                            disabled={!canEdit}
                            className="w-1/2 px-2 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                          >
                            <option value="long_term">Lâu dài</option>
                            <option value="fixed_date">Có thời hạn</option>
                          </select>
                          {usageTermType === 'fixed_date' && (
                            <input
                              type="date"
                              value={usageTermDate}
                              onChange={e => setUsageTermDate(e.target.value)}
                              disabled={!canEdit}
                              className="w-1/2 px-2 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PHẦN 3: HỒ SƠ THẾ CHẤP NGÂN HÀNG */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center justify-between border-b border-rose-200 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        3. Thông Tin Cầm Cố / Thế Chấp Tổ Chức Tín Dụng
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-800 normal-case">
                        <input
                          type="checkbox"
                          checked={isMortgaged}
                          onChange={e => setIsMortgaged(e.target.checked)}
                          disabled={!canEdit}
                          className="w-4 h-4 text-rose-600 rounded border-gray-300 focus:ring-rose-500"
                        />
                        <span>Tài sản đang thế chấp</span>
                      </label>
                    </div>

                    {isMortgaged ? (
                      <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-xl space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Ngân Hàng Nhận Thế Chấp <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={mortgageBank}
                              onChange={e => setMortgageBank(e.target.value)}
                              disabled={!canEdit}
                              placeholder="VD: BIDV - CN TP.HCM, VCB..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Đơn Vị Thực Hiện Thế Chấp / Đơn Vị Vay
                            </label>
                            <input
                              type="text"
                              value={mortgageUnit}
                              onChange={e => setMortgageUnit(e.target.value)}
                              disabled={!canEdit}
                              placeholder="VD: Phòng Nguồn Vốn - TĐ1..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Giá Trị Định Giá (VNĐ)
                            </label>
                            <input
                              type="number"
                              value={mortgageValuation}
                              onChange={handleValuationChange}
                              disabled={!canEdit}
                              placeholder="VD: 35000000000"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Tỷ Lệ Đảm Bảo (%) & Giá Trị TSĐB (VNĐ)
                            </label>
                            <div className="flex space-x-2">
                              <input
                                type="number"
                                value={collateralRatio}
                                onChange={handleRatioChange}
                                disabled={!canEdit}
                                placeholder="%"
                                className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                              />
                              <input
                                type="number"
                                value={collateralValue}
                                onChange={e => setCollateralValue(e.target.value)}
                                disabled={!canEdit}
                                placeholder="Giá trị TSĐB"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Ngày Dự Kiến Giải Chấp
                            </label>
                            <input
                              type="date"
                              value={mortgageReleaseDate}
                              onChange={e => setMortgageReleaseDate(e.target.value)}
                              disabled={!canEdit}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                        GCN này hiện không thế chấp tại Ngân hàng (Trạng thái: Tự do / Chưa thế chấp).
                      </p>
                    )}
                  </div>

                  {/* PHẦN 4: KHO LƯU TRỮ & TÀI LIỆU SCAN */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                      4. Kho Lưu Trữ, Đơn Vị Quản Lý & Hồ Sơ Đính Kèm
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Kho Lưu Trữ Nhận Sổ <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={warehouseId}
                          onChange={(e) => setWarehouseId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white disabled:bg-gray-100 font-semibold text-[#1E3A8A]"
                          required
                          disabled={!canEdit}
                        >
                          <option value="">-- Chọn kho giữ sổ --</option>
                          {availableWarehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name} {w.is_central ? '(Trung tâm)' : ''}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Đơn Vị Quản Lý Sổ (Cột 26)
                        </label>
                        <input
                          type="text"
                          value={managingUnit}
                          onChange={e => setManagingUnit(e.target.value)}
                          disabled={!canEdit}
                          placeholder="VD: Ban Quản Lý Dự Án / Két Sắt Thủ Kho..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        File Scan Giấy Chứng Nhận (PDF, JPG, PNG - Tối đa 10MB)
                      </label>
                      <DocumentUploadField
                        value={scanFileUrl}
                        onChange={setScanFileUrl}
                        onPreview={url => setPreviewFileUrl(url)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ghi Chú Nghiệp Vụ</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-100"
                        rows={2}
                        placeholder="Ghi chú chi tiết nguồn gốc, lý do cấp mới / tách sổ / cấp đổi..."
                      />
                    </div>
                  </div>

                </div>
              )}
            </div>

          </form>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl">
          <div className="text-xs text-gray-500">
            {canEdit ? (
              <span className="text-emerald-700 font-medium">
                ✓ Bạn có quyền chỉnh sửa & duyệt nhập kho GCN này
              </span>
            ) : (
              <span>Chế độ chỉ xem thông tin</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              {canEdit ? 'Hủy' : 'Đóng'}
            </button>

            {canEdit && (
              <>
                <button
                  type="submit"
                  form="review-declare-form"
                  disabled={loading || approving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang lưu...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> Lưu Thay Đổi
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleApproveAndImport}
                  disabled={loading || approving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {approving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang Phê Duyệt & Nhập Kho...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" /> Phê Duyệt & Nhập Kho GCN
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

      </div>

      {/* DOCUMENT PREVIEW MODAL */}
      <DocumentPreviewModal
        isOpen={!!previewFileUrl}
        fileUrlOrPath={previewFileUrl || ''}
        onClose={() => setPreviewFileUrl(null)}
      />
    </div>
  );
};
