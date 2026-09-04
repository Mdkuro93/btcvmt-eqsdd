import { Role } from '../types';

export const ALL_PERMISSIONS = [
  { key: 'asset.view', label: 'Xem danh mục GCN' },
  { key: 'asset.lookup', label: 'Tra cứu tình trạng GCN' },
  { key: 'asset.create', label: 'Thêm mới GCN' },
  { key: 'asset.edit', label: 'Sửa GCN' },
  { key: 'request.borrow', label: 'Gửi YC Mượn/Xuất' },
  { key: 'request.return', label: 'Gửi YC Nhập trả' },
  { key: 'request.mortgage', label: 'Gửi YC Thế chấp' },
  { key: 'request.unmortgage', label: 'Gửi YC Giải chấp' },
  { key: 'request.sell', label: 'Gửi YC Xuất bán' },
  { key: 'request.split', label: 'Gửi YC Tách sổ' },
  { key: 'request.approve', label: 'Duyệt / Từ chối Yêu cầu kho' },
  { key: 'access.approve', label: 'Duyệt cấp quyền truy cập kho' },
  { key: 'report.view', label: 'Xem Báo cáo & Thống kê tài chính' },
  { key: 'import.excel', label: 'Import Excel' },
  { key: 'admin.manage', label: 'Quản trị hệ thống' },
];

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<Role, string[]> = {
  super_admin: ALL_PERMISSIONS.map(p => p.key),
  admin: ALL_PERMISSIONS.map(p => p.key),
  btc_manager: ALL_PERMISSIONS.map(p => p.key),
  warehouse_manager: ['asset.view', 'asset.lookup', 'request.approve', 'access.approve', 'report.view'],
  capital_dept: ['asset.view', 'request.borrow', 'request.return', 'request.mortgage', 'request.unmortgage'],
  project_dept: ['asset.view', 'request.borrow', 'request.return', 'request.split'],
  re_dept: ['asset.view', 'request.borrow', 'request.return', 'request.sell'],
  viewer: ['asset.lookup'],
  user: ['asset.lookup'],
};
