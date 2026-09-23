import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Profile, Warehouse, Role } from '../../types';
import { 
  fetchProfiles, 
  updateUserRole, 
  updateUserPermissions, 
  updateUserStatus, 
  updateUserManagedWarehouses, 
  createProfile, 
  deleteProfile, 
  ALL_PERMISSIONS,
  DEFAULT_PERMISSIONS_BY_ROLE,
  getEffectivePermissions,
  isCustomizedPermissions
} from '../../api/users';
import { fetchWarehouses } from '../../api/assets';
import { mockStore } from '../../lib/mockStore';
import { 
  Shield, UserPlus, Trash2, Check, Store, RotateCcw, KeyRound 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../ConfirmModal';
import { LoadingFallback } from '../LoadingFallback';
import { AdminResetPasswordModal } from '../user-management/AdminResetPasswordModal';

export const AdminInternalUsers: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetPasswordUser, setResetPasswordUser] = useState<Profile | null>(null);

  // Form states
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('viewer');
  const [newUserManagedWarehouses, setNewUserManagedWarehouses] = useState<string[]>([]);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profs, whs] = await Promise.all([
        fetchProfiles().catch(() => mockStore.getProfiles()),
        fetchWarehouses().catch(() => mockStore.getWarehouses()),
      ]);
      setProfiles(profs || []);
      setWarehouses(whs || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu tài khoản hệ thống');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể thêm người dùng'));
    }
  };

  const handleUserRoleChange = async (userId: string, newRole: Role) => {
    try {
      await updateUserRole(userId, newRole);
      toast.success('Đã cập nhật vai trò & tự động áp dụng bộ quyền mặc định');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi đổi vai trò: ' + (err.message || 'Thao tác thất bại'));
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    try {
      await updateUserStatus(userId, nextStatus);
      toast.success(nextStatus === 'active' ? 'Đã kích hoạt tài khoản' : 'Đã tạm khóa tài khoản');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi cập nhật trạng thái');
    }
  };

  const handleTogglePermission = async (prof: Profile, permKey: string) => {
    // Luôn kế thừa từ tập quyền hiệu lực thực tế (không bao giờ bắt đầu từ rỗng khi permissions là null)
    const currentPerms = getEffectivePermissions(prof);
    const newPerms = currentPerms.includes(permKey)
      ? currentPerms.filter(p => p !== permKey)
      : [...currentPerms, permKey];

    try {
      await updateUserPermissions(prof.id, newPerms);
      toast.success('Đã cập nhật phân quyền chi tiết');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi cập nhật quyền: ' + (err.message || ''));
    }
  };

  const handleResetDefaultPermissions = async (prof: Profile) => {
    try {
      const defaultPerms = DEFAULT_PERMISSIONS_BY_ROLE[prof.role] || [];
      await updateUserPermissions(prof.id, defaultPerms);
      toast.success(`Đã khôi phục bộ quyền mặc định cho vai trò "${prof.role}"`);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi khôi phục quyền mặc định');
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
      loadData();
    } catch (err: any) {
      toast.error('Lỗi cập nhật kho phụ trách');
    }
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteProfile(deleteTarget.id);
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
        message="Đang tải danh sách tài khoản hệ thống..."
        onRetry={loadData}
        onForceLocal={() => {
          setProfiles(mockStore.getProfiles());
          setWarehouses(mockStore.getWarehouses());
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              <option value="admin">Quản trị viên (admin)</option>
              <option value="btc_manager">Ban TC Tập đoàn (btc_manager)</option>
              <option value="warehouse_manager">Quản lý kho (warehouse_manager)</option>
              <option value="capital_dept">Ban Nguồn Vốn (capital_dept)</option>
              <option value="project_dept">Ban PTDA & Ban Đối Ngoại (project_dept)</option>
              <option value="re_dept">Ban KD BĐS (re_dept)</option>
              <option value="investor">Chủ đầu tư / NĐT (investor)</option>
              <option value="supervisor">Ban Giám sát / Kiểm soát (supervisor)</option>
              <option value="viewer">Người tra cứu (viewer)</option>
            </select>
          </div>

          {newUserRole === 'warehouse_manager' && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
              <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-amber-700" /> Chọn các kho Quản lý kho này phụ trách:
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
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 cursor-pointer"
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
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
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
                      className="text-xs border border-gray-300 rounded-md p-1.5 bg-white focus:border-blue-500 font-medium text-gray-800"
                    >
                      <option value="super_admin">Quản trị viên cấp cao (super_admin)</option>
                      <option value="admin">Quản trị viên (admin)</option>
                      <option value="btc_manager">Ban TC Tập đoàn (btc_manager)</option>
                      <option value="warehouse_manager">Quản lý kho (warehouse_manager)</option>
                      <option value="capital_dept">Ban Nguồn Vốn (capital_dept)</option>
                      <option value="project_dept">Ban PTDA & Ban Đối Ngoại (project_dept)</option>
                      <option value="re_dept">Ban KD BĐS (re_dept)</option>
                      <option value="investor">Chủ đầu tư / NĐT (investor)</option>
                      <option value="supervisor">Ban Giám sát / Kiểm soát (supervisor)</option>
                      <option value="viewer">Người tra cứu (viewer)</option>
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
                                className={`px-2 py-0.5 rounded text-[11px] border transition-colors flex items-center gap-1 cursor-pointer ${
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
                    <div className="space-y-2 max-w-2xl">
                      {/* Trạng thái phân quyền (Mặc định hay Tùy biến) */}
                      <div className="flex items-center justify-between text-[11px]">
                        {['super_admin', 'admin', 'btc_manager'].includes(prof.role) ? (
                          <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            Toàn quyền theo vai trò Quản trị
                          </span>
                        ) : isCustomizedPermissions(prof) ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Đã tùy biến quyền riêng
                            </span>
                            <button
                              type="button"
                              onClick={() => handleResetDefaultPermissions(prof)}
                              className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                              title="Khôi phục về bộ quyền mặc định theo vai trò"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Khôi phục mặc định
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Mặc định theo vai trò ({prof.role})
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Danh sách các nút quyền chi tiết */}
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_PERMISSIONS.map((perm) => {
                          const effectivePerms = getEffectivePermissions(prof);
                          const hasPerm = effectivePerms.includes(perm.key);
                          const isSpecialAdmin = ['super_admin', 'admin', 'btc_manager'].includes(prof.role);

                          return (
                            <button
                              key={perm.key}
                              type="button"
                              disabled={isSpecialAdmin}
                              onClick={() => handleTogglePermission(prof, perm.key)}
                              className={`px-2 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1 ${
                                isSpecialAdmin
                                  ? 'bg-blue-50 text-[#1E3A8A] border-blue-200 cursor-default opacity-90'
                                  : hasPerm
                                    ? 'bg-blue-100 text-[#1E3A8A] border-blue-300 hover:bg-blue-200 cursor-pointer font-semibold shadow-2xs'
                                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600 cursor-pointer'
                              }`}
                              title={isSpecialAdmin ? 'Vai trò Quản trị luôn có toàn quyền' : `Bấm để ${hasPerm ? 'bỏ' : 'cấp'} quyền "${perm.label}"`}
                            >
                              {hasPerm && <Check className="w-3 h-3 text-[#1E3A8A]" />}
                              {perm.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      onClick={() => setResetPasswordUser(prof)}
                      className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 p-1.5 rounded-md transition-colors cursor-pointer mr-1"
                      title="Đặt lại mật khẩu"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: prof.id, name: prof.full_name || prof.email })}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition-colors cursor-pointer"
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

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmExecuteDelete}
        title="Xác nhận xóa Tài khoản"
        message={`Bạn có chắc chắn muốn xóa tài khoản "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />

      {/* Reset Password Modal */}
      {resetPasswordUser && (
        <AdminResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
