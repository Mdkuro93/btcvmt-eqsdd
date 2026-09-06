import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, RotateCcw, AlertTriangle, UserCheck } from 'lucide-react';

/**
 * Format tên vai trò hiển thị thân thiện trong Dropdown
 */
export function formatRoleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Admin (Quản trị hệ thống)';
    case 'super_admin':
      return 'Super Admin (Toàn quyền)';
    case 'btc_manager':
      return 'Ban Tài Chính Tập Đoàn (btc_manager)';
    case 'warehouse_manager':
      return 'Thủ kho lưu trữ (warehouse_manager)';
    case 'capital_dept':
      return 'Phòng Nguồn Vốn';
    case 'project_dept':
      return 'Ban PTDA/BĐN';
    case 're_dept':
      return 'Khối SPG';
    case 'supervisor':
      return 'Quản lý (Xem báo cáo/Truy vấn)';
    case 'investor':
      return 'Chủ đầu tư/Nhà đầu tư (CĐT/NĐT)';
    case 'viewer':
      return 'Người tra cứu (viewer)';
    case 'quan_ly':
      return 'Quản lý (quan_ly)';
    case 'chuyen_vien':
      return 'Chuyên viên nghiệp vụ (chuyen_vien)';
    case 'nguoi_dung':
      return 'Người dùng (nguoi_dung)';
    case 'user':
      return 'Người dùng cơ bản (user)';
    default:
      return `${role.replace(/_/g, ' ')} (${role})`;
  }
}

/**
 * Component RoleSwitcher đặt tại Header/Navbar:
 * - Dành riêng cho Admin
 * - Hiển thị danh sách các vai trò động lấy từ CSDL Supabase (bảng app_users)
 * - Tự động thay đổi effectiveRole và phân quyền toàn hệ thống khi chọn
 */
export const RoleSwitcher: React.FC = () => {
  const { 
    user, 
    effectiveRole, 
    originalRole, 
    availableRoles, 
    setEffectiveRole, 
    resetRole, 
    isSimulating 
  } = useAuth();

  // Chỉ hiển thị đối với tài khoản có quyền Admin thực tế
  const actualRole = originalRole || user?.role;
  const isActualAdmin = actualRole === 'admin' || actualRole === 'super_admin';

  if (!isActualAdmin) {
    return null;
  }

  // Đảm bảo effectiveRole luôn nằm trong danh sách lựa chọn
  const options = Array.from(new Set([
    ...availableRoles,
    effectiveRole,
    actualRole
  ])).filter(Boolean);

  const isChanged = Boolean(user?.role && effectiveRole && effectiveRole !== user.role);

  return (
    <div id="admin-role-switcher" className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
        <Shield className="w-3.5 h-3.5 text-[#1E3A8A]" />
        <span className="hidden sm:inline">Mô phỏng vai trò:</span>
      </div>

      <div className="relative">
        <select
          id="role-switcher-dropdown"
          value={effectiveRole}
          onChange={(e) => setEffectiveRole(e.target.value)}
          className={`text-xs font-semibold rounded-lg px-2.5 py-1 pr-7 border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isChanged 
              ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold' 
              : 'bg-white border-slate-300 text-slate-900 hover:border-slate-400'
          }`}
          title="Chọn vai trò để kiểm tra phân quyền hiển thị (Menu, nút bấm, dữ liệu)"
        >
          {options.map((r) => (
            <option key={r} value={r}>
              {formatRoleLabel(r)} {r === actualRole ? ' (Quyền gốc)' : ''}
            </option>
          ))}
        </select>
      </div>

      {isChanged && (
        <button
          type="button"
          id="reset-admin-role-btn-inline"
          onClick={resetRole}
          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition shadow-2xs cursor-pointer"
          title="Khôi phục về vai trò Admin gốc"
        >
          <RotateCcw className="w-3 h-3 text-[#1E3A8A]" />
          <span className="hidden md:inline">Khôi phục</span>
        </button>
      )}
    </div>
  );
};

/**
 * 3. BANNER CẢNH BÁO TRẠNG THÁI MÔ PHỎNG:
 * Hiển thị Banner cảnh báo nổi bật khi effectiveRole !== user.role:
 * "⚠️ Đang duyệt hệ thống dưới vai trò: [effectiveRole]" kèm nút "Khôi phục quyền Admin"
 */
export const RoleSimulationBanner: React.FC = () => {
  const { user, effectiveRole, originalRole, resetRole } = useAuth();

  const actualRole = originalRole || user?.role;
  const isActualAdmin = actualRole === 'admin' || actualRole === 'super_admin';
  const isChanged = Boolean(isActualAdmin && effectiveRole && user?.role && effectiveRole !== user.role);

  if (!isChanged) {
    return null;
  }

  return (
    <div 
      id="role-simulation-banner" 
      className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shadow-xs border-b border-amber-600 transition-all z-30 shrink-0"
    >
      <div className="flex items-center gap-2">
        <span className="text-base" role="img" aria-label="warning">⚠️</span>
        <span className="text-slate-950">
          Đang duyệt hệ thống dưới vai trò: <span className="underline uppercase font-black px-1.5 py-0.5 bg-amber-600/30 rounded">{effectiveRole}</span>
        </span>
        <span className="text-[11px] font-normal text-slate-900 hidden sm:inline">
          (Toàn bộ Menu, Nút bấm thao tác và Phân quyền hiển thị đang mô phỏng theo vai trò này)
        </span>
      </div>

      <button
        type="button"
        id="restore-admin-role-banner-btn"
        onClick={resetRole}
        className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer shrink-0 ml-2"
        title="Bấm để khôi phục lại toàn bộ quyền Quản trị viên"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Khôi phục quyền Admin</span>
      </button>
    </div>
  );
};
