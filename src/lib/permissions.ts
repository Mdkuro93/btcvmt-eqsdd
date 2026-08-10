import { Role } from '../types';

export const ALL_PERMISSIONS = [
  { key: 'asset.view', label: 'Xem danh mục GCN' },
  { key: 'asset.create', label: 'Thêm mới GCN' },
  { key: 'asset.edit', label: 'Sửa GCN' },
  { key: 'request.borrow', label: 'Gửi YC Mượn/Xuất' },
  { key: 'request.return', label: 'Gửi YC Nhập trả' },
  { key: 'request.mortgage', label: 'Gửi YC Thế chấp' },
  { key: 'request.unmortgage', label: 'Gửi YC Giải chấp' },
  { key: 'request.sell', label: 'Gửi YC Xuất bán' },
  { key: 'request.split', label: 'Gửi YC Tách sổ' },
  { key: 'request.approve', label: 'Duyệt / Từ chối Yêu cầu' },
  { key: 'import.excel', label: 'Import Excel' },
  { key: 'admin.manage', label: 'Quản trị hệ thống' },
];

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<Role, string[]> = {
  btc_manager: ALL_PERMISSIONS.map(p => p.key),
  capital_dept: ['asset.view', 'request.borrow', 'request.return', 'request.mortgage', 'request.unmortgage'],
  project_dept: ['asset.view', 'request.borrow', 'request.return', 'request.split'],
  re_dept: ['asset.view', 'request.borrow', 'request.return', 'request.sell'],
  viewer: ['asset.view'],
};
