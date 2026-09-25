import React, { useState, useEffect } from 'react';
import { X, Search, FileText, AlertTriangle, GitFork, LandPlot } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchProjects, fetchWarehouses, fetchAssetIdentifierCandidates } from '../api/assets';
import { createDeclarationRequest } from '../api/assetDeclarationRequests';
import { fetchInvestorEntities } from '../api/investorEntities';
import { fetchOpenPlannedLandLotsByParentAsset } from '../api/plannedLandLots';
import { PlannedLandLot } from '../types';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeclareNewAssetModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [investorEntities, setInvestorEntities] = useState<any[]>([]);

  const [requestType, setRequestType] = useState<'cap_moi' | 'tach_so' | 'cap_doi'>('cap_moi');
  const [splitMode, setSplitMode] = useState<'SPLIT_FULL' | 'SPLIT_PARTIAL'>('SPLIT_FULL');
  const [remainingArea, setRemainingArea] = useState('');
  const [oldAssetId, setOldAssetId] = useState('');
  const [plannedLots, setPlannedLots] = useState<PlannedLandLot[]>([]);
  const [loadingPlannedLots, setLoadingPlannedLots] = useState(false);
  const [selectedPlannedLotId, setSelectedPlannedLotId] = useState('');
  
  // Search state for entity
  const [searchEntityText, setSearchEntityText] = useState('');
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);

  // Search state for old asset
  const [searchOldAsset, setSearchOldAsset] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Form fields
  const [certificateNo, setCertificateNo] = useState('');
  const [registryNo, setRegistryNo] = useState('');
  const [registryDate, setRegistryDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [legalLotCode, setLegalLotCode] = useState('');
  const [landLotNo, setLandLotNo] = useState('');
  const [mapSheetNo, setMapSheetNo] = useState('');
  const [businessProjectName, setBusinessProjectName] = useState('');
  const [businessPlotCode, setBusinessPlotCode] = useState('');
  const [area, setArea] = useState('');
  const [currentOwnerEntityId, setCurrentOwnerEntityId] = useState('');
  const [certificateGroup, setCertificateGroup] = useState<'so_lon' | 'so_nho'>('so_nho');
  const [usagePurpose, setUsagePurpose] = useState('');
  const [usageTermType, setUsageTermType] = useState('');
  const [usageTermDate, setUsageTermDate] = useState('');
  const [assetType, setAssetType] = useState('Đất nền');
  const [collateralType, setCollateralType] = useState('BDS');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [keepOpen, setKeepOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [p, w, a, e] = await Promise.all([
        fetchProjects(),
        fetchWarehouses(),
        fetchAssetIdentifierCandidates(),
        fetchInvestorEntities()
      ]);
      setProjects(p);
      setWarehouses(w);
      setAllAssets(a);
      setInvestorEntities(e);

      if (profile?.role === 'investor' && profile.owner_entity_ids?.length) {
        setCurrentOwnerEntityId(profile.owner_entity_ids[0]);
        setSearchEntityText('Pháp nhân NĐT (ID: ' + profile.owner_entity_ids[0] + ')');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredEntities = investorEntities.filter(e => {
    const s = searchEntityText.toLowerCase();
    return (e.name?.toLowerCase().includes(s) || e.company_code?.toLowerCase().includes(s));
  }).slice(0, 50);

  // Lô quy hoạch (nếu có): chỉ áp dụng khi Tách sổ và đã chọn Sổ gốc, giúp điền nhanh dữ liệu lô đã khai trước.
  useEffect(() => {
    setSelectedPlannedLotId('');
    if (requestType !== 'tach_so' || !oldAssetId) {
      setPlannedLots([]);
      return;
    }
    let cancelled = false;
    setLoadingPlannedLots(true);
    fetchOpenPlannedLandLotsByParentAsset(oldAssetId)
      .then(data => { if (!cancelled) setPlannedLots(data); })
      .catch(() => { if (!cancelled) setPlannedLots([]); })
      .finally(() => { if (!cancelled) setLoadingPlannedLots(false); });
    return () => { cancelled = true; };
  }, [requestType, oldAssetId]);

  const handleSelectPlannedLot = (lotId: string) => {
    setSelectedPlannedLotId(lotId);
    const lot = plannedLots.find(l => l.id === lotId);
    if (!lot) return;
    setLegalLotCode(lot.legal_lot_code || '');
    setLandLotNo(lot.land_lot_no || '');
    setMapSheetNo(lot.map_sheet_no || '');
    setBusinessProjectName(lot.business_project_name || '');
    setBusinessPlotCode(lot.business_plot_code || '');
    if (lot.planned_area) setArea(String(lot.planned_area));
  };

  const filteredAssets = allAssets.filter(a => {
    if (!searchOldAsset) return false;
    const s = searchOldAsset.toLowerCase();
    return (a.certificate_no?.toLowerCase().includes(s) || a.asset_code?.toLowerCase().includes(s) || a.legal_lot_code?.toLowerCase().includes(s));
  }).slice(0, 20);

  const selectedParentAsset = allAssets.find(a => a.id === oldAssetId);
  const isParentInWarehouse = selectedParentAsset ? (
    selectedParentAsset.is_in_warehouse !== undefined
      ? Boolean(selectedParentAsset.is_in_warehouse)
      : (selectedParentAsset.custody_status === 'in_stock')
  ) : false;

  const handleChildAreaChange = (newAreaStr: string) => {
    setArea(newAreaStr);
    if (requestType === 'tach_so' && splitMode === 'SPLIT_PARTIAL' && selectedParentAsset?.area) {
      const childVal = Number(newAreaStr);
      if (!isNaN(childVal) && childVal > 0) {
        const rem = Math.max(0, Number((selectedParentAsset.area - childVal).toFixed(2)));
        setRemainingArea(rem.toString());
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateNo.trim()) {
      toast.error('Vui lòng nhập số GCN');
      return;
    }
    if ((requestType === 'tach_so' || requestType === 'cap_doi')) {
      if (!oldAssetId) {
        toast.error('Vui lòng chọn sổ gốc / GCN cũ');
        return;
      }
      // CHẶN CỨNG (Hard Block): Nếu Sổ gốc chọn có is_in_warehouse === true
      if (isParentInWarehouse) {
        toast.error(
          '⚠️ KHÔNG THỂ THỰC HIỆN: GCN gốc hiện vẫn đang LƯU KHO.\n' +
          'Nếu chọn nhầm sổ: Vui lòng chọn lại đúng Mã TSĐB.\n' +
          'Nếu đúng sổ: Vui lòng lập Phiếu Xuất Kho cho GCN gốc trước khi làm thủ tục nhập kho GCN mới!',
          { duration: 7000 }
        );
        return;
      }
    }

    if (requestType === 'tach_so' && splitMode === 'SPLIT_PARTIAL') {
      if (!remainingArea || Number(remainingArea) <= 0) {
        toast.error('Vui lòng nhập diện tích còn lại hợp lệ cho Sổ gốc khi tách 1 phần');
        return;
      }
    }

    setLoading(true);
    try {
      await createDeclarationRequest({
        request_type: requestType,
        relationship_type: requestType === 'cap_doi' ? 'RENEW' : (requestType === 'tach_so' ? splitMode : null),
        invalidation_type: requestType === 'cap_doi' ? 'FULL' : (requestType === 'tach_so' ? (splitMode === 'SPLIT_PARTIAL' ? 'PARTIAL' : 'FULL') : 'NONE'),
        parent_asset_id: (requestType === 'tach_so' || requestType === 'cap_doi') ? oldAssetId : null,
        old_asset_id: (requestType === 'tach_so' || requestType === 'cap_doi') ? oldAssetId : null,
        remaining_area: (requestType === 'tach_so' && splitMode === 'SPLIT_PARTIAL' && remainingArea) ? Number(remainingArea) : null,
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
        usage_term_date: usageTermDate || null,
        asset_type: assetType.trim() || null,
        collateral_type: collateralType || 'BDS',
        warehouse_id: warehouseId || null,
        requester_id: profile?.id,
        notes: notes.trim() || null,
        status: 'pending'
      });
      toast.success('Gửi yêu cầu khai báo GCN thành công!');
      onSuccess();
      if (!keepOpen) {
        onClose();
      } else {
        // Reset some fields but keep project, warehouse, owner
        setCertificateNo('');
        setRegistryNo('');
        setLegalLotCode('');
        setLandLotNo('');
        setMapSheetNo('');
        setBusinessProjectName('');
        setBusinessPlotCode('');
        setArea('');
        setRemainingArea('');
        setOldAssetId('');
        setSearchOldAsset('');
        setNotes('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi gửi yêu cầu');
    } finally {
      setLoading(false);
    }
  };

  const isInvestor = profile?.role === 'investor';
  const isDept = profile?.role === 'capital_dept' || profile?.role === 'project_dept' || profile?.role === 're_dept';

  const availableWarehouses = isDept
    ? warehouses.filter(w => profile?.assigned_warehouse_ids?.includes(w.id))
    : warehouses;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Đề xuất khai báo GCN mới</h2>
              <p className="text-xs text-gray-500">Tạo yêu cầu cấp mã định danh và nhập kho GCN</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:bg-gray-200 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form id="declare-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Loại yêu cầu <span className="text-red-500">*</span></label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium"
                  required
                >
                  <option value="cap_moi">Cấp mới (GCN lần đầu nhập kho)</option>
                  <option value="tach_so">Tách sổ (Tách từ Sổ gốc đang có)</option>
                  <option value="cap_doi">Cấp đổi (Đổi số GCN mới từ Sổ cũ)</option>
                </select>
              </div>

              {/* HÌNH THỨC TÁCH SỔ (NẾU CHỌN TÁCH SỔ) */}
              {requestType === 'tach_so' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Hình thức tách sổ <span className="text-red-500">*</span></label>
                  <select
                    value={splitMode}
                    onChange={(e) => setSplitMode(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium"
                  >
                    <option value="SPLIT_FULL">Tách toàn phần (Vô hiệu / Thu hồi toàn bộ Sổ gốc)</option>
                    <option value="SPLIT_PARTIAL">Tách 1 phần (Giảm diện tích Sổ gốc, Sổ gốc tiếp tục lưu hành)</option>
                  </select>
                </div>
              )}

              {/* CHỌN SỔ GỐC / GCN CŨ */}
              {(requestType === 'tach_so' || requestType === 'cap_doi') && (
                <div className="relative md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-blue-600" />
                      Chọn Sổ gốc / GCN cũ (parent_asset_id) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-gray-500">Bắt buộc Sổ gốc phải đã lập Phiếu Xuất Kho</span>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
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
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                      required={!oldAssetId}
                    />
                  </div>

                  {showDropdown && filteredAssets.length > 0 && (
                    <div className="absolute z-20 left-4 right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-gray-100">
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
                              if (requestType === 'tach_so' && splitMode === 'SPLIT_PARTIAL' && a.area && area) {
                                const rem = Math.max(0, Number((a.area - Number(area)).toFixed(2)));
                                setRemainingArea(rem.toString());
                              }
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-blue-50/50 transition-colors ${
                              inWh ? 'bg-red-50/20' : 'bg-green-50/20'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-bold text-gray-900 font-mono text-sm">
                                [{a.asset_code || 'Chưa cấp mã'}] - {a.certificate_no}
                              </span>
                              {inWh ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200 shrink-0">
                                  🔴 Đang lưu tại {whName}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200 shrink-0">
                                  🟢 Đã xuất kho
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-3">
                              <span>Diện tích gốc: <strong className="text-gray-800">{a.area ? `${a.area} m²` : 'Chưa có'}</strong></span>
                              <span>·</span>
                              <span>Dự án: {a.projects?.name || 'Chưa gán DA'}</span>
                              {a.legal_lot_code && (
                                <>
                                  <span>·</span>
                                  <span>Mã lô: {a.legal_lot_code}</span>
                                </>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* THÔNG TIN SỔ GỐC ĐÃ CHỌN & CẢNH BÁO CHẶN CỨNG */}
                  {selectedParentAsset && (
                    <div className="mt-3">
                      <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
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
                            🟢 Đã xuất kho (Hợp lệ để khai báo)
                          </span>
                        )}
                      </div>

                      {/* CHẶN CỨNG BẢO MẬT & NGHIỆP VỤ */}
                      {isParentInWarehouse && (
                        <div className="mt-2.5 p-3.5 bg-red-50 border-2 border-red-500 rounded-lg text-red-900 text-xs leading-relaxed space-y-1 shadow-sm animate-in fade-in">
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
            {requestType === 'tach_so' && splitMode === 'SPLIT_PARTIAL' && (
              <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Tính Toán Diện Tích Tách Sổ Một Phần
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-amber-200">
                    <span className="text-gray-500 block">Diện tích Sổ gốc (m²)</span>
                    <span className="text-base font-bold text-gray-900">
                      {selectedParentAsset?.area ? `${selectedParentAsset.area} m²` : 'Chưa có thông tin'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Diện tích Sổ con mới tách (m²) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="VD: 150.5"
                      value={area}
                      onChange={(e) => handleChildAreaChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Diện tích còn lại của Sổ gốc (m²) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Tự động tính hoặc nhập tay..."
                      value={remainingArea}
                      onChange={(e) => setRemainingArea(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-semibold text-amber-900"
                      required
                    />
                  </div>
                </div>
                {selectedParentAsset?.area && area && remainingArea && (
                  <p className="text-[11px] text-amber-800 italic">
                    Công thức: {selectedParentAsset.area} m² (Gốc) - {area} m² (Mới) = {remainingArea} m² (Còn lại của Sổ gốc sau duyệt)
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số GCN <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={certificateNo}
                  onChange={(e) => setCertificateNo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Dự án</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Chọn dự án --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kho lưu trữ <span className="text-red-500">*</span></label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">-- Chọn kho --</option>
                  {availableWarehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Loại TSĐB</label>
                <select
                  value={collateralType}
                  onChange={(e) => setCollateralType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="BDS">Bất động sản</option>
                  <option value="TSCD">Tài sản cố định hữu hình</option>
                  <option value="VONGOP">Phần vốn góp</option>
                  <option value="COPHAN">Cổ phần</option>
                  <option value="CHUNGKHOAN">Chứng khoán</option>
                  <option value="TS_KHAC">Khác</option>
                </select>
              </div>

              <div className="relative">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Pháp nhân / Chủ sở hữu</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchEntityText}
                    onChange={(e) => {
                      setSearchEntityText(e.target.value);
                      setShowEntityDropdown(true);
                      if (e.target.value === '') {
                        setCurrentOwnerEntityId('');
                      }
                    }}
                    onFocus={() => setShowEntityDropdown(true)}
                    onBlur={() => setTimeout(() => setShowEntityDropdown(false), 200)}
                    disabled={isInvestor}
                    placeholder={isInvestor ? 'Đã khoá theo ID NĐT' : 'Nhập tên hoặc mã pháp nhân...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {/* Fake clear button */}
                  {!isInvestor && searchEntityText && (
                     <button type="button" onClick={() => { setSearchEntityText(''); setCurrentOwnerEntityId(''); setShowEntityDropdown(true); }} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                     </button>
                  )}
                </div>
                {!isInvestor && showEntityDropdown && (
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
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                      >
                        <div className="font-semibold text-gray-800">{entity.name}</div>
                        {entity.company_code && <div className="text-xs text-gray-500">Mã: {entity.company_code}</div>}
                      </button>
                    )) : (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">Không tìm thấy pháp nhân</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {requestType === 'tach_so' && oldAssetId && (
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
                <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <LandPlot className="w-3.5 h-3.5" /> Lô quy hoạch (nếu có)
                </label>
                {loadingPlannedLots ? (
                  <p className="text-xs text-amber-700">Đang tải danh sách lô quy hoạch của sổ gốc...</p>
                ) : plannedLots.length === 0 ? (
                  <p className="text-xs text-amber-700">Sổ gốc này chưa có lô quy hoạch nào được khai báo trước. Nhập tay các trường bên dưới.</p>
                ) : (
                  <>
                    <select
                      value={selectedPlannedLotId}
                      onChange={e => handleSelectPlannedLot(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">-- Chọn lô để tự điền Mã lô/Số thửa/Diện tích --</option>
                      {plannedLots.map(lot => (
                        <option key={lot.id} value={lot.id}>
                          {lot.legal_lot_code} — {lot.planned_area} m²{lot.business_plot_code ? ` — KD: ${lot.business_plot_code}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-amber-700 mt-1">Chọn lô sẽ tự điền các trường bên dưới; bạn vẫn có thể sửa lại sau khi điền.</p>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số tờ bản đồ</label>
                <input type="text" value={mapSheetNo} onChange={e => setMapSheetNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Thửa đất số</label>
                <input type="text" value={landLotNo} onChange={e => setLandLotNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Lô Pháp Lý</label>
                <input type="text" value={legalLotCode} onChange={e => setLegalLotCode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Phân khu A-Lô 12..." />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Diện tích (m²)</label>
                <input type="number" step="0.01" value={area} onChange={e => setArea(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nhóm Sổ</label>
                <select value={certificateGroup} onChange={e => setCertificateGroup(e.target.value as 'so_lon' | 'so_nho')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="so_nho">Sổ nhỏ</option>
                  <option value="so_lon">Sổ lớn</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Dự Án Kinh Doanh</label>
                <input type="text" value={businessProjectName} onChange={e => setBusinessProjectName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Lô Kinh Doanh</label>
                <input type="text" value={businessPlotCode} onChange={e => setBusinessPlotCode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Ghi chú thêm</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={2}
                placeholder="Ví dụ: Tách sổ từ GCN gốc do chia lô..."
              />
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between rounded-b-xl">
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="keepOpen" 
              checked={keepOpen} 
              onChange={e => setKeepOpen(e.target.checked)} 
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
            />
            <label htmlFor="keepOpen" className="text-sm text-gray-600 cursor-pointer">Tiếp tục tạo thêm GCN khác</label>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Hủy
            </button>
            <button
              type="submit"
              form="declare-form"
              disabled={loading}
              className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};