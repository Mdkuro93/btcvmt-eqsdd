import React, { useState, useEffect } from 'react';
import { X, Search, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchProjects, fetchWarehouses, fetchAssetIdentifierCandidates } from '../api/assets';
import { createDeclarationRequest } from '../api/assetDeclarationRequests';
import { fetchInvestorEntities } from '../api/investorEntities';
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
  const [oldAssetId, setOldAssetId] = useState('');
  
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
  const [subdivision, setSubdivision] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [landLotNo, setLandLotNo] = useState('');
  const [mapSheetNo, setMapSheetNo] = useState('');
  const [area, setArea] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [currentOwnerEntityId, setCurrentOwnerEntityId] = useState('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [ward, setWard] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [usagePurpose, setUsagePurpose] = useState('');
  const [usageTermType, setUsageTermType] = useState('');
  const [usageTermDate, setUsageTermDate] = useState('');
  const [assetType, setAssetType] = useState('Đất nền');
  const [collateralType, setCollateralType] = useState('BDS');
  const [businessProjectName, setBusinessProjectName] = useState('');
  const [businessPlotCode, setBusinessPlotCode] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');

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

  const filteredAssets = allAssets.filter(a => {
    if (!searchOldAsset) return false;
    const s = searchOldAsset.toLowerCase();
    return (a.certificate_no?.toLowerCase().includes(s) || a.asset_code?.toLowerCase().includes(s));
  }).slice(0, 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateNo.trim()) {
      toast.error('Vui lòng nhập số GCN');
      return;
    }
    if ((requestType === 'tach_so' || requestType === 'cap_doi') && !oldAssetId) {
      toast.error('Vui lòng chọn sổ cũ');
      return;
    }

    setLoading(true);
    try {
      await createDeclarationRequest({
        request_type: requestType,
        certificate_no: certificateNo.trim(),
        registry_no: registryNo.trim() || null,
        registry_date: registryDate || null,
        project_id: projectId || null,
        subdivision: subdivision.trim() || null,
        lot_no: lotNo.trim() || null,
        land_lot_no: landLotNo.trim() || null,
        map_sheet_no: mapSheetNo.trim() || null,
        area: area ? Number(area) : null,
        owner_name: ownerName.trim() || null,
        current_owner_entity_id: currentOwnerEntityId || null,
        province: province.trim() || null,
        district: district.trim() || null,
        ward: ward.trim() || null,
        address_detail: addressDetail.trim() || null,
        usage_purpose: usagePurpose.trim() || null,
        usage_term_type: usageTermType.trim() || null,
        usage_term_date: usageTermDate || null,
        asset_type: assetType.trim() || null,
        collateral_type: collateralType || 'BDS',
        business_project_name: businessProjectName.trim() || null,
        business_plot_code: businessPlotCode.trim() || null,
        old_asset_id: (requestType === 'tach_so' || requestType === 'cap_doi') ? oldAssetId : null,
        warehouse_id: warehouseId || null,
        requester_id: profile?.id,
        notes: notes.trim() || null,
        status: 'pending'
      });
      toast.success('Gửi yêu cầu khai báo GCN thành công!');
      onSuccess();
      onClose();
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
                  onChange={(e) => setRequestType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  required
                >
                  <option value="cap_moi">Cấp mới</option>
                  <option value="tach_so">Tách sổ</option>
                  <option value="cap_doi">Cấp đổi</option>
                </select>
              </div>

              {(requestType === 'tach_so' || requestType === 'cap_doi') && (
                <div className="relative">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Chọn sổ cũ <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm theo số GCN hoặc mã tài sản..."
                      value={searchOldAsset}
                      onChange={(e) => {
                        setSearchOldAsset(e.target.value);
                        setShowDropdown(true);
                        setOldAssetId('');
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                      required={!oldAssetId}
                    />
                  </div>
                  {showDropdown && filteredAssets.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                      {filteredAssets.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setOldAssetId(a.id);
                            setSearchOldAsset(`${a.certificate_no} (${a.asset_code})`);
                            setShowDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                        >
                          <div className="font-semibold">{a.certificate_no}</div>
                          <div className="text-xs text-gray-500">{a.asset_code}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phân khu</label>
                <input type="text" value={subdivision} onChange={e => setSubdivision(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số lô / Thửa</label>
                <input type="text" value={lotNo} onChange={e => setLotNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Diện tích (m²)</label>
                <input type="number" step="0.01" value={area} onChange={e => setArea(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tỉnh / Thành phố</label>
                <input type="text" value={province} onChange={e => setProvince(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ví dụ: Đà Nẵng, QNM" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Quận / Huyện</label>
                <input type="text" value={district} onChange={e => setDistrict(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Xã / Phường</label>
                <input type="text" value={ward} onChange={e => setWard(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
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

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
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
  );
};
