import React, { useState, useEffect, useMemo } from 'react';
import { Users, UserPlus, RefreshCw, Search } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { 
  fetchProfiles, 
  approveUserProfile, 
  extendUserAccess, 
  rejectUserProfile, 
  createUserDirect, 
  updateUserStatus,
  updateUserDirect,
  deleteProfile
} from '../api/users';
import { fetchWarehouses } from '../api/assets';
import { fetchInvestorEntities } from '../api/investorEntities';
import { Profile, Warehouse, InvestorEntity } from '../types';
import { UserManagementStats } from '../components/user-management/UserManagementStats';
import { UserTable } from '../components/user-management/UserTable';
import { ApproveUserModal } from '../components/user-management/ApproveUserModal';
import { ExtendAccessModal } from '../components/user-management/ExtendAccessModal';
import { CreateUserModal } from '../components/user-management/CreateUserModal';
import { EditUserModal } from '../components/user-management/EditUserModal';
import { AdminResetPasswordModal } from '../components/user-management/AdminResetPasswordModal';
import { ConfirmModal } from '../components/ConfirmModal';

export const UserManagement: React.FC = () => {
  const { profile: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [investorEntities, setInvestorEntities] = useState<InvestorEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'expired' | 'internal'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals state
  const [approvingUser, setApprovingUser] = useState<Profile | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  const [extendingUser, setExtendingUser] = useState<Profile | null>(null);
  const [isExtending, setIsExtending] = useState<boolean>(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Cấp bậc (khớp với Edge Function admin-delete-user; server vẫn kiểm tra lại)
  const ROLE_RANK: Record<string, number> = { super_admin: 100, admin: 80, btc_manager: 60, warehouse_manager: 40 };
  const rankOf = (role?: string | null) => ROLE_RANK[role ?? ''] ?? 0;
  const canDeleteUser = (u: Profile): boolean => {
    if (!currentUser || !['super_admin', 'admin'].includes(currentUser.role)) return false;
    if (u.id === currentUser.id) return false;
    return currentUser.role === 'super_admin' || rankOf(currentUser.role) > rankOf(u.role);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProfile(deleteTarget.id);
      toast.success(`Đã xóa tài khoản "${deleteTarget.full_name || deleteTarget.email}"`);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err?.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [userList, whList, invList] = await Promise.all([
        fetchProfiles(),
        fetchWarehouses(),
        fetchInvestorEntities(),
      ]);
      setProfiles(userList || []);
      setWarehouses(whList || []);
      setInvestorEntities(invList || []);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu người dùng:', err);
      toast.error('Không thể tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    const now = Date.now();
    let pendingCount = 0;
    let approvedActiveCount = 0;
    let expiredCount = 0;
    let internalCount = 0;

    profiles.forEach(p => {
      const isInternal = ['super_admin', 'admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor'].includes(p.role);
      if (isInternal) {
        internalCount++;
      }

      if (p.status === 'pending') {
        pendingCount++;
      } else if (p.status === 'approved') {
        if (!p.access_expires_at) {
          expiredCount++;
        } else {
          const expTime = new Date(p.access_expires_at).getTime();
          if (isNaN(expTime) || expTime <= now) {
            expiredCount++;
          } else {
            approvedActiveCount++;
          }
        }
      } else if (p.status === 'active' && !isInternal) {
        approvedActiveCount++;
      }
    });

    return {
      total: profiles.length,
      pendingCount,
      approvedActiveCount,
      expiredCount,
      internalCount,
    };
  }, [profiles]);

  // Filter profiles based on activeTab, search, role
  const filteredProfiles = useMemo(() => {
    const now = Date.now();
    return profiles.filter(p => {
      // 1. Tab filter
      if (activeTab === 'pending') {
        if (p.status !== 'pending') return false;
      } else if (activeTab === 'approved') {
        if (p.status !== 'approved') return false;
        if (!p.access_expires_at) return false;
        const exp = new Date(p.access_expires_at).getTime();
        if (isNaN(exp) || exp <= now) return false;
      } else if (activeTab === 'expired') {
        if (p.status === 'approved') {
          if (!p.access_expires_at) return true;
          const exp = new Date(p.access_expires_at).getTime();
          if (isNaN(exp) || exp <= now) return true;
          return false;
        }
        return false;
      } else if (activeTab === 'internal') {
        const isInternal = ['super_admin', 'admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor'].includes(p.role);
        if (!isInternal) return false;
      }

      // 2. Role filter
      if (roleFilter !== 'all' && p.role !== roleFilter) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (p.full_name || '').toLowerCase().includes(q);
        const matchEmail = (p.email || '').toLowerCase().includes(q);
        const matchUser = (p.username || '').toLowerCase().includes(q);
        const matchOrg = (p.organization || '').toLowerCase().includes(q);
        const matchPhone = (p.phone || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchUser && !matchOrg && !matchPhone) {
          return false;
        }
      }

      return true;
    });
  }, [profiles, activeTab, roleFilter, searchQuery]);

  // Handle Approve user
  const handleApprove = async (expiresAt: string) => {
    if (!approvingUser) return;
    setIsApproving(true);
    try {
      const updated = await approveUserProfile(approvingUser.id, expiresAt, currentUser?.id);
      if (updated) {
        setProfiles(prev => prev.map(p => p.id === approvingUser.id ? updated : p));
        toast.success(
          `Đã phê duyệt tài khoản ${approvingUser.full_name || approvingUser.email} thành công! Thời hạn tra cứu đến ${format(new Date(expiresAt), 'dd/MM/yyyy HH:mm')}.`,
          { duration: 5000 }
        );
      }
      setApprovingUser(null);
    } catch (err) {
      console.error('Lỗi duyệt tài khoản:', err);
      toast.error('Có lỗi xảy ra khi duyệt tài khoản');
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Extend user access
  const handleExtend = async (expiresAt: string) => {
    if (!extendingUser) return;
    setIsExtending(true);
    try {
      const updated = await extendUserAccess(extendingUser.id, expiresAt);
      if (updated) {
        setProfiles(prev => prev.map(p => p.id === extendingUser.id ? updated : p));
        toast.success(
          `Gia hạn quyền tra cứu thành công! Thời hạn mới đến ${format(new Date(expiresAt), 'dd/MM/yyyy HH:mm')}.`,
          { duration: 5000 }
        );
      }
      setExtendingUser(null);
    } catch (err) {
      console.error('Lỗi gia hạn tài khoản:', err);
      toast.error('Có lỗi xảy ra khi gia hạn tài khoản');
    } finally {
      setIsExtending(false);
    }
  };

  // Handle Reject user
  const handleReject = async (user: Profile) => {
    if (!window.confirm(`Bạn có chắc chắn muốn từ chối yêu cầu đăng ký của ${user.full_name || user.email}?`)) {
      return;
    }
    try {
      const updated = await rejectUserProfile(user.id);
      if (updated) {
        setProfiles(prev => prev.map(p => p.id === user.id ? updated : p));
        toast.success(`Đã từ chối tài khoản ${user.full_name || user.email}`);
      }
    } catch (err) {
      console.error('Lỗi từ chối tài khoản:', err);
      toast.error('Không thể từ chối tài khoản');
    }
  };

  // Handle Toggle status (lock/unlock)
  const handleToggleStatus = async (user: Profile) => {
    const newStatus = (user.status === 'active' || user.status === 'approved') ? 'disabled' : 'active';
    const actionText = newStatus === 'disabled' ? 'khóa' : 'mở khóa';
    if (!window.confirm(`Bạn có chắc muốn ${actionText} tài khoản ${user.full_name || user.email}?`)) {
      return;
    }
    try {
      const updated = await updateUserStatus(user.id, newStatus);
      if (updated) {
        setProfiles(prev => prev.map(p => p.id === user.id ? { ...p, status: newStatus } : p));
        toast.success(`Đã ${actionText} tài khoản thành công`);
      }
    } catch (err) {
      console.error('Lỗi cập nhật trạng thái:', err);
      toast.error('Không thể thay đổi trạng thái');
    }
  };

  // Handle Create Direct User
  const handleCreateDirectUser = async (userData: any) => {
    setIsCreating(true);
    try {
      const created = await createUserDirect(userData);
      setProfiles(prev => [created, ...prev.filter(p => p.id !== created.id)]);
      toast.success(
        `Tạo tài khoản ${created.full_name} (${created.email}) thành công! Tài khoản đã được kích hoạt trực tiếp ngay lập tức.`,
        { duration: 5000 }
      );
      setIsCreateModalOpen(false);
    } catch (err: any) {
      console.error('Lỗi tạo tài khoản trực tiếp:', err);
      toast.error(err.message || 'Không thể tạo tài khoản');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Save User Edit
  const handleSaveUserEdit = async (updates: Partial<Profile>) => {
    if (!editingUser) return;
    setIsSavingEdit(true);
    try {
      const updated = await updateUserDirect(editingUser.id, updates);
      setProfiles(prev => prev.map(p => p.id === editingUser.id ? { ...p, ...updated } : p));
      toast.success(`Cập nhật thông tin tài khoản ${updated.full_name} thành công!`);
      setEditingUser(null);
    } catch (err: any) {
      console.error('Lỗi cập nhật người dùng:', err);
      toast.error(err.message || 'Không thể cập nhật người dùng');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-[#1E3A8A] rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quản lý người dùng &amp; Phê duyệt tra cứu</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Phê duyệt tài khoản tự đăng ký tra cứu tạm thời và quản lý ủy quyền dành cho Ban Quản Trị &amp; Quản Lý Kho
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg transition cursor-pointer"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tạo tài khoản trực tiếp</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <UserManagementStats
        stats={stats}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Tabs & Search Filter & User Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-gray-200 px-4 flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'pending'
                ? 'border-amber-600 text-amber-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Chờ duyệt</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              stats.pendingCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {stats.pendingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('approved')}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'approved'
                ? 'border-emerald-600 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Đã duyệt &amp; Còn hạn</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              {stats.approvedActiveCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('expired')}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'expired'
                ? 'border-rose-600 text-rose-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Hết hạn tra cứu</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold">
              {stats.expiredCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('internal')}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'internal'
                ? 'border-[#1E3A8A] text-[#1E3A8A] font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Cán bộ nội bộ</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
              {stats.internalCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'all'
                ? 'border-gray-800 text-gray-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Tất cả</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
              {stats.total}
            </span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo họ tên, email, cơ quan..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:border-[#1E3A8A]"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="text-sm bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
            >
              <option value="all">Tất cả vai trò</option>
              <option value="user">Tra cứu tạm thời (user)</option>
              <option value="viewer">Khách tra cứu (viewer)</option>
              <option value="warehouse_manager">Quản lý kho</option>
              <option value="btc_manager">Ban Tài Chính</option>
              <option value="capital_dept">Phòng Nguồn Vốn</option>
              <option value="project_dept">Ban PTDA & Ban Đối Ngoại</option>
              <option value="re_dept">Khối SPG</option>
              <option value="supervisor">Quản lý (Xem báo cáo/Truy vấn)</option>
              <option value="investor">Chủ đầu tư/Nhà đầu tư (CĐT/NĐT)</option>
              <option value="admin">Quản trị viên</option>
              <option value="super_admin">Quản trị tối cao</option>
            </select>
          </div>
        </div>

        {/* User Table */}
        <UserTable
          profiles={filteredProfiles}
          loading={loading}
          warehouses={warehouses}
          investorEntities={investorEntities}
          activeTab={activeTab}
          onApproveClick={setApprovingUser}
          onRejectClick={handleReject}
          onExtendClick={setExtendingUser}
          onToggleStatus={handleToggleStatus}
          onEditClick={setEditingUser}
          onResetPasswordClick={setResetPasswordUser}
          onDeleteClick={setDeleteTarget}
          canDeleteUser={canDeleteUser}
        />
      </div>

      {/* Modal 1: Approve User & Set Expiry */}
      {approvingUser && (
        <ApproveUserModal
          user={approvingUser}
          onClose={() => setApprovingUser(null)}
          onApprove={handleApprove}
          loading={isApproving}
        />
      )}

      {/* Modal 2: Extend User Access */}
      {extendingUser && (
        <ExtendAccessModal
          user={extendingUser}
          onClose={() => setExtendingUser(null)}
          onExtend={handleExtend}
          loading={isExtending}
        />
      )}

      {/* Modal 3: Create Direct User */}
      {isCreateModalOpen && (
        <CreateUserModal
          warehouses={warehouses}
          investorEntities={investorEntities}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateDirectUser}
          loading={isCreating}
        />
      )}

      {/* Modal 4: Edit User & Permissions */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          warehouses={warehouses}
          investorEntities={investorEntities}
          onClose={() => setEditingUser(null)}
          onSave={handleSaveUserEdit}
          loading={isSavingEdit}
        />
      )}

      {/* Modal 5: Admin Reset Password */}
      {resetPasswordUser && (
        <AdminResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
          onSuccess={loadData}
        />
      )}

      {/* Modal 6: Confirm Delete User */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Xác nhận xóa tài khoản"
        message={`Bạn có chắc chắn muốn xóa hẳn tài khoản "${deleteTarget?.full_name || deleteTarget?.email}" (${deleteTarget?.email})? Thao tác này không thể hoàn tác. Nếu tài khoản đã phát sinh dữ liệu nghiệp vụ, hệ thống sẽ từ chối và bạn nên dùng "Khóa" thay thế.`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />
    </div>
  );
};

export default UserManagement;