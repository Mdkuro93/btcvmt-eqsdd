import React, { useState, useEffect, useMemo } from 'react';
import { fetchTransactions, decideTransactionItem, bulkDecideTransactionItems } from '../api/transactions';
import { fetchWarehouses } from '../api/assets';
import { DecideRequestModal } from '../components/DecideRequestModal';
import { BulkDecideModal } from '../components/BulkDecideModal';
import { VoucherPrintModal } from '../components/VoucherPrintModal';
import { DEFAULT_PERMISSIONS_BY_ROLE } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, FileText, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, AlertTriangle, Printer, Filter, Store, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Warehouse } from '../types';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';

import { LoadingFallback } from '../components/LoadingFallback';
import { mockStore } from '../lib/mockStore';

const TYPE_LABEL: Record<string, string> = {
  checkout: 'Mượn/Xuất sổ',
  checkin: 'Nhập sổ',
  split: 'Tách sổ',
  mortgage: 'Thế chấp',
  sale_update: 'Xuất bán',
};

const ITEM_STATUS_BADGE: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: 'Chờ duyệt', className: 'bg-yellow-100 text-yellow-800 border border-yellow-300', icon: Clock },
  approved: { label: 'Đã duyệt', className: 'bg-emerald-100 text-emerald-800 border border-emerald-300', icon: CheckCircle },
  rejected: { label: 'Từ chối', className: 'bg-rose-100 text-rose-800 border border-rose-300', icon: XCircle },
  completed: { label: 'Hoàn tất', className: 'bg-blue-100 text-blue-800 border border-blue-300', icon: CheckCircle },
};

function ItemStatusBadge({ status }: { status: string }) {
  const meta = ITEM_STATUS_BADGE[status] || ITEM_STATUS_BADGE.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${meta.className}`}>
      <Icon className="w-3 h-3 mr-1" /> {meta.label}
    </span>
  );
}

function detailsSummary(type: string, details: any) {
  if (!details) return '';
  switch (type) {
    case 'checkout':
      return `${details.department || ''} — ${details.reason || ''}`;
    case 'checkin':
      return `Ngày nhập thực tế: ${details.checkinDate || '-'}`;
    case 'mortgage':
      return `${details.bank || ''} · Định giá ${Number(details.valuation || 0).toLocaleString('vi-VN')} VNĐ`;
    case 'sale_update':
      return details.saleStatus === 'sold' ? 'Đã bán' : 'Sẵn sàng bán';
    case 'split':
      if (details.splitType === 'reissue') {
        return `Cấp đổi sang GCN mới: ${details.newCertificateNo || 'Chưa nhập'}`;
      } else if (details.splitType === 'partial') {
        return `Tách 1 phần (QĐ ${details.decisionNo || ''}) · ${(details.splitChildren || []).length} sổ con · DT còn lại: ${(details.remainingArea || 0).toLocaleString('vi-VN')} m²`;
      }
      return `Tách toàn bộ (QĐ ${details.decisionNo || ''}) · ${(details.splitChildren || []).length} sổ con (Sổ mẹ hết HL)`;
    default:
      return '';
  }
}

export const Requests: React.FC = () => {
  const { profile, user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [decidingItemId, setDecidingItemId] = useState<string | null>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [modalItem, setModalItem] = useState<any>(null);
  const [modalDecision, setModalDecision] = useState<'approved' | 'rejected' | null>(null);
  
  // Print Modal
  const [printModalData, setPrintModalData] = useState<{ item: any; tx?: any } | null>(null);

  // Filters
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Bulk approval state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  useEffect(() => {
    fetchWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  const effectivePerms = profile?.permissions && profile.permissions.length > 0
    ? profile.permissions
    : DEFAULT_PERMISSIONS_BY_ROLE[profile?.role || 'viewer'] || [];
  const isApprover = effectivePerms.includes('request.approve') || profile?.role === 'warehouse_manager' || profile?.role === 'btc_manager';

  const isWarehouseManager = profile?.role === 'warehouse_manager';
  const managedWarehouseIds = profile?.managed_warehouse_ids || [];

  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel1 = supabase.channel('txs_page_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadTransactions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_items' }, () => loadTransactions())
      .subscribe();
    return () => {
      supabase.removeChannel(channel1);
    };
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await fetchTransactions();
      setTransactions(data || []);
      // Auto expand the first 3
      if (data && data.length > 0) {
        setExpanded(new Set(data.slice(0, 3).map((t: any) => t.id)));
      }
    } catch (error) {
      toast.error('Lỗi tải danh sách phiếu yêu cầu');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Filter transactions based on warehouse manager scope and active filters
  const filteredTransactions = useMemo(() => {
    return transactions.map(tx => {
      let items = tx.items || [];

      // 1. Role-based filtering for warehouse_manager
      if (isWarehouseManager) {
        items = items.filter((it: any) => {
          const whId = getResponsibleWarehouseId(it, tx.type);
          return whId && managedWarehouseIds.includes(whId);
        });
      }

      // 2. Global warehouse dropdown filter
      if (selectedWarehouseFilter !== 'all') {
        items = items.filter((it: any) => {
          const whId = getResponsibleWarehouseId(it, tx.type);
          return whId === selectedWarehouseFilter;
        });
      }

      // 3. Type filter
      if (selectedTypeFilter !== 'all' && tx.type !== selectedTypeFilter) {
        return null;
      }

      // 4. Status filter
      if (selectedStatusFilter !== 'all') {
        items = items.filter((it: any) => it.status === selectedStatusFilter);
      }

      if (items.length === 0) return null;

      return {
        ...tx,
        items,
      };
    }).filter(Boolean);
  }, [transactions, isWarehouseManager, managedWarehouseIds, selectedWarehouseFilter, selectedTypeFilter, selectedStatusFilter]);

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const getSelectedItemsFull = () => {
    const list: any[] = [];
    transactions.forEach(tx => {
      (tx.items || []).forEach((i: any) => {
        if (selectedItems.has(i.id)) list.push({ ...i, transaction_id: tx.id, transaction: tx });
      });
    });
    return list;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDecide = (item: any, decision: 'approved' | 'rejected') => {
    setModalItem(item);
    setModalDecision(decision);
  };

  const confirmBulkDecision = async (payload: {
    approvedItems: any[];
    excludedItemIds: string[];
    originalRequestedCount: number;
    globalNotes: string;
    transactionId?: string;
  }) => {
    if (!user) return;
    try {
      await bulkDecideTransactionItems({
        transactionId: payload.transactionId,
        approvedItems: payload.approvedItems,
        excludedItemIds: payload.excludedItemIds,
        originalRequestedCount: payload.originalRequestedCount,
        globalNotes: payload.globalNotes,
        performerId: user.id,
      });

      toast.success(
        payload.approvedItems.length !== payload.originalRequestedCount
          ? `Đã duyệt với điều chỉnh (Yêu cầu: ${payload.originalRequestedCount} — Thực nhận: ${payload.approvedItems.length} sổ)`
          : 'Đã duyệt hàng loạt thành công'
      );
      await loadTransactions();
      setSelectedItems(new Set());
    } catch (error: any) {
      toast.error('Lỗi khi duyệt hàng loạt: ' + (error.message || ''));
      console.error(error);
    }
  };

  const confirmDecision = async (decision: 'approved' | 'rejected', notes: string, finalDetails?: any, confirmedAssetId?: string) => {
    if (!user || !modalItem) return;
    setDecidingItemId(modalItem.id);
    try {
      await decideTransactionItem(modalItem.id, decision, notes, user.id, finalDetails, confirmedAssetId);
      toast.success(decision === 'approved' ? 'Đã duyệt yêu cầu và phát hành mã chứng từ' : 'Đã từ chối');
      await loadTransactions();
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(modalItem.id);
        return next;
      });
    } catch (error: any) {
      toast.error('Lỗi khi xử lý: ' + (error.message || ''));
      console.error(error);
    } finally {
      setDecidingItemId(null);
      setModalItem(null);
      setModalDecision(null);
    }
  };

  const summarize = (items: any[]) => {
    const total = items?.length || 0;
    const pending = items?.filter((i) => i.status === 'pending').length || 0;
    const approved = items?.filter((i) => i.status === 'approved' || i.status === 'completed').length || 0;
    const rejected = items?.filter((i) => i.status === 'rejected').length || 0;
    return { total, pending, approved, rejected };
  };

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Header & Role Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {isApprover ? 'Duyệt phiếu & Quản lý Kho' : 'Phiếu yêu cầu của tôi'}
          </h1>
          {isWarehouseManager && (
            <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md mt-1 inline-flex">
              <Store className="w-3.5 h-3.5 text-amber-700" />
              <span>Phân quyền Thủ kho: Đang phụ trách <b>{managedWarehouseIds.length}</b> kho</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTransactions}
            className="p-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Tải lại danh sách"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isApprover && selectedItems.size > 0 && (
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="bg-[#1E3A8A] text-white px-4 py-2 rounded-lg font-semibold text-xs hover:bg-blue-800 shadow-sm"
            >
              Duyệt nhanh {selectedItems.size} mục đã chọn
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-gray-600 font-semibold">
          <Filter className="w-3.5 h-3.5 text-blue-700" /> Bộ lọc:
        </div>

        {/* Warehouse filter */}
        <select
          value={selectedWarehouseFilter}
          onChange={e => setSelectedWarehouseFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white font-medium focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">-- Tất cả kho lưu trữ --</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>
              {w.name} {w.is_central ? '(Kho TT)' : ''}
            </option>
          ))}
        </select>

        {/* Transaction Type Filter */}
        <select
          value={selectedTypeFilter}
          onChange={e => setSelectedTypeFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white font-medium focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">-- Tất cả loại nghiệp vụ --</option>
          <option value="checkout">Mượn/Xuất sổ</option>
          <option value="checkin">Nhập sổ</option>
          <option value="split">Tách sổ / Cấp đổi</option>
          <option value="mortgage">Thế chấp</option>
          <option value="sale_update">Xuất bán</option>
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatusFilter}
          onChange={e => setSelectedStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white font-medium focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">-- Tất cả trạng thái --</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
        </select>
      </div>

      {/* Main Transactions List */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <LoadingFallback
            message="Đang tải danh sách phiếu yêu cầu..."
            onRetry={() => loadTransactions()}
            onForceLocal={() => {
              const data = mockStore.getTransactions();
              setTransactions(data || []);
              if (data && data.length > 0) {
                setExpanded(new Set(data.slice(0, 3).map((t: any) => t.id)));
              }
              setLoading(false);
              toast.success('Đã tải dữ liệu phiếu cục bộ');
            }}
          />
        ) : filteredTransactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            Không có phiếu yêu cầu nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTransactions.map((tx: any) => {
              const { total, pending, approved, rejected } = summarize(tx.items || []);
              const isOpen = expanded.has(tx.id);
              return (
                <div key={tx.id} className="transition-colors">
                  <button
                    onClick={() => toggleExpand(tx.id)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#1E3A8A] flex items-center gap-2">
                          <span>{TYPE_LABEL[tx.type] || tx.type}</span>
                          <span className="text-xs font-normal text-gray-400">|</span>
                          <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {tx.id?.slice(0, 8)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Đề xuất bởi: <span className="font-medium text-gray-700">{tx.created_by?.full_name || tx.created_by?.email || 'N/A'}</span> · {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full">{total} GCN</span>
                      {pending > 0 && <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">{pending} chờ duyệt</span>}
                      {approved > 0 && <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">{approved} đã duyệt</span>}
                      {rejected > 0 && <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-full">{rejected} từ chối</span>}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="bg-slate-50/70 border-t border-gray-100 px-6 py-4">
                      <div className="mb-3 text-xs text-gray-600 bg-white p-2.5 rounded-lg border border-gray-200">
                        <span className="font-semibold text-gray-800">Căn cứ / Ghi chú đề xuất:</span> {detailsSummary(tx.type, tx.details) || 'Không có ghi chú thêm'}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500 uppercase tracking-wider border-b border-gray-200">
                              {isApprover && <th className="py-2 pr-3 w-8"></th>}
                              <th className="py-2 pr-4 font-semibold">Số GCN</th>
                              <th className="py-2 pr-4 font-semibold">Dự án & Vị trí</th>
                              <th className="py-2 pr-4 font-semibold">Kho lưu trữ</th>
                              <th className="py-2 pr-4 font-semibold">Chứng từ (PN/PX)</th>
                              <th className="py-2 pr-4 font-semibold">Trạng thái</th>
                              <th className="py-2 pr-4 text-right font-semibold">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(tx.items || []).map((item: any) => {
                              const effectiveAsset = item.confirmed_asset || item.asset;
                              const whId = getResponsibleWarehouseId(item, tx.type);
                              const warehouseObj = warehouses.find(w => w.id === whId);

                              return (
                                <tr key={item.id} className="hover:bg-white transition-colors">
                                  {isApprover && (
                                    <td className="py-2.5 pr-3">
                                      {item.status === 'pending' && (
                                        <input 
                                          type="checkbox" 
                                          checked={selectedItems.has(item.id)}
                                          onChange={() => toggleItemSelection(item.id)}
                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                      )}
                                    </td>
                                  )}
                                  <td className="py-2.5 pr-4">
                                    <div className="font-bold text-gray-900">
                                      {effectiveAsset?.certificate_no}
                                      {item.confirmed_asset_id && item.confirmed_asset_id !== item.asset_id && (
                                        <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-semibold">
                                          Đã đổi GCN
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      Số vào sổ: {effectiveAsset?.registry_no || '-'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <div className="text-gray-800 font-medium">{effectiveAsset?.projects?.name || 'VMT'}</div>
                                    <div className="text-gray-500 text-[11px]">{effectiveAsset?.subdivision || '-'} · Lô {effectiveAsset?.lot_no || effectiveAsset?.land_lot_no || '-'}</div>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <span className="inline-flex items-center gap-1 text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                                      <Store className="w-3 h-3 text-gray-500" />
                                      {warehouseObj?.name || 'Kho Trung tâm'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    {item.voucher_code ? (
                                      <span className="font-mono font-bold text-[#1E3A8A] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                        {item.voucher_code}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 italic">Chưa phát hành</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <ItemStatusBadge status={item.status} />
                                  </td>
                                  <td className="py-2.5 pr-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {/* Print Button if approved or has voucher */}
                                      {(item.status === 'approved' || item.status === 'completed' || item.voucher_code) && (
                                        <button
                                          type="button"
                                          onClick={() => setPrintModalData({ item, tx })}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                                          title="In phiếu xuất/nhập A4"
                                        >
                                          <Printer className="w-3 h-3" /> In biên bản
                                        </button>
                                      )}

                                      {isApprover && item.status === 'pending' && (
                                        <>
                                          <button
                                            disabled={decidingItemId === item.id}
                                            onClick={() => handleDecide(item, 'rejected')}
                                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                          >
                                            Từ chối
                                          </button>
                                          <button
                                            disabled={decidingItemId === item.id}
                                            onClick={() => handleDecide(item, 'approved')}
                                            className="px-3 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                                          >
                                            {decidingItemId === item.id ? 'Đang xử lý...' : 'Duyệt phiếu'}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Decision Modal */}
      <DecideRequestModal
        isOpen={!!modalItem && !!modalDecision}
        onClose={() => { setModalItem(null); setModalDecision(null); }}
        onConfirm={confirmDecision}
        item={modalItem}
        decisionType={modalDecision!}
        warehouses={warehouses}
        onOpenPrint={(itemWithDetails) => setPrintModalData({ item: itemWithDetails })}
      />

      {/* Bulk Approval Modal */}
      <BulkDecideModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onConfirm={confirmBulkDecision}
        items={getSelectedItemsFull()}
        warehouses={warehouses}
        onOpenPrint={(payload) => setPrintModalData({ item: payload.item, tx: payload.transaction })}
      />

      {/* Standard A4 Printable Voucher Modal */}
      {printModalData && (
        <VoucherPrintModal
          isOpen={!!printModalData}
          onClose={() => setPrintModalData(null)}
          item={printModalData.item}
          transaction={printModalData.tx}
          warehouse={warehouses.find(w => w.id === getResponsibleWarehouseId(printModalData.item, printModalData.tx?.type || 'checkout'))}
        />
      )}
    </div>
  );
};
