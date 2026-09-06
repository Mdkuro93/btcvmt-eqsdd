import React, { useState, useEffect, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { 
  fetchRegions, createRegion, updateRegion, deleteRegion,
  fetchAreas, createArea, updateArea, deleteArea,
  fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  fetchProjects, createProject, updateProject, deleteProject 
} from '../api/assets';
import { 
  fetchInvestorEntities, 
  createInvestorEntity, 
  updateInvestorEntity, 
  deleteInvestorEntity 
} from '../api/investorEntities';
import { fetchProfiles, updateUserRole, updateUserPermissions, updateUserStatus, updateUserManagedWarehouses, createProfile, deleteProfile, ALL_PERMISSIONS } from '../api/users';
import { fetchAllAppUsers, fetchPendingAppUsers, approveAppUser, rejectAppUser } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import { Role, Profile, Area, Region, Warehouse, Project, AppUserSession, InvestorEntity } from '../types';
import { 
  Settings, MapPin, Building2, Warehouse as WarehouseIcon, FolderGit2, 
  Users, Plus, Trash2, Edit2, Check, Shield, UserPlus, 
  Store, Search, Filter, RotateCcw, X, AlertCircle, Layers,
  Clock, Calendar, CheckCircle2, UserX, Infinity as InfinityIcon,
  Building, Landmark, HelpCircle, CheckCheck
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format } from 'date-fns';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingFallback } from '../components/LoadingFallback';
import { mockStore } from '../lib/mockStore';

export const Admin: React.FC = () => {
  const { profile } = useAuth();

  // Dành cho Admin, Quản lý kho (warehouse_manager) và Ban Tài chính
  if (profile && profile.role !== 'admin' && profile.role !== 'super_admin' && profile.role !== 'warehouse_manager' && profile.role !== 'btc_manager') {
    return <Navigate to="/lookup" replace />;
  }

  const [activeTab, setActiveTab] = useState<'regions' | 'areas' | 'warehouses' | 'projects' | 'users' | 'app_users' | 'investor_entities'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'investor_entities') return 'investor_entities';
    if (profile?.role === 'warehouse_manager') return 'investor_entities';
    return 'users';
  });

  // Data states
  const [regions, setRegions] = useState<Region[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [investorEntities, setInvestorEntities] = useState<InvestorEntity[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserSession[]>([]);
  const [appUserFilter, setAppUserFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [appUserSearch, setAppUserSearch] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Investor entities states
  const [investorSearch, setInvestorSearch] = useState('');
  const [isAddInvestorOpen, setIsAddInvestorOpen] = useState(false);
  const [newInvestorName, setNewInvestorName] = useState('');
  const [newInvestorCode, setNewInvestorCode] = useState('');
  const [newInvestorNote, setNewInvestorNote] = useState('');
  const [editingInvestor, setEditingInvestor] = useState<InvestorEntity | null>(null);
  const [editInvestorName, setEditInvestorName] = useState('');
  const [editInvestorCode, setEditInvestorCode] = useState('');
  const [editInvestorNote, setEditInvestorNote] = useState('');
  const [isSavingInvestor, setIsSavingInvestor] = useState(false);

  // App User Approval states
  const [approvingAppUser, setApprovingAppUser] = useState<AppUserSession | null>(null);
  const [approvalDays, setApprovalDays] = useState<number>(7);
  const [customApprovalDate, setCustomApprovalDate] = useState<string>('');
  const [isUnlimitedAccess, setIsUnlimitedAccess] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

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
    type: 'region' | 'area' | 'warehouse' | 'project' | 'user' | 'investor_entity';
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
      const [r, a, w, p, profs, allUsers, invs] = await Promise.all([
        fetchRegions().catch(() => mockStore.getRegions()),
        fetchAreas().catch(() => mockStore.getAreas()),
        fetchWarehouses().catch(() => mockStore.getWarehouses()),
        fetchProjects().catch(() => mockStore.getProjects()),
        fetchProfiles().catch(() => mockStore.getProfiles()),
        fetchAllAppUsers().catch(() => []),
        fetchInvestorEntities().catch(() => mockStore.getInvestorEntities()),
      ]);
      setRegions(r || []);
      setAreas(a || []);
      setWarehouses(w || []);
      setProjects(p || []);
      setProfiles(profs || []);
      setAppUsers(allUsers || []);
      setInvestorEntities(invs || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu quản trị');
    } finally {
      setLoading(false);
    }
  };

  // App User Approval Handler
  const handleApproveAppUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingAppUser) return;

    setIsApproving(true);
    try {
      let expiresAtIso: string | null = null;
      if (!isUnlimitedAccess) {
        if (customApprovalDate) {
          expiresAtIso = new Date(customApprovalDate).toISOString();
        } else {
          expiresAtIso = new Date(Date.now() + approvalDays * 24 * 60 * 60 * 1000).toISOString();
        }
      }

      await approveAppUser(approvingAppUser.id, expiresAtIso);
      toast.success(
        `Đã duyệt tài khoản "${approvingAppUser.username}" thành công! ${
          expiresAtIso ? `Hạn đến: ${format(new Date(expiresAtIso), 'dd/MM/yyyy HH:mm')}` : 'Thời hạn: Vô thời hạn'
        }`
      );
      setApprovingAppUser(null);
      await loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi phê duyệt: ' + (err.message || 'Thao tác thất bại'));
    } finally {
      setIsApproving(false);
    }
  };

  // App User Rejection Handler
  const handleRejectAppUser = async (user: AppUserSession) => {
    if (!window.confirm(`Bạn có chắc chắn muốn từ chối (status = rejected) tài khoản "${user.username}"?`)) {
      return;
    }
    try {
      await rejectAppUser(user.id);
      toast.success(`Đã từ chối tài khoản "${user.username}"`);
      await loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi từ chối: ' + (err.message || 'Thao tác thất bại'));
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
      if (deleteTarget.type === 'investor_entity') await deleteInvestorEntity(deleteTarget.id);

      toast.success(`Đã xóa "${deleteTarget.name}"`);
      setDeleteTarget(null);
      loadAllData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Chuẩn hóa mã pháp nhân: viết hoa, loại bỏ dấu tiếng Việt, thay khoảng trắng/ký tự đặc biệt bằng dấu gạch dưới
  const normalizeCompanyCode = (text: string): string => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_');
  };

  // Validate mã pháp nhân
  const validateCompanyCode = (code: string, currentId?: string): { valid: boolean; error?: string } => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { valid: true }; // Mã có thể không bắt buộc hoặc tuỳ chỉnh, nhưng nếu nhập thì phải chuẩn
    }

    // Format check: Viết hoa không dấu, không khoảng trắng, chỉ gồm A-Z, 0-9 và dấu gạch dưới _
    const formatRegex = /^[A-Z0-9_]+$/;
    if (!formatRegex.test(trimmed)) {
      return {
        valid: false,
        error: 'Mã pháp nhân phải viết hoa, không dấu tiếng Việt và không chứa khoảng trắng (Ví dụ: VMT_GROUP, SUN_LAND, TECH_CAPITAL).'
      };
    }

    // Duplicate check: không trùng mã với các pháp nhân khác
    const isDuplicate = investorEntities.some(
      e => e.id !== currentId && e.company_code && e.company_code.trim().toUpperCase() === trimmed.toUpperCase()
    );
    if (isDuplicate) {
      return {
        valid: false,
        error: `Mã pháp nhân "${trimmed}" đã tồn tại trên hệ thống. Vui lòng đặt mã khác để không bị trùng lặp!`
      };
    }

    return { valid: true };
  };

  // Thêm mới Pháp nhân CĐT/NĐT
  const handleAddInvestorEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvestorName.trim()) {
      toast.error('Vui lòng nhập tên pháp nhân CĐT/NĐT');
      return;
    }

    const val = validateCompanyCode(newInvestorCode);
    if (!val.valid) {
      toast.error(val.error!);
      return;
    }

    setIsSavingInvestor(true);
    try {
      const created = await createInvestorEntity({
        name: newInvestorName.trim(),
        company_code: newInvestorCode.trim() ? newInvestorCode.trim().toUpperCase() : null,
        note: newInvestorNote.trim() || null,
      });
      setInvestorEntities(prev => [...prev, created]);
      toast.success(`Đã thêm mới pháp nhân "${created.name}"`);
      setNewInvestorName('');
      setNewInvestorCode('');
      setNewInvestorNote('');
      setIsAddInvestorOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi thêm mới pháp nhân');
    } finally {
      setIsSavingInvestor(false);
    }
  };

  // Cập nhật Pháp nhân CĐT/NĐT
  const handleUpdateInvestorEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvestor) return;

    if (!editInvestorName.trim()) {
      toast.error('Vui lòng nhập tên pháp nhân');
      return;
    }

    const val = validateCompanyCode(editInvestorCode, editingInvestor.id);
    if (!val.valid) {
      toast.error(val.error!);
      return;
    }

    setIsSavingInvestor(true);
    try {
      const updated = await updateInvestorEntity(editingInvestor.id, {
        name: editInvestorName.trim(),
        company_code: editInvestorCode.trim() ? editInvestorCode.trim().toUpperCase() : null,
        note: editInvestorNote.trim() || null,
      });
      setInvestorEntities(prev => prev.map(item => item.id === editingInvestor.id ? { ...item, ...updated } : item));
      toast.success(`Đã cập nhật pháp nhân "${updated.name}"`);
      setEditingInvestor(null);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi cập nhật pháp nhân');
    } finally {
      setIsSavingInvestor(false);
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

  // Filtered investor entities
  const filteredInvestorEntities = useMemo(() => {
    return investorEntities.filter(e => {
      if (!investorSearch.trim()) return true;
      const s = investorSearch.toLowerCase();
      const matchName = e.name.toLowerCase().includes(s);
      const matchCode = e.company_code ? e.company_code.toLowerCase().includes(s) : false;
      const matchNote = e.note ? e.note.toLowerCase().includes(s) : false;
      return matchName || matchCode || matchNote;
    });
  }, [investorEntities, investorSearch]);

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
            Quản trị Vùng, Địa bàn, Kho lưu trữ chứng từ, Dự án BĐS, Pháp nhân CĐT/NĐT và Phân quyền người dùng
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsResetModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-200 hover:bg-blue-100 transition-colors shadow-xs cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Khôi phục Dữ liệu chuẩn VMT
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 rounded-t-xl overflow-x-auto gap-1">
        <button
          onClick={() => setActiveTab('areas')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'areas' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MapPin className="w-4 h-4" /> Địa bàn ({areas.length})
        </button>
        <button
          onClick={() => setActiveTab('regions')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'regions' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" /> Vùng ({regions.length})
        </button>
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'warehouses' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <WarehouseIcon className="w-4 h-4" /> Kho lưu trữ ({warehouses.length})
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'projects' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderGit2 className="w-4 h-4" /> Dự án ({projects.length})
        </button>
        <button
          onClick={() => setActiveTab('investor_entities')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'investor_entities' ? 'border-rose-600 text-rose-700 font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building className="w-4 h-4 text-rose-600" /> Pháp nhân CĐT/NĐT ({investorEntities.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'users' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield className="w-4 h-4" /> Tài khoản nội bộ ({profiles.length})
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
            setInvestorEntities(mockStore.getInvestorEntities());
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
                <div className="flex items-center gap-2">
                  <Link
                    to="/user-management"
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Shield className="w-4 h-4" /> Phê duyệt & Hạn tra cứu
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsAddUserOpen(!isAddUserOpen)}
                    className="px-3.5 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" /> Thêm người dùng
                  </button>
                </div>
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

          {/* TAB: QUẢN LÝ TÀI KHOẢN APP_USERS */}
          {activeTab === 'app_users' && (
            <div className="space-y-6">
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#1E3A8A]" />
                    Quản lý danh sách tài khoản (bảng public.app_users)
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Dữ liệu được truy vấn từ bảng <span className="font-mono font-semibold">app_users</span>. Admin có quyền phê duyệt (<span className="font-semibold text-emerald-700">approved</span>), từ chối (<span className="font-semibold text-red-700">rejected</span>) và thiết lập ngày hết hạn tra cứu (<span className="font-semibold text-blue-700">access_expires_at</span>).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadAllData()}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Làm mới danh sách
                </button>
              </div>

              {/* Bộ lọc & Tìm kiếm */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setAppUserFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      appUserFilter === 'all'
                        ? 'bg-[#1E3A8A] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Tất cả ({appUsers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppUserFilter('pending')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                      appUserFilter === 'pending'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    Chờ duyệt ({appUsers.filter(u => u.status === 'pending').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppUserFilter('approved')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                      appUserFilter === 'approved'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Đã duyệt ({appUsers.filter(u => u.status === 'approved').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppUserFilter('rejected')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                      appUserFilter === 'rejected'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
                    }`}
                  >
                    <UserX className="w-3 h-3" />
                    Bị từ chối ({appUsers.filter(u => u.status === 'rejected').length})
                  </button>
                </div>

                <div className="relative min-w-[240px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={appUserSearch}
                    onChange={(e) => setAppUserSearch(e.target.value)}
                    placeholder="Tìm theo tên đăng nhập..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                  />
                  {appUserSearch && (
                    <button
                      type="button"
                      onClick={() => setAppUserSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Bảng danh sách app_users */}
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase">
                    <tr>
                      <th className="px-4 py-3">Tên đăng nhập (Username)</th>
                      <th className="px-4 py-3">Vai trò</th>
                      <th className="px-4 py-3">Trạng thái (status)</th>
                      <th className="px-4 py-3">Hạn tra cứu (access_expires_at)</th>
                      <th className="px-4 py-3 text-right">Thao tác quản trị</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(() => {
                      const filtered = appUsers
                        .filter(u => {
                          if (appUserFilter === 'pending') return u.status === 'pending';
                          if (appUserFilter === 'approved') return u.status === 'approved';
                          if (appUserFilter === 'rejected') return u.status === 'rejected';
                          return true;
                        })
                        .filter(u => {
                          if (!appUserSearch.trim()) return true;
                          return u.username?.toLowerCase().includes(appUserSearch.toLowerCase().trim());
                        });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-sm text-gray-500">
                              <p className="font-medium text-gray-700">Không tìm thấy tài khoản nào phù hợp.</p>
                              <p className="text-xs text-gray-400 mt-1">Hãy thử đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((user) => {
                        const isApproved = user.status === 'approved';
                        const isPending = user.status === 'pending';
                        const isRejected = user.status === 'rejected';

                        // Kiểm tra tình trạng hạn tra cứu
                        let expiryBadge = null;
                        if (!user.access_expires_at) {
                          expiryBadge = (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              <InfinityIcon className="w-3 h-3" />
                              Vô thời hạn
                            </span>
                          );
                        } else {
                          const expireDate = new Date(user.access_expires_at);
                          const isExpired = expireDate.getTime() <= Date.now();
                          expiryBadge = (
                            <div className="space-y-0.5">
                              <div className="text-xs font-semibold text-gray-900">
                                {format(expireDate, 'dd/MM/yyyy HH:mm')}
                              </div>
                              {isExpired ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                  Đã hết hạn
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Còn hiệu lực
                                </span>
                              )}
                            </div>
                          );
                        }

                        return (
                          <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-gray-900 flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#1E3A8A] flex items-center justify-center font-mono text-xs font-bold shrink-0">
                                  {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                                </span>
                                <span className="truncate">{user.username}</span>
                              </div>
                              <div className="text-[11px] text-gray-400 font-mono mt-0.5 ml-9">ID: {user.id}</div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                {user.role || 'user'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              {isApproved && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  approved (Đã duyệt)
                                </span>
                              )}
                              {isPending && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                                  pending (Chờ duyệt)
                                </span>
                              )}
                              {isRejected && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                                  <UserX className="w-3.5 h-3.5 text-red-600" />
                                  rejected (Từ chối)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {expiryBadge}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setApprovingAppUser(user);
                                    if (user.access_expires_at) {
                                      setIsUnlimitedAccess(false);
                                      setCustomApprovalDate(format(new Date(user.access_expires_at), "yyyy-MM-dd'T'HH:mm"));
                                    } else {
                                      setIsUnlimitedAccess(false);
                                      setApprovalDays(7);
                                      setCustomApprovalDate('');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                                  title="Phê duyệt hoặc điều chỉnh hạn tra cứu"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{isApproved ? 'Gia hạn' : 'Phê duyệt'}</span>
                                </button>

                                {!isRejected && (
                                  <button
                                    type="button"
                                    onClick={() => handleRejectAppUser(user)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                                    title="Từ chối quyền truy cập của tài khoản"
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                    <span>Từ chối</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: DANH MỤC PHÁP NHÂN CĐT/NĐT (investor_entities) */}
          {activeTab === 'investor_entities' && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-rose-50/80 p-5 rounded-xl border border-rose-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                    <Building className="w-4 h-4 text-rose-700" />
                    Danh mục Pháp nhân Chủ đầu tư / Nhà đầu tư (CĐT & NĐT)
                  </h3>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    Quản lý danh sách các thực thể pháp nhân (Doanh nghiệp, Công ty thành viên, Quỹ đầu tư) sở hữu Giấy chứng nhận QSDĐ. 
                    Mã pháp nhân được chuẩn hóa viết hoa không dấu để liên kết CĐT mặc định cho Dự án, gán quyền đại diện cho tài khoản NĐT và lưu vết lịch sử chuyển nhượng.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewInvestorName('');
                    setNewInvestorCode('');
                    setNewInvestorNote('');
                    setIsAddInvestorOpen(true);
                  }}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Pháp nhân CĐT/NĐT
                </button>
              </div>

              {/* Toolbar: Search & Count */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên pháp nhân, mã doanh nghiệp hoặc ghi chú..."
                    value={investorSearch}
                    onChange={e => setInvestorSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600 bg-white"
                  />
                  {investorSearch && (
                    <button
                      type="button"
                      onClick={() => setInvestorSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 justify-between sm:justify-end">
                  <span className="text-xs text-gray-500 font-medium">
                    Hiển thị <span className="font-bold text-gray-800">{filteredInvestorEntities.length}</span> / {investorEntities.length} pháp nhân
                  </span>
                  <button
                    type="button"
                    onClick={() => loadAllData()}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Làm mới
                  </button>
                </div>
              </div>

              {/* Table List */}
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-600">
                    <thead className="bg-gray-50/90 text-gray-700 font-semibold border-b border-gray-200 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="px-4 py-3.5 w-12 text-center">STT</th>
                        <th className="px-4 py-3.5">Tên Pháp nhân CĐT/NĐT</th>
                        <th className="px-4 py-3.5 w-48">Mã Pháp nhân</th>
                        <th className="px-4 py-3.5">Ghi chú nghiệp vụ</th>
                        <th className="px-4 py-3.5 w-36">Ngày khởi tạo</th>
                        <th className="px-4 py-3.5 w-28 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredInvestorEntities.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                            <Building className="w-8 h-8 mx-auto mb-2 text-gray-300 opacity-60" />
                            <p className="font-medium">Chưa có pháp nhân CĐT/NĐT nào</p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              Nhấn "Thêm Pháp nhân CĐT/NĐT" để tạo mới các thực thể sở hữu GCN
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredInvestorEntities.map((ent, idx) => (
                          <tr key={ent.id} className="hover:bg-rose-50/20 transition-colors">
                            <td className="px-4 py-3.5 text-center text-gray-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-rose-100 text-rose-800 rounded-md">
                                  <Building className="w-3.5 h-3.5" />
                                </div>
                                <span className="font-semibold text-gray-900 text-sm">{ent.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-mono">
                              {ent.company_code ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                  {ent.company_code}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic text-[11px]">Chưa đặt mã</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-gray-600 max-w-xs truncate">
                              {ent.note || <span className="text-gray-300 italic">—</span>}
                            </td>
                            <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                              {ent.created_at ? format(new Date(ent.created_at), 'dd/MM/yyyy') : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingInvestor(ent);
                                    setEditInvestorName(ent.name);
                                    setEditInvestorCode(ent.company_code || '');
                                    setEditInvestorNote(ent.note || '');
                                  }}
                                  className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                  title="Chỉnh sửa pháp nhân"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteTarget({
                                      type: 'investor_entity',
                                      id: ent.id,
                                      name: ent.name,
                                      warning: 'Lưu ý: Nếu pháp nhân này đang được gán làm CĐT mặc định của Dự án hoặc chủ sở hữu hiện tại của GCN, dữ liệu liên quan có thể bị ảnh hưởng.',
                                    });
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Xóa pháp nhân"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Thêm mới Pháp nhân CĐT/NĐT */}
      {isAddInvestorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Thêm mới Pháp nhân CĐT/NĐT</h3>
                  <p className="text-xs text-gray-500">Đăng ký thực thể sở hữu Giấy chứng nhận quyền sử dụng đất</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddInvestorOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddInvestorEntity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tên pháp nhân đầy đủ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Công ty Cổ phần Tập đoàn VMT, CTCP Đầu tư BĐS Đông Đô..."
                  value={newInvestorName}
                  onChange={e => {
                    setNewInvestorName(e.target.value);
                    // Tự động gợi ý mã nếu mã đang để trống
                    if (!newInvestorCode) {
                      const words = e.target.value.trim().split(/\s+/);
                      if (words.length > 1) {
                        const abbr = words.map(w => w[0]).join('');
                        // Chỉ là gợi ý nhẹ
                      }
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Mã pháp nhân (Company Code)
                  </label>
                  {newInvestorCode && (
                    <button
                      type="button"
                      onClick={() => setNewInvestorCode(normalizeCompanyCode(newInvestorCode))}
                      className="text-[11px] text-rose-700 hover:text-rose-900 hover:underline flex items-center gap-1 font-medium"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Chuẩn hóa (Viết hoa &amp; Không dấu)
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Ví dụ: VMT_GROUP, DONGDO_LAND, VINHOMES"
                  value={newInvestorCode}
                  onChange={e => setNewInvestorCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600 bg-gray-50/50"
                />
                <div className="mt-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <p className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    Gợi ý định dạng chuẩn:
                  </p>
                  <p className="text-[11px] text-slate-600 leading-normal">
                    Viết hoa, không dấu tiếng Việt, không khoảng trắng (chỉ dùng ký tự <code className="font-mono font-bold bg-white px-1 py-0.5 rounded border text-rose-800">A-Z, 0-9, _</code>). 
                    Mã này duy nhất trong hệ thống và không được trùng lặp.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú nghiệp vụ / Mã số thuế / Thông tin liên hệ
                </label>
                <textarea
                  rows={3}
                  placeholder="Thông tin thêm về địa chỉ đăng ký kinh doanh, người đại diện, MST..."
                  value={newInvestorNote}
                  onChange={e => setNewInvestorNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsAddInvestorOpen(false)}
                  disabled={isSavingInvestor}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingInvestor}
                  className="px-5 py-2 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  {isSavingInvestor ? 'Đang lưu...' : 'Thêm pháp nhân'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Chỉnh sửa Pháp nhân CĐT/NĐT */}
      {editingInvestor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-lg">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Sửa thông tin Pháp nhân</h3>
                  <p className="text-xs text-gray-500">Cập nhật tên, mã doanh nghiệp và ghi chú nghiệp vụ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvestor(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateInvestorEntity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tên pháp nhân đầy đủ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editInvestorName}
                  onChange={e => setEditInvestorName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Mã pháp nhân (Company Code)
                  </label>
                  {editInvestorCode && (
                    <button
                      type="button"
                      onClick={() => setEditInvestorCode(normalizeCompanyCode(editInvestorCode))}
                      className="text-[11px] text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Chuẩn hóa (Viết hoa &amp; Không dấu)
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={editInvestorCode}
                  onChange={e => setEditInvestorCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] focus:border-[#1E3A8A] bg-gray-50/50"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Gợi ý: Viết hoa, không dấu tiếng Việt, không khoảng trắng (Ví dụ: VINHOMES, VMT_INVEST, SUN_GROUP). Mã không được trùng lặp.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú nghiệp vụ / Mã số thuế / Thông tin liên hệ
                </label>
                <textarea
                  rows={3}
                  value={editInvestorNote}
                  onChange={e => setEditInvestorNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] focus:border-[#1E3A8A]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditingInvestor(null)}
                  disabled={isSavingInvestor}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingInvestor}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  {isSavingInvestor ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Approve app_user and set access_expires_at */}
      {approvingAppUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Phê duyệt & Thiết lập hạn tra cứu
              </h3>
              <button 
                onClick={() => setApprovingAppUser(null)} 
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="text-xs text-slate-500">Tài khoản được duyệt:</div>
              <div className="font-bold text-slate-900 text-sm flex items-center justify-between">
                <span>{approvingAppUser.username}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">
                  role: {approvingAppUser.role || 'user'}
                </span>
              </div>
            </div>

            <form onSubmit={handleApproveAppUserSubmit} className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-gray-900 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={isUnlimitedAccess}
                    onChange={(e) => setIsUnlimitedAccess(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  <span>Cho phép tra cứu Vô thời hạn (access_expires_at = null)</span>
                </label>
              </div>

              {!isUnlimitedAccess && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      1. Chọn nhanh thời hạn tra cứu:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '24 giờ', days: 1 },
                        { label: '3 ngày', days: 3 },
                        { label: '7 ngày', days: 7 },
                        { label: '30 ngày', days: 30 },
                        { label: '90 ngày', days: 90 },
                        { label: '180 ngày', days: 180 },
                        { label: '365 ngày', days: 365 },
                      ].map((preset) => (
                        <button
                          key={preset.days}
                          type="button"
                          onClick={() => {
                            setApprovalDays(preset.days);
                            setCustomApprovalDate('');
                          }}
                          className={`py-2 px-2 text-xs font-semibold rounded-lg border transition text-center cursor-pointer ${
                            approvalDays === preset.days && !customApprovalDate
                              ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-xs'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      2. Hoặc chỉ định ngày & giờ hết hạn cụ thể:
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <input
                        type="datetime-local"
                        value={customApprovalDate}
                        onChange={(e) => setCustomApprovalDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                <strong>Thời hạn sẽ áp dụng: </strong>
                {isUnlimitedAccess ? (
                  <span className="font-bold text-emerald-800">Vô thời hạn (Không giới hạn ngày tra cứu)</span>
                ) : customApprovalDate ? (
                  format(new Date(customApprovalDate), 'dd/MM/yyyy HH:mm')
                ) : (
                  format(new Date(Date.now() + approvalDays * 24 * 60 * 60 * 1000), 'dd/MM/yyyy HH:mm')
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setApprovingAppUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isApproving}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isApproving ? 'Đang lưu...' : 'Xác nhận Phê duyệt (approved)'}
                </button>
              </div>
            </form>
          </div>
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
          deleteTarget?.type === 'project' ? 'Dự án' :
          deleteTarget?.type === 'investor_entity' ? 'Pháp nhân CĐT/NĐT' : 'Tài khoản'
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
