import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  fetchDashboardAssetStats, 
  fetchWarehouses, 
  fetchOverdueAssets, 
  fetchProjects,
  fetchDashboardDetailedAssets 
} from '../api/assets';
import { fetchTransactions } from '../api/transactions';
import { DashboardSummaryCard, DashboardSummaryData } from '../components/DashboardSummaryCard';
import { Asset, Warehouse as WarehouseType, Project } from '../types';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';
import { 
  Search, 
  Sparkles,
  Layers,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { BtcManagerDashboard } from '../components/dashboard/BtcManagerDashboard';
import { WarehouseManagerDashboard } from '../components/dashboard/WarehouseManagerDashboard';
import { DepartmentDashboard } from '../components/dashboard/DepartmentDashboard';
import { ViewerDashboard } from '../components/dashboard/ViewerDashboard';

export const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Detailed datasets for role-based analytics
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [overdueAssets, setOverdueAssets] = useState<Asset[]>([]);

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
      const [
        assetStats, 
        txs, 
        whList, 
        projList, 
        detailedAssets, 
        overdueList
      ] = await Promise.all([
        fetchDashboardAssetStats(),
        fetchTransactions().catch(err => {
          console.error('Lỗi tải giao dịch:', err);
          return [];
        }),
        fetchWarehouses().catch(err => {
          console.error('Lỗi tải kho:', err);
          return [];
        }),
        fetchProjects().catch(err => {
          console.error('Lỗi tải dự án:', err);
          return [];
        }),
        fetchDashboardDetailedAssets().catch(err => {
          console.error('Lỗi tải chi tiết tài sản:', err);
          return [];
        }),
        fetchOverdueAssets().catch(err => {
          console.error('Lỗi tải tài sản quá hạn:', err);
          return [];
        }),
      ]);

      setTransactions(txs || []);
      setWarehouses(whList || []);
      setProjects(projList || []);
      setAllAssets(detailedAssets || []);
      setOverdueAssets(overdueList || []);

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
      (whList || []).forEach(w => {
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
    } catch (err: any) {
      console.error('Lỗi khi cập nhật thống kê Dashboard:', err);
      toast.error('Không thể tải toàn bộ dữ liệu thống kê: ' + (err.message || 'Lỗi không xác định'));
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

  // Classify current active user role into 4 canonical functional groups:
  // 1. Quản trị & Giám sát: admin, super_admin, btc_manager, supervisor
  // 2. Quản lý kho: warehouse_manager
  // 3. Phòng ban chuyên môn: capital_dept, project_dept, re_dept, investor
  // 4. Tra cứu tổng quan: user, viewer, hoặc mặc định
  const currentRole = profile?.role || 'viewer';
  const isAdminOrSupervisorGroup =
    currentRole === 'btc_manager' ||
    currentRole === 'admin' ||
    currentRole === 'super_admin' ||
    currentRole === 'supervisor';
  const isSupervisorReadOnly = currentRole === 'supervisor';

  const isWarehouseManagerGroup = currentRole === 'warehouse_manager';

  const isDepartmentGroup =
    currentRole === 'capital_dept' ||
    currentRole === 'project_dept' ||
    currentRole === 're_dept' ||
    currentRole === 'investor';

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Real-time Summary Card Component */}
      <DashboardSummaryCard
        data={summaryData}
        loading={loading}
        onRefresh={loadStats}
        lastUpdated={lastUpdated}
        isRealtimeActive={isSupabaseConfigured}
      />

      {/* Dynamic Role-Based Tailored Dashboard (Lối truy cập nhanh đã được loại bỏ) */}
      <div className="mt-8">
        {isAdminOrSupervisorGroup ? (
          <BtcManagerDashboard
            assets={allAssets}
            projects={projects}
            overdueAssets={overdueAssets}
            pendingTransactions={transactions}
            isReadOnly={isSupervisorReadOnly}
          />
        ) : isWarehouseManagerGroup ? (
          <WarehouseManagerDashboard
            managedWarehouseIds={profile?.managed_warehouse_ids}
            warehouses={warehouses}
            assets={allAssets}
            pendingTransactions={transactions}
            onRefresh={loadStats}
            userId={profile?.id}
          />
        ) : isDepartmentGroup ? (
          <DepartmentDashboard
            role={currentRole}
            projectIds={profile?.assigned_warehouse_ids || (profile as any)?.project_ids}
            assets={allAssets}
            projects={projects}
          />
        ) : (
          <ViewerDashboard
            assets={allAssets}
            projects={projects}
            warehouses={warehouses}
            role={currentRole}
          />
        )}
      </div>
    </div>
  );
};