import React, { useState } from 'react';
import { Profile, Role, Warehouse, InvestorEntity } from '../../types';
import { Edit2, Building, Calendar, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { InvestorEntityPicker, OrganizationEntityInput } from './InvestorEntityPicker';

interface EditUserModalProps {
  user: Profile;
  warehouses: Warehouse[];
  investorEntities: InvestorEntity[];
  onClose: () => void;
  onSave: (updates: Partial<Profile>) => Promise<void>;
  loading: boolean;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  warehouses,
  investorEntities,
  onClose,
  onSave,
  loading,
}) => {
  const [editFullName, setEditFullName] = useState(user.full_name || '');
  const [editRole, setEditRole] = useState<Role>(user.role);
  const [editStatus, setEditStatus] = useState<string>(user.status || 'pending');
  const [editPhone, setEditPhone] = useState(user.phone || '');
  const [editOrganization, setEditOrganization] = useState(user.organization || '');
  const [editPurpose, setEditPurpose] = useState(user.purpose || '');
  const [editExpiresAt, setEditExpiresAt] = useState(
    user.access_expires_at ? new Date(user.access_expires_at).toISOString().slice(0, 16) : ''
  );
  const [editManagedWarehouseIds, setEditManagedWarehouseIds] = useState<string[]>(
    user.managed_warehouse_ids || []
  );
  const [editAssignedWarehouseIds, setEditAssignedWarehouseIds] = useState<string[]>(
    user.assigned_warehouse_ids || []
  );
  const [editOwnerEntityIds, setEditOwnerEntityIds] = useState<string[]>(
    user.owner_entity_ids || []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim()) {
      toast.error('Vui lòng nhập Họ và tên');
      return;
    }

    await onSave({
      full_name: editFullName.trim(),
      role: editRole,
      status: editStatus as any,
      phone: editPhone.trim() || undefined,
      organization: editOrganization.trim() || undefined,
      purpose: editPurpose.trim() || undefined,
      access_expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
      managed_warehouse_ids: editRole === 'warehouse_manager' ? editManagedWarehouseIds : null,
      assigned_warehouse_ids: ['capital_dept', 'project_dept', 're_dept', 'supervisor'].includes(editRole)
        ? editAssignedWarehouseIds
        : null,
      owner_entity_ids: editRole === 'investor' ? editOwnerEntityIds : null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-lg">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Sửa thông tin &amp; Phân quyền</h3>
              <p className="text-xs text-gray-500">Cập nhật vai trò, trạng thái, kho phụ trách và pháp nhân đại diện</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email đăng nhập
              </label>
              <input
                type="text"
                disabled
                value={user.email || ''}
                className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editFullName}
                onChange={e => setEditFullName(e.target.value)}
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
                value={editRole}
                onChange={e => setEditRole(e.target.value as Role)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] bg-white font-medium"
              >
                <option value="user">Tra cứu tạm thời (user)</option>
                <option value="viewer">Khách tra cứu (viewer)</option>
                <option value="warehouse_manager">Quản lý kho (warehouse_manager)</option>
                <option value="btc_manager">Ban Tài Chính (btc_manager)</option>
                <option value="capital_dept">Phòng Nguồn Vốn (capital_dept)</option>
                <option value="project_dept">Ban PTDA & Ban Đối Ngoại (project_dept)</option>
                <option value="re_dept">Khối SPG (re_dept)</option>
                <option value="supervisor">Quản lý (Xem báo cáo/Truy vấn) (supervisor)</option>
                <option value="investor">Chủ đầu tư/Nhà đầu tư (investor)</option>
                <option value="admin">Quản trị viên (admin)</option>
                <option value="super_admin">Quản trị tối cao (super_admin)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Trạng thái tài khoản <span className="text-red-500">*</span>
              </label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] bg-white font-medium"
              >
                <option value="active">Hoạt động (active)</option>
                <option value="approved">Đã duyệt tra cứu (approved)</option>
                <option value="pending">Chờ phê duyệt (pending)</option>
                <option value="disabled">Đã khóa (disabled)</option>
                <option value="rejected">Từ chối (rejected)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Cơ quan / Đơn vị công tác
              </label>
              {editRole === 'investor' ? (
                <OrganizationEntityInput
                  value={editOrganization}
                  onChange={setEditOrganization}
                  entities={investorEntities}
                  selectedIds={editOwnerEntityIds}
                  onPickEntity={ent => {
                    setEditOrganization(ent.name);
                    setEditOwnerEntityIds(prev => (prev.includes(ent.id) ? prev : [...prev, ent.id]));
                  }}
                />
              ) : (
                <input
                  type="text"
                  placeholder="Ví dụ: Ngân hàng Vietcombank..."
                  value={editOrganization}
                  onChange={e => setEditOrganization(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Số điện thoại <span className="text-gray-400 font-normal">(Không bắt buộc)</span>
              </label>
              <input
                type="tel"
                placeholder="Không bắt buộc"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Mục đích sử dụng / Tra cứu hồ sơ
            </label>
            <input
              type="text"
              placeholder="VD: Thẩm định hồ sơ pháp lý, phê duyệt tín dụng..."
              value={editPurpose}
              onChange={e => setEditPurpose(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
            />
          </div>

          {/* Expiry date setting */}
          {(editStatus === 'approved' || editRole === 'user' || editRole === 'viewer') && (
            <div className="p-3.5 bg-orange-50/80 border border-orange-200 rounded-xl space-y-1.5">
              <label className="block text-xs font-semibold text-orange-950 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-orange-700" />
                Hạn thời gian tra cứu tạm thời:
              </label>
              <input
                type="datetime-local"
                value={editExpiresAt}
                onChange={e => setEditExpiresAt(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg"
              />
              <p className="text-[11px] text-orange-800">
                Để trống nếu muốn cấp quyền không thời hạn hoặc không áp dụng hạn tra cứu.
              </p>
            </div>
          )}

          {/* Edit Warehouse Manager: Managed warehouses */}
          {editRole === 'warehouse_manager' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-amber-950 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-amber-700" />
                  Kho sổ quản lý: <span className="font-normal text-amber-700">({editManagedWarehouseIds.length} kho)</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditManagedWarehouseIds(warehouses.map(w => w.id))}
                    className="text-amber-800 hover:underline font-medium cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setEditManagedWarehouseIds([])}
                    className="text-gray-500 hover:underline cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {warehouses.map(wh => (
                  <label key={wh.id} className="flex items-center gap-2 text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 cursor-pointer hover:bg-amber-50/50">
                    <input
                      type="checkbox"
                      checked={editManagedWarehouseIds.includes(wh.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setEditManagedWarehouseIds(prev => [...prev, wh.id]);
                        } else {
                          setEditManagedWarehouseIds(prev => prev.filter(id => id !== wh.id));
                        }
                      }}
                      className="rounded text-[#1E3A8A]"
                    />
                    <span className="truncate">{wh.name} {wh.is_central ? '(Kho TT)' : ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Edit Multi-select "Kho phụ trách" for capital_dept, project_dept, re_dept, supervisor */}
          {['capital_dept', 'project_dept', 're_dept', 'supervisor'].includes(editRole) && (
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-blue-950 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-700" />
                  Kho phụ trách: <span className="font-normal text-blue-700">({editAssignedWarehouseIds.length} kho)</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditAssignedWarehouseIds(warehouses.map(w => w.id))}
                    className="text-blue-700 hover:text-blue-900 font-medium hover:underline cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setEditAssignedWarehouseIds([])}
                    className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-blue-800">
                Gán danh sách kho sổ mà tài khoản có thẩm quyền nghiệp vụ (theo dõi báo cáo, duyệt, tra cứu).
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {warehouses.map(wh => {
                  const isChecked = editAssignedWarehouseIds.includes(wh.id);
                  return (
                    <label key={wh.id} className={`flex items-center gap-2 text-xs p-2 rounded-lg border cursor-pointer transition ${
                      isChecked ? 'bg-blue-100/70 border-blue-300 text-blue-950 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setEditAssignedWarehouseIds(prev => [...prev, wh.id]);
                          } else {
                            setEditAssignedWarehouseIds(prev => prev.filter(id => id !== wh.id));
                          }
                        }}
                        className="rounded text-[#1E3A8A]"
                      />
                      <span className="truncate">{wh.name} {wh.is_central ? '(Kho TT)' : ''}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit Multi-select "Pháp nhân đại diện" for investor (có tìm kiếm / chọn nhanh) */}
          {editRole === 'investor' && (
            <InvestorEntityPicker
              entities={investorEntities}
              selectedIds={editOwnerEntityIds}
              onChange={setEditOwnerEntityIds}
            />
          )}

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};