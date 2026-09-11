import React, { useState, useEffect, useMemo } from 'react';
import { Area, Region, Project } from '../../types';
import { fetchAreas, createArea, updateArea, deleteArea, fetchRegions, fetchProjects } from '../../api/assets';
import { mockStore } from '../../lib/mockStore';
import { MapPin, Plus, Edit2, Trash2, Search, Filter, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../ConfirmModal';
import { LoadingFallback } from '../LoadingFallback';

export const AdminAreas: React.FC = () => {
  const [areas, setAreas] = useState<Area[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaRegionId, setNewAreaRegionId] = useState('');
  const [areaSearch, setAreaSearch] = useState('');
  const [areaRegionFilter, setAreaRegionFilter] = useState('');
  const [editingArea, setEditingArea] = useState<{ id: string; name: string; region_id: string } | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; warning?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [a, r, p] = await Promise.all([
        fetchAreas().catch(() => mockStore.getAreas()),
        fetchRegions().catch(() => mockStore.getRegions()),
        fetchProjects().catch(() => mockStore.getProjects()),
      ]);
      setAreas(a || []);
      setRegions(r || []);
      setProjects(p || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu địa bàn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim()) {
      toast.error('Vui lòng nhập tên địa bàn');
      return;
    }
    if (!newAreaRegionId) {
      toast.error('Vui lòng chọn Vùng trực thuộc');
      return;
    }
    try {
      await createArea(newAreaName.trim(), newAreaRegionId);
      toast.success(`Đã thêm địa bàn "${newAreaName.trim()}" thành công`);
      setNewAreaName('');
      setNewAreaRegionId('');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể thêm địa bàn'));
    }
  };

  const handleUpdateAreaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArea || !editingArea.name.trim() || !editingArea.region_id) {
      toast.error('Vui lòng điền đầy đủ tên địa bàn và chọn vùng');
      return;
    }
    try {
      await updateArea(editingArea.id, editingArea.name.trim(), editingArea.region_id);
      toast.success('Cập nhật địa bàn thành công');
      setEditingArea(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật địa bàn'));
    }
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteArea(deleteTarget.id);
      toast.success(`Đã xóa "${deleteTarget.name}"`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredAreas = useMemo(() => {
    return areas.filter(a => {
      const matchSearch = areaSearch ? a.name.toLowerCase().includes(areaSearch.toLowerCase()) : true;
      const matchRegion = areaRegionFilter ? a.region_id === areaRegionFilter : true;
      return matchSearch && matchRegion;
    });
  }, [areas, areaSearch, areaRegionFilter]);

  if (loading) {
    return (
      <LoadingFallback
        message="Đang tải dữ liệu địa bàn..."
        onRetry={loadData}
        onForceLocal={() => {
          setAreas(mockStore.getAreas());
          setRegions(mockStore.getRegions());
          setProjects(mockStore.getProjects());
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Form thêm mới */}
      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
        <h3 className="text-xs font-bold uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Thêm Địa bàn hành chính mới
        </h3>
        <form onSubmit={handleAddArea} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Địa bàn / Tỉnh thành *</label>
            <input
              type="text"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="VD: Khánh Hòa (Nha Trang), Long An..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Vùng trực thuộc *</label>
            <select
              value={newAreaRegionId}
              onChange={(e) => setNewAreaRegionId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Chọn Vùng --</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button 
              type="submit" 
              className="w-full h-[38px] bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Thêm
            </button>
          </div>
        </form>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={areaSearch}
            onChange={(e) => setAreaSearch(e.target.value)}
            placeholder="Tìm kiếm địa bàn theo tên..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white"
          />
          {areaSearch && (
            <button onClick={() => setAreaSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          <select
            value={areaRegionFilter}
            onChange={(e) => setAreaRegionFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50/50 text-gray-700 w-full sm:w-auto"
          >
            <option value="">Tất cả các Vùng ({areas.length})</option>
            {regions.map((r) => {
              const count = areas.filter(a => a.region_id === r.id).length;
              return (
                <option key={r.id} value={r.id}>{r.name} ({count})</option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Area List */}
      <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        {filteredAreas.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Không tìm thấy địa bàn nào phù hợp.
          </div>
        ) : (
          filteredAreas.map((a) => {
            const linkedProjects = projects.filter(p => p.area_id === a.id);
            const regionName = a.regions?.name || regions.find(r => r.id === a.region_id)?.name || 'Chưa gán vùng';
            
            return (
              <div key={a.id} className="p-4 flex items-center justify-between hover:bg-gray-50/80 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E3A8A] flex items-center justify-center font-bold text-xs">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{a.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        {regionName}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>Mã: <code className="font-mono text-gray-700">{a.id}</code></span>
                      <span>·</span>
                      <span className="text-blue-700 font-medium">
                        {linkedProjects.length} dự án trực thuộc
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingArea({ id: a.id, name: a.name, region_id: a.region_id })}
                    className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                    title="Sửa địa bàn"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDeleteTarget({ 
                      id: a.id, 
                      name: a.name,
                      warning: linkedProjects.length > 0 ? `Địa bàn này đang có ${linkedProjects.length} dự án liên kết!` : undefined 
                    })} 
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Xóa địa bàn"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Edit Area */}
      {editingArea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E3A8A]" /> Chỉnh sửa Địa bàn
              </h3>
              <button onClick={() => setEditingArea(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateAreaSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Địa bàn *</label>
                <input
                  type="text"
                  value={editingArea.name}
                  onChange={(e) => setEditingArea({ ...editingArea, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Vùng trực thuộc *</label>
                <select
                  value={editingArea.region_id}
                  onChange={(e) => setEditingArea({ ...editingArea, region_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">-- Chọn Vùng --</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingArea(null)}
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
        title="Xác nhận xóa Địa bàn"
        message={`${deleteTarget?.warning ? deleteTarget.warning + ' ' : ''}Bạn có chắc chắn muốn xóa địa bàn "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />
    </div>
  );
};
