import React, { useMemo, useState } from 'react';
import { 
  Warehouse as WarehouseIcon, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowRight, 
  Eye, 
  Check, 
  Loader2, 
  AlertTriangle,
  User,
  ShieldCheck,
  Building2,
  FileCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Asset, Warehouse as WarehouseType } from '../../types';
import { decideTransactionItem } from '../../api/transactions';
import { getResponsibleWarehouseId } from '../../lib/warehouseRouting';
import { AssetDetailModal } from './AssetDetailModal';
import { DonutChart } from './DonutChart';
import { StorageProgressBar } from './StorageProgressBar';

interface WarehouseManagerDashboardProps {
  managedWarehouseIds?: string[] | null;
  warehouses: WarehouseType[];
  assets: Asset[];
  pendingTransactions: any[];
  onRefresh: () => Promise<void> | void;
  userId?: string;
}

export const WarehouseManagerDashboard: React.FC<WarehouseManagerDashboardProps> = ({
  managedWarehouseIds,
  warehouses,
  assets,
  pendingTransactions,
  onRefresh,
  userId,
}) => {
  const [approvingItemId, setApprovingItemId] = useState<string | null>(null);

  // Modal states for inspecting detail assets
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    assets: Asset[];
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    assets: [],
  });

  // Filter warehouses based on user's managed warehouse IDs
  const relevantWarehouses = useMemo(() => {
    if (managedWarehouseIds && managedWarehouseIds.length > 0) {
      const filtered = warehouses.filter(w => managedWarehouseIds.includes(w.id));
      if (filtered.length > 0) return filtered;
    }
    // Fallback if not configured: show all available warehouses
    return warehouses;
  }, [warehouses, managedWarehouseIds]);

  const relevantWarehouseIdSet = useMemo(() => {
    return new Set(relevantWarehouses.map(w => w.id));
  }, [relevantWarehouses]);

  // Warehouse inventory breakdown
  const warehouseStats = useMemo(() => {
    return relevantWarehouses.map(w => {
      const warehouseAssets = assets.filter(a => a.warehouse_id === w.id);
      const inStockAssets = warehouseAssets.filter(a => a.custody_status === 'in_stock');
      const checkedOutAssets = warehouseAssets.filter(a => a.custody_status === 'checked_out');
      const mortgagedAssets = warehouseAssets.filter(a => a.mortgage_status === 'mortgaged');

      const total = warehouseAssets.length;
      const inStock = inStockAssets.length;
      const checkedOut = checkedOutAssets.length;
      const mortgaged = mortgagedAssets.length;
      const inStockRate = total > 0 ? Math.round((inStock / total) * 100) : 0;

      return {
        warehouse: w,
        total,
        inStock,
        checkedOut,
        mortgaged,
        inStockRate,
        assets: warehouseAssets,
        inStockAssets,
        checkedOutAssets,
        mortgagedAssets,
      };
    });
  }, [relevantWarehouses, assets]);

  // Filter Top 5 pending requests for responsible warehouses
  const topPendingRequests = useMemo(() => {
    const now = new Date();
    const list: Array<{
      txId: string;
      itemId: string;
      item: any;
      tx: any;
      type: string;
      assetName: string;
      assetCode?: string;
      projectName?: string;
      creatorName: string;
      deptName: string;
      createdAt: string;
      hoursWaiting: number;
      isSlaOverdue: boolean;
    }> = [];

    (pendingTransactions || []).forEach(tx => {
      (tx.items || []).forEach((item: any) => {
        if (item.status === 'pending') {
          const responsibleWhId = getResponsibleWarehouseId(item, item.type || tx.type);
          
          // Check if request belongs to one of user's managed warehouses (or all if not strictly restricted)
          const isManaged = !managedWarehouseIds || managedWarehouseIds.length === 0 ||
            (responsibleWhId && relevantWarehouseIdSet.has(responsibleWhId)) ||
            (item.asset?.warehouse_id && relevantWarehouseIdSet.has(item.asset.warehouse_id));

          if (isManaged) {
            const created = new Date(item.created_at || tx.created_at);
            const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
            list.push({
              txId: tx.id,
              itemId: item.id,
              item,
              tx,
              type: item.type || tx.type,
              assetName: item.asset?.certificate_no || 'GCN',
              assetCode: item.asset?.asset_code,
              projectName: item.asset?.projects?.name || item.asset?.business_project_name,
              creatorName: tx.created_by?.full_name || 'Người dùng',
              deptName: item.details?.department || tx.created_by?.department || 'Phòng ban',
              createdAt: item.created_at || tx.created_at,
              hoursWaiting: diffHours,
              isSlaOverdue: diffHours > 24,
            });
          }
        }
      });
    });

    // Priority sorting: SLA overdue first, then longest waiting
    return list.sort((a, b) => {
      if (a.isSlaOverdue && !b.isSlaOverdue) return -1;
      if (!a.isSlaOverdue && b.isSlaOverdue) return 1;
      return b.hoursWaiting - a.hoursWaiting;
    }).slice(0, 5);
  }, [pendingTransactions, managedWarehouseIds, relevantWarehouseIdSet]);

  // Fast approve handler
  const handleQuickApprove = async (itemId: string, assetName: string) => {
    if (!window.confirm(`Xác nhận duyệt nhanh phiếu cho GCN: ${assetName}?`)) {
      return;
    }

    setApprovingItemId(itemId);
    try {
      await decideTransactionItem(
        itemId, 
        'approved', 
        'Duyệt nhanh từ Dashboard thủ kho', 
        userId
      );
      toast.success(`Đã phê duyệt thành công yêu cầu cho GCN ${assetName}`);
      await onRefresh();
    } catch (err: any) {
      toast.error('Lỗi khi phê duyệt phiếu: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setApprovingItemId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Thông tin kho phụ trách */}
      {managedWarehouseIds && managedWarehouseIds.length > 0 && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <WarehouseIcon className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              Phạm vi quản trị: <strong>{relevantWarehouses.length} kho được phân công</strong> ({relevantWarehouses.map(w => w.name).join(', ')})
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full font-bold bg-blue-200/70 text-blue-800 text-[11px]">
            Quản lý kho chuyên trách
          </span>
        </div>
      )}

      {/* 1. Biểu Đồ Thị Giác: Cơ Cấu Tồn Kho Phụ Trách (Donut Chart) */}
      <DonutChart
        title="Cơ Cấu Trạng Thái GCN Tại Các Kho Phụ Trách"
        subtitle={`Tổng hợp từ ${relevantWarehouses.length} kho lưu trữ thuộc phạm vi quản lý`}
        total={warehouseStats.reduce((sum, w) => sum + w.total, 0)}
        unit="GCN"
        segments={[
          {
            label: 'Trong kho (Tại chỗ)',
            count: warehouseStats.reduce((sum, w) => sum + w.inStock, 0),
            color: '#10B981', // Emerald-500
            hoverColor: '#059669',
            bgBadge: 'bg-emerald-50',
            borderBadge: 'border-emerald-200',
            textBadge: 'text-emerald-700',
          },
          {
            label: 'Đang mượn ngoài',
            count: warehouseStats.reduce((sum, w) => sum + w.checkedOut, 0),
            color: '#3B82F6', // Blue-500
            hoverColor: '#2563EB',
            bgBadge: 'bg-blue-50',
            borderBadge: 'border-blue-200',
            textBadge: 'text-blue-700',
          },
          {
            label: 'Đang thế chấp Ngân hàng',
            count: warehouseStats.reduce((sum, w) => sum + w.mortgaged, 0),
            color: '#F97316', // Orange-500
            hoverColor: '#EA580C',
            bgBadge: 'bg-orange-50',
            borderBadge: 'border-orange-200',
            textBadge: 'text-orange-700',
          },
        ]}
        onSegmentClick={(seg) => {
          const allWhAssets = warehouseStats.flatMap((w) => w.assets);
          if (seg.label.includes('Trong kho')) {
            setModalState({
              isOpen: true,
              title: 'GCN đang lưu trữ tại các kho phụ trách',
              subtitle: `Tổng cộng ${seg.count} Giấy chứng nhận đang nằm trong kho`,
              assets: allWhAssets.filter((a) => a.custody_status === 'in_stock'),
            });
          } else if (seg.label.includes('mượn')) {
            setModalState({
              isOpen: true,
              title: 'GCN thuộc kho đang cho mượn ngoài',
              subtitle: `Tổng cộng ${seg.count} Giấy chứng nhận đang mượn công tác`,
              assets: allWhAssets.filter((a) => a.custody_status === 'checked_out'),
            });
          } else {
            setModalState({
              isOpen: true,
              title: 'GCN thuộc kho đang thế chấp ngân hàng',
              subtitle: `Tổng cộng ${seg.count} Giấy chứng nhận đang thế chấp`,
              assets: allWhAssets.filter((a) => a.mortgage_status === 'mortgaged'),
            });
          }
        }}
      />

      {/* 2. Bảng: Thống Kê Tồn Kho Chi Tiết Theo Từng Kho Phụ Trách */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
              <WarehouseIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Thống Kê Tồn Kho Chi Tiết Theo Kho Phụ Trách</h3>
              <p className="text-xs text-slate-500">Giám sát số lượng GCN thực tế tại kho, đang mượn và đang thế chấp</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
            {relevantWarehouses.length} Kho hiển thị
          </span>
        </div>

        <div className="overflow-x-auto">
          {warehouseStats.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Chưa có thông tin kho nào được cấu hình cho tài khoản của bạn.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Tên Kho & Mã Kho</th>
                  <th className="py-3 px-3 text-center">Tổng GCN</th>
                  <th className="py-3 px-3 text-center">Trong Kho</th>
                  <th className="py-3 px-3 text-center">Đang Mượn</th>
                  <th className="py-3 px-3 text-center">Đang Thế Chấp</th>
                  <th className="py-3 px-4 min-w-[180px]">Tỷ Lệ Lưu Trữ Tại Chỗ</th>
                  <th className="py-3 px-3 text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {warehouseStats.map(stat => (
                  <tr key={stat.warehouse.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <WarehouseIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{stat.warehouse.name}</span>
                        {stat.warehouse.is_central && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Trung tâm
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                        Mã kho: {stat.warehouse.code}
                      </div>
                    </td>

                    {/* Tổng GCN */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Kho: ${stat.warehouse.name} (Toàn bộ)`,
                          subtitle: `Tổng cộng ${stat.total} Giấy chứng nhận thuộc kho`,
                          assets: stat.assets,
                        })}
                        className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors"
                        title="Bấm để xem danh sách GCN"
                      >
                        {stat.total}
                      </button>
                    </td>

                    {/* Trong kho */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Kho: ${stat.warehouse.name} (Trong kho)`,
                          subtitle: `Các GCN đang lưu trữ tại chỗ an toàn`,
                          assets: stat.inStockAssets,
                        })}
                        className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        title="Bấm xem GCN đang trong kho"
                      >
                        {stat.inStock}
                      </button>
                    </td>

                    {/* Đang mượn */}
                    <td className="py-3 px-3 text-center">
                      {stat.checkedOut > 0 ? (
                        <button
                          onClick={() => setModalState({
                            isOpen: true,
                            title: `Kho: ${stat.warehouse.name} (Đang mượn ngoài)`,
                            subtitle: `GCN đang được các phòng ban/cá nhân mượn công tác`,
                            assets: stat.checkedOutAssets,
                          })}
                          className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                          title="Bấm xem GCN đang mượn"
                        >
                          {stat.checkedOut}
                        </button>
                      ) : (
                        <span className="text-slate-400 font-medium">0</span>
                      )}
                    </td>

                    {/* Đang thế chấp */}
                    <td className="py-3 px-3 text-center">
                      {stat.mortgaged > 0 ? (
                        <button
                          onClick={() => setModalState({
                            isOpen: true,
                            title: `Kho: ${stat.warehouse.name} (Đang thế chấp)`,
                            subtitle: `GCN đang thế chấp ngân hàng`,
                            assets: stat.mortgagedAssets,
                          })}
                          className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                          title="Bấm xem GCN đang thế chấp"
                        >
                          {stat.mortgaged}
                        </button>
                      ) : (
                        <span className="text-slate-400 font-medium">0</span>
                      )}
                    </td>

                    {/* Tỷ lệ lưu kho */}
                    <td className="py-3 px-4">
                      <StorageProgressBar inStock={stat.inStock} total={stat.total} />
                    </td>

                    {/* Chi tiết */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Kho: ${stat.warehouse.name}`,
                          subtitle: `Danh sách chi tiết Giấy chứng nhận`,
                          assets: stat.assets,
                        })}
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors inline-flex"
                        title="Xem chi tiết GCN trong kho"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 2. Bảng: Top 5 Phiếu mượn/trả chờ duyệt */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Top 5 Phiếu Mượn / Trả Chờ Duyệt</h3>
              <p className="text-xs text-slate-500">Các yêu cầu đang chờ thủ kho kiểm tra & xác nhận xuất/nhập sổ</p>
            </div>
          </div>
          <Link
            to="/requests"
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>Xem toàn bộ phiếu yêu cầu</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          {topPendingRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
              <p className="font-medium text-slate-700">Không có phiếu nào đang chờ duyệt cho các kho phụ trách!</p>
              <p className="text-slate-400">Mọi yêu cầu luân chuyển hồ sơ đã được giải quyết kịp thời.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Loại Phiếu</th>
                  <th className="py-3 px-3">Số GCN & Dự Án</th>
                  <th className="py-3 px-3">Người Yêu Cầu</th>
                  <th className="py-3 px-3">Thời Gian Gửi</th>
                  <th className="py-3 px-3 text-center">Tiến Độ SLA</th>
                  <th className="py-3 px-4 text-center">Thao Tác Duyệt Nhanh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {topPendingRequests.map((req) => (
                  <tr key={req.itemId} className="hover:bg-amber-50/30 transition-colors">
                    {/* Loại phiếu */}
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                        req.type === 'checkout' 
                          ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                          : req.type === 'checkin'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-purple-50 text-purple-800 border border-purple-200'
                      }`}>
                        {req.type === 'checkout' ? 'Mượn sổ' : req.type === 'checkin' ? 'Trả sổ' : req.type}
                      </span>
                    </td>

                    {/* Số GCN & Dự án */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{req.assetName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {req.projectName || 'Dự án chưa cập nhật'}
                        {req.assetCode ? ` · ${req.assetCode}` : ''}
                      </div>
                    </td>

                    {/* Người yêu cầu */}
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">{req.creatorName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{req.deptName}</div>
                    </td>

                    {/* Thời gian gửi */}
                    <td className="py-3 px-3 text-slate-500">
                      <div>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('vi-VN') : '-'}</div>
                      <div className="text-[11px] text-slate-400">
                        {req.createdAt ? new Date(req.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </td>

                    {/* Tiến độ SLA */}
                    <td className="py-3 px-3 text-center">
                      {req.isSlaOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertTriangle className="w-3 h-3" />
                          Trễ {req.hoursWaiting}h (&gt;24h)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          Đã chờ {req.hoursWaiting}h
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleQuickApprove(req.itemId, req.assetName)}
                          disabled={approvingItemId === req.itemId}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                          title="Duyệt nhanh yêu cầu này"
                        >
                          {approvingItemId === req.itemId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Duyệt nhanh</span>
                        </button>

                        <Link
                          to="/requests"
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Xem chi tiết hồ sơ trên trang Phê duyệt"
                        >
                          Chi tiết
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal chi tiết GCN */}
      <AssetDetailModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        title={modalState.title}
        subtitle={modalState.subtitle}
        assets={modalState.assets}
      />
    </div>
  );
};