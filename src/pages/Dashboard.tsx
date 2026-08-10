import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { generateDemoData } from '../api/demo';
import { 
  Files, 
  Warehouse, 
  ArrowUpRight, 
  Landmark, 
  ShoppingBag, 
  PlusCircle, 
  Search, 
  CheckSquare, 
  BookText, 
  Loader2,
  Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

export const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    inStock: 0,
    checkedOut: 0,
    mortgaged: 0,
    sold: 0,
  });
  const [loading, setLoading] = useState(true);
  const [generatingDemo, setGeneratingDemo] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data: assets, error } = await supabase
        .from('assets')
        .select('custody_status, mortgage_status, sale_status');

      if (error) throw error;

      if (assets) {
        setStats({
          total: assets.length,
          inStock: assets.filter(a => a.custody_status === 'in_stock').length,
          checkedOut: assets.filter(a => a.custody_status === 'checked_out').length,
          mortgaged: assets.filter(a => a.mortgage_status === 'mortgaged').length,
          sold: assets.filter(a => a.sale_status === 'sold').length,
        });
      }
    } catch (err) {
      console.warn('Load stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDemo = async () => {
    setGeneratingDemo(true);
    try {
      await generateDemoData();
      toast.success('Đã khởi tạo thành công 5 GCN mẫu & dự án mới!');
      await loadStats();
    } catch (err: any) {
      toast.error('Lỗi khi tạo dữ liệu mẫu: ' + (err.message || 'Chưa kết nối Supabase'));
    } finally {
      setGeneratingDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tổng quan Quản lý GCN QSDĐ</h1>
          <p className="text-sm text-gray-500 mt-1">
            Xin chào, <span className="font-semibold text-[#1E3A8A]">{profile?.full_name || profile?.email}</span> ({profile?.role.replace('_', ' ')})
          </p>
        </div>

        {profile?.role === 'btc_manager' && (
          <button
            onClick={handleGenerateDemo}
            disabled={generatingDemo}
            className="inline-flex items-center px-4 py-2 border border-blue-300 text-sm font-medium rounded-md shadow-sm text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            {generatingDemo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2 text-blue-600" />}
            Tạo dữ liệu thử nghiệm
          </button>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tổng số GCN</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> : stats.total}
            </p>
          </div>
          <div className="p-3 bg-blue-50 text-[#1E3A8A] rounded-lg">
            <Files className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trong kho</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-green-600" /> : stats.inStock}
            </p>
          </div>
          <div className="p-3 bg-green-50 text-green-700 rounded-lg">
            <Warehouse className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Đang mượn/xuất</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-amber-600" /> : stats.checkedOut}
            </p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-lg">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Đang thế chấp</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-rose-600" /> : stats.mortgaged}
            </p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-700 rounded-lg">
            <Landmark className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Đã xuất bán</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-indigo-600" /> : stats.sold}
            </p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-lg">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Access Actions */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-4">Lối truy cập nhanh</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/assets"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/40 transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-blue-100 text-[#1E3A8A] rounded-md">
              <Files className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 group-hover:text-[#1E3A8A]">Danh sách GCN</div>
              <div className="text-xs text-gray-500">Xem và mượn/xuất sổ</div>
            </div>
          </Link>

          <Link
            to="/requests"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/40 transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-md">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 group-hover:text-[#1E3A8A]">Yêu cầu & Phê duyệt</div>
              <div className="text-xs text-gray-500">Xử lý các phiếu gửi lên</div>
            </div>
          </Link>

          <Link
            to="/lookup"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/40 transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-md">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900 group-hover:text-[#1E3A8A]">Tra cứu nhanh</div>
              <div className="text-xs text-gray-500">Kiểm tra thông tin sổ</div>
            </div>
          </Link>

          {profile?.role === 'btc_manager' && (
            <Link
              to="/activity-logs"
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/40 transition-all flex items-center gap-3 group"
            >
              <div className="p-2.5 bg-purple-100 text-purple-800 rounded-md">
                <BookText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 group-hover:text-[#1E3A8A]">Nhật ký biến động</div>
                <div className="text-xs text-gray-500">Theo dõi toàn bộ lịch sử</div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
