import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, ShieldCheck, AlertTriangle, Building2, FileText, MapPin } from 'lucide-react';
import { Asset, Project, Warehouse } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { checkAssetDuplicateServer, allocateAssetCodeByPrefix } from '../api/assets';
import { fetchInvestorEntities } from '../api/investorEntities';
import { COLLATERAL_TYPES, resolveAssetCodePrefix } from '../lib/assetIdentifier';
import { DocumentUploadField } from './DocumentUploadField';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { HIGH_RISE_ASSET_TYPES, LOW_RISE_ASSET_TYPES } from '../constants/assetTypes';
import { validateScanLink } from '../lib/scanLink';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (assetData: Partial<Asset>) => Promise<void>;
  projects: Project[];
  warehouses: Warehouse[];
}

export const CreateAssetModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, projects, warehouses }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  // Asset Code & Collateral Type
  const [collateralType, setCollateralType] = useState('BDS');
  const [customAssetCode, setCustomAssetCode] = useState('');

  // Core Fields
  const [certificateNo, setCertificateNo] = useState('');
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
  const [certificateGroup, setCertificateGroup] = useState<'so_lon' | 'so_nho'>('so_nho');
  const [usageTermType, setUsageTermType] = useState<'fixed_date' | 'long_term'>('long_term');
  const [usageTermDate, setUsageTermDate] = useState('');
  const [scanFileUrl, setScanFileUrl] = useState('');
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);

  // Mortgage Fields
  const [isMortgaged, setIsMortgaged] = useState(false);
  const [mortgageBank, setMortgageBank] = useState('');
  const [mortgageUnit, setMortgageUnit] = useState('');
  const [mortgageValuation, setMortgageValuation] = useState('');
  const [mortgageReleaseDate, setMortgageReleaseDate] = useState('');
        const [collateralRatio, setCollateralRatio] = useState('');
  const [collateralValue, setCollateralValue] = useState('');
  const [notes, setNotes] = useState('');

  // Duplicate warning & confirmation state
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateAckConfirmed, setDuplicateAckConfirmed] = useState(false);
  const [duplicateAckReason, setDuplicateAckReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchInvestorEntities().then(setInvestorEntities).catch(() => {});
    }
  }, [isOpen]);

  // Tiền tố mã tài sản tự động nội suy từ Dự án -> Địa bàn -> Vùng miền (không tăng bộ đếm)
  const resolvedPrefix = useMemo(() => {
    if (!projectId) return null;
    return resolveAssetCodePrefix({
      projectId,
      projects,
      collateralType,
    });
  }, [projectId, projects, collateralType]);

  const filteredEntities = investorEntities.filter(e => {
    const s = searchEntityText.toLowerCase();
    return (e.name?.toLowerCase().includes(s) || e.company_code?.toLowerCase().includes(s));
  }).slice(0, 50);

  // Live duplicate check qua RPC máy chủ (check_asset_duplicate)
  useEffect(() => {
    if (!isOpen) return;
    if (!certificateNo.trim() && !legalLotCode.trim() && (!mapSheetNo.trim() || !landLotNo.trim())) {
      setIsDuplicate(false);
      setDuplicateWarning(null);
      setDuplicateAckConfirmed(false);
      setDuplicateAckReason('');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await checkAssetDuplicateServer({
          certificateNo: certificateNo.trim() || null,
          projectId: projectId || null,
          legalLotCode: legalLotCode.trim() || null,
          mapSheetNo: mapSheetNo.trim() || null,
          landLotNo: landLotNo.trim() || null,
        });
        if (res.is_duplicate) {
          setIsDuplicate(true);
          setDuplicateWarning(res.reason || 'Trùng lặp dữ liệu GCN trong hệ thống!');
        } else {
          setIsDuplicate(false);
          setDuplicateWarning(null);
          setDuplicateAckConfirmed(false);
          setDuplicateAckReason('');
        }
      } catch (err) {
        console.error('Lỗi khi kiểm tra trùng GCN:', err);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [certificateNo, projectId, legalLotCode, mapSheetNo, landLotNo, isOpen]);

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateNo.trim() || !profile) return;

    if (isDuplicate && (!duplicateAckConfirmed || duplicateAckReason.trim().length < 10)) {
      toast.error('Vui lòng xác nhận và nhập lý do tối thiểu 10 ký tự cho trường hợp trùng số GCN.');
      return;
    }

    const scanValidation = validateScanLink(scanFileUrl);
    if (!scanValidation.ok) {
      toast.error(scanValidation.error || 'Link bản scan không hợp lệ.');
      return;
    }

    setLoading(true);
    try {
      // 1. Kiểm tra trùng GCN trên server qua RPC check_asset_duplicate
      const dupCheck = await checkAssetDuplicateServer({
        certificateNo: certificateNo.trim(),
        projectId: projectId || null,
        legalLotCode: legalLotCode.trim() || null,
        mapSheetNo: mapSheetNo.trim() || null,
        landLotNo: landLotNo.trim() || null,
      });
      if (dupCheck.is_duplicate) {
        setIsDuplicate(true);
        setDuplicateWarning(dupCheck.reason || 'Trùng lặp dữ liệu GCN trong hệ thống!');
        if (!duplicateAckConfirmed || duplicateAckReason.trim().length < 10) {
          toast.error(dupCheck.reason || 'Trùng lặp dữ liệu GCN trong hệ thống. Vui lòng xác nhận trường hợp trùng kèm lý do.');
          setLoading(false);
          return;
        }
      }

      // 2. Cấp mã tài sản chính thức qua RPC allocate_asset_code nếu không nhập mã tùy biến
      let finalAssetCode = customAssetCode.trim();
      if (!finalAssetCode) {
        if (!projectId) {
          toast.error('Vui lòng chọn Dự án để sinh mã tài sản.');
          setLoading(false);
          return;
        }
        const resolved = resolveAssetCodePrefix({
          projectId,
          projects,
          collateralType,
        });
        if (resolved.isValid) {
          finalAssetCode = await allocateAssetCodeByPrefix(resolved.prefix);
        } else {
          toast.error(resolved.error || 'Dự án hoặc địa bàn chưa cấu hình mã vùng/mã tỉnh.');
          setLoading(false);
          return;
        }
      }

      const isDup = isDuplicate || dupCheck.is_duplicate;

      await onSubmit({
        asset_code: finalAssetCode,
        collateral_type: collateralType,
        certificate_no: certificateNo.trim(),
        ...(isDup ? { duplicate_ack_reason: duplicateAckReason.trim() } : {}),
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
        certificate_group: certificateGroup,
        usage_term_type: usageTermType,
        usage_term_date: usageTermType === 'fixed_date' ? (usageTermDate || null) : null,
        scan_file_url: scanValidation.url || null,

        // GCN đã thế chấp: bản gốc thường đang giữ tại ngân hàng, không nằm tại kho công ty
        // -> đánh dấu Đã xuất kho ngay khi tạo, thay vì mặc định Trong kho.
        custody_status: isMortgaged ? 'checked_out' : 'in_stock',
        lifecycle_status: 'active',
        sale_status: 'not_ready',
        mortgage_status: isMortgaged ? 'mortgaged' : 'none',
        mortgage_bank: isMortgaged ? mortgageBank.trim() : null,
        mortgage_unit: isMortgaged ? mortgageUnit.trim() : null,
                        mortgage_valuation: isMortgaged && mortgageValuation ? Number(mortgageValuation) : null,
        collateral_ratio: isMortgaged && collateralRatio ? Number(collateralRatio) : null,
        collateral_value: isMortgaged && collateralValue ? Number(collateralValue) : null,
        mortgage_expected_release_date: isMortgaged ? (mortgageReleaseDate || null) : null,
        notes: notes.trim() || null,
      });

      toast.success('Khai báo GCN thành công!');
      onClose();
      // Reset form
      setCertificateNo('');
      setProjectId('');
      setBusinessProjectName('');
      setLegalLotCode('');
      setBusinessPlotCode('');
      setArea('');
      setCurrentOwnerEntityId('');
      setSearchEntityText('');
      setWarehouseId('');
      setCustomAssetCode('');
      setMapSheetNo('');
      setLandLotNo('');
            setScanFileUrl('');
      setIsMortgaged(false);
      setMortgageBank('');
      setMortgageUnit('');
      setMortgageValuation('');
      setMortgageReleaseDate('');
                        setCollateralRatio('');
      setCollateralValue('');
      setNotes('');
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 bg-[#1E3A8A] text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="text-base font-bold">Khai Báo GCN QSDĐ / Tài Sản Mới</h3>
              <p className="text-xs text-blue-200">
                Tự động định danh mã tài sản theo Vùng và Loại tài sản đảm bảo (TSĐB)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {isDuplicate && duplicateWarning && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3 text-amber-900">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <span className="font-bold text-amber-900">Cảnh báo trùng lặp dữ liệu: </span>
                  <span className="text-amber-800">{duplicateWarning}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">
                  Lý do xác nhận đây là trường hợp trùng thật (bắt buộc, tối thiểu 10 ký tự) <span className="text-red-500">*</span>:
                </label>
                <textarea
                  rows={2}
                  value={duplicateAckReason}
                  onChange={(e) => setDuplicateAckReason(e.target.value)}
                  placeholder="Ví dụ: Đã đối chiếu bản gốc, cơ quan cấp cấp trùng số cho 2 chủ sở hữu khác nhau..."
                  className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white placeholder:text-gray-400"
                />
                {duplicateAckReason.trim().length > 0 && duplicateAckReason.trim().length < 10 && (
                  <p className="text-[11px] text-red-600 mt-1">
                    Lý do xác nhận cần tối thiểu 10 ký tự (hiện có {duplicateAckReason.trim().length}/10).
                  </p>
                )}
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={duplicateAckConfirmed}
                  onChange={(e) => setDuplicateAckConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-medium text-amber-950">
                  Tôi xác nhận đã đối chiếu bản gốc và đây là trường hợp trùng thật
                </span>
              </label>
            </div>
          )}

          {/* SECTION 1: ĐỊNH DANH MÃ TÀI SẢN & TSĐB */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <ShieldCheck className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              1. Định Danh Mã Tài Sản & Loại TSĐB
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mã Định Danh (Hệ Thống Tự Sinh)
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    value={customAssetCode || (resolvedPrefix?.isValid ? `${resolvedPrefix.prefix}xxxxxxxx` : '')}
                    onChange={e => setCustomAssetCode(e.target.value)}
                    placeholder={resolvedPrefix?.isValid ? `${resolvedPrefix.prefix}xxxxxxxx` : 'Chọn Dự án để nội suy tiền tố mã'}
                    className={`w-full px-3 py-2 border rounded-md text-xs font-mono font-bold ${
                      resolvedPrefix?.isValid
                        ? 'text-[#1E3A8A] bg-blue-50/50 border-blue-200 focus:bg-white'
                        : resolvedPrefix?.error
                        ? 'text-rose-700 bg-rose-50/50 border-rose-200 focus:bg-white'
                        : 'text-gray-500 bg-gray-50 border-gray-200'
                    }`}
                  />
                </div>
                {resolvedPrefix?.isValid ? (
                  <span className="text-[10px] text-emerald-600 mt-1 block font-medium">
                    ✓ Tiền tố: <code className="font-mono font-bold">{resolvedPrefix.prefix}</code> (8 chữ số tự sinh trên máy chủ khi lưu)
                  </span>
                ) : resolvedPrefix?.error ? (
                  <span className="text-[10px] text-rose-600 mt-1 block font-semibold leading-relaxed">
                    ⚠️ {resolvedPrefix.error}
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-500 mt-0.5 block">
                    Quy tắc: [Mã vùng]_[Mã tỉnh]_[Loại TSĐB]_[8 số tự sinh]
                  </span>
                )}
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
                  <option value="so_nho">Sổ nhỏ (Lô / Căn hộ / Liền kề)</option>
                  <option value="so_lon">Sổ lớn (Tổng DA / Khu đất mẹ)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 2: PHÁP LÝ GCN */}
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
                  required
                  type="text"
                  value={certificateNo}
                  onChange={e => setCertificateNo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs font-bold text-[#1E3A8A] border-gray-300 focus:ring-1 focus:ring-blue-500"
                  placeholder="VD: CQ 123456"
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
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                  placeholder="VD: CH 01234"
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
                <div className="relative">
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
                </div>
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
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                  placeholder="Ban Nguồn Vốn / Sở TNMT..."
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: VỊ TRÍ, PHÂN KHU & THỬA ĐẤT */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <MapPin className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              3. Vị Trí, Phân Khu & Thửa Đất
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Dự Án (Pháp lý)</label>
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
                  className="w-full px-3 py-2 border rounded-md text-xs border-blue-200 bg-blue-50/20 focus:ring-1 focus:ring-blue-500"
                  placeholder="VD: Cồn Dầu, Spana, Cora..."
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
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                  placeholder="VD: Phân khu A-Lô 12, Block B-LK04..."
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
                  className="w-full px-3 py-2 border rounded-md text-xs border-blue-200 bg-blue-50/20 focus:ring-1 focus:ring-blue-500"
                  placeholder="VD: LK02-15, BT-VIP-08..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số Thửa Bản Đồ</label>
                <input
                  type="text"
                  value={landLotNo}
                  onChange={e => setLandLotNo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                  placeholder="VD: 112"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số Tờ Bản Đồ</label>
                <input
                  type="text"
                  value={mapSheetNo}
                  onChange={e => setMapSheetNo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                  placeholder="VD: 04"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Diện Tích (m²)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs font-semibold border-gray-300"
                  placeholder="VD: 450.5"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Loại Tài Sản</label>
                <select
                  value={assetType}
                  onChange={e => setAssetType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300 focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <optgroup label="🏢 Cao tầng / Căn hộ / Sàn 3D">
                    {HIGH_RISE_ASSET_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🏡 Thấp tầng / Đất nền">
                    {LOW_RISE_ASSET_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mục Đích Sử Dụng</label>
                <input
                  type="text"
                  value={usagePurpose}
                  onChange={e => setUsagePurpose(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                  placeholder="Đất ở tại đô thị (ODT)..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Thời Hạn Sử Dụng</label>
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

          {/* SECTION 4: KHO & THẾ CHẤP */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <Building2 className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              4. Kho Quản Lý & Hồ Sơ Thế Chấp
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kho Quản Lý</label>
                <select
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                >
                  <option value="">-- Chọn kho giữ sổ --</option>
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
                    Tài sản đang được thế chấp tại Ngân hàng
                  </span>
                </label>
              </div>
            </div>

            {isMortgaged && (
              <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-lg space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Ngân Hàng Nhận Thế Chấp (NH 1)
                    </label>
                    <input
                      type="text"
                      value={mortgageBank}
                      onChange={e => setMortgageBank(e.target.value)}
                      placeholder="BIDV, VCB..."
                      className="w-full px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Đơn Vị Thực Hiện Thế Chấp (Đơn vị 1)
                    </label>
                    <input
                      type="text"
                      value={mortgageUnit}
                      onChange={e => setMortgageUnit(e.target.value)}
                      placeholder="Ban Nguồn Vốn..."
                      className="w-full px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Giá Trị Định Giá (VNĐ)
                    </label>
                    <input
                      type="number"
                      value={mortgageValuation}
                      onChange={handleValuationChange}
                      placeholder="35000000000"
                      className="w-full px-3 py-2 border rounded-md text-xs bg-white border-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tỷ Lệ Đảm Bảo (%) & Giá Trị Đảm Bảo (VNĐ)
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        value={collateralRatio}
                        onChange={handleRatioChange}
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
                      Ngày Dự Kiến Giải Chấp
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
          {/* SECTION 5: FILE SCAN & GHI CHÚ */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center border-b pb-2">
              <FileText className="w-4 h-4 text-[#1E3A8A] mr-1.5" />
              5. File Scan GCN & Ghi Chú
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  File scan Giấy chứng nhận (PDF, JPG, JPEG, PNG - Tối đa 10MB)
                </label>
                <DocumentUploadField
                  value={scanFileUrl}
                  onChange={setScanFileUrl}
                  onPreview={(url) => setPreviewFileUrl(url)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi Chú</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-xs border-gray-300"
                  placeholder="Ghi chú thêm về GCN..."
                />
              </div>
            </div>
          </div>
          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || (isDuplicate && (!duplicateAckConfirmed || duplicateAckReason.trim().length < 10))}
              className="px-5 py-2 bg-[#1E3A8A] text-white rounded-lg text-xs font-bold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-sm"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Khai Báo GCN
            </button>
          </div>
        </form>
      </div>
      {previewFileUrl && (
        <DocumentPreviewModal
          isOpen={!!previewFileUrl}
          onClose={() => setPreviewFileUrl(null)}
          fileUrlOrPath={previewFileUrl}
          certificateNo={certificateNo}
          title="Xem Bản Scan GCN"
        />
      )}
    </div>
  );
};