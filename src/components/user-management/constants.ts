import { Role } from '../../types';

export const ROLE_LABELS: Record<Role, { label: string; color: string; desc: string }> = {
  super_admin: { label: 'Quản trị tối cao', color: 'bg-red-50 text-red-700 border-red-200', desc: 'Toàn quyền cấu hình hệ thống' },
  admin: { label: 'Quản trị viên', color: 'bg-purple-50 text-purple-700 border-purple-200', desc: 'Quản lý người dùng và danh mục' },
  btc_manager: { label: 'Ban Tài Chính (BTC)', color: 'bg-blue-50 text-blue-700 border-blue-200', desc: 'Phê duyệt mượn/thế chấp/xuất kho' },
  warehouse_manager: { label: 'Quản Lý Kho Trung Tâm/Chi Nhánh', color: 'bg-amber-50 text-amber-700 border-amber-200', desc: 'Quản lý kho sổ & duyệt truy cập' },
  quan_ly: { label: 'Quản lý phòng ban', color: 'bg-teal-50 text-teal-700 border-teal-200', desc: 'Quản lý và duyệt hồ sơ' },
  capital_dept: { label: 'Phòng Nguồn Vốn', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'Lập đề xuất mượn/thế chấp' },
  project_dept: { label: 'Ban PTDA & Ban Đối Ngoại', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', desc: 'Đề xuất mượn & tách sổ' },
  re_dept: { label: 'Khối SPG', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', desc: 'Đề xuất bán & bàn giao' },
  supervisor: { label: 'Quản lý (Xem báo cáo/Truy vấn)', color: 'bg-violet-50 text-violet-700 border-violet-200', desc: 'Giám sát báo cáo & yêu cầu kho phân công' },
  investor: { label: 'Chủ đầu tư/Nhà đầu tư (CĐT/NĐT)', color: 'bg-rose-50 text-rose-700 border-rose-200', desc: 'Xem & gửi yêu cầu mượn/trả GCN thuộc thực thể sở hữu' },
  chuyen_vien: { label: 'Chuyên viên nghiệp vụ', color: 'bg-sky-50 text-sky-700 border-sky-200', desc: 'Lập và xử lý đề xuất' },
  viewer: { label: 'Khách Tra Cứu', color: 'bg-slate-50 text-slate-700 border-slate-200', desc: 'Tra cứu thông tin GCN' },
  nguoi_dung: { label: 'Người dùng', color: 'bg-stone-50 text-stone-700 border-stone-200', desc: 'Người dùng tra cứu cơ bản' },
  user: { label: 'Tra Cứu Tạm Thời', color: 'bg-orange-50 text-orange-700 border-orange-200', desc: 'Tài khoản tự đăng ký' },
};

export const calculateExpiryDate = (preset: string, customDate: string): string => {
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
