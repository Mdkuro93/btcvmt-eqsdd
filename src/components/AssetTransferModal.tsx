import React, { useState, useEffect, useMemo } from 'react';
import { Asset, InvestorEntity, Profile } from '../types';
import { fetchInvestorEntities, transferAssetOwnership, batchTransferAssetOwnership } from '../api/investorEntities';
import { X, ArrowLeftRight, Building2, Search, AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  assets: Asset[]; // 1 asset if single, >1 if bulk
  currentUser: Profile | null;
}

export const AssetTransferModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  assets,
  currentUser,
}) => {
  const [entities, setEntities] = useState<InvestorEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [newRole, setNewRole] = useState<'cdt' | 'ndt'>('cdt');
  const [note, setNote] = useState<string>('');
  const [showAssetList, setShowAssetList] = useState<boolean>(false);

  const isBulk = assets.length > 1;
  const singleAsset = assets.length === 1 ? assets[0] : null;

  useEffect(() => {
    if (isOpen) {
      loadEntities();
      setSelectedEntityId('');
      setSearchTerm('');
      setNewRole('cdt');
      setNote('');
      setShowAssetList(false);
    }
  }, [isOpen, assets]);

  const loadEntities = async () => {
    setLoadingEntities(true);
    try {
      const data = await fetchInvestorEntities();
      setEntities(data || []);
    } catch (err) {
      console.error('Lỗi tải danh mục pháp nhân:', err);
      toast.error('Không thể tải danh mục pháp nhân CĐT/NĐT');
    } finally {
      setLoadingEntities(false);
    }
  };

  // Filter entities by search term
  const filteredEntities = useMemo(() => {
    if (!searchTerm.trim()) return entities;
    const term = searchTerm.toLowerCase();
    return entities.filter(e =>
      e.name.toLowerCase().includes(term) ||
      (e.company_code && e.company_code.toLowerCase().includes(term))
    );
  }, [entities, searchTerm]);

  // Selected entity detail
  const selectedEntity = useMemo(() => {
    return entities.find(e => e.id === selectedEntityId);
  }, [entities, selectedEntityId]);

  // Current entity of single asset (if any)
  const currentEntity = useMemo(() => {
    if (!singleAsset || !singleAsset.current_owner_entity_id) return null;
    return entities.find(e => e.id === singleAsset.current_owner_entity_id) || singleAsset.current_owner_entity || null;
  }, [singleAsset, entities]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedEntityId) {
      toast.error('Vui lòng chọn pháp nhân tiếp nhận từ danh mục');
      return;
    }

    if (!newRole) {
      toast.error('Vui lòng chọn vai trò chủ sở hữu mới (CĐT hoặc NĐT)');
      return;
    }

    if (assets.length === 0) {
      toast.error('Không có tài sản nào được chọn');
      return;
    }

    // Confirmation check if single asset is transferred to identical entity & role
    if (singleAsset && singleAsset.current_owner_entity_id === selectedEntityId && singleAsset.current_owner_role === newRole) {
      toast.error('Pháp nhân và vai trò mới trùng khớp với hiện tại. Vui lòng chọn thay đổi.');
      return;
    }

    setSubmitting(true);
    try {
      if (isBulk) {
        const assetIds = assets.map(a => a.id);
        const res = await batchTransferAssetOwnership({
          asset_ids: assetIds,
          to_entity_id: selectedEntityId,
          to_role: newRole,
          note: note.trim() || null,
          transferred_by: currentUser?.id || null,
        });

        toast.success(`Chuyển nhượng thành công ${res.count} / ${assets.length} GCN sang pháp nhân ${selectedEntity?.name}`);
      } else {
        await transferAssetOwnership({
          asset_id: singleAsset!.id,
          to_entity_id: selectedEntityId,
          to_role: newRole,
          note: note.trim() || null,
          transferred_by: currentUser?.id || null,
        });

        toast.success(`Chuyển nhượng GCN ${singleAsset?.certificate_no} thành công sang pháp nhân ${selectedEntity?.name}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi thực hiện chuyển nhượng:', err);
      toast.error('Thao tác chuyển nhượng thất bại: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 text-white border-b border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <ArrowLeftRight className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {isBulk ? `Chuyển Nhượng Hàng Loạt (${assets.length} GCN)` : 'Chuyển Nhượng Quyền Sở Hữu GCN'}
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                Cập nhật pháp nhân CĐT/NĐT và lưu vết lịch sử chuyển giao
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs text-gray-800 flex-1">
          {/* Target Asset Information */}
          {singleAsset ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Tài sản / GCN đang thao tác:</span>
                <span className="font-mono font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded text-[11px]">
                  {singleAsset.asset_code || `GCN #${singleAsset.certificate_no}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 block text-[11px]">Số GCN:</span>
                  <span className="font-semibold text-gray-900">{singleAsset.certificate_no}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Dự án & Phân khu:</span>
                  <span className="font-semibold text-gray-900">
                    {singleAsset.projects?.name || '-'} {singleAsset.subdivision ? `(${singleAsset.subdivision})` : ''}
                  </span>
                </div>
              </div>

              {/* Current Owner Card */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                <div>
                  <span className="text-gray-500 block text-[11px]">Pháp nhân sở hữu hiện tại:</span>
                  <div className="font-bold text-indigo-950 mt-0.5">
                    {currentEntity ? (
                      <span>
                        {currentEntity.name} {currentEntity.company_code ? `(${currentEntity.company_code})` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">Chưa liên kết pháp nhân CĐT/NĐT</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px] text-right">Vai trò hiện tại:</span>
                  <div className="text-right mt-0.5">
                    {singleAsset.current_owner_role === 'cdt' ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        Chủ đầu tư (CĐT)
                      </span>
                    ) : singleAsset.current_owner_role === 'ndt' ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        Nhà đầu tư (NĐT)
                      </span>
                    ) : (
                      <span className="text-gray-400 text-[11px]">Chưa gán</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-900">
                    Chuyển nhượng đồng loạt cho {assets.length} GCN
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAssetList(!showAssetList)}
                  className="text-blue-700 hover:text-blue-900 underline text-[11px] font-medium cursor-pointer"
                >
                  {showAssetList ? 'Thu gọn danh sách' : 'Xem danh sách GCN'}
                </button>
              </div>

              {showAssetList && (
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white space-y-1">
                  {assets.map((a, idx) => (
                    <div key={a.id} className="flex items-center justify-between text-[11px] py-1 px-1.5 border-b border-gray-100 last:border-0">
                      <span className="font-mono font-medium text-gray-700">{idx + 1}. {a.certificate_no}</span>
                      <span className="text-gray-500">{a.subdivision || '-'} - {a.lot_no || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transfer Destination: Select Investor Entity (NO FREE TEXT) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-800">
              1. Chọn Pháp Nhân Nhận Chuyển Nhượng <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-gray-500">
              Chọn từ danh mục pháp nhân CĐT/NĐT có sẵn trên hệ thống (không nhập tên tự do).
            </p>

            {/* Search filter for entity dropdown */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Gõ để lọc tìm pháp nhân theo tên hoặc mã công ty..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            {/* Select Dropdown */}
            {loadingEntities ? (
              <div className="flex items-center gap-2 py-3 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Đang tải danh mục pháp nhân CĐT/NĐT...</span>
              </div>
            ) : (
              <select
                value={selectedEntityId}
                onChange={e => setSelectedEntityId(e.target.value)}
                required
                className="w-full px-3 py-2.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium shadow-xs"
              >
                <option value="">-- Vui lòng chọn pháp nhân tiếp nhận --</option>
                {filteredEntities.map(ent => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name} {ent.company_code ? `(${ent.company_code})` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Preview of selected entity */}
            {selectedEntity && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-start gap-2.5 text-xs text-blue-900">
                <Building2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-blue-950">{selectedEntity.name}</div>
                  <div className="text-[11px] text-blue-800 mt-0.5">
                    Mã pháp nhân: <strong className="font-mono">{selectedEntity.company_code || 'Chưa thiết lập'}</strong>
                    {selectedEntity.note && ` • Ghi chú: ${selectedEntity.note}`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* New Owner Role */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-800">
              2. Vai Trò Chủ Sở Hữu Mới <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newRole === 'cdt'
                    ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-600'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="new_role"
                  value="cdt"
                  checked={newRole === 'cdt'}
                  onChange={() => setNewRole('cdt')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-gray-900 block">Chủ đầu tư (CĐT)</span>
                  <span className="text-[11px] text-gray-500">Pháp nhân phát triển dự án hoặc chủ sở hữu gốc</span>
                </div>
              </label>

              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  newRole === 'ndt'
                    ? 'border-purple-600 bg-purple-50/70 shadow-xs ring-1 ring-purple-600'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="new_role"
                  value="ndt"
                  checked={newRole === 'ndt'}
                  onChange={() => setNewRole('ndt')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-bold text-gray-900 block">Nhà đầu tư (NĐT)</span>
                  <span className="text-[11px] text-gray-500">Nhà đầu tư thứ cấp hoặc đối tác hợp tác đầu tư</span>
                </div>
              </label>
            </div>
          </div>

          {/* Note / Transfer Reason */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-800">
              3. Ghi Chú / Lý Do Chuyển Nhượng
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Nhập số hợp đồng chuyển nhượng, biên bản bàn giao hoặc lý do chuyển nhượng..."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* User info disclaimer */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              Thao tác này sẽ ghi nhận lịch sử vào sổ kiểm toán chuyển nhượng sở hữu (Audit Trail) với người thực hiện:{' '}
              <strong>{currentUser?.full_name || currentUser?.email || 'Người dùng hiện tại'}</strong> vào thời điểm hiện tại.
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedEntityId}
              className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Xác Nhận Chuyển Nhượng
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
