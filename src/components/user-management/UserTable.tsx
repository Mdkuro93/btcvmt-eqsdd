import React from 'react';
import { Profile, Warehouse, InvestorEntity } from '../../types';
import {
  Users,
  RefreshCw,
  Mail,
  Phone,
  Building,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  XCircle,
  Lock,
  Check,
  Calendar,
  Edit2,
  KeyRound,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ROLE_LABELS } from './constants';
import { checkLookupAccess } from '../../lib/accessGuard';

interface UserTableProps {
  profiles: Profile[];
  loading: boolean;
  warehouses: Warehouse[];
  investorEntities: InvestorEntity[];
  activeTab: 'all' | 'pending' | 'approved' | 'expired' | 'internal';
  onApproveClick: (user: Profile) => void;
  onRejectClick: (user: Profile) => void;
  onExtendClick: (user: Profile) => void;
  onToggleStatus: (user: Profile) => void;
  onEditClick: (user: Profile) => void;
  onResetPasswordClick?: (user: Profile) => void;
  onDeleteClick?: (user: Profile) => void;
  /** Trả về true nếu người đang đăng nhập được phép xóa tài khoản này (server vẫn kiểm tra lại) */
  canDeleteUser?: (user: Profile) => boolean;
}

export const UserTable: React.FC<UserTableProps> = ({
  profiles,
  loading,
  investorEntities,
  activeTab,
  onApproveClick,
  onRejectClick,
  onExtendClick,
  onToggleStatus,
  onEditClick,
  onResetPasswordClick,
  onDeleteClick,
  canDeleteUser,
}) => {
  return (
    <div className="overflow-x-auto">
      {loading ? (
        <div className="p-12 text-center text-gray-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#1E3A8A]" />
          <p className="text-sm">Đang tải danh sách người dùng...</p>
        </div>
      ) : profiles.length === 0 ? (
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
              <th className="px-6 py-3.5">Đơn vị &amp; Mục đích</th>
              <th className="px-6 py-3.5">Vai trò</th>
              <th className="px-6 py-3.5">Trạng thái &amp; Thời hạn</th>
              <th className="px-6 py-3.5 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {profiles.map(u => {
              const accessCheck = checkLookupAccess(u);
              const roleMeta = ROLE_LABELS[u.role] || { label: u.role, color: 'bg-gray-100 text-gray-700 border-gray-200', desc: '' };

              return (
                <tr key={u.id} className="hover:bg-gray-50/80 transition">
                  {/* Name & Contact */}
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">{u.full_name || 'Chưa cập nhật tên'}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>{u.email}</span>
                    </div>
                    {u.phone && (
                      <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
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
                      <div className="text-[11px] text-amber-700 font-medium mt-1">
                        Quản lý {u.managed_warehouse_ids.length} kho sổ
                      </div>
                    )}
                    {['capital_dept', 'project_dept', 're_dept', 'supervisor'].includes(u.role) && u.assigned_warehouse_ids && u.assigned_warehouse_ids.length > 0 && (
                      <div className="text-[11px] text-blue-700 font-medium mt-1">
                        Phụ trách {u.assigned_warehouse_ids.length} kho
                      </div>
                    )}
                    {u.role === 'investor' && u.owner_entity_ids && u.owner_entity_ids.length > 0 && (
                      <div className="text-[11px] text-rose-700 font-medium mt-1" title={
                        u.owner_entity_ids
                          .map(id => {
                            const found = investorEntities.find(ie => ie.id === id);
                            return found ? `${found.name} (${found.company_code || 'Chưa có mã'})` : id;
                          })
                          .join(', ')
                      }>
                        Đại diện {u.owner_entity_ids.length} pháp nhân CĐT/NĐT
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
                            onClick={() => onApproveClick(u)}
                            className="px-3 py-1.5 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 shadow-sm transition flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Duyệt &amp; Cấp hạn</span>
                          </button>
                          <button
                            onClick={() => onRejectClick(u)}
                            className="px-2.5 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
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
                            onClick={() => onExtendClick(u)}
                            className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 shadow-sm transition flex items-center gap-1 cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Gia hạn / Đổi hạn</span>
                          </button>
                          <button
                            onClick={() => onToggleStatus(u)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                            title="Khóa tài khoản"
                          >
                            <Lock className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {/* Active / Disabled actions */}
                      {u.status !== 'pending' && u.status !== 'approved' && (
                        <button
                          onClick={() => onToggleStatus(u)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg transition cursor-pointer ${
                            u.status === 'disabled'
                              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                              : 'bg-gray-100 text-gray-700 hover:bg-rose-50 hover:text-rose-700'
                          }`}
                        >
                          {u.status === 'disabled' ? 'Mở khóa' : 'Khóa'}
                        </button>
                      )}
                      {/* Edit button */}
                      <button
                        onClick={() => onEditClick(u)}
                        className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        title="Sửa thông tin &amp; phân quyền"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Reset password button */}
                      {onResetPasswordClick && (
                        <button
                          onClick={() => onResetPasswordClick(u)}
                          className="p-1.5 text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                          title="Đặt lại mật khẩu cho tài khoản"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete button */}
                      {onDeleteClick && (!canDeleteUser || canDeleteUser(u)) && (
                        <button
                          onClick={() => onDeleteClick(u)}
                          className="p-1.5 text-gray-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Xóa tài khoản"
                        >
                          <Trash2 className="w-4 h-4" />
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
  );
};