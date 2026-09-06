import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchDashboardAssetStats, fetchWarehouses, fetchOverdueAssets } from '../api/assets';
import { CalendarX } from 'lucide-react';
import { fetchTransactions } from '../api/transactions';
import { generateDemoData } from '../api/demo';
import { DashboardSummaryCard, DashboardSummaryData } from '../components/DashboardSummaryCard';
import { Asset, Warehouse as WarehouseType } from '../types';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';
import { 
  Files, 
  Warehouse, 
  ArrowUpRight, 
  Landmark, 
  ShoppingBag, 
  Search, 
  CheckSquare, 
  BookText, 
  Loader2,
  Sparkles,
  Layers,
  FileCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [generatingDemo, setGeneratingDemo] = useState(false);
  const [overdueAssets, setOverdueAssets] = useState<Asset[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [summaryData, setSummaryData] = useState<DashboardSummaryData>({
    totalAssets: 0,
    totalArea: 0,
    activeProjectsCount: 0,
    pendingRequests: 0,
    overdueRequests: 0,
    pendingByType: {
      checkout: 0,
      checkin: 0,
      mortgage: 0,
      split: 0,
      sale_update: 0,
    },
    assetsInUse: 0,
    checkedOutCount: 0,
    mortgagedCount: 0,
    inStockCount: 0,
    soldCount: 0,
  });

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [assetStats, txs, warehouses] = await Promise.all([
        fetchDashboardAssetStats(),
        fetchTransactions(),
        fetchWarehouses(),
      ]);

      let pendingTotal = 0;
      let overdueCount = 0;
      const typeCounts = {
        checkout: 0,
        checkin: 0,
        mortgage: 0,
        split: 0,
        sale_update: 0,
      };

      const warehousePendingMap: Record<string, { warehouseId: string; warehouseName: string; count: number; isCentral?: boolean }> = {};
      (warehouses || []).forEach(w => {
        warehousePendingMap[w.id] = {
          warehouseId: w.id,
          warehouseName: w.name,
          count: 0,
          isCentral: w.is_central,
        };
      });

      if (txs) {
        const now = new Date();
        txs.forEach((tx: any) => {
          (tx.items || []).forEach((item: any) => {
            if (item.status === 'pending') {
              pendingTotal++;
              const t = item.type as keyof typeof typeCounts;
              if (typeCounts[t] !== undefined) {
                typeCounts[t]++;
              }

              // Responsible warehouse grouping
              const responsibleWhId = getResponsibleWarehouseId(item, item.type || tx.type);
              if (responsibleWhId && warehousePendingMap[responsibleWhId]) {
                warehousePendingMap[responsibleWhId].count++;
              }

              const created = new Date(item.created_at || tx.created_at);
              const diffMs = now.getTime() - created.getTime();
              const diffHours = diffMs / (1000 * 60 * 60);
              if (diffHours > 24) overdueCount++; // SLA 24h
            }
          });
        });
      }

      setSummaryData({
        totalAssets: assetStats.total,
        totalArea: assetStats.totalArea || 0,
        activeProjectsCount: assetStats.activeProjectsCount || 0,
        pendingRequests: pendingTotal,
        overdueRequests: overdueCount,
        pendingByType: typeCounts,
        pendingByWarehouse: Object.values(warehousePendingMap),
        assetsInUse: (assetStats.checkedOut || 0) + (assetStats.mortgaged || 0),
        checkedOutCount: assetStats.checkedOut || 0,
        mortgagedCount: assetStats.mortgaged || 0,
        inStockCount: assetStats.inStock || 0,
        soldCount: assetStats.sold || 0,
      });

      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Load stats error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Realtime subscription with debounce across all critical asset & transaction tables
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let timer: any = null;
    const channel = supabase.channel('dashboard_stats_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          loadStats();
        }, 800);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          loadStats();
        }, 800);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_items' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          loadStats();
        }, 800);
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

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
      
      {/* Viewer Welcome Card */}
      {profile?.role === 'viewer' && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
              <Sparkles className="w-3.5 h-3.5" /> Quyền Tra Cứu Khách (Viewer)
            </div>
            <h2 className="text-lg font-bold text-white">Bạn đang có quyền tra cứu thông tin GCN theo kho</h2>
            <p className="text-xs text-blue-200 max-w-xl">
              Hệ thống cho phép bạn kiểm tra mã số sổ, tình trạng pháp lý, phân khu và tình trạng thế chấp của các Giấy chứng nhận trong các kho đã được phê duyệt.
            </p>
          </div>
          <Link
            to="/lookup"
            className="whitespace-nowrap px-5 py-2.5 bg-white hover:bg-blue-50 text-[#1E3A8A] font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <Search className="w-4 h-4" /> Bắt đầu tra cứu ngay
          </Link>
        </div>
      )}

      {/* Real-time Summary Card Component */}
      <DashboardSummaryCard
        data={summaryData}
        loading={loading}
        onRefresh={loadStats}
        lastUpdated={lastUpdated}
        isRealtimeActive={isSupabaseConfigured}
      />

      {/* Quick Access Navigation */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider text-slate-500">Lối truy cập nhanh</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/assets"
            className="p-4 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/40 transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-blue-100 text-[#1E3A8A] rounded-lg">
              <Files className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 group-hover:text-[#1E3A8A]">Danh mục GCN</div>
              <div className="text-xs text-slate-500">Tra cứu, lọc & mượn sổ</div>
            </div>
          </Link>

          <Link
            to="/requests"
            className="p-4 border border-slate-200 rounded-xl hover:border-amber-500 hover:bg-amber-50/40 transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-lg">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 group-hover:text-amber-800">Yêu cầu & Phê duyệt</div>
              <div className="text-xs text-slate-500">Xử lý {summaryData.pendingRequests} phiếu gửi lên</div>
            </div>
          </Link>

          <Link
            to="/lookup"
            className="p-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/40 transition-all flex items-center gap-3 group"
          >
            <div className="p-2.5 bg-indigo-100 text-indigo-800 rounded-lg">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-800">Tra cứu nhanh</div>
              <div className="text-xs text-slate-500">Kiểm tra thông tin sổ</div>
            </div>
          </Link>

          {profile?.role === 'btc_manager' && (
            <Link
              to="/activity-logs"
              className="p-4 border border-slate-200 rounded-xl hover:border-purple-500 hover:bg-purple-50/40 transition-all flex items-center gap-3 group"
            >
              <div className="p-2.5 bg-purple-100 text-purple-800 rounded-lg">
                <BookText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 group-hover:text-purple-800">Nhật ký biến động</div>
                <div className="text-xs text-slate-500">Lịch sử & Audit Trail</div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

