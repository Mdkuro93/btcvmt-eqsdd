import React, { useState, useEffect } from 'react';
import { Region, Area } from '../../types';
import { fetchRegions, createRegion, updateRegion, deleteRegion, fetchAreas } from '../../api/assets';
import { mockStore } from '../../lib/mockStore';
import { Building2, Plus, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../ConfirmModal';
import { LoadingFallback } from '../LoadingFallback';

export const AdminRegions: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newRegionName, setNewRegionName] = useState('');
  const [editingRegion, setEditingRegion] = useState<{ id: string; name: string } | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; warning?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([
        fetchRegions().catch(() => mockStore.getRegions()),
        fetchAreas().catch(() => mockStore.getAreas()),
      ]);
      setRegions(r || []);
      setAreas(a || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu vùng hoạt động');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegionName.trim()) {
      toast.error('Vui lòng nhập tên vùng');
      return;
    }
    try {
      await createRegion(newRegionName.trim());
      toast.success('Thêm vùng thành công');
      setNewRegionName('');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể thêm vùng'));
    }
  };

  const handleUpdateRegionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRegion || !editingRegion.name.trim()) return;
    try {
      await updateRegion(editingRegion.id, editingRegion.name.trim());
      toast.success('Cập nhật vùng thành công');
      setEditingRegion(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật vùng'));
    }
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteRegion(deleteTarget.id);
      toast.success(`Đã xóa "${deleteTarget.name}"`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <LoadingFallback
        message="Đang tải danh sách vùng hoạt động..."
        onRetry={loadData}
        onForceLocal={() => {
          setRegions(mockStore.getRegions());
          setAreas(mockStore.getAreas());
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Form thêm mới */}
      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
        <h3 className="text-xs font-bold uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Thêm Vùng hoạt động mới
        </h3>
        <form onSubmit={handleAddRegion} className="flex gap-3">
          <input
            type="text"
            value={newRegionName}
            onChange={(e) => setNewRegionName(e.target.value)}
            placeholder="Tên vùng mới (VD: Miền Tây, Tây Nguyên)..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
          />
          <button 
            type="submit" 
            className="px-4 py-2 bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Thêm vùng
          </button>
        </form>
      </div>

      {/* Danh sách Vùng */}
      <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        {regions.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">Chưa có vùng nào.</div>
        ) : (
          regions.map((r) => {
            const areaCount = areas.filter(a => a.region_id === r.id).length;
            return (
              <div key={r.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 text-sm">{r.name}</span>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Mã: <code className="font-mono text-gray-700">{r.id}</code> · {areaCount} địa bàn trực thuộc
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingRegion({ id: r.id, name: r.name })}
                    className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                    title="Sửa tên vùng"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDeleteTarget({ 
                      id: r.id, 
                      name: r.name,
                      warning: areaCount > 0 ? `Vùng này đang có ${areaCount} địa bàn trực thuộc!` : undefined
                    })} 
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Xóa vùng"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Edit Region */}
      {editingRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E3A8A]" /> Chỉnh sửa Vùng
              </h3>
              <button onClick={() => setEditingRegion(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateRegionSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Vùng *</label>
                <input
                  type="text"
                  value={editingRegion.name}
                  onChange={(e) => setEditingRegion({ ...editingRegion, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRegion(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 cursor-pointer"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmExecuteDelete}
        title="Xác nhận xóa Vùng"
        message={`${deleteTarget?.warning ? deleteTarget.warning + ' ' : ''}Bạn có chắc chắn muốn xóa vùng "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />
    </div>
  );
};
