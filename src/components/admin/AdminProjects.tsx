import React, { useState, useEffect, useMemo } from 'react';
import { Project, Area, InvestorEntity } from '../../types';
import { fetchProjects, createProject, updateProject, deleteProject, fetchAreas } from '../../api/assets';
import { fetchInvestorEntities } from '../../api/investorEntities';
import { mockStore } from '../../lib/mockStore';
import { FolderGit2, Plus, Edit2, Trash2, Search, X, LandPlot } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../ConfirmModal';
import { LoadingFallback } from '../LoadingFallback';
import { ProjectPlannedLotsModal } from './ProjectPlannedLotsModal';
import { useAuth } from '../../contexts/AuthContext';

export const AdminProjects: React.FC = () => {
  const { profile } = useAuth();
  // Ban PTDA (project_dept) chỉ được quản lý Lô quy hoạch pháp lý (nút LandPlot bên dưới),
  // KHÔNG được thêm/sửa/xóa Dự án — việc đó vẫn thuộc admin/super_admin/btc_manager (theo RLS bảng projects).
  const canManageProjects = profile?.role !== 'project_dept';
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [entities, setEntities] = useState<InvestorEntity[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectAreaId, setNewProjectAreaId] = useState('');
  const [newProjectDefaultOwnerId, setNewProjectDefaultOwnerId] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; area_id: string; default_owner_entity_id?: string | null } | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [plannedLotsProject, setPlannedLotsProject] = useState<Project | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, a, e] = await Promise.all([
        fetchProjects().catch(() => mockStore.getProjects()),
        fetchAreas().catch(() => mockStore.getAreas()),
        fetchInvestorEntities().catch(() => mockStore.getInvestorEntities()),
      ]);
      setProjects(p || []);
      setAreas(a || []);
      setEntities(e || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu dự án BĐS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectAreaId) {
      toast.error('Vui lòng nhập tên dự án và chọn địa bàn');
      return;
    }
    try {
      await createProject({
        name: newProjectName.trim(),
        area_id: newProjectAreaId,
        default_owner_entity_id: newProjectDefaultOwnerId || null,
      });
      toast.success('Thêm dự án thành công');
      setNewProjectName('');
      setNewProjectDefaultOwnerId('');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể thêm dự án'));
    }
  };

  const handleUpdateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editingProject.name.trim() || !editingProject.area_id) {
      toast.error('Vui lòng nhập tên dự án và chọn địa bàn');
      return;
    }
    try {
      await updateProject(editingProject.id, {
        name: editingProject.name.trim(),
        area_id: editingProject.area_id,
        default_owner_entity_id: editingProject.default_owner_entity_id || null,
      });
      toast.success('Cập nhật dự án thành công');
      setEditingProject(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật dự án'));
    }
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProject(deleteTarget.id);
      toast.success(`Đã xóa "${deleteTarget.name}"`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (!projectSearch) return true;
      const s = projectSearch.toLowerCase();
      return p.name.toLowerCase().includes(s) || (p.areas?.name || '').toLowerCase().includes(s);
    });
  }, [projects, projectSearch]);

  if (loading) {
    return (
      <LoadingFallback
        message="Đang tải danh sách dự án bất động sản..."
        onRetry={loadData}
        onForceLocal={() => {
          setProjects(mockStore.getProjects());
          setAreas(mockStore.getAreas());
          setEntities(mockStore.getInvestorEntities());
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Form thêm mới dự án — chỉ vai trò được sửa danh mục Dự án mới thấy */}
      {canManageProjects && (
      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
        <h3 className="text-xs font-bold uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Thêm Dự án Bất động sản mới
        </h3>
        <form onSubmit={handleAddProject} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Dự án *</label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="VD: Dự án Khu Đô Thị VMT Central Palm..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Địa bàn trực thuộc *</label>
            <select
              value={newProjectAreaId}
              onChange={(e) => setNewProjectAreaId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Chọn Địa bàn --</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.regions?.name || ''})</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Chủ đầu tư mặc định</label>
            <select
              value={newProjectDefaultOwnerId}
              onChange={(e) => setNewProjectDefaultOwnerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Chọn CĐT (Tùy chọn) --</option>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>{ent.name} {ent.company_code ? `(${ent.company_code})` : ''}</option>
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
      )}

      {/* Search Project Toolbar */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={projectSearch}
          onChange={(e) => setProjectSearch(e.target.value)}
          placeholder="Tìm kiếm dự án theo tên hoặc địa bàn..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white"
        />
        {projectSearch && (
          <button onClick={() => setProjectSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Danh sách dự án */}
      <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        {filteredProjects.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">Chưa có dự án nào.</div>
        ) : (
          filteredProjects.map((p) => {
            const area = areas.find(a => a.id === p.area_id);
            const areaName = p.areas?.name || area?.name || 'Chưa gán địa bàn';
            const defaultOwner = entities.find(e => e.id === p.default_owner_entity_id);
            return (
              <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    <FolderGit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>Địa bàn: <span className="font-medium text-gray-700">{areaName}</span></span>
                      {defaultOwner && (
                        <span>• CĐT mặc định: <span className="font-medium text-blue-700">{defaultOwner.name}</span></span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPlannedLotsProject(p)}
                    className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                    title="Quản lý lô quy hoạch pháp lý"
                  >
                    <LandPlot className="w-4 h-4" />
                  </button>
                  {canManageProjects && (
                  <>
                  <button
                    type="button"
                    onClick={() => setEditingProject({
                      id: p.id,
                      name: p.name,
                      area_id: p.area_id,
                      default_owner_entity_id: p.default_owner_entity_id || '',
                    })}
                    className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                    title="Sửa dự án"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDeleteTarget({ id: p.id, name: p.name })} 
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Xóa dự án"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Edit Project */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E3A8A]" /> Chỉnh sửa Dự án BĐS
              </h3>
              <button onClick={() => setEditingProject(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateProjectSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Dự án *</label>
                <input
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Địa bàn trực thuộc *</label>
                <select
                  value={editingProject.area_id}
                  onChange={(e) => setEditingProject({ ...editingProject, area_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">-- Chọn Địa bàn --</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.regions?.name || ''})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Chủ đầu tư mặc định</label>
                <select
                  value={editingProject.default_owner_entity_id || ''}
                  onChange={(e) => setEditingProject({ ...editingProject, default_owner_entity_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Chọn CĐT mặc định (Tùy chọn) --</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>{ent.name} {ent.company_code ? `(${ent.company_code})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
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
        title="Xác nhận xóa Dự án"
        message={`Bạn có chắc chắn muốn xóa dự án "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />

      {plannedLotsProject && (
        <ProjectPlannedLotsModal
          project={plannedLotsProject}
          onClose={() => setPlannedLotsProject(null)}
        />
      )}
    </div>
  );
};