import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Clock, CheckCircle2, AlertTriangle, ShieldCheck, 
  XCircle, Search, RefreshCw, Calendar, Building, Phone, Mail, 
  ChevronDown, Check, Shield, Lock, Eye, AlertCircle, X, Sparkles
} from 'lucide-react';
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
  updateUserRole 
} from '../api/users';
import { fetchWarehouses } from '../api/assets';
import { Profile, Role, Warehouse } from '../types';
import { checkLookupAccess, formatRemainingDuration } from '../lib/accessGuard';

const ROLE_LABELS: Record<Role, { label: string; color: string; desc: string }> = {
  super_admin: { label: 'Quản trị tối cao', color: 'bg-red-50 text-red-700 border-red-200', desc: 'Toàn quyền cấu hình hệ thống' },
  admin: { label: 'Quản trị viên', color: 'bg-purple-50 text-purple-700 border-purple-200', desc: 'Quản lý người dùng và danh mục' },
  btc_manager: { label: 'Ban Tài Chính (BTC)', color: 'bg-blue-50 text-blue-700 border-blue-200', desc: 'Phê duyệt mượn/thế chấp/xuất kho' },
  warehouse_manager: { label: 'Thủ Kho Trung Tâm/Chi Nhánh', color: 'bg-amber-50 text-amber-700 border-amber-200', desc: 'Quản lý kho sổ & duyệt truy cập' },
  capital_dept: { label: 'Ban Nguồn Vốn', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'Lập đề xuất mượn/thế chấp' },
  project_dept: { label: 'Ban Quản Lý Dự Án', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', desc: 'Đề xuất mượn & tách sổ' },
  re_dept: { label: 'Ban Kinh Doanh BĐS', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', desc: 'Đề xuất bán & bàn giao' },
  viewer: { label: 'Khách Tra Cứu', color: 'bg-slate-50 text-slate-700 border-slate-200', desc: 'Tra cứu thông tin GCN' },
  user: { label: 'Tra Cứu Tạm Thời', color: 'bg-orange-50 text-orange-700 border-orange-200', desc: 'Tài khoản tự đăng ký' },
};

export const UserManagement: React.FC = () => {
  const { profile: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'expired' | 'internal'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modal: Approve user & set access_expires_at
  const [approvingUser, setApprovingUser] = useState<Profile | null>(null);
  const [expiryPreset, setExpiryPreset] = useState<'24h' | '3d' | '7d' | '30d' | '90d' | 'custom'>('7d');
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // Modal: Extend user access
  const [extendingUser, setExtendingUser] = useState<Profile | null>(null);
  const [extendPreset, setExtendPreset] = useState<'24h' | '3d' | '7d' | '30d' | 'custom'>('7d');
  const [extendCustomDate, setExtendCustomDate] = useState<string>('');
  const [isExtending, setIsExtending] = useState<boolean>(false);

  // Modal: Create direct user (Admin/Warehouse Manager)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('user');
  const [newPhone, setNewPhone] = useState('');
  const [newOrganization, setNewOrganization] = useState('');
  const [newExpiryPreset, setNewExpiryPreset] = useState<'7d' | '30d' | '90d' | 'permanent' | 'custom'>('30d');
  const [newCustomExpiry, setNewCustomExpiry] = useState('');
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userList, whList] = await Promise.all([
        fetchProfiles(),
        fetchWarehouses(),
      ]);
      setProfiles(userList || []);
      setWarehouses(whList || []);
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

  // Set default custom date to 7 days from now
  useEffect(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const isoString = d.toISOString().slice(0, 16);
    setCustomExpiryDate(isoString);
    setExtendCustomDate(isoString);
    setNewCustomExpiry(isoString);
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    const now = Date.now();
    let pendingCount = 0;
    let approvedActiveCount = 0;
    let expiredCount = 0;
    let internalCount = 0;

    profiles.forEach(p => {
      const isInternal = ['super_admin', 'admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept'].includes(p.role);
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
        const isInternal = ['super_admin', 'admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept'].includes(p.role);
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

  // Calculate expiration date based on preset
  const calculateExpiryDate = (preset: string, customDate: string): string => {
    const now = Date.now();
    if (preset === '24h') {
      return new Date(now + 24 * 60 * 60 * 1000).toISOString();
    }
    if (preset === '3d') {
      return new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (preset === '7d') {
      return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (preset === '30d') {
      return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (preset === '90d') {
      return new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (preset === 'custom' && customDate) {
      return new Date(customDate).toISOString();
    }
    return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  };

  // Handle Approve user
  const handleConfirmApproval = async () => {
    if (!approvingUser) return;
    setIsApproving(true);
    try {
      const expiresAt = calculateExpiryDate(expiryPreset, customExpiryDate);
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

  // Handle Extend user
  const handleConfirmExtend = async () => {
    if (!extendingUser) return;
    setIsExtending(true);
    try {
      const expiresAt = calculateExpiryDate(extendPreset, extendCustomDate);
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
  const handleCreateDirectUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error('Vui lòng nhập Email');
      return;
    }
    if (!newFullName.trim()) {
      toast.error('Vui lòng nhập Họ và tên');
      return;
    }

    setIsCreating(true);
    try {
      let expiresAt: string | null = null;
      if (newRole === 'user' || newRole === 'viewer') {
        if (newExpiryPreset !== 'permanent') {
          expiresAt = calculateExpiryDate(newExpiryPreset, newCustomExpiry);
        }
      }

      const created = await createUserDirect({
        email: newEmail.trim(),
        full_name: newFullName.trim(),
        username: newUsername.trim() || undefined,
        password: newPassword.trim() || '123456',
        role: newRole,
        status: (newRole === 'user' && expiresAt) ? 'approved' : 'active',
        access_expires_at: expiresAt,
        phone: newPhone.trim() || undefined,
        organization: newOrganization.trim() || undefined,
        managed_warehouse_ids: newRole === 'warehouse_manager' ? selectedWarehouseIds : null,
      });

      setProfiles(prev => [created, ...prev]);
      toast.success(
        `Tạo tài khoản ${created.full_name} (${created.email}) thành công! Tài khoản đã được kích hoạt trực tiếp ngay lập tức.`,
        { duration: 5000 }
      );
      // Reset form
      setNewFullName('');
      setNewEmail('');
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setNewPhone('');
      setNewOrganization('');
      setSelectedWarehouseIds([]);
      setIsCreateModalOpen(false);
    } catch (err: any) {
      console.error('Lỗi tạo tài khoản trực tiếp:', err);
      toast.error(err.message || 'Không thể tạo tài khoản');
    } finally {
      setIsCreating(false);
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
              <h1 className="text-2xl font-bold text-gray-900">Quản lý người dùng & Phê duyệt tra cứu</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Phê duyệt tài khoản tự đăng ký tra cứu tạm thời và quản lý ủy quyền dành cho Ban Quản Trị & Thủ Kho
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg transition"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tạo tài khoản trực tiếp</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Card */}
        <button
          onClick={() => setActiveTab('pending')}
          className={`p-5 rounded-xl border text-left transition-all ${
            activeTab === 'pending'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/50 shadow-sm'
              : 'bg-white border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {stats.pendingCount > 0 && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                )}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Chờ phê duyệt
            </span>
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-amber-900">{stats.pendingCount}</span>
            <span className="text-xs text-amber-700 font-medium">tài khoản tự đăng ký</span>
          </div>
        </button>

        {/* Active Approved Card */}
        <button
          onClick={() => setActiveTab('approved')}
          className={`p-5 rounded-xl border text-left transition-all ${
            activeTab === 'approved'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/50 shadow-sm'
              : 'bg-white border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/40 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Đã duyệt & Còn hạn
            </span>
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-900">{stats.approvedActiveCount}</span>
            <span className="text-xs text-emerald-700 font-medium">đang có quyền tra cứu</span>
          </div>
        </button>

        {/* Expired Card */}
        <button
          onClick={() => setActiveTab('expired')}
          className={`p-5 rounded-xl border text-left transition-all ${
            activeTab === 'expired'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/50 shadow-sm'
              : 'bg-white border-gray-200 hover:border-rose-300 hover:bg-rose-50/40 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
              Hết hạn tra cứu
            </span>
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-rose-900">{stats.expiredCount}</span>
            <span className="text-xs text-rose-700 font-medium">cần gia hạn lại</span>
          </div>
        </button>

        {/* Total Card */}
        <button
          onClick={() => setActiveTab('all')}
          className={`p-5 rounded-xl border text-left transition-all ${
            activeTab === 'all'
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400/50 shadow-sm'
              : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-800">
              Tổng số người dùng
            </span>
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-blue-900">{stats.total}</span>
            <span className="text-xs text-blue-700 font-medium">toàn hệ thống</span>
          </div>
        </button>
      </div>

      {/* Tabs & Search Filter */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-gray-200 px-4 flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
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
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeTab === 'approved'
                ? 'border-emerald-600 text-emerald-800 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Đã duyệt & Còn hạn</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              {stats.approvedActiveCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('expired')}
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
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
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
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
            className={`pb-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
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
              <option value="user">Người dùng tra cứu tạm thời (user)</option>
              <option value="viewer">Khách tra cứu (viewer)</option>
              <option value="warehouse_manager">Thủ kho</option>
              <option value="btc_manager">Ban Tài Chính</option>
              <option value="capital_dept">Ban Nguồn Vốn</option>
              <option value="project_dept">Ban Quản Lý Dự Án</option>
              <option value="re_dept">Ban Kinh Doanh BĐS</option>
              <option value="admin">Quản trị viên</option>
              <option value="super_admin">Quản trị tối cao</option>
            </select>
          </div>
        </div>

        {/* User Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#1E3A8A]" />
              <p className="text-sm">Đang tải danh sách người dùng...</p>
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-base font-semibold text-gray-800">Không có người dùng nào</h3>
              <p className="text-sm text-gray-500 mt-1">
                {activeTab === 'pending'
                  ? 'Hiện không có tài khoản nào đang chờ phê duyệt.'
                  : 'Không tìm thấy tài khoản phù hợp với điều kiện tìm kiếm.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3.5">Người dùng / Liên hệ</th>
                  <th className="px-6 py-3.5">Đơn vị & Mục đích</th>
                  <th className="px-6 py-3.5">Vai trò</th>
                  <th className="px-6 py-3.5">Trạng thái & Thời hạn</th>
                  <th className="px-6 py-3.5 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredProfiles.map(u => {
                  const accessCheck = checkLookupAccess(u);
                  const isInternal = ['super_admin', 'admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept'].includes(u.role);
                  const roleMeta = ROLE_LABELS[u.role] || { label: u.role, color: 'bg-gray-100 text-gray-700', desc: '' };

                  return (
                    <tr key={u.id} className="hover:bg-gray-50/80 transition">
                      {/* Name & Contact */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{u.full_name || 'Chưa cập nhật tên'}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          <span>{u.email}</span>
                        </div>
                        {u.phone && (
                          <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                            <span>{u.phone}</span>
                          </div>
                        )}
                        {u.created_at && (
                          <div className="text-[11px] text-gray-400 mt-1">
                            Tạo ngày: {format(new Date(u.created_at), 'dd/MM/yyyy HH:mm')}
                          </div>
                        )}
                      </td>

                      {/* Organization & Purpose */}
                      <td className="px-6 py-4 max-w-xs">
                        {u.organization ? (
                          <div className="font-medium text-gray-800 text-xs flex items-center gap-1.5">
                            <Building className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="truncate" title={u.organization}>{u.organization}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Cá nhân</span>
                        )}
                        {u.purpose && (
                          <div className="text-xs text-gray-500 mt-1 line-clamp-2" title={u.purpose}>
                            {u.purpose}
                          </div>
                        )}
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${roleMeta.color}`}>
                          {roleMeta.label}
                        </span>
                        {u.role === 'warehouse_manager' && u.managed_warehouse_ids && u.managed_warehouse_ids.length > 0 && (
                          <div className="text-[11px] text-gray-500 mt-1">
                            Quản lý {u.managed_warehouse_ids.length} kho sổ
                          </div>
                        )}
                      </td>

                      {/* Status & Expiry */}
                      <td className="px-6 py-4">
                        {u.status === 'pending' && (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                              <Clock className="w-3.5 h-3.5 animate-pulse" />
                              Chờ phê duyệt
                            </span>
                            <div className="text-[11px] text-amber-700 mt-1">
                              Chưa được phép tra cứu dữ liệu
                            </div>
                          </div>
                        )}

                        {u.status === 'approved' && (
                          <div>
                            {accessCheck.allowed ? (
                              <div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Đã duyệt • Còn {accessCheck.remainingText}
                                </span>
                                {u.access_expires_at && (
                                  <div className="text-[11px] text-gray-500 mt-1">
                                    Hết hạn: {format(new Date(u.access_expires_at), 'dd/MM/yyyy HH:mm')}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Đã hết hạn tra cứu
                                </span>
                                {u.access_expires_at && (
                                  <div className="text-[11px] text-rose-600 mt-1">
                                    Hết hạn lúc: {format(new Date(u.access_expires_at), 'dd/MM/yyyy HH:mm')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {u.status === 'active' && (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Đang hoạt động (Nội bộ)
                            </span>
                          </div>
                        )}

                        {u.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            <XCircle className="w-3.5 h-3.5" />
                            Đã từ chối
                          </span>
                        )}

                        {u.status === 'disabled' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            <Lock className="w-3.5 h-3.5" />
                            Đã khóa truy cập
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Pending actions */}
                          {u.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setApprovingUser(u)}
                                className="px-3 py-1.5 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 shadow-sm transition flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Duyệt & Cấp hạn</span>
                              </button>
                              <button
                                onClick={() => handleReject(u)}
                                className="px-2.5 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-rose-50 hover:text-rose-700 transition"
                                title="Từ chối yêu cầu"
                              >
                                <span>Từ chối</span>
                              </button>
                            </>
                          )}

                          {/* Approved actions: Extend & Lock */}
                          {u.status === 'approved' && (
                            <>
                              <button
                                onClick={() => setExtendingUser(u)}
                                className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 shadow-sm transition flex items-center gap-1"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Gia hạn / Đổi hạn</span>
                              </button>
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-gray-100 transition"
                                title="Khóa tài khoản"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {/* Active / Disabled actions */}
                          {u.status !== 'pending' && u.status !== 'approved' && (
                            <button
                              onClick={() => handleToggleStatus(u)}
                              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                                u.status === 'disabled'
                                  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  : 'bg-gray-100 text-gray-700 hover:bg-rose-50 hover:text-rose-700'
                              }`}
                            >
                              {u.status === 'disabled' ? 'Mở khóa' : 'Khóa'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal 1: Phê duyệt tài khoản & Thiết lập thời gian tra cứu tạm thời */}
      {approvingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Phê duyệt & Cấp hạn tra cứu</h3>
                  <p className="text-xs text-gray-500">Cập nhật status = 'approved' và thiết lập thời gian tra cứu tạm thời</p>
                </div>
              </div>
              <button
                onClick={() => setApprovingUser(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Details */}
            <div className="my-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Họ và tên:</span>
                <span className="font-semibold text-gray-900">{approvingUser.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email:</span>
                <span className="font-medium text-gray-800">{approvingUser.email}</span>
              </div>
              {approvingUser.organization && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Cơ quan:</span>
                  <span className="font-medium text-gray-800 text-right max-w-xs truncate">{approvingUser.organization}</span>
                </div>
              )}
              {approvingUser.purpose && (
                <div className="flex flex-col gap-1 pt-1 border-t border-gray-200">
                  <span className="text-gray-500 text-xs">Mục đích tra cứu:</span>
                  <span className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200">{approvingUser.purpose}</span>
                </div>
              )}
            </div>

            {/* Expiry Presets */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-800">
                Chọn thời gian tra cứu tạm thời:
              </label>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: '24h', label: '24 Giờ (1 Ngày)' },
                  { key: '3d', label: '3 Ngày' },
                  { key: '7d', label: '7 Ngày (1 Tuần)' },
                  { key: '30d', label: '30 Ngày (1 Tháng)' },
                  { key: '90d', label: '90 Ngày (3 Tháng)' },
                  { key: 'custom', label: 'Tùy chỉnh' },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setExpiryPreset(item.key as any)}
                    className={`py-2 px-2 text-xs font-medium rounded-lg border text-center transition ${
                      expiryPreset === item.key
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-sm'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {expiryPreset === 'custom' && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Ngày & Giờ hết hạn chính xác:
                  </label>
                  <input
                    type="datetime-local"
                    value={customExpiryDate}
                    onChange={e => setCustomExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              )}

              {/* Calculated Expiry Preview */}
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex items-start gap-2">
                <Clock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900">
                  <span>Thời hạn truy cập sẽ kết thúc vào: </span>
                  <strong className="block text-sm text-emerald-950 mt-0.5">
                    {format(new Date(calculateExpiryDate(expiryPreset, customExpiryDate)), 'HH:mm:ss - dd/MM/yyyy')}
                  </strong>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setApprovingUser(null)}
                disabled={isApproving}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                disabled={isApproving}
                className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition flex items-center gap-2"
              >
                {isApproving && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Xác nhận Phê duyệt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Gia hạn thời gian tra cứu tạm thời */}
      {extendingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Gia hạn quyền tra cứu</h3>
                  <p className="text-xs text-gray-500">Cập nhật thời gian hết hạn mới (access_expires_at)</p>
                </div>
              </div>
              <button
                onClick={() => setExtendingUser(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
              <div className="font-semibold text-gray-900">{extendingUser.full_name} ({extendingUser.email})</div>
              {extendingUser.access_expires_at && (
                <div className="text-xs text-gray-500 mt-1">
                  Hạn hiện tại: {format(new Date(extendingUser.access_expires_at), 'dd/MM/yyyy HH:mm')}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-800">
                Chọn thời gian gia hạn:
              </label>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: '24h', label: '+24 Giờ' },
                  { key: '3d', label: '+3 Ngày' },
                  { key: '7d', label: '+7 Ngày' },
                  { key: '30d', label: '+30 Ngày' },
                  { key: 'custom', label: 'Chọn ngày cụ thể' },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setExtendPreset(item.key as any)}
                    className={`py-2 px-2 text-xs font-medium rounded-lg border text-center transition ${
                      extendPreset === item.key
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {extendPreset === 'custom' && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Ngày & Giờ kết thúc mới:
                  </label>
                  <input
                    type="datetime-local"
                    value={extendCustomDate}
                    onChange={e => setExtendCustomDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              )}

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-start gap-2">
                <Clock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900">
                  <span>Hạn mới sẽ kéo dài đến: </span>
                  <strong className="block text-sm text-blue-950 mt-0.5">
                    {format(new Date(calculateExpiryDate(extendPreset, extendCustomDate)), 'HH:mm:ss - dd/MM/yyyy')}
                  </strong>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setExtendingUser(null)}
                disabled={isExtending}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmExtend}
                disabled={isExtending}
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition flex items-center gap-2"
              >
                {isExtending && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Cập nhật Hạn Tra Cứu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Admin chủ động tạo mới tài khoản trực tiếp (kích hoạt ngay) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#1E3A8A] text-white rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Tạo tài khoản trực tiếp</h3>
                  <p className="text-xs text-gray-500">Tài khoản được kích hoạt ngay, không cần qua bước chờ duyệt</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDirectUser} className="space-y-4 my-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>Kích hoạt trực tiếp:</strong> Tài khoản tạo bởi Ban Quản Trị / Thủ kho có trạng thái kích hoạt ngay lập tức mà không cần qua quy trình duyệt đơn.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Họ và tên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nguyễn Văn A"
                    value={newFullName}
                    onChange={e => setNewFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Email đăng nhập <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={newEmail}
                    onChange={e => {
                      setNewEmail(e.target.value);
                      if (!newUsername) {
                        setNewUsername(e.target.value.split('@')[0]);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Tên đăng nhập (Username)
                  </label>
                  <input
                    type="text"
                    placeholder="Tùy chọn (mặc định lấy từ email)"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Mật khẩu khởi tạo
                  </label>
                  <input
                    type="text"
                    placeholder="Mặc định: 123456"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Vai trò tài khoản <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as Role)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] bg-white font-medium"
                  >
                    <option value="user">Tra cứu tạm thời (user)</option>
                    <option value="viewer">Khách tra cứu (viewer)</option>
                    <option value="warehouse_manager">Thủ kho (warehouse_manager)</option>
                    <option value="btc_manager">Ban Tài Chính (btc_manager)</option>
                    <option value="capital_dept">Ban Nguồn Vốn (capital_dept)</option>
                    <option value="project_dept">Ban Quản Lý Dự Án (project_dept)</option>
                    <option value="re_dept">Ban Kinh Doanh BĐS (re_dept)</option>
                    <option value="admin">Quản trị viên (admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Số điện thoại liên hệ
                  </label>
                  <input
                    type="tel"
                    placeholder="0912345678"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Cơ quan / Đơn vị công tác
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Ngân hàng Vietcombank, Cty Thẩm định giá, v.v."
                  value={newOrganization}
                  onChange={e => setNewOrganization(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              {/* Expiry option for user / viewer */}
              {(newRole === 'user' || newRole === 'viewer') && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-2">
                  <label className="block text-xs font-semibold text-orange-950">
                    Thời gian tra cứu tạm thời:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: '7d', label: '7 Ngày' },
                      { key: '30d', label: '30 Ngày' },
                      { key: '90d', label: '90 Ngày' },
                      { key: 'permanent', label: 'Không giới hạn' },
                      { key: 'custom', label: 'Tùy chỉnh' },
                    ].map(item => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setNewExpiryPreset(item.key as any)}
                        className={`py-1.5 px-2 text-xs font-medium rounded-lg border text-center transition ${
                          newExpiryPreset === item.key
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-white text-gray-700 border-orange-200 hover:bg-orange-100/50'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {newExpiryPreset === 'custom' && (
                    <input
                      type="datetime-local"
                      value={newCustomExpiry}
                      onChange={e => setNewCustomExpiry(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg mt-2"
                    />
                  )}
                </div>
              )}

              {/* Warehouse selector for warehouse_manager */}
              {newRole === 'warehouse_manager' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <label className="block text-xs font-semibold text-amber-950">
                    Phân công kho sổ phụ trách:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {warehouses.map(wh => (
                      <label key={wh.id} className="flex items-center gap-2 text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedWarehouseIds.includes(wh.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedWarehouseIds(prev => [...prev, wh.id]);
                            } else {
                              setSelectedWarehouseIds(prev => prev.filter(id => id !== wh.id));
                            }
                          }}
                          className="rounded text-[#1E3A8A]"
                        />
                        <span className="truncate">{wh.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreating}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition flex items-center gap-2"
                >
                  {isCreating && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Kích hoạt ngay</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
