import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Settings, MapPin, Building2, Warehouse as WarehouseIcon, FolderGit2, 
  Shield, Users, RotateCcw, Building
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { mockStore } from '../lib/mockStore';

// Sub-components
import { AdminAreas } from '../components/admin/AdminAreas';
import { AdminRegions } from '../components/admin/AdminRegions';
import { AdminWarehouses } from '../components/admin/AdminWarehouses';
import { AdminProjects } from '../components/admin/AdminProjects';
import { AdminInvestorEntities } from '../components/admin/AdminInvestorEntities';
import { AdminInternalUsers } from '../components/admin/AdminInternalUsers';
import { AdminAppUsers } from '../components/admin/AdminAppUsers';

export const Admin: React.FC = () => {
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<'regions' | 'areas' | 'warehouses' | 'projects' | 'users' | 'app_users' | 'investor_entities'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'regions' || tabParam === 'areas' || tabParam === 'projects' || 
        tabParam === 'warehouses' || tabParam === 'investor_entities' || 
        tabParam === 'users' || tabParam === 'app_users') {
      return tabParam;
    }
    return 'regions';
  });

  // Reset standard data modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  // Key to force refresh sub-components after standard data reset
  const [refreshKey, setRefreshKey] = useState(0);

  // Chỉ dành cho Quản trị viên (Admin / Super Admin)
  if (profile && profile.role !== 'admin' && profile.role !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  // Reset standard corporate dataset
  const handleResetToStandardData = () => {
    setIsResetting(true);
    try {
      mockStore.resetToStandardData();
      toast.success('Đã khôi phục thành công bộ Dữ liệu chuẩn Doanh nghiệp Tập đoàn VMT!');
      setIsResetModalOpen(false);
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      toast.error('Lỗi khôi phục dữ liệu');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#1E3A8A]" />
            Cấu hình Danh mục &amp; Phân quyền Hệ thống
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Quản trị Vùng, Địa bàn, Kho lưu trữ chứng từ, Dự án BĐS, Pháp nhân CĐT/NĐT và Phân quyền người dùng
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsResetModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-200 hover:bg-blue-100 transition-colors shadow-xs cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Khôi phục Dữ liệu chuẩn VMT
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 rounded-t-xl overflow-x-auto gap-1">
        <button
          onClick={() => setActiveTab('regions')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'regions' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" /> Vùng
        </button>
        <button
          onClick={() => setActiveTab('areas')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'areas' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MapPin className="w-4 h-4" /> Địa bàn
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'projects' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderGit2 className="w-4 h-4" /> Dự án
        </button>
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'warehouses' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <WarehouseIcon className="w-4 h-4" /> Kho lưu trữ
        </button>
        <button
          onClick={() => setActiveTab('investor_entities')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'investor_entities' ? 'border-rose-600 text-rose-700 font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building className="w-4 h-4 text-rose-600" /> Pháp nhân CĐT/NĐT
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'users' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield className="w-4 h-4" /> Tài khoản nội bộ
        </button>
        <button
          onClick={() => setActiveTab('app_users')}
          className={`py-3.5 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'app_users' ? 'border-[#1E3A8A] text-[#1E3A8A]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" /> Tài khoản App Users
        </button>
      </div>

      <div className="bg-white p-6 rounded-b-xl border border-gray-200 shadow-xs" key={refreshKey}>
        {activeTab === 'regions' && <AdminRegions />}
        {activeTab === 'areas' && <AdminAreas />}
        {activeTab === 'projects' && <AdminProjects />}
        {activeTab === 'warehouses' && <AdminWarehouses />}
        {activeTab === 'investor_entities' && <AdminInvestorEntities />}
        {activeTab === 'users' && <AdminInternalUsers />}
        {activeTab === 'app_users' && <AdminAppUsers />}
      </div>

      {/* Confirm Reset Standard Data Modal */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetToStandardData}
        title="Khôi phục Dữ liệu chuẩn Tập đoàn VMT"
        message="Hành động này sẽ thiết lập lại toàn bộ Danh mục Vùng (3 vùng), Địa bàn (18 tỉnh thành), Kho lưu trữ (8 kho), Dự án BĐS (8 dự án), cùng bộ hồ sơ Giấy Chứng Nhận QSDĐ & Phiếu Đề Xuất chuẩn để kiểm thử. Bạn có chắc chắn muốn thực hiện?"
        confirmText="Xác nhận khôi phục"
        confirmVariant="primary"
        loading={isResetting}
      />
    </div>
  );
};

export default Admin;
