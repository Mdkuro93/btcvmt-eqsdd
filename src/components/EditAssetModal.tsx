import React, { useState, useEffect } from 'react';
import { X, Loader2, Save, AlertTriangle, Building2, MapPin, ShieldCheck, FileText, CheckCircle2, ArrowLeftRight } from 'lucide-react';
import { Asset, Project, Warehouse } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { updateAsset, fetchAssets } from '../api/assets';
import { fetchInvestorEntities } from '../api/investorEntities';
import { logActivity } from '../api/activityLogs';
import { COLLATERAL_TYPES, PROPERTY_TYPES, checkAssetDuplicate, resolveRegionCode } from '../lib/assetIdentifier';
import { DocumentUploadField } from './DocumentUploadField';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { AssetTransferModal } from './AssetTransferModal';
import { canTransferAsset } from '../lib/permissions';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset | null;
  onSuccess: () => void;
  projects: Project[];
  warehouses: Warehouse[];
}

export const EditAssetModal: React.FC<Props> = ({
  isOpen,
  onClose,
  asset,
  onSuccess,
  projects,
  warehouses,
}) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  // Form State
  const [assetCode, setAssetCode] = useState('');
  const [collateralType, setCollateralType] = useState('BDS');
  const [certificateNo, setCertificateNo] = useState('');
  const [certificateGroup, setCertificateGroup] = useState<'so_lon' | 'so_nho'>('so_nho');
  const [projectId, setProjectId] = useState('');
  const [businessProjectName, setBusinessProjectName] = useState('');
  const [legalLotCode, setLegalLotCode] = useState('');
  const [businessPlotCode, setBusinessPlotCode] = useState('');
  const [area, setArea] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  // Chủ sở hữu (liên kết Pháp nhân/NĐT)
  const [investorEntities, setInvestorEntities] = useState<any[]>([]);
  const [currentOwnerEntityId, setCurrentOwnerEntityId] = useState('');
  const [searchEntityText, setSearchEntityText] = useState('');
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);

  // Extended Land & Legal Fields
  const [mapSheetNo, setMapSheetNo] = useState('');
  const [landLotNo, setLandLotNo] = useState('');
    const [usagePurpose, setUsagePurpose] = useState('Đất ở tại đô thị (ODT)');
  const [assetType, setAssetType] = useState('Đất nền');
  const [registryNo, setRegistryNo] = useState('');
  const [registryDate, setRegistryDate] = useState('');
  const [managingUnit, setManagingUnit] = useState('');
  const [usageTermType, setUsageTermType] = useState<'fixed_date' | 'long_term'>('long_term');
  const [usageTermDate, setUsageTermDate] = useState('');
  const [scanFileUrl, setScanFileUrl] = useState('');
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);

  // Mortgage Fields
  const [isMortgaged, setIsMortgaged] = useState(false);
  const [mortgageBank, setMortgageBank] = useState('');
  const [mortgageUnit, setMortgageUnit] = useState('');
        const [mortgageValuation, setMortgageValuation] = useState('');
  const [collateralRatio, setCollateralRatio] = useState('');
  const [collateralValue, setCollateralValue] = useState('');
  const [mortgageReleaseDate, setMortgageReleaseDate] = useState('');
  const [notes, setNotes] = useState('');

  // Duplicate error state
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Load all assets to perform live duplicate checks
      fetchAssets({}, 1, 5000).then(res => setAllAssets(res.data)).catch(() => {});
      fetchInvestorEntities().then(setInvestorEntities).catch(() => {});
    }
  }, [isOpen]);

  const filteredEntities = investorEntities.filter(e => {
    const s = searchEntityText.toLowerCase();
    return (e.name?.toLowerCase().includes(s) || e.company_code?.toLowerCase().includes(s));
  }).slice(0, 50);

  useEffect(() => {
    if (asset) {
      setAssetCode(asset.asset_code || '');
      setCollateralType(asset.collateral_type || 'BDS');
      setCertificateNo(asset.certificate_no || '');
      setCertificateGroup(asset.certificate_group || 'so_nho');
      setProjectId(asset.project_id || '');
      setBusinessProjectName(asset.business_project_name || '');
      setLegalLotCode(asset.legal_lot_code || '');
      setBusinessPlotCode(asset.business_plot_code || '');
      setArea(asset.area !== null && asset.area !== undefined ? String(asset.area) : '');
      setCurrentOwnerEntityId(asset.current_owner_entity_id || '');
      setSearchEntityText(
        asset.current_owner_entity?.name
          ? (asset.current_owner_entity.company_code ? `[${asset.current_owner_entity.company_code}] ${asset.current_owner_entity.name}` : asset.current_owner_entity.name)
          : (asset.investor_entities?.name || '')
      );
      setWarehouseId(asset.warehouse_id || '');

      setMapSheetNo(asset.map_sheet_no || '');
      setLandLotNo(asset.land_lot_no || '');
            setUsagePurpose(asset.usage_purpose || 'Đất ở tại đô thị (ODT)');
      setAssetType(asset.asset_type || 'Đất nền');
      setRegistryNo(asset.registry_no || '');
      setRegistryDate(asset.registry_date || '');
      setManagingUnit(asset.managing_unit || '');
      setUsageTermType(asset.usage_term_type || 'long_term');
      setUsageTermDate(asset.usage_term_date || '');
      setScanFileUrl(asset.scan_file_url || '');

      const isMort = asset.mortgage_status === 'mortgaged';
      setIsMortgaged(isMort);
      setMortgageBank(asset.mortgage_bank || '');
      setMortgageUnit(asset.mortgage_unit || '');
                        setMortgageValuation(asset.mortgage_valuation ? String(asset.mortgage_valuation) : '');
      setCollateralRatio(asset.collateral_ratio ? String(asset.collateral_ratio) : '');
      setCollateralValue(asset.collateral_value ? String(asset.collateral_value) : '');
      setMortgageReleaseDate(asset.mortgage_expected_release_date || '');
      setNotes(asset.notes || '');

      setDuplicateWarning(null);
    }
  }, [asset]);

  // Live duplicate warning check
  useEffect(() => {
    if (!asset || !isOpen) return;

    const dupResult = checkAssetDuplicate(
      {
        certificate_no: certificateNo,
        project_id: projectId || null,
        legal_lot_code: legalLotCode || null,
        map_sheet_no: mapSheetNo || null,
        land_lot_no: landLotNo || null,
      },
      allAssets,
      asset.id,
      projects.find(p => p.id === projectId)?.name
    );

    if (dupResult.isDuplicate) {
      setDuplicateWarning(dupResult.reason || 'Phát hiện dữ liệu trùng lặp trong dự án!');
    } else {
      setDuplicateWarning(null);
    }
  }, [certificateNo, projectId, legalLotCode, mapSheetNo, landLotNo, allAssets, asset, isOpen]);

  const handleValuationChange = (val: string) => {
    setMortgageValuation(val);
    if (val && collateralRatio) {
      setCollateralValue(((Number(val) * Number(collateralRatio)) / 100).toString());
    }
  };

  const handleRatioChange = (ratio: string) => {
    setCollateralRatio(ratio);
    if (mortgageValuation && ratio) {
      setCollateralValue(((Number(mortgageValuation) * Number(ratio)) / 100).toString());
    }
  };

  if (!isOpen || !asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateNo.trim()) {
      toast.error('Vui lòng nhập Số GCN QSDĐ!');
      return;
    }

    if (duplicateWarning) {
      toast.error(duplicateWarning);
      return;
    }

    setLoading(true);
    try {
      const updates: Partial<Asset> = {
        asset_code: assetCode || asset.asset_code,
        collateral_type: collateralType,
        certificate_no: certificateNo.trim(),
        certificate_group: certificateGroup,
        project_id: projectId || null,
        business_project_name: businessProjectName.trim() || null,
        legal_lot_code: legalLotCode.trim() || null,
        business_plot_code: businessPlotCode.trim() || null,
        area: area ? Number(area) : null,
        current_owner_entity_id: currentOwnerEntityId || null,
        warehouse_id: warehouseId || null,

        map_sheet_no: mapSheetNo.trim() || null,
        land_lot_no: landLotNo.trim() || null,
                usage_purpose: usagePurpose || null,
        asset_type: assetType || null,
        registry_no: registryNo.trim() || null,
        registry_date: registryDate || null,
        managing_unit: managingUnit.trim() || null,
        usage_term_type: usageTermType,
        usage_term_date: usageTermType === 'fixed_date' ? (usageTermDate || null) : null,
        scan_file_url: scanFileUrl.trim() || null,

        mortgage_status: isMortgaged ? 'mortgaged' : 'none',
        mortgage_bank: isMortgaged ? mortgageBank.trim() : null,
        mortgage_unit: isMortgaged ? mortgageUnit.trim() : null,
                        mortgage_valuation: isMortgaged && mortgageValuation ? Number(mortgageValuation) : null,
        collateral_ratio: isMortgaged && collateralRatio ? Number(collateralRatio) : null,
        collateral_value: isMortgaged && collateralValue ? Number(collateralValue) : null,
        mortgage_expected_release_date: isMortgaged ? (mortgageReleaseDate || null) : null,
        notes: notes.trim() || null,
      };

      await updateAsset(
        asset.id, 
        updates, 
        profile ? { id: profile.id, email: profile.email, full_name: profile.full_name } : null,
        notes || 'Chỉnh sửa cập nhật thông tin GCN'
      );

      // Log activity
      await logActivity({
        assetId: asset.id,
        actionType: 'Cập nhật GCN',
        description: `Chỉnh sửa cập nhật thông tin GCN ${certificateNo} (Mã: ${assetCode || asset.asset_code || asset.id})`,
        usedBy: profile?.full_name || 'Quản trị viên',
        warehouseId: warehouseId || asset.warehouse_id || undefined,
        performedBy: profile?.id,
        notes: notes || undefined,
      });

      toast.success('Cập nhật thông tin GCN thành công!');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Update asset error:', error);
      toast.error('Lỗi khi cập nhật GCN: ' + (error?.message || 'Vui lòng thử lại'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1E3A8A] text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold">Chỉnh Sửa & Cập Nhật GCN QSDĐ</h3>
                <span className="px-2 py-0.5 bg-blue-500/40 text-blue-100 text-xs font-mono font-bold rounded">
                  {assetCode || asset.asset_code || 'Chưa gán mã'}
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Cập nhật thông tin định danh, địa chính, phân khu và hồ sơ thế chấp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {duplicateWarning && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-800 text-xs animate-pulse">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Cảnh báo trùng lặp: </span>
                {duplicateWarning}
              </div>
            </div>
          )}

          {/* Block 1: Định Danh & Phân Loại TSĐB */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <ShieldCheck className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              1. Thông Tin Định Danh & Phân Loại TSĐB
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mã Định Danh Tài Sản (Hệ thống)
                </label>
                <input
                  type="text"
                  value={assetCode}
                  onChange={e => setAssetCode(e.target.value)}
                  placeholder="VMT_BDS_00001"
                  className="w-full px-3 py-2 border rounded-md text-xs font-mono bg-gray-50 border-gray-300 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Loại Tài Sản Đảm Bảo (TSĐB) <span className="text-red-500">*</span>
                </label>
                <select
                  value={collateralType}
                  onChange={e => setCollateralType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300 focus:ring-1 focus:ring-blue-500"
                >
                  {COLLATERAL_TYPES.map(ct => (
                    <option key={ct.code} value={ct.code}>
                      [{ct.shortName}] {ct.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nhóm Sổ Quản Lý
                </label>
                <select
                  value={certificateGroup}
                  onChange={e => setCertificateGroup(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                >
                  <option value="so_nho">Sổ nhỏ (Lô/Căn hộ/Liền kề)</option>
                  <option value="so_lon">Sổ lớn (Tổng DA / Khu đất mẹ)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Block 2: Pháp Lý & Số GCN */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <FileText className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              2. Pháp Lý & Thông Tin Giấy Chứng Nhận
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Số GCN QSDĐ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={certificateNo}
                  onChange={e => setCertificateNo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs font-bold text-[#1E3A8A] border-gray-300 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Số Vào Sổ Cấp GCN
                </label>
                <input
                  type="text"
                  value={registryNo}
                  onChange={e => setRegistryNo(e.target.value)}
                  placeholder="CS 01234 / CS-CT..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ngày Vào Sổ Cấp GCN
                </label>
                <input
                  type="date"
                  value={registryDate}
                  onChange={e => setRegistryDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>

              <div className="md:col-span-2 relative">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Chủ Sở Hữu (Pháp nhân)
                </label>
                <input
                  type="text"
                  value={searchEntityText}
                  onChange={e => {
                    setSearchEntityText(e.target.value);
                    setShowEntityDropdown(true);
                    if (e.target.value === '') setCurrentOwnerEntityId('');
                  }}
                  onFocus={() => setShowEntityDropdown(true)}
                  onBlur={() => setTimeout(() => setShowEntityDropdown(false), 200)}
                  placeholder="Nhập tên hoặc mã pháp nhân..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {showEntityDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredEntities.length > 0 ? filteredEntities.map(entity => (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => {
                          setCurrentOwnerEntityId(entity.id);
                          setSearchEntityText(entity.company_code ? `[${entity.company_code}] ${entity.name}` : entity.name);
                          setShowEntityDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-xs border-b last:border-0"
                      >
                        {entity.company_code ? `[${entity.company_code}] ` : ''}{entity.name}
                      </button>
                    )) : (
                      <div className="px-4 py-2 text-xs text-gray-500">Không tìm thấy pháp nhân phù hợp</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Đơn Vị Quản Lý Sổ
                </label>
                <input
                  type="text"
                  value={managingUnit}
                  onChange={e => setManagingUnit(e.target.value)}
                  placeholder="Ban Nguồn Vốn / Văn phòng BTC"
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>
            </div>
          </div>

          {/* Block 3: Vị Trí, Phân Khu & Địa Chính */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <MapPin className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              3. Vị Trí, Phân Khu & Thửa Đất
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Dự Án Trực Thuộc (Pháp lý)
                </label>
                <select
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Chọn dự án pháp lý --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.areas?.name ? `(${p.areas.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-blue-900 mb-1 flex items-center justify-between">
                  <span>Tên Dự Án Kinh Doanh</span>
                  <span className="text-[10px] text-blue-600 font-normal">Tên bán hàng</span>
                </label>
                <input
                  type="text"
                  value={businessProjectName}
                  onChange={e => setBusinessProjectName(e.target.value)}
                  placeholder="VD: Cồn Dầu, Spana, Cora..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-blue-200 bg-blue-50/20 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mã Lô Pháp Lý
                </label>
                <input
                  type="text"
                  value={legalLotCode}
                  onChange={e => setLegalLotCode(e.target.value)}
                  placeholder="Phân khu A-Lô 12, Block B-LK04..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-blue-900 mb-1 flex items-center justify-between">
                  <span>Mã Lô Kinh Doanh</span>
                  <span className="text-[10px] text-blue-600 font-normal">Mã bán hàng</span>
                </label>
                <input
                  type="text"
                  value={businessPlotCode}
                  onChange={e => setBusinessPlotCode(e.target.value)}
                  placeholder="VD: LK02-15, BT-VIP-08..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-blue-200 bg-blue-50/20 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Số Thửa Bản Đồ
                </label>
                <input
                  type="text"
                  value={landLotNo}
                  onChange={e => setLandLotNo(e.target.value)}
                  placeholder="112, 405..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Số Tờ Bản Đồ
                </label>
                <input
                  type="text"
                  value={mapSheetNo}
                  onChange={e => setMapSheetNo(e.target.value)}
                  placeholder="04, 25..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Diện Tích (m²)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  placeholder="450.5"
                  className="w-full px-3 py-2 border rounded-md text-xs font-semibold border-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Loại Tài Sản
                </label>
                <select
                  value={assetType}
                  onChange={e => setAssetType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300 focus:ring-1 focus:ring-blue-500"
                >
                  {PROPERTY_TYPES.map(pt => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mục Đích Sử Dụng
                </label>
                <input
                  type="text"
                  value={usagePurpose}
                  onChange={e => setUsagePurpose(e.target.value)}
                  placeholder="Đất ở tại đô thị (ODT), TMD..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Thời Hạn Sử Dụng
                </label>
                <div className="flex space-x-2">
                  <select
                    value={usageTermType}
                    onChange={e => setUsageTermType(e.target.value as any)}
                    className="w-1/2 px-2 py-2 border rounded-md text-xs border-gray-300"
                  >
                    <option value="long_term">Lâu dài</option>
                    <option value="fixed_date">Có thời hạn</option>
                  </select>
                  {usageTermType === 'fixed_date' && (
                    <input
                      type="date"
                      value={usageTermDate}
                      onChange={e => setUsageTermDate(e.target.value)}
                      className="w-1/2 px-2 py-2 border rounded-md text-xs border-gray-300"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Block 4: Kho Lưu Trữ & Hồ Sơ Thế Chấp */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <Building2 className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              4. Kho Lưu Trữ & Hồ Sơ Thế Chấp
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Kho Lưu Trữ GCN
                </label>
                <select
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                >
                  <option value="">-- Chưa gán kho --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.is_central ? '(Trung tâm)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex items-center pt-5">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMortgaged}
                    onChange={e => setIsMortgaged(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <span className="text-xs font-semibold text-gray-800">
                    Tài sản đang được thế chấp / cầm cố tại Ngân hàng
                  </span>
                </label>
              </div>
            </div>

            {isMortgaged && (
              <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-lg space-y-3 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Ngân hàng thế chấp <span className="text-gray-400 font-normal">(nhiều NH cách nhau bởi ";")</span>
                    </label>
                    <input
                      type="text"
                      value={mortgageBank}
                      onChange={e => setMortgageBank(e.target.value)}
                      placeholder="VD: Vietcombank - CN Tân Định; VTB - CN Sông Hàn"
                      className="w-full px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Đơn vị vay <span className="text-gray-400 font-normal">(nhiều đơn vị cách nhau bởi ";")</span>
                    </label>
                    <input
                      type="text"
                      value={mortgageUnit}
                      onChange={e => setMortgageUnit(e.target.value)}
                      placeholder="Ban Nguồn Vốn - TĐ1; Công ty CP ABC..."
                      className="w-full px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Giá trị định giá (VNĐ)
                    </label>
                    <input
                      type="number"
                      value={mortgageValuation}
                      onChange={e => handleValuationChange(e.target.value)}
                      placeholder="35000000000"
                      className="w-full px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tỷ lệ đảm bảo (%) & Giá trị đảm bảo (VNĐ)
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        value={collateralRatio}
                        onChange={e => handleRatioChange(e.target.value)}
                        placeholder="%"
                        className="w-20 px-2 py-2 border rounded-md text-xs bg-white border-gray-300"
                      />
                      <input
                        type="number"
                        value={collateralValue}
                        onChange={e => setCollateralValue(e.target.value)}
                        placeholder="Giá trị đảm bảo (VNĐ)"
                        className="flex-1 px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Ngày dự kiến giải chấp
                    </label>
                    <input
                      type="date"
                      value={mortgageReleaseDate}
                      onChange={e => setMortgageReleaseDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                    />
                  </div>


                </div>
              </div>
            )}
          </div>

          {/* Block 5: File Scan & Ghi Chú */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <FileText className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              5. File Scan GCN & Ghi Chú
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  File Scan Giấy Chứng Nhận (PDF, JPG, JPEG, PNG - Tối đa 10MB)
                </label>
                <DocumentUploadField
                  value={scanFileUrl}
                  onChange={setScanFileUrl}
                  assetId={asset.id}
                  onPreview={(url) => setPreviewFileUrl(url)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ghi Chú Bổ Sung
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ghi chú hồ sơ, số hợp đồng thế chấp..."
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                />
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-500">
                Trạng thái: <span className="font-semibold text-gray-800">{asset.custody_status === 'in_stock' ? 'Trong kho' : 'Đang mượn'}</span> · <span className="font-semibold text-gray-800">{asset.lifecycle_status === 'active' ? 'Đang hiệu lực' : 'Đã tách/Đóng sổ'}</span>
              </div>
              {canTransferAsset(profile, asset) && (
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Chuyển Nhượng</span>
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={loading || !!duplicateWarning}
                className="px-5 py-2 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Lưu Cập Nhật</span>
              </button>
            </div>
          </div>
      </form>
      </div>

      {previewFileUrl && (
        <DocumentPreviewModal
          isOpen={!!previewFileUrl}
          onClose={() => setPreviewFileUrl(null)}
          fileUrlOrPath={previewFileUrl}
          certificateNo={certificateNo || asset.certificate_no}
          title="Xem Bản Scan GCN"
        />
      )}

      {/* Asset Transfer Modal */}
      {asset && (
        <AssetTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          assets={[asset]}
          currentUser={profile}
          onSuccess={() => {
            onSuccess();
            onClose();
          }}
        />
      )}
    </div>
  );
};