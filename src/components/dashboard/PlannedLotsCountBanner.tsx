import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandPlot, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchOpenPlannedLandLotsCount } from '../../api/plannedLandLots';

// Phải khớp _planned_lots_can_view() trong migration 0047 (không gọi RPC khi chắc chắn không có quyền).
const CAN_VIEW_ROLES = new Set([
  'super_admin', 'admin', 'btc_manager', 'warehouse_manager',
  'capital_dept', 'project_dept', 're_dept', 'supervisor',
]);

/**
 * Dòng đếm tổng "Còn X lô chưa cấp sổ toàn hệ thống" trên Dashboard.
 * Theo quyết định Phương án A trong bàn giao: chi tiết nằm ở tab trong trang Dự án,
 * Dashboard chỉ giữ một dòng đếm để không mất khả năng theo dõi tổng quan.
 */
export const PlannedLotsCountBanner: React.FC = () => {
  const { profile } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.role || !CAN_VIEW_ROLES.has(profile.role)) return;
    let cancelled = false;
    fetchOpenPlannedLandLotsCount()
      .then(c => { if (!cancelled) setCount(c); })
      .catch(() => { /* im lặng: đây chỉ là banner phụ, không phải chỗ báo lỗi chính */ });
    return () => { cancelled = true; };
  }, [profile?.role]);

  if (!profile?.role || !CAN_VIEW_ROLES.has(profile.role) || !count) return null;

  return (
    <Link
      to="/admin?tab=projects"
      className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm hover:bg-amber-100 transition-colors group"
    >
      <span className="flex items-center gap-2 text-amber-900">
        <LandPlot className="w-4 h-4 text-amber-600 shrink-0" />
        Còn <strong>{count}</strong> lô quy hoạch chưa cấp sổ toàn hệ thống
      </span>
      <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 group-hover:gap-1.5 transition-all shrink-0">
        Xem theo dự án <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
};