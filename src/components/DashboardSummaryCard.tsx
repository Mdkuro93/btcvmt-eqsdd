import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  Clock, 
  Activity, 
  Warehouse, 
  ArrowUpRight, 
  Landmark, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle2, 
  ChevronRight,
  Sparkles,
  Layers,
  MapPin
} from 'lucide-react';

export interface DashboardSummaryData {
  totalAssets: number;
  totalArea: number;
  activeProjectsCount: number;
  
  pendingRequests: number;
  overdueRequests: number;
  pendingByType: {
    checkout: number;
    checkin: number;
    mortgage: number;
    split: number;
    sale_update: number;
  };
  pendingByWarehouse?: Array<{
    warehouseId: string;
    warehouseName: string;
    count: number;
    isCentral?: boolean;
  }>;

  assetsInUse: number;
  checkedOutCount: number;
  mortgagedCount: number;
  inStockCount: number;
  soldCount: number;
}

interface DashboardSummaryCardProps {
  data: DashboardSummaryData;
  loading: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
  isRealtimeActive?: boolean;
}

export const DashboardSummaryCard: React.FC<DashboardSummaryCardProps> = ({
  data,
  loading,
  onRefresh,
  lastUpdated,
  isRealtimeActive = true,
}) => {
  // Calculations
  const inUseRate = data.totalAssets > 0 
    ? Math.round((data.assetsInUse / data.totalAssets) * 100) 
    : 0;

  const inStockRate = data.totalAssets > 0 
    ? Math.round((data.inStockCount / data.totalAssets) * 100) 
    : 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
      {/* Header bar with Real-time Status */}
      <div className="px-5 py-3.5 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-900 dark:bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Chỉ Số Trọng Yếu & Giám Sát Thời Gian Thực</h2>
              {isRealtimeActive && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Real-time
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cập nhật lúc: {lastUpdated ? lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Vừa xong'}
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 disabled:opacity-60 transition-colors shadow-2xs cursor-pointer"
          title="Làm mới dữ liệu thống kê ngay lập tức"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ${loading ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`} />
          <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
        </button>
      </div>

      {/* 3 Main Summary Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
        
        {/* Metric 1: Total Land Assets */}
        <div className="p-5 flex flex-col justify-between hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                Tổng Tài Sản Đất (GCN)
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60 rounded-md">
                Total Assets
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {loading ? '...' : data.totalAssets.toLocaleString('vi-VN')}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Giấy chứng nhận</span>
            </div>

            {/* Sub-metrics */}
            <div className="mt-3.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-slate-400" /> Tổng diện tích quỹ đất:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {loading ? '...' : `${data.totalArea.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m²`}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Số dự án ghi nhận:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {loading ? '...' : `${data.activeProjectsCount} dự án`}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Warehouse className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Đang sẵn sàng tại kho:
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {loading ? '...' : `${data.inStockCount} GCN (${inStockRate}%)`}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Link
              to="/assets"
              className="inline-flex items-center justify-between w-full text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 group"
            >
              <span>Xem chi tiết danh sách GCN</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 2: Pending Requests */}
        <div className="p-5 flex flex-col justify-between hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Yêu Cầu Chờ Duyệt
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                data.pendingRequests > 0 
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                Pending Requests
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-3xl font-extrabold tracking-tight ${
                data.pendingRequests > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
              }`}>
                {loading ? '...' : data.pendingRequests.toLocaleString('vi-VN')}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">phiếu đang đợi</span>
            </div>

            {/* Overdue alert & Breakdown */}
            <div className="mt-3.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              {data.overdueRequests > 0 ? (
                <div className="p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-lg flex items-center gap-2 text-rose-800 dark:text-rose-300 font-medium">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Có <strong>{data.overdueRequests}</strong> phiếu vượt quá SLA (quá 24h)</span>
                </div>
              ) : (
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 rounded-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Đảm bảo 100% SLA phê duyệt hồ sơ</span>
                </div>
              )}

              <div className="pt-1 grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-md border border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Mượn sổ:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{data.pendingByType.checkout}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-md border border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Thế chấp:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{data.pendingByType.mortgage}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-md border border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Xuất bán:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{data.pendingByType.sale_update}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-md border border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Tách / Nhập:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{data.pendingByType.split + data.pendingByType.checkin}</span>
                </div>
              </div>

              {/* Breakdown by Responsible Warehouse */}
              {data.pendingByWarehouse && data.pendingByWarehouse.some(w => w.count > 0) && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Phân bổ theo kho chịu trách nhiệm:
                  </span>
                  <div className="space-y-1">
                    {data.pendingByWarehouse.filter(w => w.count > 0).map(wh => (
                      <div key={wh.warehouseId} className="flex items-center justify-between py-0.5 text-[11px]">
                        <span className="text-slate-600 dark:text-slate-400 truncate flex items-center gap-1">
                          <Warehouse className="w-3 h-3 text-slate-400 shrink-0" />
                          {wh.warehouseName} {wh.isCentral ? '(TT)' : ''}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          {wh.count} phiếu
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Link
              to="/requests"
              className="inline-flex items-center justify-between w-full text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 group"
            >
              <span>Phê duyệt & Xử lý phiếu</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 3: Assets in Use */}
        <div className="p-5 flex flex-col justify-between hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Tài Sản Đang Sử Dụng
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60 rounded-md">
                Assets in Use
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-400 tracking-tight">
                {loading ? '...' : data.assetsInUse.toLocaleString('vi-VN')}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">GCN đang khai thác</span>
            </div>

            {/* Utilization Bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1 font-medium">
                <span className="text-slate-500 dark:text-slate-400">Tỷ lệ khai thác quỹ đất:</span>
                <span className="font-bold text-indigo-700 dark:text-indigo-400">{inUseRate}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className="bg-indigo-600 dark:bg-indigo-500 transition-all duration-500" 
                  style={{ width: `${Math.min(100, inUseRate)}%` }} 
                  title={`Đang sử dụng: ${inUseRate}%`}
                />
                <div 
                  className="bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${Math.min(100 - inUseRate, inStockRate)}%` }} 
                  title={`Trong kho: ${inStockRate}%`}
                />
              </div>
            </div>

            {/* Breakdown */}
            <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Đang mượn / luân chuyển:
                </span>
                <span className="font-bold text-amber-700 dark:text-amber-400">
                  {loading ? '...' : `${data.checkedOutCount} GCN`}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Landmark className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> Đang thế chấp ngân hàng:
                </span>
                <span className="font-bold text-rose-700 dark:text-rose-400">
                  {loading ? '...' : `${data.mortgagedCount} GCN`}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Link
              to="/assets?custodyStatus=checked_out"
              className="inline-flex items-center justify-between w-full text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 group"
            >
              <span>Xem tài sản đang lưu hành & thế chấp</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};
