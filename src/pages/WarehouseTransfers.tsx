import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeftRight,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Building2,
  FileText,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Undo2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchWarehouses } from '../api/assets';
import {
  WarehouseTransferRow,
  fetchWarehouseTransfers,
  STAGE_LABELS,
  STAGE_BADGE_CLASSES,
  rejectWarehouseTransferReceipt,
  cancelWarehouseTransfer,
} from '../api/warehouseTransfers';
import { Warehouse } from '../types';
import { CreateTransferModal } from '../components/warehouse-transfers/CreateTransferModal';
import { ReceiveTransferModal } from '../components/warehouse-transfers/ReceiveTransferModal';
import { ReviewAdjustmentModal } from '../components/warehouse-transfers/ReviewAdjustmentModal';
import { TransferReasonDialog } from '../components/warehouse-transfers/TransferReasonDialog';
import { TransferDetailModal } from '../components/warehouse-transfers/TransferDetailModal';
import toast from 'react-hot-toast';

export const WarehouseTransfers: React.FC = () => {
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState<WarehouseTransferRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'action_needed' | 'in_transit' | 'history'>('action_needed');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [targetFilter, setTargetFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [receiveItem, setReceiveItem] = useState<WarehouseTransferRow | null>(null);
  const [reviewItem, setReviewItem] = useState<WarehouseTransferRow | null>(null);
  const [detailItem, setDetailItem] = useState<WarehouseTransferRow | null>(null);
  const [reasonDialogData, setReasonDialogData] = useState<{
    isOpen: boolean;
    type: 'reject' | 'cancel';
    item: WarehouseTransferRow | null;
  }>({
    isOpen: false,
    type: 'reject',
    item: null,
  });
  const [isReasonSubmitting, setIsReasonSubmitting] = useState<boolean>(false);

  const isAdminOrBtc = ['admin', 'super_admin', 'btc_manager'].includes(profile?.role || '');
  const managedWarehouseIds = profile?.managed_warehouse_ids || [];

  const isActorForWarehouse = useCallback(
    (warehouseId?: string | null): boolean => {
      if (isAdminOrBtc) return true;
      if (!warehouseId) return false;
      return managedWarehouseIds.includes(warehouseId);
    },
    [isAdminOrBtc, managedWarehouseIds]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [transfersData, warehousesData] = await Promise.all([
        fetchWarehouseTransfers(),
        fetchWarehouses(),
      ]);
      setTransfers(transfersData || []);
      setWarehouses(warehousesData || []);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải dữ liệu luân chuyển kho');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tab categorization
  const { actionNeededItems, inTransitItems, historyItems } = useMemo(() => {
    const actionNeeded: WarehouseTransferRow[] = [];
    const inTransit: WarehouseTransferRow[] = [];
    const history: WarehouseTransferRow[] = [];

    transfers.forEach((t) => {
      const stage = t.details?.transfer?.stage || 'awaiting_receipt';
      const srcWh = t.details?.transfer?.source_warehouse_id;
      const tgtWh = t.details?.transfer?.target_warehouse_id;

      const isPending = t.status === 'pending';
      const isCompleted = ['received', 'rejected_by_receiver', 'recalled'].includes(stage);

      if (isCompleted) {
        history.push(t);
      } else if (isPending) {
        inTransit.push(t);

        // Check if action needed for current user
        if (
          (stage === 'awaiting_receipt' || stage === 'adjustment_rejected') &&
          isActorForWarehouse(tgtWh)
        ) {
          actionNeeded.push(t);
        } else if (stage === 'adjustment_proposed' && isActorForWarehouse(srcWh)) {
          actionNeeded.push(t);
        }
      }
    });

    return {
      actionNeededItems: actionNeeded,
      inTransitItems: inTransit,
      historyItems: history,
    };
  }, [transfers, isActorForWarehouse]);

  // Current tab items
  const tabFilteredItems = useMemo(() => {
    if (activeTab === 'action_needed') return actionNeededItems;
    if (activeTab === 'in_transit') return inTransitItems;
    return historyItems;
  }, [activeTab, actionNeededItems, inTransitItems, historyItems]);

  // Apply search and warehouse filters
  const filteredItems = useMemo(() => {
    let list = tabFilteredItems;
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      list = list.filter((t) => {
        const cert = (t.asset?.certificate_no || t.details?.transfer?.snapshot?.certificate_no || '').toLowerCase();
        const code = (t.asset?.asset_code || '').toLowerCase();
        const lot = (t.asset?.legal_lot_code || t.details?.transfer?.snapshot?.legal_lot_code || '').toLowerCase();
        const px = (t.details?.transfer?.out_voucher_code || '').toLowerCase();
        const pn = (t.voucher_code || t.details?.transfer?.in_voucher_code || '').toLowerCase();
        const proj = (t.asset?.projects?.name || '').toLowerCase();

        return (
          cert.includes(q) ||
          code.includes(q) ||
          lot.includes(q) ||
          px.includes(q) ||
          pn.includes(q) ||
          proj.includes(q)
        );
      });
    }

    if (sourceFilter !== 'all') {
      list = list.filter((t) => t.details?.transfer?.source_warehouse_id === sourceFilter);
    }

    if (targetFilter !== 'all') {
      list = list.filter((t) => t.details?.transfer?.target_warehouse_id === targetFilter);
    }

    return list;
  }, [tabFilteredItems, searchQuery, sourceFilter, targetFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const handleTabChange = (tab: 'action_needed' | 'in_transit' | 'history') => {
    setActiveTab(tab);
    setPage(1);
  };

  // Handle reason confirm (Reject / Cancel)
  const handleConfirmReason = async (reason: string) => {
    if (!reasonDialogData.item) return;
    setIsReasonSubmitting(true);
    try {
      const isReject = reasonDialogData.type === 'reject';
      if (isReject) {
        await rejectWarehouseTransferReceipt(reasonDialogData.item.id, reason);
        toast.success('Đã từ chối nhận GCN luân chuyển. GCN đã trở về kho xuất.');
      } else {
        await cancelWarehouseTransfer(reasonDialogData.item.id, reason);
        toast.success('Đã thu hồi lệnh luân chuyển. GCN đã trở về kho xuất.');
      }
      setReasonDialogData({ isOpen: false, type: 'reject', item: null });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi thực hiện thao tác');
    } finally {
      setIsReasonSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#1E3A8A] text-white rounded-xl shadow-xs">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">
              Luân chuyển kho
            </h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Quy trình điều chuyển GCN hai bước nguyên tử: kho xuất lập lệnh xuất và kho đích đối chiếu xác nhận nhận.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl border border-gray-300 dark:border-slate-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Tải lại dữ liệu mới nhất"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo lệnh luân chuyển</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-800 gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('action_needed')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-2 ${
            activeTab === 'action_needed'
              ? 'text-[#1E3A8A] dark:text-blue-400 border-b-2 border-[#1E3A8A] dark:border-blue-400'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          <span>Cần tôi xử lý</span>
          {actionNeededItems.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
              {actionNeededItems.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('in_transit')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-2 ${
            activeTab === 'in_transit'
              ? 'text-[#1E3A8A] dark:text-blue-400 border-b-2 border-[#1E3A8A] dark:border-blue-400'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          <span>Đang luân chuyển</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
            {inTransitItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('history')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-2 ${
            activeTab === 'history'
              ? 'text-[#1E3A8A] dark:text-blue-400 border-b-2 border-[#1E3A8A] dark:border-blue-400'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          <span>Lịch sử luân chuyển</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300">
            {historyItems.length}
          </span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo số GCN, mã tài sản, mã lô, mã phiếu PX/PN..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Kho xuất:</span>
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tất cả kho xuất</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 ml-2">
            <span>Kho đích:</span>
          </div>
          <select
            value={targetFilter}
            onChange={(e) => {
              setTargetFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-2 text-xs bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tất cả kho đích</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-gray-500 dark:text-slate-400 space-y-2">
            <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#1E3A8A]" />
            <p className="text-xs">Đang tải danh sách luân chuyển kho...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-gray-500 dark:text-slate-400 space-y-2">
            <FileText className="w-8 h-8 mx-auto text-gray-300 dark:text-slate-600" />
            <p className="text-xs font-medium">Không tìm thấy bản ghi luân chuyển nào.</p>
            {activeTab === 'action_needed' && (
              <p className="text-[11px] text-gray-400">Hiện tại bạn không có phiếu nào cần xử lý.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3.5">STT</th>
                  <th className="py-3 px-3.5">Số GCN / Mã TS</th>
                  <th className="py-3 px-3.5">Dự án / Lô đất</th>
                  <th className="py-3 px-3.5">Tuyến luân chuyển</th>
                  <th className="py-3 px-3.5">Mã chứng từ (PX / PN)</th>
                  <th className="py-3 px-3.5">Trạng thái</th>
                  <th className="py-3 px-3.5">Ngày lập / Người lập</th>
                  <th className="py-3 px-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {paginatedItems.map((t, idx) => {
                  const stage = t.details?.transfer?.stage || 'awaiting_receipt';
                  const srcWhId = t.details?.transfer?.source_warehouse_id;
                  const tgtWhId = t.details?.transfer?.target_warehouse_id;
                  const sourceWh = warehouses.find((w) => w.id === srcWhId);
                  const targetWh = warehouses.find((w) => w.id === tgtWhId);

                  const isTargetActor = isActorForWarehouse(tgtWhId);
                  const isSourceActor = isActorForWarehouse(srcWhId);

                  const canReceive =
                    (stage === 'awaiting_receipt' || stage === 'adjustment_rejected') && isTargetActor;
                  const canReviewAdjustment = stage === 'adjustment_proposed' && isSourceActor;
                  const canRecall =
                    ['awaiting_receipt', 'adjustment_proposed', 'adjustment_rejected'].includes(stage) &&
                    isSourceActor;
                  const canReject =
                    (stage === 'awaiting_receipt' || stage === 'adjustment_rejected') && isTargetActor;

                  const rowNumber = (page - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-50/70 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-3.5 text-gray-500 font-mono">{rowNumber}</td>

                      <td className="py-3 px-3.5">
                        <div className="font-mono font-bold text-gray-900 dark:text-slate-100 text-xs">
                          {t.asset?.certificate_no || t.details?.transfer?.snapshot?.certificate_no || '-'}
                        </div>
                        <div className="font-mono text-[11px] text-blue-700 dark:text-blue-400">
                          {t.asset?.asset_code || 'Chưa cấp mã'}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="font-medium text-gray-800 dark:text-slate-200">
                          {t.asset?.projects?.name || '-'}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-slate-400">
                          {t.asset?.legal_lot_code || t.details?.transfer?.snapshot?.legal_lot_code ? `Lô: ${t.asset?.legal_lot_code || t.details?.transfer?.snapshot?.legal_lot_code}` : ''}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-1.5 font-medium text-gray-800 dark:text-slate-200">
                          <span className="truncate max-w-[110px]">{sourceWh?.name || 'Kho xuất'}</span>
                          <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[110px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            {targetWh?.name || 'Kho đích'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <div className="flex flex-col gap-0.5">
                          {t.details?.transfer?.out_voucher_code && (
                            <span className="font-mono text-[11px] text-blue-700 dark:text-blue-400">
                              PX: <strong>{t.details.transfer.out_voucher_code}</strong>
                            </span>
                          )}
                          {t.voucher_code ? (
                            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                              PN: <strong>{t.voucher_code}</strong>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Chưa nhập</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            STAGE_BADGE_CLASSES[stage] || ''
                          }`}
                        >
                          {STAGE_LABELS[stage] || stage}
                        </span>
                      </td>

                      <td className="py-3 px-3.5 text-gray-600 dark:text-slate-400">
                        <div>
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('vi-VN') : '-'}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate max-w-[120px]">
                          {t.transaction?.profiles?.full_name || t.transaction?.profiles?.email || '-'}
                        </div>
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Nút Kho đích: Xác nhận nhận */}
                          {canReceive && (
                            <button
                              type="button"
                              onClick={() => setReceiveItem(t)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                              Xác nhận nhận
                            </button>
                          )}

                          {/* Nút Kho xuất: Kiểm tra điều chỉnh */}
                          {canReviewAdjustment && (
                            <button
                              type="button"
                              onClick={() => setReviewItem(t)}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                              Kiểm tra điều chỉnh
                            </button>
                          )}

                          {/* Nút Kho đích: Từ chối nhận */}
                          {canReject && (
                            <button
                              type="button"
                              onClick={() =>
                                setReasonDialogData({
                                  isOpen: true,
                                  type: 'reject',
                                  item: t,
                                })
                              }
                              className="px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Từ chối nhận
                            </button>
                          )}

                          {/* Nút Kho xuất: Thu hồi lệnh */}
                          {canRecall && (
                            <button
                              type="button"
                              onClick={() =>
                                setReasonDialogData({
                                  isOpen: true,
                                  type: 'cancel',
                                  item: t,
                                })
                              }
                              className="px-2 py-1 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Thu hồi lệnh
                            </button>
                          )}

                          {/* Chi tiết */}
                          <button
                            type="button"
                            onClick={() => setDetailItem(t)}
                            className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredItems.length > pageSize && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
            <div>
              Hiển thị {(page - 1) * pageSize + 1} -{' '}
              {Math.min(page * pageSize, filteredItems.length)} trên tổng số {filteredItems.length} dòng
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 border border-gray-300 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateTransferModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={loadData}
      />

      <ReceiveTransferModal
        isOpen={Boolean(receiveItem)}
        onClose={() => setReceiveItem(null)}
        onSuccess={loadData}
        transfer={receiveItem}
        warehouses={warehouses}
      />

      <ReviewAdjustmentModal
        isOpen={Boolean(reviewItem)}
        onClose={() => setReviewItem(null)}
        onSuccess={loadData}
        transfer={reviewItem}
        warehouses={warehouses}
      />

      <TransferDetailModal
        isOpen={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        transfer={detailItem}
        warehouses={warehouses}
      />

      <TransferReasonDialog
        isOpen={reasonDialogData.isOpen}
        type={reasonDialogData.type}
        certificateNo={
          reasonDialogData.item?.asset?.certificate_no ||
          reasonDialogData.item?.details?.transfer?.snapshot?.certificate_no
        }
        isSubmitting={isReasonSubmitting}
        onConfirm={handleConfirmReason}
        onCancel={() => setReasonDialogData({ isOpen: false, type: 'reject', item: null })}
      />
    </div>
  );
};

export default WarehouseTransfers;
