import { Profile } from '../types';
import { DEFAULT_PERMISSIONS_BY_ROLE } from './permissions';

/**
 * Cờ kiểm tra môi trường dev/test hoặc bật tài khoản demo
 */
export const isDemoAccountsEnabled = !import.meta.env.PROD;

/**
 * Danh sách tài khoản demo mẫu.
 * CHỈ tồn tại khi chạy ở môi trường development.
 * Trong bản build production (import.meta.env.PROD === true), mảng này được biên dịch thành mảng rỗng []
 * và tree-shaker loại bỏ toàn bộ dữ liệu mẫu khỏi bundle.
 */
export const DEMO_PROFILES: Profile[] = import.meta.env.PROD
  ? []
  : [
      {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'admin',
        email: 'admin@btcvmt.vn',
        full_name: 'Nguyễn Văn Quản Trị',
        role: 'super_admin',
        region_id: null,
        area_id: null,
        project_ids: null,
        managed_warehouse_ids: null,
        permissions: DEFAULT_PERMISSIONS_BY_ROLE['super_admin'],
        status: 'active',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        username: 'warehouse',
        email: 'warehouse@btcvmt.vn',
        full_name: 'Lê Hoàng Nam (Thủ Kho Trung Tâm)',
        role: 'warehouse_manager',
        region_id: 'reg-01',
        area_id: 'area-01',
        project_ids: null,
        managed_warehouse_ids: ['wh-01', 'wh-02', 'wh-03', 'wh-04'],
        permissions: DEFAULT_PERMISSIONS_BY_ROLE['warehouse_manager'],
        status: 'active',
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        username: 'capital',
        email: 'capital@btcvmt.vn',
        full_name: 'Phạm Minh Đức (Ban Nguồn Vốn)',
        role: 'capital_dept',
        region_id: null,
        area_id: null,
        project_ids: null,
        managed_warehouse_ids: null,
        permissions: DEFAULT_PERMISSIONS_BY_ROLE['capital_dept'],
        status: 'active',
      },
      {
        id: '00000000-0000-0000-0000-000000000004',
        username: 're_dept',
        email: 're_dept@btcvmt.vn',
        full_name: 'Trần Thị Bích (Ban Kinh Doanh BĐS)',
        role: 're_dept',
        region_id: null,
        area_id: null,
        project_ids: null,
        managed_warehouse_ids: null,
        permissions: DEFAULT_PERMISSIONS_BY_ROLE['re_dept'],
        status: 'active',
      },
      {
        id: '00000000-0000-0000-0000-000000000005',
        username: 'project',
        email: 'project@btcvmt.vn',
        full_name: 'Vũ Quốc Hùng (Ban Quản Lý Dự Án)',
        role: 'project_dept',
        region_id: null,
        area_id: null,
        project_ids: null,
        managed_warehouse_ids: null,
        permissions: DEFAULT_PERMISSIONS_BY_ROLE['project_dept'],
        status: 'active',
      },
      {
        id: '00000000-0000-0000-0000-000000000006',
        username: 'viewer',
        email: 'viewer@btcvmt.vn',
        full_name: 'Chuyên viên Tra Cứu Hồ Sơ',
        role: 'viewer',
        region_id: null,
        area_id: null,
        project_ids: null,
        managed_warehouse_ids: null,
        permissions: DEFAULT_PERMISSIONS_BY_ROLE['viewer'],
        status: 'active',
      },
    ];
