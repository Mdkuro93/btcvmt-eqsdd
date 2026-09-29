import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandPlot, ArrowRight, Layers, FileClock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPlannedLotsStageCounts, PlannedLotsStageCounts } from '../../api/plannedLandLots';

// Phải khớp _planned_lots_can_view() trong migration (không gọi RPC khi chắc chắn không có quyền).
const CAN_VIEW_ROLES = new Set([
  'super_admin', 'admin', 'btc_manager', 'warehouse_manager',
  'capital_dept', 'project_dept', 're_dept', 'supervisor',
]);

/**
 * Dòng đếm 3 trạng thái lô quy hoạch trên Dashboard:
 * Tách rõ 2 chỉ số: "Lô chưa có sổ nào (Q/R)" và "Lô trong sổ lớn chưa tách (O/P)".
 */
export const PlannedLotsCountBanner: React.FC = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState<PlannedLotsStageCounts | null>(null);

  useEffect(() => {
    if (!profile?.role || !CAN_VIEW_ROLES.has(profile.role)) return;
    let cancelled = false;
    fetchPlannedLotsStageCounts()
      .then(s => { if (!cancelled) setStats(s); })
      .catch(() => { /* im lặng: banner phụ */ });
    return () => { cancelled = true; };
  }, [profile?.role]);

  if (!profile?.role || !CAN_VIEW_ROLES.has(profile.role) || !stats) return null;

  const totalOpen = (stats.unregistered_count || 0) + (stats.in_master_count || 0);
  if (totalOpen === 0 && (stats.total_count || 0) === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-sm transition-colors">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-amber-950 dark:text-amber-200">
        <span className="flex items-center gap-2 font-bold">
          <LandPlot className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
          Còn <strong>{totalOpen}</strong> lô quy hoạch chưa có sổ riêng:
        </span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 font-semibold border border-rose-300 dark:border-rose-800">
            <FileClock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            Lô chưa có sổ nào (Q/R): <strong>{stats.unregistered_count}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 font-semibold border border-amber-300 dark:border-amber-700">
            <Layers className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            Lô trong sổ lớn chưa tách (O/P): <strong>{stats.in_master_count}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-xs transition-all"
        >
          Báo cáo theo dự án <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Link
          to="/admin?tab=projects"
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-amber-100/60 dark:hover:bg-slate-800 transition-colors"
        >
          Quản lý lô
        </Link>
      </div>
    </div>
  );
};