import React, { useState } from 'react';
import { Role, Warehouse, InvestorEntity } from '../../types';
import { UserPlus, Sparkles, Building, X, RefreshCw } from 'lucide-react';
import { calculateExpiryDate } from './constants';
import toast from 'react-hot-toast';

interface CreateUserModalProps {
  warehouses: Warehouse[];
  investorEntities: InvestorEntity[];
  onClose: () => void;
  onCreate: (userData: any) => Promise<void>;
  loading: boolean;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  warehouses,
  investorEntities,
  onClose,
  onCreate,
  loading,
}) => {
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
  const [assignedWarehouseIds, setAssignedWarehouseIds] = useState<string[]>([]);
  const [selectedOwnerEntityIds, setSelectedOwnerEntityIds] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error('Vui lòng nhập Email');
      return;
    }
    if (!newFullName.trim()) {
      toast.error('Vui lòng nhập Họ và tên');
      return;
    }

    let expiresAt: string | null = null;
    if (newRole === 'user' || newRole === 'viewer') {
      if (newExpiryPreset !== 'permanent') {
        expiresAt = calculateExpiryDate(newExpiryPreset, newCustomExpiry);
      }
    }

    await onCreate({
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
      assigned_warehouse_ids: ['capital_dept', 'project_dept', 're_dept', 'supervisor'].includes(newRole) ? assignedWarehouseIds : null,
      owner_entity_ids: newRole === 'investor' ? selectedOwnerEntityIds : null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs animate-in fade-in duration-200">
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
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 my-4">
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
                <option value="capital_dept">Phòng Nguồn Vốn (capital_dept)</option>
                <option value="project_dept">Ban PTDA/BĐN (project_dept)</option>
                <option value="re_dept">Khối SPG (re_dept)</option>
                <option value="supervisor">Quản lý (Xem báo cáo/Truy vấn) (supervisor)</option>
                <option value="investor">Chủ đầu tư/Nhà đầu tư (investor)</option>
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
                    className={`py-1.5 px-2 text-xs font-medium rounded-lg border text-center transition cursor-pointer ${
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
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-amber-950 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-amber-700" />
                  Phân công kho sổ quản lý: <span className="font-normal text-amber-700">({selectedWarehouseIds.length} kho đã chọn)</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedWarehouseIds(warehouses.map(w => w.id))}
                    className="text-amber-800 hover:underline font-medium cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedWarehouseIds([])}
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
                    <span className="truncate">{wh.name} {wh.is_central ? '(Kho TT)' : ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select "Kho phụ trách" for capital_dept, project_dept, re_dept, supervisor */}
          {['capital_dept', 'project_dept', 're_dept', 'supervisor'].includes(newRole) && (
            <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-blue-950 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-700" />
                  Kho phụ trách: <span className="font-normal text-blue-700">({assignedWarehouseIds.length} kho đã chọn)</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setAssignedWarehouseIds(warehouses.map(w => w.id))}
                    className="text-blue-700 hover:text-blue-900 font-medium hover:underline cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setAssignedWarehouseIds([])}
                    className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-blue-800">
                Phân quyền cho tài khoản phụ trách các kho chỉ định (lập đề xuất, giám sát hoặc duyệt).
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {warehouses.map(wh => {
                  const isChecked = assignedWarehouseIds.includes(wh.id);
                  return (
                    <label key={wh.id} className={`flex items-center gap-2 text-xs p-2 rounded-lg border cursor-pointer transition ${
                      isChecked ? 'bg-blue-100/70 border-blue-300 text-blue-950 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setAssignedWarehouseIds(prev => [...prev, wh.id]);
                          } else {
                            setAssignedWarehouseIds(prev => prev.filter(id => id !== wh.id));
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

          {/* Multi-select "Pháp nhân đại diện" for investor */}
          {newRole === 'investor' && (
            <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-rose-950 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-rose-700" />
                  Pháp nhân đại diện: <span className="font-normal text-rose-700">({selectedOwnerEntityIds.length} pháp nhân đã chọn)</span>
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedOwnerEntityIds(investorEntities.map(e => e.id))}
                    className="text-rose-700 hover:text-rose-900 font-medium hover:underline cursor-pointer"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedOwnerEntityIds([])}
                    className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-rose-800">
                Chỉ định các pháp nhân CĐT/NĐT mà tài khoản đại diện để có quyền xem và gửi yêu cầu mượn/trả GCN sở hữu.
              </div>
              {investorEntities.length === 0 ? (
                <div className="p-3 bg-white rounded-lg border border-rose-200 text-xs text-rose-600 text-center">
                  Chưa có dữ liệu danh mục pháp nhân CĐT/NĐT. Vui lòng vào mục Quản trị &gt; Pháp nhân CĐT/NĐT để thêm mới.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
                  {investorEntities.map(ent => {
                    const isChecked = selectedOwnerEntityIds.includes(ent.id);
                    return (
                      <label key={ent.id} className={`flex items-center gap-2 text-xs p-2.5 rounded-lg border cursor-pointer transition ${
                        isChecked ? 'bg-rose-100/70 border-rose-300 text-rose-950 font-medium' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedOwnerEntityIds(prev => [...prev, ent.id]);
                            } else {
                              setSelectedOwnerEntityIds(prev => prev.filter(id => id !== ent.id));
                            }
                          }}
                          className="rounded text-rose-600"
                        />
                        <span className="flex-1 truncate">
                          {ent.name} {ent.company_code ? `(${ent.company_code})` : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
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
              <span>Kích hoạt ngay</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
