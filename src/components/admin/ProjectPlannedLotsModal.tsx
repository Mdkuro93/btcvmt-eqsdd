import React, { useEffect, useMemo, useState } from 'react';
import {
  X, LandPlot, FileText, Plus, Trash2, Edit2, UploadCloud, Loader2,
  CheckCircle2, Clock, Save, XCircle, Download, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Asset, PlannedLandLot, Project } from '../../types';
import { fetchAssets } from '../../api/assets';
import {
  fetchPlannedLandLotsByProject,
  createPlannedLandLot,
  updatePlannedLandLot,
  deletePlannedLandLot,
  assignPlannedLotsToMasterAsset,
  CreatePlannedLandLotInput,
} from '../../api/plannedLandLots';
import { exportPlannedLandLotsExcel } from '../../utils/exportPlannedLandLotsExcel';
import { ConfirmModal } from '../ConfirmModal';
import { ImportPlannedLotsModal } from './ImportPlannedLotsModal';

interface Props {
  project: Project;
  onClose: () => void;
}

const emptyForm: Omit<CreatePlannedLandLotInput, 'parent_master_asset_id'> = {
  legal_lot_code: '',
  land_lot_no: '',
  map_sheet_no: '',
  planned_area: 0,
  business_project_name: '',
  business_plot_code: '',
  notes: '',
};

export const ProjectPlannedLotsModal: React.FC<Props> = ({ project, onClose }) => {
  const [tab, setTab] = useState<'existing' | 'planned'>('planned');

  const [existingAssets, setExistingAssets] = useState<Asset[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);

  const [lots, setLots] = useState<PlannedLandLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);

  const [parentAssetId, setParentAssetId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlannedLandLot | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Chọn nhiều lô độc lập để gán chung vào 1 sổ lớn mới cấp (Giai đoạn 1 -> 2)
  const [selectedLotIds, setSelectedLotIds] = useState<Set<string>>(new Set());
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignTargetId, setAssignTargetId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const loadExisting = async () => {
    setLoadingExisting(true);
    try {
      const res = await fetchAssets({ projectId: project.id }, 1, 200);
      setExistingAssets(res.data || []);
    } catch (err: any) {
      toast.error('Lỗi tải danh sách GCN: ' + (err.message || ''));
    } finally {
      setLoadingExisting(false);
    }
  };

  const loadLots = async () => {
    setLoadingLots(true);
    try {
      const data = await fetchPlannedLandLotsByProject(project.id);
      setLots(data);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải danh sách lô quy hoạch');
    } finally {
      setLoadingLots(false);
    }
  };

  useEffect(() => {
    loadExisting();
    loadLots();
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sổ lớn: ưu tiên các sổ được đánh dấu "Sổ lớn"; nếu chưa ai gắn nhãn, cho chọn trong toàn bộ GCN của dự án.
  const masterCandidates = useMemo(() => {
    const tagged = existingAssets.filter(a => a.certificate_group === 'so_lon');
    return tagged.length > 0 ? tagged : existingAssets;
  }, [existingAssets]);

  const UNASSIGNED_KEY = '__unassigned__';
  const lotsByParent = useMemo(() => {
    const map = new Map<string, PlannedLandLot[]>();
    for (const lot of lots) {
      const key = lot.parent_master_asset_id || UNASSIGNED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lot);
    }
    return map;
  }, [lots]);
  const unassignedLots = lotsByParent.get(UNASSIGNED_KEY) || [];

  // Lô đang chọn Sổ lớn gốc (chưa tách): Số thửa/Số tờ bản đồ hiển thị TẠM theo sổ lớn,
  // không cho gõ tay — chỉ có số thửa/tờ thật của riêng lô sau khi lô được tách sổ.
  const selectedMaster = parentAssetId ? masterCandidates.find(a => a.id === parentAssetId) || null : null;

  const openCreateFor = (assetId?: string) => {
    setParentAssetId(assetId || '');
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (lot: PlannedLandLot) => {
    setParentAssetId(lot.parent_master_asset_id || '');
    setForm({
      legal_lot_code: lot.legal_lot_code,
      land_lot_no: lot.land_lot_no || '',
      map_sheet_no: lot.map_sheet_no || '',
      planned_area: lot.planned_area,
      business_project_name: lot.business_project_name || '',
      business_plot_code: lot.business_plot_code || '',
      notes: lot.notes || '',
    });
    setEditingId(lot.id);
    setShowForm(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    // Sổ lớn gốc KHÔNG bắt buộc: dự án chưa có GCN nào vẫn khai báo được lô quy hoạch,
    // lô đó sẽ gắn thẳng vào dự án (project_id) và chờ cấp thẳng hoặc gán vào sổ lớn sau.
    if (!form.legal_lot_code.trim()) {
      toast.error('Vui lòng nhập Mã Lô Pháp Lý.');
      return;
    }
    if (!form.planned_area || form.planned_area <= 0) {
      toast.error('Diện tích dự kiến phải lớn hơn 0.');
      return;
    }
    setSaving(true);
    try {
      // Có sổ lớn & chưa tách -> gửi land_lot_no/map_sheet_no = null (không lưu số của sổ lớn
      // thành số riêng của lô); lô độc lập -> giữ đúng số người dùng nhập (nếu có).
      const submitForm = selectedMaster
        ? { ...form, land_lot_no: null, map_sheet_no: null }
        : form;
      if (editingId) {
        await updatePlannedLandLot(editingId, { ...submitForm, parent_master_asset_id: parentAssetId || null });
        toast.success('Đã cập nhật lô quy hoạch.');
      } else if (parentAssetId) {
        await createPlannedLandLot({ ...submitForm, parent_master_asset_id: parentAssetId });
        toast.success('Đã thêm lô quy hoạch.');
      } else {
        await createPlannedLandLot({ ...submitForm, parent_master_asset_id: null, project_id: project.id });
        toast.success('Đã thêm lô quy hoạch (chưa gắn sổ lớn).');
      }
      setShowForm(false);
      setEditingId(null);
      await loadLots();
    } catch (err: any) {
      toast.error(err.message || 'Thao tác không thành công.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLotSelected = (lotId: string) => {
    setSelectedLotIds(prev => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId); else next.add(lotId);
      return next;
    });
  };

  const handleAssignToMaster = async () => {
    if (!assignTargetId || selectedLotIds.size === 0) return;
    setAssigning(true);
    try {
      const count = await assignPlannedLotsToMasterAsset(assignTargetId, Array.from(selectedLotIds));
      toast.success(`Đã gán ${count} lô vào sổ lớn.`);
      setSelectedLotIds(new Set());
      setShowAssignPicker(false);
      setAssignTargetId('');
      await loadLots();
    } catch (err: any) {
      toast.error(err.message || 'Gán lô vào sổ lớn thất bại.');
    } finally {
      setAssigning(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePlannedLandLot(deleteTarget.id);
      toast.success('Đã xóa lô quy hoạch.');
      setDeleteTarget(null);
      await loadLots();
    } catch (err: any) {
      toast.error(err.message || 'Không xóa được.');
    } finally {
      setDeleting(false);
    }
  };

  const openLotsCount = lots.filter(l => l.status === 'chưa cấp GCN').length;
  const importParentAsset = existingAssets.find(a => a.id === parentAssetId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full border border-gray-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <LandPlot className="w-4.5 h-4.5 text-[#1E3A8A]" /> {project.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Quản lý GCN và lô quy hoạch pháp lý của dự án</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (lots.length === 0) { toast.error('Dự án chưa có lô quy hoạch nào để xuất.'); return; }
                exportPlannedLandLotsExcel(project.name, lots);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#1E3A8A] hover:bg-blue-50 px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
            <button onClick={onClose} className="text-gray-400 hover:bg-gray-100 p-2 rounded-full cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          <button
            onClick={() => setTab('existing')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              tab === 'existing' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" /> Danh sách GCN đã có ({existingAssets.length})
          </button>
          <button
            onClick={() => setTab('planned')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              tab === 'planned' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <LandPlot className="w-4 h-4" /> Lô quy hoạch chưa cấp sổ ({openLotsCount})
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'existing' && (
            loadingExisting ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
              </div>
            ) : existingAssets.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-8">Dự án chưa có GCN nào.</div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                {existingAssets.map(a => (
                  <div key={a.id} className="p-3 flex items-center justify-between text-sm hover:bg-gray-50">
                    <div>
                      <span className="font-mono font-semibold text-gray-900">{a.certificate_no}</span>
                      {a.asset_code && <span className="text-xs text-gray-400 ml-2">{a.asset_code}</span>}
                      {a.certificate_group === 'so_lon' && (
                        <span className="ml-2 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded">SỔ LỚN</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{a.area ? `${a.area} m²` : ''}</div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'planned' && (
            loadingLots || loadingExisting ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
              </div>
            ) : (
              <div className="space-y-5">
                {/* Thanh thao tác gộp chung: chọn nơi thêm (độc lập hoặc 1 sổ lớn) rồi Thêm lô / Import Excel.
                    Gộp lại thay vì mỗi nhóm 1 bộ nút riêng, cho gọn khi dự án có nhiều sổ lớn. */}
                <div className="flex items-center justify-between flex-wrap gap-3 p-3 bg-slate-50 border border-gray-200 rounded-xl">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 font-semibold shrink-0">Thêm vào:</span>
                    <select
                      value={parentAssetId}
                      onChange={e => setParentAssetId(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white max-w-[260px]"
                    >
                      <option value="">-- Lô độc lập (chưa có sổ lớn) --</option>
                      {masterCandidates.map(a => (
                        <option key={a.id} value={a.id}>Sổ lớn: {a.certificate_no}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#1E3A8A] hover:bg-blue-50 px-2.5 py-1.5 rounded-lg cursor-pointer"
                    >
                      <UploadCloud className="w-3.5 h-3.5" /> Import Excel
                    </button>
                    <button
                      onClick={() => openCreateFor(parentAssetId || undefined)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-800 px-2.5 py-1.5 rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm lô
                    </button>
                  </div>
                </div>

                {/* Nhóm lô ĐỘC LẬP — chưa gắn vào sổ lớn nào, kể cả khi dự án CHƯA có bất kỳ GCN nào.
                    Luôn hiển thị (không chờ có Sổ lớn), vì đây chính là trường hợp chính của tính năng:
                    khai báo trước lô theo quy hoạch, chờ cấp thẳng hoặc gán chung vào 1 sổ lớn mới sau này. */}
                <div className="border border-dashed border-gray-300 rounded-xl overflow-hidden">
                  <div className="p-3 bg-slate-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm">
                      <span className="text-gray-500">Lô độc lập theo dự án</span>{' '}
                      <span className="text-xs text-gray-400">(chưa gắn vào sổ lớn nào)</span>
                    </div>
                    {selectedLotIds.size > 0 && masterCandidates.length > 0 && (
                      <button
                        onClick={() => setShowAssignPicker(true)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Gán {selectedLotIds.size} lô vào sổ lớn...
                      </button>
                    )}
                  </div>
                  {unassignedLots.length === 0 ? (
                    <div className="p-4 text-xs text-gray-400 text-center">
                      Chưa có lô độc lập nào. Bấm "Thêm lô" ở trên để khai báo lô theo quy hoạch — kể cả khi dự án chưa có GCN nào.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {unassignedLots.map(lot => (
                        <div key={lot.id} className="p-3 flex items-center justify-between gap-3 text-sm hover:bg-gray-50">
                          <div className="flex items-center gap-3 min-w-0">
                            {lot.status === 'chưa cấp GCN' && (
                              <input
                                type="checkbox"
                                checked={selectedLotIds.has(lot.id)}
                                onChange={() => toggleLotSelected(lot.id)}
                                title="Chọn để gán chung vào 1 sổ lớn"
                                className="w-4 h-4 rounded border-gray-300 shrink-0 cursor-pointer"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-semibold text-gray-900">{lot.legal_lot_code}</span>
                                {lot.status === 'đã cấp GCN' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                    <CheckCircle2 className="w-3 h-3" /> Đã cấp GCN
                                    {lot.resulting_asset?.certificate_no ? `: ${lot.resulting_asset.certificate_no}` : ''}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                    <Clock className="w-3 h-3" /> Chưa cấp GCN
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                                <span>{lot.planned_area} m²</span>
                                {lot.land_lot_no && <span>Thửa {lot.land_lot_no}</span>}
                                {lot.map_sheet_no && <span>Tờ BĐ {lot.map_sheet_no}</span>}
                                {lot.business_plot_code && <span>KD: {lot.business_plot_code}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEdit(lot)}
                              className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md cursor-pointer"
                              title="Sửa"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {lot.status === 'chưa cấp GCN' && (
                              <button
                                onClick={() => setDeleteTarget(lot)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                                title="Xóa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {masterCandidates.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-2">
                    Dự án chưa có GCN nào được đánh dấu "Sổ lớn" — khi khai báo GCN và gắn nhãn Sổ lớn, bạn sẽ gán được lô vào đó tại đây.
                  </div>
                ) : masterCandidates.map(master => {
                  const rows = lotsByParent.get(master.id) || [];
                  return (
                    <div key={master.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="p-3 bg-slate-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                        <div className="text-sm">
                          <span className="text-gray-500">Sổ lớn gốc:</span>{' '}
                          <span className="font-mono font-semibold text-gray-900">{master.certificate_no}</span>
                          {master.area ? <span className="text-xs text-gray-500 ml-2">({master.area} m²)</span> : null}
                        </div>
                        <span className="text-xs text-gray-400">{rows.length} lô</span>
                      </div>

                      {rows.length === 0 ? (
                        <div className="p-4 text-xs text-gray-400 text-center">Chưa có lô quy hoạch nào cho sổ lớn này.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {rows.map(lot => (
                            <div key={lot.id} className="p-3 flex items-center justify-between gap-3 text-sm hover:bg-gray-50">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-semibold text-gray-900">{lot.legal_lot_code}</span>
                                  {lot.status === 'đã cấp GCN' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                      <CheckCircle2 className="w-3 h-3" /> Đã cấp GCN
                                      {lot.resulting_asset?.certificate_no ? `: ${lot.resulting_asset.certificate_no}` : ''}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                      <Clock className="w-3 h-3" /> Chưa cấp GCN
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                                  <span>{lot.planned_area} m²</span>
                                  {lot.land_lot_no ? (
                                    <span>Thửa {lot.land_lot_no}</span>
                                  ) : lot.status !== 'đã cấp GCN' && master.land_lot_no ? (
                                    <span className="italic text-gray-400">Thửa {master.land_lot_no} (theo sổ lớn)</span>
                                  ) : null}
                                  {lot.map_sheet_no ? (
                                    <span>Tờ BĐ {lot.map_sheet_no}</span>
                                  ) : lot.status !== 'đã cấp GCN' && master.map_sheet_no ? (
                                    <span className="italic text-gray-400">Tờ BĐ {master.map_sheet_no} (theo sổ lớn)</span>
                                  ) : null}
                                  {lot.business_plot_code && <span>KD: {lot.business_plot_code}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => openEdit(lot)}
                                  className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md cursor-pointer"
                                  title="Sửa"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {lot.status === 'chưa cấp GCN' && (
                                  <button
                                    onClick={() => setDeleteTarget(lot)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                                    title="Xóa"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* Form thêm/sửa 1 lô */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-gray-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {editingId ? 'Sửa lô quy hoạch' : 'Thêm lô quy hoạch'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:bg-gray-100 p-2 rounded-full cursor-pointer">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4">
              {!editingId && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Sổ lớn gốc (nếu có)</label>
                  <select
                    value={parentAssetId}
                    onChange={e => setParentAssetId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- Không có, lô độc lập theo dự án --</option>
                    {masterCandidates.map(a => (
                      <option key={a.id} value={a.id}>{a.certificate_no}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Lô Pháp Lý *</label>
                  <input
                    type="text" required value={form.legal_lot_code}
                    onChange={e => setForm({ ...form, legal_lot_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Diện tích dự kiến (m²) *</label>
                  <input
                    type="number" step="0.01" required value={form.planned_area || ''}
                    onChange={e => setForm({ ...form, planned_area: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Số thửa</label>
                      <input
                        type="text"
                        value={selectedMaster ? (selectedMaster.land_lot_no || '') : (form.land_lot_no || '')}
                        onChange={e => setForm({ ...form, land_lot_no: e.target.value })}
                        disabled={!!selectedMaster}
                        placeholder={selectedMaster ? '' : 'Chưa có (giai đoạn pháp lý)'}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm ${selectedMaster ? 'bg-gray-100 text-gray-500' : ''}`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Số tờ bản đồ</label>
                      <input
                        type="text"
                        value={selectedMaster ? (selectedMaster.map_sheet_no || '') : (form.map_sheet_no || '')}
                        onChange={e => setForm({ ...form, map_sheet_no: e.target.value })}
                        disabled={!!selectedMaster}
                        placeholder={selectedMaster ? '' : 'Chưa có (giai đoạn pháp lý)'}
                        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm ${selectedMaster ? 'bg-gray-100 text-gray-500' : ''}`}
                      />
                    </div>
                  </div>
                  {selectedMaster && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Theo sổ lớn (chưa tách) — lô này sẽ có số thửa/tờ riêng sau khi được tách sổ.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Lô Kinh Doanh</label>
                  <input
                    type="text" value={form.business_plot_code || ''}
                    onChange={e => setForm({ ...form, business_plot_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Dự Án Kinh Doanh</label>
                  <input
                    type="text" value={form.business_project_name || ''}
                    onChange={e => setForm({ ...form, business_project_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  rows={2} value={form.notes || ''}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">
                  Hủy
                </button>
                <button
                  type="submit" disabled={saving}
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportPlannedLotsModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={loadLots}
          project={project}
          parentAsset={importParentAsset}
        />
      )}

      {/* Gán nhiều lô độc lập đã chọn vào 1 sổ lớn mới cấp (Giai đoạn 1 -> 2, ra sổ lớn chứa nhiều lô nhỏ) */}
      {showAssignPicker && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-gray-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#1E3A8A]" /> Gán {selectedLotIds.size} lô vào sổ lớn
              </h3>
              <button onClick={() => setShowAssignPicker(false)} className="text-gray-400 hover:bg-gray-100 p-2 rounded-full cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500">
                Dùng khi GCN của sổ lớn đã được cấp cho gộp nhiều lô đang khai báo độc lập bên dưới đây. Sau khi gán,
                các lô này chuyển sang trạng thái "nằm trong sổ lớn, chưa tách" — tự động chuyển tiếp khi sổ lớn thực
                sự được tách/cấp riêng cho từng lô.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Chọn sổ lớn</label>
                <select
                  value={assignTargetId}
                  onChange={e => setAssignTargetId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Chọn sổ lớn --</option>
                  {masterCandidates.map(a => (
                    <option key={a.id} value={a.id}>{a.certificate_no}{a.area ? ` (${a.area} m²)` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button onClick={() => setShowAssignPicker(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">
                Hủy
              </button>
              <button
                onClick={handleAssignToMaster}
                disabled={!assignTargetId || assigning}
                className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {assigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Xác nhận gán
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa lô quy hoạch"
        message={`Bạn có chắc chắn muốn xóa lô "${deleteTarget?.legal_lot_code}"?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  );
};