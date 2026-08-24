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
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header bar with Real-time Status */}
      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shadow-xs">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Chỉ Số Trọng Yếu & Giám Sát Thời Gian Thực</h2>
              {isRealtimeActive && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Real-time
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Cập nhật lúc: {lastUpdated ? lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Vừa xong'}
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 transition-colors shadow-2xs"
          title="Làm mới dữ liệu thống kê ngay lập tức"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
        </button>
      </div>

      {/* 3 Main Summary Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        
        {/* Metric 1: Total Land Assets */}
        <div className="p-5 flex flex-col justify-between hover:bg-slate-50/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-700" />
                Tổng Tài Sản Đất (GCN)
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-800 rounded-md">
                Total Assets
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {loading ? '...' : data.totalAssets.toLocaleString('vi-VN')}
              </span>
              <span className="text-xs font-medium text-slate-500">Giấy chứng nhận</span>
            </div>

            {/* Sub-metrics */}
            <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-slate-400" /> Tổng diện tích quỹ đất:
                </span>
                <span className="font-semibold text-slate-800">
                  {loading ? '...' : `${data.totalArea.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m²`}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Số dự án ghi nhận:
                </span>
                <span className="font-semibold text-slate-800">
                  {loading ? '...' : `${data.activeProjectsCount} dự án`}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <Warehouse className="w-3.5 h-3.5 text-emerald-600" /> Đang sẵn sàng tại kho:
                </span>
                <span className="font-bold text-emerald-700">
                  {loading ? '...' : `${data.inStockCount} GCN (${inStockRate}%)`}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <Link
              to="/assets"
              className="inline-flex items-center justify-between w-full text-xs font-semibold text-blue-700 hover:text-blue-900 group"
            >
              <span>Xem chi tiết danh sách GCN</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 2: Pending Requests */}
        <div className="p-5 flex flex-col justify-between hover:bg-slate-50/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                Yêu Cầu Chờ Duyệt
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                data.pendingRequests > 0 
                  ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                  : 'bg-slate-100 text-slate-600'
              }`}>
                Pending Requests
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-3xl font-extrabold tracking-tight ${
                data.pendingRequests > 0 ? 'text-amber-600' : 'text-slate-900'
              }`}>
                {loading ? '...' : data.pendingRequests.toLocaleString('vi-VN')}
              </span>
              <span className="text-xs font-medium text-slate-500">phiếu đang đợi</span>
            </div>

            {/* Overdue alert & Breakdown */}
            <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
              {data.overdueRequests > 0 ? (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 font-medium">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Có <strong>{data.overdueRequests}</strong> phiếu vượt quá SLA (quá 24h)</span>
                </div>
              ) : (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Đảm bảo 100% SLA phê duyệt hồ sơ</span>
                </div>
              )}

              <div className="pt-1 grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="bg-slate-50 p-1.5 rounded-md border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500">Mượn sổ:</span>
                  <span className="font-semibold text-slate-800">{data.pendingByType.checkout}</span>
                </div>
                <div className="bg-slate-50 p-1.5 rounded-md border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500">Thế chấp:</span>
                  <span className="font-semibold text-slate-800">{data.pendingByType.mortgage}</span>
                </div>
                <div className="bg-slate-50 p-1.5 rounded-md border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500">Xuất bán:</span>
                  <span className="font-semibold text-slate-800">{data.pendingByType.sale_update}</span>
                </div>
                <div className="bg-slate-50 p-1.5 rounded-md border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500">Tách / Nhập:</span>
                  <span className="font-semibold text-slate-800">{data.pendingByType.split + data.pendingByType.checkin}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <Link
              to="/requests"
              className="inline-flex items-center justify-between w-full text-xs font-semibold text-amber-700 hover:text-amber-900 group"
            >
              <span>Phê duyệt & Xử lý phiếu</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 3: Assets in Use */}
        <div className="p-5 flex flex-col justify-between hover:bg-slate-50/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 text-indigo-600" />
                Tài Sản Đang Sử Dụng
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-800 rounded-md">
                Assets in Use
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold text-indigo-700 tracking-tight">
                {loading ? '...' : data.assetsInUse.toLocaleString('vi-VN')}
              </span>
              <span className="text-xs font-medium text-slate-500">GCN đang khai thác</span>
            </div>

            {/* Utilization Bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1 font-medium">
                <span className="text-slate-500">Tỷ lệ khai thác quỹ đất:</span>
                <span className="font-bold text-indigo-700">{inUseRate}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                <div 
                  className="bg-indigo-600 transition-all duration-500" 
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
            <div className="mt-3 space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" /> Đang mượn / luân chuyển:
                </span>
                <span className="font-bold text-amber-700">
                  {loading ? '...' : `${data.checkedOutCount} GCN`}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 flex items-center gap-1">
                  <Landmark className="w-3.5 h-3.5 text-rose-600" /> Đang thế chấp ngân hàng:
                </span>
                <span className="font-bold text-rose-700">
                  {loading ? '...' : `${data.mortgagedCount} GCN`}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <Link
              to="/assets?custodyStatus=checked_out"
              className="inline-flex items-center justify-between w-full text-xs font-semibold text-indigo-700 hover:text-indigo-900 group"
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
