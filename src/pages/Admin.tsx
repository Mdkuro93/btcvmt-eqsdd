import React, { useState, useEffect } from 'react';
import { 
  fetchRegions, createRegion, updateRegion, deleteRegion,
  fetchAreas, createArea, updateArea, deleteArea,
  fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  fetchProjects, createProject, updateProject, deleteProject 
} from '../api/assets';
import { fetchProfiles, updateUserRole, updateUserPermissions, updateUserStatus, ALL_PERMISSIONS } from '../api/users';
import { Role, Profile } from '../types';
import { Settings, MapPin, Building2, Warehouse, FolderGit2, Users, Plus, Trash2, Edit2, Loader2, Check, Shield } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'regions' | 'areas' | 'warehouses' | 'projects' | 'users'>('regions');

  // Data states
  const [regions, setRegions] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newRegionName, setNewRegionName] = useState('');
  
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaRegionId, setNewAreaRegionId] = useState('');

  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseRegionId, setNewWarehouseRegionId] = useState('');
  const [newWarehouseIsCentral, setNewWarehouseIsCentral] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectAreaId, setNewProjectAreaId] = useState('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [r, a, w, p, profs] = await Promise.all([
        fetchRegions().catch(() => []),
        fetchAreas().catch(() => []),
        fetchWarehouses().catch(() => []),
        fetchProjects().catch(() => []),
        fetchProfiles().catch(() => []),
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
    if (!newRegionName.trim()) return;
    try {
      await createRegion(newRegionName.trim());
      toast.success('Thêm vùng thành công');
      setNewRegionName('');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleDeleteRegion = async (id: string) => {
    if (!window.confirm('Xác nhận xóa vùng này?')) return;
    try {
      await deleteRegion(id);
      toast.success('Đã xóa vùng');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + err.message);
    }
  };

  // Area Handlers
  const handleAddArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim() || !newAreaRegionId) return;
    try {
      await createArea(newAreaName.trim(), newAreaRegionId);
      toast.success('Thêm địa bàn thành công');
      setNewAreaName('');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleDeleteArea = async (id: string) => {
    if (!window.confirm('Xác nhận xóa địa bàn này?')) return;
    try {
      await deleteArea(id);
      toast.success('Đã xóa địa bàn');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + err.message);
    }
  };

  // Warehouse Handlers
  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) return;
    try {
      await createWarehouse({
        name: newWarehouseName.trim(),
        region_id: newWarehouseRegionId || null,
        is_central: newWarehouseIsCentral,
      });
      toast.success('Thêm kho thành công');
      setNewWarehouseName('');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleDeleteWarehouse = async (id: string) => {
    if (!window.confirm('Xác nhận xóa kho này?')) return;
    try {
      await deleteWarehouse(id);
      toast.success('Đã xóa kho');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + err.message);
    }
  };

  // Project Handlers
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectAreaId) return;
    try {
      await createProject({ name: newProjectName.trim(), area_id: newProjectAreaId });
      toast.success('Thêm dự án thành công');
      setNewProjectName('');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('Xác nhận xóa dự án này? (Các GCN thuộc dự án sẽ được gỡ liên kết dự án)')) return;
    try {
      await deleteProject(id);
      toast.success('Đã xóa dự án');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + err.message);
    }
  };

  // User Handlers
  const handleUserRoleChange = async (userId: string, newRole: Role) => {
    try {
      await updateUserRole(userId, newRole);
      toast.success('Đã cập nhật vai trò người dùng');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi đổi vai trò: ' + err.message);
    }
  };

  const handleTogglePermission = async (profileItem: Profile, permKey: string) => {
    const currentPerms = profileItem.permissions || [];
    const hasPerm = currentPerms.includes(permKey);
    const updated = hasPerm ? currentPerms.filter(p => p !== permKey) : [...currentPerms, permKey];
    try {
      await updateUserPermissions(profileItem.id, updated);
      toast.success('Cập nhật quyền thành công');
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi cập nhật quyền: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#1E3A8A]" /> Quản trị hệ thống
        </h1>
      </div>

      {/* Tabs Header */}
      <div className="border-b border-gray-200 bg-white rounded-t-lg px-4 flex gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('regions')}
          className={`py-3.5 px-2 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'regions' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MapPin className="w-4 h-4" /> Vùng miền ({regions.length})
        </button>
        <button
          onClick={() => setActiveTab('areas')}
          className={`py-3.5 px-2 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'areas' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" /> Địa bàn ({areas.length})
        </button>
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`py-3.5 px-2 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'warehouses' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Warehouse className="w-4 h-4" /> Kho lưu trữ ({warehouses.length})
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`py-3.5 px-2 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'projects' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderGit2 className="w-4 h-4" /> Dự án ({projects.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`py-3.5 px-2 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'users' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" /> Người dùng & Phân quyền ({profiles.length})
        </button>
      </div>

      {loading ? (
        <div className="bg-white p-12 text-center rounded-b-lg border border-gray-200">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-sm text-gray-500">Đang tải dữ liệu quản trị...</p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-b-lg border border-gray-200 shadow-sm">
          {/* TAB 1: REGIONS */}
          {activeTab === 'regions' && (
            <div className="space-y-6 max-w-2xl">
              <form onSubmit={handleAddRegion} className="flex gap-3">
                <input
                  type="text"
                  value={newRegionName}
                  onChange={(e) => setNewRegionName(e.target.value)}
                  placeholder="Tên vùng mới (VD: Miền Nam)..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <button type="submit" className="px-4 py-2 bg-[#1E3A8A] text-white rounded-md text-sm font-semibold hover:bg-blue-800 flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Thêm vùng
                </button>
              </form>

              <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                {regions.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">Chưa có vùng nào.</div>
                ) : (
                  regions.map((r) => (
                    <div key={r.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <span className="font-semibold text-gray-900">{r.name}</span>
                      <button onClick={() => handleDeleteRegion(r.id)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: AREAS */}
          {activeTab === 'areas' && (
            <div className="space-y-6 max-w-3xl">
              <form onSubmit={handleAddArea} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  placeholder="Tên địa bàn (VD: Quảng Nam)..."
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <select
                  value={newAreaRegionId}
                  onChange={(e) => setNewAreaRegionId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">-- Chọn vùng thuộc về --</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <button type="submit" className="px-4 py-2 bg-[#1E3A8A] text-white rounded-md text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1">
                  <Plus className="w-4 h-4" /> Thêm địa bàn
                </button>
              </form>

              <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                {areas.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">Chưa có địa bàn nào.</div>
                ) : (
                  areas.map((a) => (
                    <div key={a.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <span className="font-semibold text-gray-900">{a.name}</span>
                        <span className="text-xs text-gray-500 ml-2">({a.regions?.name || 'Chưa gán vùng'})</span>
                      </div>
                      <button onClick={() => handleDeleteArea(a.id)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: WAREHOUSES */}
          {activeTab === 'warehouses' && (
            <div className="space-y-6 max-w-3xl">
              <form onSubmit={handleAddWarehouse} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                    placeholder="Tên kho (VD: Kho BTC Miền Nam)..."
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <select
                    value={newWarehouseRegionId}
                    onChange={(e) => setNewWarehouseRegionId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="">-- Kho dùng chung / Chọn vùng --</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <button type="submit" className="px-4 py-2 bg-[#1E3A8A] text-white rounded-md text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1">
                    <Plus className="w-4 h-4" /> Thêm kho
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_central"
                    checked={newWarehouseIsCentral}
                    onChange={(e) => setNewWarehouseIsCentral(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="is_central" className="text-xs font-medium text-gray-700">Là Kho Trung Tâm (Sổ nhập lại sẽ mặc định về đây)</label>
                </div>
              </form>

              <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                {warehouses.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">Chưa có kho nào.</div>
                ) : (
                  warehouses.map((w) => (
                    <div key={w.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <span className="font-semibold text-gray-900">{w.name}</span>
                        {w.is_central && <span className="ml-2 text-xs bg-blue-100 text-[#1E3A8A] px-2 py-0.5 rounded-full font-medium">Kho Trung Tâm</span>}
                        <span className="text-xs text-gray-500 ml-2">{w.regions?.name ? `(${w.regions.name})` : ''}</span>
                      </div>
                      <button onClick={() => handleDeleteWarehouse(w.id)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PROJECTS */}
          {activeTab === 'projects' && (
            <div className="space-y-6 max-w-3xl">
              <form onSubmit={handleAddProject} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Tên dự án mới..."
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <select
                  value={newProjectAreaId}
                  onChange={(e) => setNewProjectAreaId(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">-- Chọn địa bàn thuộc về --</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.regions?.name || ''})</option>
                  ))}
                </select>
                <button type="submit" className="px-4 py-2 bg-[#1E3A8A] text-white rounded-md text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1">
                  <Plus className="w-4 h-4" /> Thêm dự án
                </button>
              </form>

              <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                {projects.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 text-center">Chưa có dự án nào.</div>
                ) : (
                  projects.map((p) => (
                    <div key={p.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-500 ml-2">Địa bàn: {p.areas?.name || '-'}</span>
                      </div>
                      <button onClick={() => handleDeleteProject(p.id)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: USERS & PERMISSIONS */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tài khoản</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vai trò (Role)</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quyền chi tiết (Permissions)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {profiles.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500">Chưa có dữ liệu tài khoản.</td>
                      </tr>
                    ) : (
                      profiles.map((prof) => (
                        <tr key={prof.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <div className="font-bold text-gray-900">{prof.full_name || prof.email}</div>
                            <div className="text-xs text-gray-500">{prof.email}</div>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={prof.role}
                              onChange={(e) => handleUserRoleChange(prof.id, e.target.value as Role)}
                              className="text-xs border border-gray-300 rounded p-1.5 focus:border-blue-500"
                            >
                              <option value="btc_manager">Ban TC (btc_manager)</option>
                              <option value="capital_dept">Ban Nguồn Vốn (capital_dept)</option>
                              <option value="project_dept">Ban DAĐT (project_dept)</option>
                              <option value="re_dept">Ban KD BĐS (re_dept)</option>
                              <option value="viewer">Viewer (viewer)</option>
                            </select>
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
    </div>
  );
};
