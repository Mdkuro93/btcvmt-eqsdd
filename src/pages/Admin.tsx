import React, { useState, useEffect, useMemo } from 'react';
import { 
  fetchRegions, createRegion, updateRegion, deleteRegion,
  fetchAreas, createArea, updateArea, deleteArea,
  fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  fetchProjects, createProject, updateProject, deleteProject 
} from '../api/assets';
import { fetchProfiles, updateUserRole, updateUserPermissions, updateUserStatus, updateUserManagedWarehouses, createProfile, deleteProfile, ALL_PERMISSIONS } from '../api/users';
import { Role, Profile, Area, Region, Warehouse, Project } from '../types';
import { 
  Settings, MapPin, Building2, Warehouse as WarehouseIcon, FolderGit2, 
  Users, Plus, Trash2, Edit2, Check, Shield, UserPlus, 
  Store, Search, Filter, RotateCcw, X, AlertCircle, Layers
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingFallback } from '../components/LoadingFallback';
import { mockStore } from '../lib/mockStore';

export const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'regions' | 'areas' | 'warehouses' | 'projects' | 'users'>('areas');

  // Data states
  const [regions, setRegions] = useState<Region[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states - Region
  const [newRegionName, setNewRegionName] = useState('');
  const [editingRegion, setEditingRegion] = useState<{ id: string; name: string } | null>(null);

  // Form states - Area
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaRegionId, setNewAreaRegionId] = useState('');
  const [areaSearch, setAreaSearch] = useState('');
  const [areaRegionFilter, setAreaRegionFilter] = useState('');
  const [editingArea, setEditingArea] = useState<{ id: string; name: string; region_id: string } | null>(null);

  // Form states - Warehouse
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseCode, setNewWarehouseCode] = useState('');
  const [newWarehouseRegionCode, setNewWarehouseRegionCode] = useState('VMN');
  const [newWarehouseRegionId, setNewWarehouseRegionId] = useState('');
  const [newWarehouseIsCentral, setNewWarehouseIsCentral] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<{
    id: string;
    name: string;
    code?: string;
    region_code?: string;
    region_id?: string | null;
    is_central?: boolean;
  } | null>(null);

  // Form states - Project
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectAreaId, setNewProjectAreaId] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; area_id: string } | null>(null);

  // User form states
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('viewer');
  const [newUserManagedWarehouses, setNewUserManagedWarehouses] = useState<string[]>([]);

  // Reset standard data modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Confirm delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'region' | 'area' | 'warehouse' | 'project' | 'user';
    id: string;
    name: string;
    warning?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [r, a, w, p, profs] = await Promise.all([
        fetchRegions().catch(() => mockStore.getRegions()),
        fetchAreas().catch(() => mockStore.getAreas()),
        fetchWarehouses().catch(() => mockStore.getWarehouses()),
        fetchProjects().catch(() => mockStore.getProjects()),
        fetchProfiles().catch(() => mockStore.getProfiles()),
      ]);
      setRegions(r || []);
      setAreas(a || []);
      setWarehouses(w || []);
      setProjects(p || []);
      setProfiles(profs || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu quản trị');
    } finally {
      setLoading(false);
    }
  };

  // Region Handlers
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
      loadAllData();
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
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật vùng'));
    }
  };

  // Area Handlers
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
      loadAllData();
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
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật địa bàn'));
    }
  };

  // Warehouse Handlers
  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) {
      toast.error('Vui lòng nhập tên kho');
      return;
    }
    try {
      await createWarehouse({
        name: newWarehouseName.trim(),
        code: newWarehouseCode.trim() || undefined,
        region_code: newWarehouseRegionCode || 'VMN',
        region_id: newWarehouseRegionId || null,
        is_central: newWarehouseIsCentral,
      });
      toast.success('Thêm kho thành công');
      setNewWarehouseName('');
      setNewWarehouseCode('');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể thêm kho'));
    }
  };

  const handleUpdateWarehouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWarehouse || !editingWarehouse.name.trim()) return;
    try {
      await updateWarehouse(editingWarehouse.id, {
        name: editingWarehouse.name.trim(),
        code: editingWarehouse.code?.trim() || undefined,
        region_code: editingWarehouse.region_code || 'VMN',
        region_id: editingWarehouse.region_id || null,
        is_central: editingWarehouse.is_central,
      });
      toast.success('Cập nhật kho thành công');
      setEditingWarehouse(null);
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật kho'));
    }
  };

  // Project Handlers
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectAreaId) {
      toast.error('Vui lòng nhập tên dự án và chọn địa bàn');
      return;
    }
    try {
      await createProject({ name: newProjectName.trim(), area_id: newProjectAreaId });
      toast.success('Thêm dự án thành công');
      setNewProjectName('');
      loadAllData();
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
      });
      toast.success('Cập nhật dự án thành công');
      setEditingProject(null);
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật dự án'));
    }
  };

  // User Handlers
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserFullName.trim()) {
      toast.error('Vui lòng nhập họ tên và email');
      return;
    }
    try {
      await createProfile({
        email: newUserEmail.trim().toLowerCase(),
        full_name: newUserFullName.trim(),
        role: newUserRole,
        managed_warehouse_ids: newUserRole === 'warehouse_manager' ? newUserManagedWarehouses : null,
      });
      toast.success('Thêm người dùng thành công');
      setNewUserEmail('');
      setNewUserFullName('');
      setNewUserManagedWarehouses([]);
      setIsAddUserOpen(false);
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể thêm người dùng'));
    }
  };

  const handleUserRoleChange = async (userId: string, newRole: Role) => {
    try {
      await updateUserRole(userId, newRole);
      toast.success('Đã cập nhật vai trò người dùng');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi đổi vai trò: ' + (err.message || 'Thao tác thất bại'));
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    try {
      await updateUserStatus(userId, nextStatus);
      toast.success(nextStatus === 'active' ? 'Đã kích hoạt tài khoản' : 'Đã tạm khóa tài khoản');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi cập nhật trạng thái');
    }
  };

  const handleTogglePermission = async (prof: Profile, permKey: string) => {
    const currentPerms = prof.permissions || [];
    const newPerms = currentPerms.includes(permKey)
      ? currentPerms.filter(p => p !== permKey)
      : [...currentPerms, permKey];

    try {
      await updateUserPermissions(prof.id, newPerms);
      toast.success('Đã cập nhật phân quyền chi tiết');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi cập nhật quyền');
    }
  };

  const handleToggleUserWarehouse = async (prof: Profile, warehouseId: string) => {
    const currentWhs = prof.managed_warehouse_ids || [];
    const newWhs = currentWhs.includes(warehouseId)
      ? currentWhs.filter(id => id !== warehouseId)
      : [...currentWhs, warehouseId];

    try {
      await updateUserManagedWarehouses(prof.id, newWhs);
      toast.success('Đã cập nhật danh sách kho phụ trách');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi cập nhật kho phụ trách');
    }
  };

  // Delete Handlers
  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'region') await deleteRegion(deleteTarget.id);
      if (deleteTarget.type === 'area') await deleteArea(deleteTarget.id);
      if (deleteTarget.type === 'warehouse') await deleteWarehouse(deleteTarget.id);
      if (deleteTarget.type === 'project') await deleteProject(deleteTarget.id);
      if (deleteTarget.type === 'user') await deleteProfile(deleteTarget.id);

      toast.success(`Đã xóa "${deleteTarget.name}"`);
      setDeleteTarget(null);
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Reset standard corporate dataset
  const handleResetToStandardData = () => {
    setIsResetting(true);
    try {
      mockStore.resetToStandardData();
      toast.success('Đã khôi phục thành công bộ Dữ liệu chuẩn Doanh nghiệp Tập đoàn VMT!');
      setIsResetModalOpen(false);
      loadAllData();
    } catch (err) {
      toast.error('Lỗi khôi phục dữ liệu');
    } finally {
      setIsResetting(false);
    }
  };

  // Filtered areas
  const filteredAreas = useMemo(() => {
    return areas.filter(a => {
      const matchSearch = areaSearch ? a.name.toLowerCase().includes(areaSearch.toLowerCase()) : true;
      const matchRegion = areaRegionFilter ? a.region_id === areaRegionFilter : true;
      return matchSearch && matchRegion;
    });
  }, [areas, areaSearch, areaRegionFilter]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (!projectSearch) return true;
      const s = projectSearch.toLowerCase();
      return p.name.toLowerCase().includes(s) || (p.areas?.name || '').toLowerCase().includes(s);
    });
  }, [projects, projectSearch]);

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#1E3A8A]" />
            Cấu hình Danh mục & Phân quyền Hệ thống
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Quản trị Vùng, Địa bàn, Kho lưu trữ chứng từ, Dự án BĐS và Phân quyền người dùng
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsResetModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-200 hover:bg-blue-100 transition-colors shadow-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Khôi phục Dữ liệu chuẩn VMT
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 rounded-t-xl overflow-x-auto gap-1">
        <button
          onClick={() => setActiveTab('areas')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'areas' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MapPin className="w-4 h-4" /> Địa bàn ({areas.length})
        </button>
        <button
          onClick={() => setActiveTab('regions')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'regions' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" /> Vùng ({regions.length})
        </button>
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'warehouses' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <WarehouseIcon className="w-4 h-4" /> Kho lưu trữ ({warehouses.length})
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'projects' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderGit2 className="w-4 h-4" /> Dự án ({projects.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'users' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" /> Tài khoản & Phân quyền ({profiles.length})
        </button>
      </div>

      {loading ? (
        <LoadingFallback
          message="Đang tải dữ liệu cấu hình quản trị..."
          onRetry={() => loadAllData()}
          onForceLocal={() => {
            setRegions(mockStore.getRegions());
            setAreas(mockStore.getAreas());
            setWarehouses(mockStore.getWarehouses());
            setProjects(mockStore.getProjects());
            setProfiles(mockStore.getProfiles());
            setLoading(false);
            toast.success('Đã tải dữ liệu danh mục cục bộ');
          }}
          className="rounded-t-none border-t-0"
        />
      ) : (
        <div className="bg-white p-6 rounded-b-xl border border-gray-200 shadow-xs">
          
          {/* TAB 1: AREAS (ĐỊA BÀN) */}
          {activeTab === 'areas' && (
            <div className="space-y-6 max-w-4xl">
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
                      className="w-full h-[38px] bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1 shadow-xs transition-colors"
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
                            className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors"
                            title="Sửa địa bàn"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDeleteTarget({ 
                              type: 'area', 
                              id: a.id, 
                              name: a.name,
                              warning: linkedProjects.length > 0 ? `Địa bàn này đang có ${linkedProjects.length} dự án liên kết!` : undefined 
                            })} 
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
            </div>
          )}

          {/* TAB 2: REGIONS (VÙNG) */}
          {activeTab === 'regions' && (
            <div className="space-y-6 max-w-3xl">
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
                  <button type="submit" className="px-4 py-2 bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center gap-1 shadow-xs transition-colors">
                    <Plus className="w-4 h-4" /> Thêm vùng
                  </button>
                </form>
              </div>

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
                            className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors"
                            title="Sửa tên vùng"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'region', id: r.id, name: r.name })} 
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
            </div>
          )}

          {/* TAB 3: WAREHOUSES (KHO LƯU TRỮ) */}
          {activeTab === 'warehouses' && (
            <div className="space-y-6 max-w-4xl">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h3 className="text-xs font-bold uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Thêm Kho lưu trữ chứng từ mới
                </h3>
                <form onSubmit={handleAddWarehouse} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Tên kho *</label>
                      <input
                        type="text"
                        value={newWarehouseName}
                        onChange={(e) => setNewWarehouseName(e.target.value)}
                        placeholder="VD: Kho Dự Án Bình Dương..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Mã STT Kho (3 số)</label>
                      <input
                        type="text"
                        maxLength={3}
                        value={newWarehouseCode}
                        onChange={(e) => setNewWarehouseCode(e.target.value)}
                        placeholder="001, 002..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Vùng</label>
                      <select
                        value={newWarehouseRegionCode}
                        onChange={(e) => setNewWarehouseRegionCode(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        <option value="VMN">VMN (Miền Nam)</option>
                        <option value="VMT">VMT (Miền Trung)</option>
                        <option value="VMB">VMB (Miền Bắc)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-4">
                      <select
                        value={newWarehouseRegionId}
                        onChange={(e) => setNewWarehouseRegionId(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                      >
                        <option value="">-- Liên kết Vùng --</option>
                        {regions.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={newWarehouseIsCentral}
                          onChange={(e) => setNewWarehouseIsCentral(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Kho Tổng Trung Tâm</span>
                      </label>
                    </div>

                    <button type="submit" className="px-4 py-2 bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1 shadow-xs transition-colors">
                      <Plus className="w-4 h-4" /> Thêm kho
                    </button>
                  </div>
                </form>
              </div>

              <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                {warehouses.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">Chưa có kho nào.</div>
                ) : (
                  warehouses.map((w) => {
                    const rCode = w.region_code || (w.regions?.name?.includes('Bắc') ? 'VMB' : w.regions?.name?.includes('Nam') ? 'VMN' : 'VMT');
                    const wCode = w.code || '001';
                    return (
                      <div key={w.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs">
                            <WarehouseIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900 text-sm">{w.name}</span>
                              <span className="font-mono text-xs px-2 py-0.5 bg-blue-50 text-[#1E3A8A] border border-blue-200 rounded">
                                {rCode}-{wCode}
                              </span>
                              {w.is_central && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">Kho Tổng</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Mã Vùng: <span className="font-semibold text-gray-700">{rCode}</span> · STT Kho: <span className="font-semibold text-gray-700">{wCode}</span> {w.regions?.name ? `· Vùng: ${w.regions.name}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingWarehouse({
                              id: w.id,
                              name: w.name,
                              code: w.code,
                              region_code: w.region_code,
                              region_id: w.region_id,
                              is_central: w.is_central,
                            })}
                            className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors"
                            title="Sửa kho"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'warehouse', id: w.id, name: w.name })} 
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Xóa kho"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PROJECTS (DỰ ÁN) */}
          {activeTab === 'projects' && (
            <div className="space-y-6 max-w-4xl">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <h3 className="text-xs font-bold uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Thêm Dự án Bất động sản mới
                </h3>
                <form onSubmit={handleAddProject} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-6">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Dự án *</label>
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="VD: Dự án Khu Đô Thị VMT Central Palm..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-4">
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
                  <div className="sm:col-span-2 flex items-end">
                    <button type="submit" className="w-full h-[38px] bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1 shadow-xs transition-colors">
                      <Plus className="w-4 h-4" /> Thêm
                    </button>
                  </div>
                </form>
              </div>

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
              </div>

              <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                {filteredProjects.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">Chưa có dự án nào.</div>
                ) : (
                  filteredProjects.map((p) => {
                    const area = areas.find(a => a.id === p.area_id);
                    const areaName = p.areas?.name || area?.name || 'Chưa gán địa bàn';
                    return (
                      <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            <FolderGit2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Địa bàn: <span className="font-medium text-gray-700">{areaName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingProject({ id: p.id, name: p.name, area_id: p.area_id })}
                            className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors"
                            title="Sửa dự án"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'project', id: p.id, name: p.name })} 
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Xóa dự án"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 5: USERS & PERMISSIONS */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Danh sách tài khoản hệ thống</h3>
                  <p className="text-xs text-gray-500">Quản lý phân quyền theo vai trò và quyền hành vi chi tiết</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(!isAddUserOpen)}
                  className="px-3.5 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <UserPlus className="w-4 h-4" /> Thêm người dùng
                </button>
              </div>

              {isAddUserOpen && (
                <form onSubmit={handleAddUser} className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                  <div className="font-semibold text-xs text-blue-900 uppercase">Thêm tài khoản mới</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Họ và tên..."
                      value={newUserFullName}
                      onChange={(e) => setNewUserFullName(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email (VD: nv.a@btcvmt.vn)..."
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      required
                    />
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as Role)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      <option value="super_admin">Quản trị viên cấp cao (super_admin)</option>
                      <option value="btc_manager">Ban TC (btc_manager)</option>
                      <option value="warehouse_manager">Thủ kho (warehouse_manager)</option>
                      <option value="capital_dept">Ban Nguồn Vốn (capital_dept)</option>
                      <option value="project_dept">Ban DAĐT (project_dept)</option>
                      <option value="re_dept">Ban KD BĐS (re_dept)</option>
                      <option value="viewer">Viewer (viewer)</option>
                    </select>
                  </div>

                  {newUserRole === 'warehouse_manager' && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-amber-700" /> Chọn các kho Thủ kho này phụ trách:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {warehouses.map((wh) => {
                          const isChecked = newUserManagedWarehouses.includes(wh.id);
                          return (
                            <label
                              key={wh.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer border transition-colors ${
                                isChecked
                                  ? 'bg-amber-100 text-amber-900 border-amber-400 font-medium'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewUserManagedWarehouses(prev => [...prev, wh.id]);
                                  } else {
                                    setNewUserManagedWarehouses(prev => prev.filter(id => id !== wh.id));
                                  }
                                }}
                              />
                              {wh.name} {wh.is_central ? '(Kho TT)' : ''}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddUserOpen(false)}
                      className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
                    >
                      Tạo tài khoản
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tài khoản</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Trạng thái</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vai trò (Role)</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phạm vi / Kho phụ trách</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quyền chi tiết (Permissions)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {profiles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Chưa có dữ liệu tài khoản.</td>
                      </tr>
                    ) : (
                      profiles.map((prof) => (
                        <tr key={prof.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4">
                            <div className="font-bold text-gray-900">{prof.full_name || prof.email}</div>
                            <div className="text-xs text-gray-500">{prof.email}</div>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(prof.id, prof.status || 'active')}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                                prof.status === 'inactive'
                                  ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${prof.status === 'inactive' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                              {prof.status === 'inactive' ? 'Tạm khóa' : 'Hoạt động'}
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={prof.role}
                              onChange={(e) => handleUserRoleChange(prof.id, e.target.value as Role)}
                              className="text-xs border border-gray-300 rounded-md p-1.5 bg-white focus:border-blue-500"
                            >
                              <option value="super_admin">Quản trị viên cấp cao (super_admin)</option>
                              <option value="btc_manager">Ban TC (btc_manager)</option>
                              <option value="warehouse_manager">Thủ kho (warehouse_manager)</option>
                              <option value="capital_dept">Ban Nguồn Vốn (capital_dept)</option>
                              <option value="project_dept">Ban DAĐT (project_dept)</option>
                              <option value="re_dept">Ban KD BĐS (re_dept)</option>
                              <option value="viewer">Viewer (viewer)</option>
                            </select>
                          </td>
                          <td className="px-4 py-4 min-w-[200px]">
                            {prof.role === 'warehouse_manager' ? (
                              <div className="space-y-1.5">
                                <div className="text-[11px] font-medium text-gray-500">Kho phụ trách:</div>
                                <div className="flex flex-wrap gap-1">
                                  {warehouses.map(wh => {
                                    const isAssigned = (prof.managed_warehouse_ids || []).includes(wh.id);
                                    return (
                                      <button
                                        key={wh.id}
                                        type="button"
                                        onClick={() => handleToggleUserWarehouse(prof, wh.id)}
                                        className={`px-2 py-0.5 rounded text-[11px] border transition-colors flex items-center gap-1 ${
                                          isAssigned
                                            ? 'bg-amber-100 text-amber-900 border-amber-300 font-medium'
                                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                                        }`}
                                        title={`Bấm để gán / bỏ gán kho ${wh.name}`}
                                      >
                                        {isAssigned && <Check className="w-2.5 h-2.5 text-amber-700" />}
                                        {wh.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500 italic">Toàn quyền theo vai trò</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1.5 max-w-xl">
                              {ALL_PERMISSIONS.map((perm) => {
                                const hasPerm = (prof.permissions || []).includes(perm.key);
                                return (
                                  <button
                                    key={perm.key}
                                    onClick={() => handleTogglePermission(prof, perm.key)}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1 ${
                                      hasPerm
                                        ? 'bg-blue-100 text-[#1E3A8A] border-blue-300'
                                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                    }`}
                                  >
                                    {hasPerm && <Check className="w-3 h-3" />}
                                    {perm.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              onClick={() => setDeleteTarget({ type: 'user', id: prof.id, name: prof.full_name || prof.email })}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                              title="Xóa tài khoản"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Edit Area */}
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
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Region */}
      {editingRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
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
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Project */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
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
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Warehouse */}
      {editingWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E3A8A]" /> Chỉnh sửa Kho lưu trữ
              </h3>
              <button onClick={() => setEditingWarehouse(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateWarehouseSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Kho *</label>
                <input
                  type="text"
                  value={editingWarehouse.name}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mã STT Kho</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={editingWarehouse.code || ''}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Vùng</label>
                  <select
                    value={editingWarehouse.region_code || 'VMN'}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, region_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="VMN">VMN (Miền Nam)</option>
                    <option value="VMT">VMT (Miền Trung)</option>
                    <option value="VMB">VMB (Miền Bắc)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Vùng trực thuộc</label>
                <select
                  value={editingWarehouse.region_id || ''}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, region_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Không liên kết --</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={!!editingWarehouse.is_central}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, is_central: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Kho Tổng Trung Tâm</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWarehouse(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Reset Standard Data Modal */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetToStandardData}
        title="Khôi phục Dữ liệu chuẩn Tập đoàn VMT"
        message="Hành động này sẽ thiết lập lại toàn bộ Danh mục Vùng (3 vùng), Địa bàn (18 tỉnh thành), Kho lưu trữ (8 kho), Dự án BĐS (8 dự án), cùng bộ hồ sơ Giấy Chứng Nhận QSDĐ & Phiếu Đề Xuất chuẩn để kiểm thử. Bạn có chắc chắn muốn thực hiện?"
        confirmText="Xác nhận khôi phục"
        confirmVariant="primary"
        loading={isResetting}
      />

      {/* Admin Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmExecuteDelete}
        title={`Xác nhận xóa ${
          deleteTarget?.type === 'region' ? 'Vùng' :
          deleteTarget?.type === 'area' ? 'Địa bàn' :
          deleteTarget?.type === 'warehouse' ? 'Kho' :
          deleteTarget?.type === 'project' ? 'Dự án' : 'Tài khoản'
        }`}
        message={`${
          deleteTarget?.warning ? deleteTarget.warning + ' ' : ''
        }Bạn có chắc chắn muốn xóa "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />
    </div>
  );
};
