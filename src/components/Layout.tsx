import React from 'react';
import { MainLayout } from '../layouts/MainLayout';

/**
 * Layout chính của ứng dụng với Sidebar thu gọn / mở rộng và Topbar.
 * Xuất khẩu tại src/components/Layout.tsx để đồng bộ cấu trúc component.
 */
export const Layout: React.FC = () => {
  return <MainLayout />;
};

export default Layout;
