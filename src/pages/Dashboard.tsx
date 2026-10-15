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
import { isHighRiseAsset } from '../constants/assetTypes';
import { BtcManagerDashboard } from '../components/dashboard/BtcManagerDashboard';
import { WarehouseManagerDashboard } from '../components/dashboard/WarehouseManagerDashboard';
import { DepartmentDashboard } from '../components/dashboard/DepartmentDashboard';
import { ViewerDashboard } from '../components/dashboard/ViewerDashboard';
import { PlannedLotsCountBanner } from '../components/dashboard/PlannedLotsCountBanner';

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
    totalHighRiseArea: 0,
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

  // Quản lý (supervisor): chỉ xem theo "Kho phụ trách" do admin gán -> lọc thêm ở giao diện (ngoài RLS của DB)
  const scopeIds: string[] | null = profile?.role === 'supervisor' ? (profile.assigned_warehouse_ids || []) : null;
  const scopeKey = scopeIds ? scopeIds.join(',') : '';

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

      const inScope = (whId?: string | null) => !scopeIds || (!!whId && scopeIds.includes(whId));
      const scopedAssets = (detailedAssets || []).filter(a => inScope(a.warehouse_id));
      const scopedOverdue = (overdueList || []).filter(a => inScope(a.warehouse_id));
      const scopedTxs = scopeIds
        ? (txs || [])
            .map((tx: any) => ({ ...tx, items: (tx.items || []).filter((it: any) => inScope(it.asset?.warehouse_id)) }))
            .filter((tx: any) => tx.items.length > 0)
        : (txs || []);

      setTransactions(scopedTxs);
      setWarehouses(scopeIds ? (whList || []).filter(w => scopeIds.includes(w.id)) : (whList || []));
      setProjects(projList || []);
      setAllAssets(scopedAssets);
      setOverdueAssets(scopedOverdue);

      // Số liệu tổng hợp: với vai trò bị giới hạn kho thì tính lại theo đúng kho được gán
      let statsForCards = assetStats;
      if (scopeIds) {
        if (scopeIds.length === 0) {
          statsForCards = { total: 0, inStock: 0, checkedOut: 0, mortgaged: 0, sold: 0, totalArea: 0, totalHighRiseArea: 0, activeProjectsCount: 0 };
        } else {
          const { data: rows, error: scopeErr } = await supabase
            .from('assets')
            .select('area, project_id, business_project_name, asset_type, custody_status, mortgage_status, sale_status')
            .in('warehouse_id', scopeIds);
          if (scopeErr) throw scopeErr;
          const list = rows || [];
          const projSet = new Set<string>();
          let totalArea = 0;
          let totalHighRiseArea = 0;
          list.forEach((r: any) => {
            const v = Number(r.area) || 0;
            if (isHighRiseAsset(r.asset_type)) totalHighRiseArea += v; else totalArea += v;
            const k = r.project_id || r.business_project_name;
            if (k) projSet.add(k);
          });
          statsForCards = {
            total: list.length,
            inStock: list.filter((r: any) => r.custody_status === 'in_stock').length,
            checkedOut: list.filter((r: any) => r.custody_status === 'checked_out').length,
            mortgaged: list.filter((r: any) => r.mortgage_status === 'mortgaged').length,
            sold: list.filter((r: any) => r.sale_status === 'sold').length,
            totalArea,
            totalHighRiseArea,
            activeProjectsCount: projSet.size,
          };
        }
      }

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
      (scopeIds ? (whList || []).filter(w => scopeIds.includes(w.id)) : (whList || [])).forEach(w => {
        warehousePendingMap[w.id] = {
          warehouseId: w.id,
          warehouseName: w.name,
          count: 0,
          isCentral: w.is_central,
        };
      });

      if (scopedTxs) {
        const now = new Date();
        scopedTxs.forEach((tx: any) => {
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
        totalAssets: statsForCards.total,
        totalArea: statsForCards.totalArea || 0,
        totalHighRiseArea: statsForCards.totalHighRiseArea || 0,
        activeProjectsCount: statsForCards.activeProjectsCount || 0,
        pendingRequests: pendingTotal,
        overdueRequests: overdueCount,
        pendingByType: typeCounts,
        pendingByWarehouse: Object.values(warehousePendingMap),
        assetsInUse: (statsForCards.checkedOut || 0) + (statsForCards.mortgaged || 0),
        checkedOutCount: statsForCards.checkedOut || 0,
        mortgagedCount: statsForCards.mortgaged || 0,
        inStockCount: statsForCards.inStock || 0,
        soldCount: statsForCards.sold || 0,
      });

      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Lỗi khi cập nhật thống kê Dashboard:', err);
      toast.error('Không thể tải toàn bộ dữ liệu thống kê: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setLoading(false);
    }
  }, [scopeKey]);

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

      <PlannedLotsCountBanner />

      {/* Dynamic Role-Based Tailored Dashboard (Lối truy cập nhanh đã được loại bỏ) */}
      <div className="mt-8">
        {isAdminOrSupervisorGroup ? (
          <BtcManagerDashboard
            assets={allAssets}
            projects={projects}
            overdueAssets={overdueAssets}
            pendingTransactions={transactions}
            isReadOnly={isSupervisorReadOnly}
            scopeLabel={isSupervisorReadOnly ? 'Theo Kho Được Phân Công' : undefined}
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

export default Dashboard;