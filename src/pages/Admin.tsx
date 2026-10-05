import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Settings, MapPin, Building2, Warehouse as WarehouseIcon, FolderGit2, 
  Shield, Users, Building
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// Sub-components
import { AdminAreas } from '../components/admin/AdminAreas';
import { AdminRegions } from '../components/admin/AdminRegions';
import { AdminWarehouses } from '../components/admin/AdminWarehouses';
import { AdminProjects } from '../components/admin/AdminProjects';
import { AdminInvestorEntities } from '../components/admin/AdminInvestorEntities';
import { AdminInternalUsers } from '../components/admin/AdminInternalUsers';

export const Admin: React.FC = () => {
  const { profile } = useAuth();

  // Quản trị viên: dùng đủ mọi tab. Trưởng phòng Dự án (PTDA) / BTC Manager / Quản lý Kho: CHỈ
  // được vào để quản lý lô quy hoạch pháp lý trong tab "Dự án" — không thấy/không đụng được các
  // tab quản trị khác.
  const isFullAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isProjectScoped = profile?.role === 'project_dept' || profile?.role === 'btc_manager' || profile?.role === 'warehouse_manager';

  const [activeTab, setActiveTab] = useState<'regions' | 'areas' | 'warehouses' | 'projects' | 'users' | 'investor_entities'>(() => {
    if (!isFullAdmin) return 'projects';
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'regions' || tabParam === 'areas' || tabParam === 'projects' || 
        tabParam === 'warehouses' || tabParam === 'investor_entities' || 
        tabParam === 'users') {
      return tabParam;
    }
    return 'regions';
  });

  // Key to force refresh sub-components
  const [refreshKey] = useState(0);

  // Quản trị viên vào toàn bộ trang; PTDA/BTC Manager chỉ vào để quản lý lô quy hoạch (tab "Dự án").
  if (profile && !isFullAdmin && !isProjectScoped) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#1E3A8A]" />
            {isFullAdmin ? 'Cấu hình Danh mục & Phân quyền Hệ thống' : 'Quản lý Lô quy hoạch pháp lý theo Dự án'}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {isFullAdmin
              ? 'Quản trị Vùng, Địa bàn, Kho lưu trữ chứng từ, Dự án BĐS, Pháp nhân CĐT/NĐT và Phân quyền người dùng'
              : 'Chọn dự án để khai báo/nhập Excel các lô đất chưa cấp GCN riêng'}
          </p>
        </div>

        {/* Nút Khôi phục dữ liệu chuẩn mock đã bị ẩn/vô hiệu hóa để đảm bảo toàn vẹn CSDL Supabase */}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 rounded-t-xl overflow-x-auto gap-1">
        {isFullAdmin && (
        <button
          onClick={() => setActiveTab('regions')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'regions' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" /> Vùng
        </button>
        )}
        {isFullAdmin && (
        <button
          onClick={() => setActiveTab('areas')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'areas' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MapPin className="w-4 h-4" /> Địa bàn
        </button>
        )}
        <button
          onClick={() => setActiveTab('projects')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'projects' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderGit2 className="w-4 h-4" /> Dự án
        </button>
        {isFullAdmin && (
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'warehouses' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <WarehouseIcon className="w-4 h-4" /> Kho lưu trữ
        </button>
        )}
        {isFullAdmin && (
        <button
          onClick={() => setActiveTab('investor_entities')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'investor_entities' ? 'border-rose-600 text-rose-700 font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building className="w-4 h-4 text-rose-600" /> Pháp nhân CĐT/NĐT
        </button>
        )}
        {isFullAdmin && (
        <button
          onClick={() => setActiveTab('users')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'users' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield className="w-4 h-4" /> Tài khoản nội bộ
        </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-b-xl border border-gray-200 shadow-xs" key={refreshKey}>
        {activeTab === 'regions' && <AdminRegions />}
        {activeTab === 'areas' && <AdminAreas />}
        {activeTab === 'projects' && <AdminProjects />}
        {activeTab === 'warehouses' && <AdminWarehouses />}
        {activeTab === 'investor_entities' && <AdminInvestorEntities />}
        {activeTab === 'users' && <AdminInternalUsers />}
      </div>
    </div>
  );
};

export default Admin;