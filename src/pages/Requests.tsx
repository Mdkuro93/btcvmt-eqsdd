import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchTransactions, decideTransactionItem, bulkDecideTransactionItems, voidTransactionItem } from '../api/transactions';
import { fetchOverdueAssets } from '../api/assets';
import { fetchWarehouses, fetchAssets, fetchProjects } from '../api/assets';
import {
  fetchDeclarationRequests,
  approveDeclarationRequest,
  rejectDeclarationRequest,
  bulkApproveDeclarationRequests,
  isDuplicateUnconfirmed,
  BulkApproveDeclarationItem,
} from '../api/assetDeclarationRequests';
import { ReviewDeclarationRequestModal } from '../components/ReviewDeclarationRequestModal';
import { DuplicateCertificateAckDialog } from '../components/DuplicateCertificateAckDialog';
import { resolveAssetCodePrefix } from '../lib/assetIdentifier';
import { DecideRequestModal } from '../components/DecideRequestModal';
import { BulkDecideModal } from '../components/BulkDecideModal';
import { VoucherPrintModal } from '../components/VoucherPrintModal';
import { DEFAULT_PERMISSIONS_BY_ROLE, getEffectivePermissions } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, FileText, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, AlertTriangle, Printer, Filter, Store, RefreshCw, CalendarX, Ban, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Warehouse } from '../types';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';

import { LoadingFallback } from '../components/LoadingFallback';

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
  cancelled: { label: 'Đã hủy', className: 'bg-slate-100 text-slate-700 border border-slate-300', icon: Ban },
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
  const [activeTab, setActiveTab] = useState<'giao_dich' | 'gcn_moi'>('giao_dich');
  const [declarationRequests, setDeclarationRequests] = useState<any[]>([]);
  const [loadingDeclarations, setLoadingDeclarations] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<any>(null);
  const { profile, user, effectiveRole, originalRole } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [overdueAssets, setOverdueAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [decidingItemId, setDecidingItemId] = useState<string | null>(null);
  const [selectedDeclarations, setSelectedDeclarations] = useState<Set<string>>(new Set());

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [modalItem, setModalItem] = useState<any>(null);
  const [modalDecision, setModalDecision] = useState<'approved' | 'rejected' | null>(null);
  
  // Print Modal
  const [printModalData, setPrintModalData] = useState<{ item: any; tx?: any } | null>(null);

  // Duplicate Certificate Ack Dialog State (for both single and bulk approval)
  const [duplicateAckState, setDuplicateAckState] = useState<{
    isOpen: boolean;
    items: {
      requestId: string;
      certificateNo: string;
      projectName?: string;
      message?: string;
      prefix: string | null;
    }[];
  } | null>(null);
  const [isAckSubmitting, setIsAckSubmitting] = useState<boolean>(false);

  // Void Modal
  const [voidModalData, setVoidModalData] = useState<{ item: any; tx?: any } | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [isVoiding, setIsVoiding] = useState<boolean>(false);

  // Filters
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Bulk approval state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  useEffect(() => {
    fetchWarehouses().then(setWarehouses).catch(() => {});
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  const effectivePerms = getEffectivePermissions(profile);
  const isApprover = effectivePerms.includes('request.approve') || profile?.role === 'warehouse_manager' || profile?.role === 'btc_manager';

  const userRole = effectiveRole || profile?.role || user?.role || '';
  const origRole = originalRole || (profile as any)?.originalRole || '';

  const isWarehouseManager = profile?.role === 'warehouse_manager';
  const managedWarehouseIds = profile?.managed_warehouse_ids || [];

  const canVoidItem = (item: any): boolean => {
    if (!profile) return false;
    // Phiếu có lý do luân chuyển: xử lý ở /warehouse-transfers, ẩn nút Hủy tại đây
    if (String(item?.reason || '').trim().toLowerCase() === 'luân chuyển') return false;
    const currentRole = effectiveRole || profile.role || user?.role || '';
    const initialRole = originalRole || (profile as any)?.originalRole || '';

    // admin, super_admin, btc_manager luôn được
    if (
      ['admin', 'super_admin', 'btc_manager'].includes(currentRole) ||
      ['admin', 'super_admin', 'btc_manager'].includes(initialRole)
    ) {
      return true;
    }

    // warehouse_manager chỉ được thấy nút với phiếu mà GCN thuộc kho họ quản lý
    if (
      currentRole === 'warehouse_manager' ||
      initialRole === 'warehouse_manager' ||
      profile.role === 'warehouse_manager'
    ) {
      const managed = profile.managed_warehouse_ids || [];
      const assetWhId =
        item?.asset?.warehouse_id ||
        item?.confirmed_asset?.warehouse_id ||
        item?.details?.warehouse_id ||
        item?.warehouse_id;
      if (assetWhId && Array.isArray(managed) && managed.includes(assetWhId)) {
        return true;
      }
    }

    return false;
  };

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

  const loadDeclarationRequests = async () => {
    setLoadingDeclarations(true);
    try {
      const data = await fetchDeclarationRequests();
      setDeclarationRequests(data || []);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải danh sách đề xuất');
    } finally {
      setLoadingDeclarations(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'gcn_moi') {
      loadDeclarationRequests();
    }
  }, [activeTab]);


  const handleSelectDeclaration = (id: string) => {
    const newSelected = new Set(selectedDeclarations);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDeclarations(newSelected);
  };

  const handleSelectAllDeclarations = () => {
    const pendingReqs = declarationRequests.filter(r => r.status === 'pending');
    if (selectedDeclarations.size === pendingReqs.length && pendingReqs.length > 0) {
      setSelectedDeclarations(new Set());
    } else {
      setSelectedDeclarations(new Set(pendingReqs.map(r => r.id)));
    }
  };

  const handleBulkApproveDeclarations = async () => {
    if (selectedDeclarations.size === 0) return;
    
    if (!window.confirm(`Bạn có chắc muốn duyệt ${selectedDeclarations.size} đề xuất đã chọn? Các GCN được duyệt sẽ gộp chung vào 1 phiếu nhập kho.`)) return;
    
    setLoadingDeclarations(true);
    try {
      const selectedIds = Array.from(selectedDeclarations);
      const items: { request_id: string; asset_code_prefix: string | null }[] = [];

      for (const id of selectedIds) {
        const req = declarationRequests.find(r => r.id === id);
        if (!req) continue;
        let prefix: string | null = null;
        if (req.request_type === 'cap_moi' || req.request_type === 'tach_so') {
          const res = resolveAssetCodePrefix({
            projectId: req.project_id,
            projectName: req.projects?.name,
            projects,
            collateralType: req.collateral_type,
          });
          if (res.isValid) {
            prefix = res.prefix;
          }
        }
        items.push({ request_id: id, asset_code_prefix: prefix });
      }

      const results = await bulkApproveDeclarationRequests(items);
      const duplicateFailed = results.filter((r) => isDuplicateUnconfirmed(r.error_message));
      const otherFailed = results.filter((r) => r.error_message && !isDuplicateUnconfirmed(r.error_message));
      const successCount = results.filter((r) => !r.error_message).length;

      if (successCount > 0) {
        toast.success(`Đã duyệt ${successCount} đề xuất thành công!`);
      }
      if (otherFailed.length > 0) {
        toast.error(`${otherFailed.length} đề xuất lỗi: ${otherFailed.map((f) => f.error_message).join('; ')}`);
      }

      if (duplicateFailed.length > 0) {
        const ackItems = duplicateFailed.map((df) => {
          const req = declarationRequests.find((r) => r.id === df.request_id);
          const origItem = items.find((it) => it.request_id === df.request_id);
          return {
            requestId: df.request_id,
            certificateNo: req?.certificate_no || 'Chưa cập nhật',
            projectName: req?.projects?.name,
            message: df.error_message || undefined,
            prefix: origItem?.asset_code_prefix ?? null,
          };
        });

        setDuplicateAckState({
          isOpen: true,
          items: ackItems,
        });

        // Giữ lại các ID bị trùng số chưa duyệt trong selectedDeclarations
        setSelectedDeclarations(new Set(duplicateFailed.map((df) => df.request_id)));
        loadDeclarationRequests();
        return;
      }

      setSelectedDeclarations(new Set());
      loadDeclarationRequests();
    } catch (err: any) {
      toast.error('Lỗi khi duyệt hàng loạt: ' + err.message);
      loadDeclarationRequests();
    } finally {
      setLoadingDeclarations(false);
    }
  };

  const handleApproveDeclaration = async (req: any) => {
    let prefix: string | null = null;
    try {
      if (req.request_type === 'cap_moi' || req.request_type === 'tach_so') {
        const res = resolveAssetCodePrefix({
          projectId: req.project_id,
          projectName: req.projects?.name,
          projects,
          collateralType: req.collateral_type,
        });
        if (res.isValid) {
          prefix = res.prefix;
        }
      }
      await approveDeclarationRequest(req.id, prefix);
      toast.success('Đã duyệt và nhập kho GCN thành công!');
      loadDeclarationRequests();
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_UNCONFIRMED' || isDuplicateUnconfirmed(err?.message)) {
        setDuplicateAckState({
          isOpen: true,
          items: [
            {
              requestId: req.id,
              certificateNo: req.certificate_no || 'Chưa cập nhật',
              projectName: req.projects?.name,
              message: err.message,
              prefix,
            },
          ],
        });
        return;
      }
      toast.error(err.message || 'Lỗi duyệt yêu cầu');
    }
  };

  const handleConfirmDuplicateAck = async (reasons: Record<string, string>) => {
    if (!duplicateAckState || duplicateAckState.items.length === 0) return;
    setIsAckSubmitting(true);
    try {
      if (duplicateAckState.items.length === 1) {
        const item = duplicateAckState.items[0];
        const reason = reasons[item.requestId]?.trim();
        await approveDeclarationRequest(item.requestId, item.prefix, reason);
        toast.success('Đã xác nhận và duyệt GCN thành công!');
      } else {
        const retryPayload: BulkApproveDeclarationItem[] = duplicateAckState.items.map((it) => ({
          request_id: it.requestId,
          asset_code_prefix: it.prefix,
          duplicate_ack_reason: reasons[it.requestId]?.trim() || null,
        }));
        const results = await bulkApproveDeclarationRequests(retryPayload);
        const successCount = results.filter((r) => !r.error_message).length;
        const failed = results.filter((r) => r.error_message);
        if (failed.length > 0) {
          toast.error(
            `Duyệt được ${successCount}/${retryPayload.length}. Lỗi: ${failed
              .map((f) => f.error_message)
              .join('; ')}`
          );
        } else {
          toast.success(`Đã xác nhận và duyệt thành công ${successCount} hồ sơ trùng số GCN!`);
        }
      }
      setDuplicateAckState(null);
      setSelectedDeclarations(new Set());
      loadDeclarationRequests();
    } catch (err: any) {
      toast.error('Lỗi khi duyệt hồ sơ trùng số GCN: ' + (err.message || ''));
    } finally {
      setIsAckSubmitting(false);
    }
  };

  const handleRejectDeclaration = async (req: any) => {
    const reason = window.prompt('Nhập lý do từ chối:');
    if (reason === null) return;
    try {
      await rejectDeclarationRequest(req.id, reason);
      toast.success('Đã từ chối yêu cầu.');
      loadDeclarationRequests();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi từ chối yêu cầu');
    }
  };
  const loadTransactions = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchTransactions();
      const overdue = await fetchOverdueAssets();
      setOverdueAssets(overdue);
      setTransactions(data || []);
      // Auto expand the first 3
      if (data && data.length > 0) {
        setExpanded(new Set(data.slice(0, 3).map((t: any) => t.id)));
      }
    } catch (error: any) {
      const errMsg = error?.message || 'Lỗi tải danh sách phiếu yêu cầu';
      setLoadError(errMsg);
      toast.error(errMsg);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmVoid = async () => {
    if (!voidModalData?.item?.id) return;
    const reason = voidReason.trim();
    if (reason.length < 5) {
      toast.error('Vui lòng nhập lý do hủy phiếu (tối thiểu 5 ký tự)');
      return;
    }

    setIsVoiding(true);
    try {
      const result = await voidTransactionItem(voidModalData.item.id, reason);
      toast.success('Hủy phiếu thành công. Trạng thái tài sản đã được hoàn trả về kho.');
      
      // Nếu kết quả RPC có asset_restored = false thì hiện thêm toast cảnh báo "GCN không bị thay đổi vì đã có phiếu mới hơn"
      if (result && result.asset_restored === false) {
        toast('GCN không bị thay đổi vì đã có phiếu mới hơn', {
          icon: '⚠️',
          duration: 5000,
        });
      }

      setVoidModalData(null);
      setVoidReason('');
      await loadTransactions();
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi khi hủy phiếu');
    } finally {
      setIsVoiding(false);
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
    // Không cho chọn phiếu có lý do luân chuyển
    const targetItem = transactions.flatMap(t => t.items || []).find(i => i.id === itemId);
    if (String(targetItem?.reason || '').trim().toLowerCase() === 'luân chuyển') return;

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
        const isTransfer = String(i?.reason || '').trim().toLowerCase() === 'luân chuyển';
        if (selectedItems.has(i.id) && !isTransfer) list.push({ ...i, transaction_id: tx.id, transaction: tx });
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
      
      {overdueAssets.length > 0 && isApprover && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 md:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CalendarX className="w-5 h-5 text-red-600" />
            <h3 className="text-sm font-bold text-red-900 uppercase">Cảnh báo: {overdueAssets.length} GCN đang quá hạn trả</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {overdueAssets.map(asset => (
              <div key={asset.id} className="bg-white rounded-lg p-3 border border-red-100 shadow-xs flex flex-col min-w-[200px]">
                <span className="font-bold text-red-900 text-sm">{asset.certificate_no}</span>
                <span className="text-xs text-red-800 font-medium mt-1">Mượn bởi: {asset.current_holder_dept || 'Chưa rõ'}</span>
                <span className="text-xs text-gray-500 mt-0.5">Hạn trả: {asset.expected_return_date ? new Date(asset.expected_return_date).toLocaleDateString('vi-VN') : '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-800 gap-6 px-1">
        <button
          onClick={() => setActiveTab('giao_dich')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'giao_dich'
              ? 'border-blue-600 dark:border-blue-400 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          Phiếu yêu cầu giao dịch
        </button>
        <button
          onClick={() => setActiveTab('gcn_moi')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'gcn_moi'
              ? 'border-blue-600 dark:border-blue-400 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          Đề xuất GCN mới (Khai báo)
        </button>
      </div>

      {activeTab === 'giao_dich' ? (<>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
            {isApprover ? 'Duyệt phiếu & Quản lý Kho' : 'Phiếu yêu cầu của tôi'}
          </h1>
          {isWarehouseManager && (
            <div className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-md mt-1 inline-flex">
              <Store className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              <span>Phân quyền Quản lý kho: Đang phụ trách <b>{managedWarehouseIds.length}</b> kho</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTransactions}
            className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Tải lại danh sách"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isApprover && selectedItems.size > 0 && (
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="bg-[#1E3A8A] dark:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-xs hover:bg-blue-800 dark:hover:bg-blue-500 shadow-sm cursor-pointer"
            >
              Duyệt nhanh {selectedItems.size} mục đã chọn
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center gap-3 text-xs transition-colors">
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400 font-semibold">
          <Filter className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" /> Bộ lọc:
        </div>

        {/* Warehouse filter */}
        <select
          value={selectedWarehouseFilter}
          onChange={e => setSelectedWarehouseFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
        >
          <option value="all" className="bg-white dark:bg-slate-900">-- Tất cả kho lưu trữ --</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id} className="bg-white dark:bg-slate-900">
              {w.name} {w.is_central ? '(Kho TT)' : ''}
            </option>
          ))}
        </select>

        {/* Transaction Type Filter */}
        <select
          value={selectedTypeFilter}
          onChange={e => setSelectedTypeFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
        >
          <option value="all" className="bg-white dark:bg-slate-900">-- Tất cả loại nghiệp vụ --</option>
          <option value="checkout" className="bg-white dark:bg-slate-900">Mượn/Xuất sổ</option>
          <option value="checkin" className="bg-white dark:bg-slate-900">Nhập sổ</option>
          <option value="split" className="bg-white dark:bg-slate-900">Tách sổ / Cấp đổi</option>
          <option value="mortgage" className="bg-white dark:bg-slate-900">Thế chấp</option>
          <option value="sale_update" className="bg-white dark:bg-slate-900">Xuất bán</option>
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatusFilter}
          onChange={e => setSelectedStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
        >
          <option value="all" className="bg-white dark:bg-slate-900">-- Tất cả trạng thái --</option>
          <option value="pending" className="bg-white dark:bg-slate-900">Chờ duyệt</option>
          <option value="approved" className="bg-white dark:bg-slate-900">Đã duyệt</option>
          <option value="rejected" className="bg-white dark:bg-slate-900">Từ chối</option>
        </select>
      </div>

      {/* Main Transactions List */}
      <div className="bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
        {loading ? (
          <LoadingFallback
            message="Đang tải danh sách phiếu yêu cầu..."
            onRetry={() => loadTransactions()}
          />
        ) : loadError ? (
          <div className="p-8 text-center bg-red-50/50 dark:bg-red-950/30">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-red-900 dark:text-red-200 mb-1">Không thể tải dữ liệu phiếu yêu cầu</h3>
            <p className="text-sm text-red-700 dark:text-red-300 max-w-xl mx-auto mb-4">{loadError}</p>
            <button
              onClick={() => loadTransactions()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Thử lại
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">
            Không có phiếu yêu cầu nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {filteredTransactions.map((tx: any) => {
              const { total, pending, approved, rejected } = summarize(tx.items || []);
              const isOpen = expanded.has(tx.id);
              return (
                <div key={tx.id} className="transition-colors">
                  <button
                    onClick={() => toggleExpand(tx.id)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/60 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 dark:text-slate-500" /> : <ChevronRight className="w-4 h-4 text-gray-400 dark:text-slate-500" />}
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-700 dark:text-blue-400">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#1E3A8A] dark:text-blue-400 flex items-center gap-2">
                          <span>{TYPE_LABEL[tx.type] || tx.type}</span>
                          <span className="text-xs font-normal text-gray-400 dark:text-slate-500">|</span>
                          <span className="text-xs font-mono text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {tx.id?.slice(0, 8)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                          Đề xuất bởi: <span className="font-medium text-gray-700 dark:text-slate-300">{tx.created_by?.full_name || tx.created_by?.email || 'N/A'}</span> · {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
                      {(tx.scan_url || tx.details?.scan_url || tx.details?.scanUrl) && (
                        <a
                          href={tx.scan_url || tx.details?.scan_url || tx.details?.scanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors"
                          title="Mở file scan đính kèm trên OneDrive"
                        >
                          📄 Xem file đính kèm
                        </a>
                      )}
                      <span className="font-bold text-gray-900 dark:text-slate-100 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{total} GCN</span>
                      {pending > 0 && <span className="text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">{pending} chờ duyệt</span>}
                      {approved > 0 && <span className="text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">{approved} đã duyệt</span>}
                      {rejected > 0 && <span className="text-rose-700 dark:text-rose-300 font-semibold bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">{rejected} từ chối</span>}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="bg-slate-50/70 dark:bg-slate-850 border-t border-gray-100 dark:border-slate-800 px-6 py-4">
                      <div className="mb-3 text-xs text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="font-semibold text-gray-800 dark:text-slate-200">Căn cứ / Ghi chú đề xuất:</span> {detailsSummary(tx.type, tx.details) || 'Không có ghi chú thêm'}
                        </div>
                        {(tx.scan_url || tx.details?.scan_url || tx.details?.scanUrl) && (
                          <a
                            href={tx.scan_url || tx.details?.scan_url || tx.details?.scanUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-semibold transition-colors"
                            title="Mở file scan đính kèm trên OneDrive trong tab mới"
                          >
                            📄 Xem file đính kèm
                          </a>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500 dark:text-slate-400 uppercase tracking-wider border-b border-gray-200 dark:border-slate-700">
                              {isApprover && <th className="py-2 pr-3 w-8"></th>}
                              <th className="py-2 pr-4 font-semibold">Số GCN</th>
                              <th className="py-2 pr-4 font-semibold">Dự án & Vị trí</th>
                              <th className="py-2 pr-4 font-semibold">Kho lưu trữ</th>
                              <th className="py-2 pr-4 font-semibold">Chứng từ (PN/PX)</th>
                              <th className="py-2 pr-4 font-semibold">Trạng thái</th>
                              <th className="py-2 pr-4 text-right font-semibold">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                            {(tx.items || []).map((item: any) => {
                              const effectiveAsset = item.confirmed_asset || item.asset;
                              const whId = getResponsibleWarehouseId(item, tx.type);
                              const isOverdueSLA = item.status === 'pending' && tx.details?.desiredReceiveDate && new Date(tx.details.desiredReceiveDate) < new Date(new Date().setHours(0, 0, 0, 0));
                              const warehouseObj = warehouses.find(w => w.id === whId);
                              const isTransfer = String(item?.reason || '').trim().toLowerCase() === 'luân chuyển' ||
                                                 String(tx?.reason || '').trim().toLowerCase() === 'luân chuyển' ||
                                                 String(tx?.details?.reason || '').trim().toLowerCase() === 'luân chuyển';

                              return (
                                <tr key={item.id} className="hover:bg-white dark:hover:bg-slate-800/60 transition-colors">
                                  {isApprover && (
                                    <td className="py-2.5 pr-3">
                                      {item.status === 'pending' && !isTransfer && (
                                        <input 
                                          type="checkbox" 
                                          checked={selectedItems.has(item.id)}
                                          onChange={() => toggleItemSelection(item.id)}
                                          className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-600 rounded focus:ring-blue-500 cursor-pointer"
                                        />
                                      )}
                                    </td>
                                  )}
                                  <td className="py-2.5 pr-4">
                                    <div className="font-bold text-gray-900 dark:text-slate-100">
                                      {effectiveAsset?.certificate_no}
                                      {item.confirmed_asset_id && item.confirmed_asset_id !== item.asset_id && (
                                        <span className="ml-1.5 text-[10px] bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded font-semibold">
                                          Đã đổi GCN
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="text-[11px] text-gray-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                                      <span>Số vào sổ: {effectiveAsset?.registry_no || '-'}</span>
                                      {isOverdueSLA && (
                                        <span className="text-red-700 dark:text-red-300 font-bold bg-red-100 dark:bg-red-950/80 border border-red-300 dark:border-red-800 px-1.5 py-0.5 rounded text-[10px] animate-pulse">
                                          ⚠️ Quá hạn xử lý (SLA)
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <div className="text-gray-800 dark:text-slate-200 font-medium">{effectiveAsset?.projects?.name || '---'}</div>
                                    <div className="text-gray-500 dark:text-slate-400 text-[11px]">{effectiveAsset?.legal_lot_code || '-'}</div>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <span className="inline-flex items-center gap-1 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                                      <Store className="w-3 h-3 text-gray-500 dark:text-slate-400" />
                                      {warehouseObj?.name || 'Chưa gán kho'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    {item.voucher_code ? (
                                      <span className="font-mono font-bold text-[#1E3A8A] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                        {item.voucher_code}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 dark:text-slate-500 italic">Chưa phát hành</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <ItemStatusBadge status={item.status} />
                                  </td>
                                  <td className="py-2.5 pr-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {isTransfer ? (
                                        <Link
                                          to="/warehouse-transfers"
                                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-md transition-colors"
                                          title="Phiếu điều chuyển kho — chuyển sang trang Luân chuyển kho để xử lý"
                                        >
                                          <span>Luân chuyển kho</span>
                                          <ArrowRight className="w-3 h-3" />
                                        </Link>
                                      ) : (
                                        <>
                                          {/* Print Button if approved or has voucher */}
                                          {(item.status === 'approved' || item.status === 'completed' || item.voucher_code) && (
                                            <button
                                              type="button"
                                              onClick={() => setPrintModalData({ item, tx })}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1E3A8A] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-md transition-colors cursor-pointer"
                                              title="In phiếu xuất/nhập A4"
                                            >
                                              <Printer className="w-3 h-3" /> In biên bản
                                            </button>
                                          )}

                                          {/* Void Button */}
                                          {canVoidItem(item) && ['approved', 'confirmed', 'checked_out', 'completed'].includes(item.status) && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setVoidModalData({ item, tx });
                                                setVoidReason('');
                                              }}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800 rounded-md transition-colors cursor-pointer"
                                              title="Hủy phiếu và hoàn trả tài sản về kho"
                                            >
                                              <Ban className="w-3 h-3" /> Hủy phiếu
                                            </button>
                                          )}

                                          {isApprover && item.status === 'pending' && (
                                            <>
                                              <button
                                                disabled={decidingItemId === item.id}
                                                onClick={() => handleDecide(item, 'rejected')}
                                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-50 cursor-pointer"
                                              >
                                                Từ chối
                                              </button>
                                              <button
                                                disabled={decidingItemId === item.id}
                                                onClick={() => handleDecide(item, 'approved')}
                                                className="px-3 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 shadow-sm cursor-pointer"
                                              >
                                                {decidingItemId === item.id ? 'Đang xử lý...' : 'Duyệt phiếu'}
                                              </button>
                                            </>
                                          )}
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
      

      </>) : (
      <div className="bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
        {loadingDeclarations ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Đang tải...</div>
        ) : declarationRequests.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">Chưa có đề xuất khai báo GCN nào.</div>
        ) : (
          <>
          {isApprover && selectedDeclarations.size > 0 && (
            <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/60 border-b border-blue-100 dark:border-blue-900/60 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-200">Đã chọn {selectedDeclarations.size} đề xuất</span>
              <button 
                onClick={handleBulkApproveDeclarations}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm cursor-pointer"
              >
                Duyệt hàng loạt
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-slate-800/80">
                <tr className="text-left text-gray-500 dark:text-slate-400 uppercase tracking-wider border-b border-gray-200 dark:border-slate-700">
                  <th className="py-3 px-4 font-semibold">Loại YC / Ngày</th>
                  <th className="py-3 px-4 font-semibold">GCN & Lô đất</th>
                  <th className="py-3 px-4 font-semibold">Người yêu cầu</th>
                  <th className="py-3 px-4 font-semibold">Trạng thái</th>
                  <th className="py-3 px-4 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {declarationRequests.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors">
                    {isApprover && (
                      <td className="py-3 pl-4 pr-2">
                        {req.status === 'pending' && (
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 dark:border-slate-600 cursor-pointer"
                            checked={selectedDeclarations.has(req.id)}
                            onChange={() => handleSelectDeclaration(req.id)}
                          />
                        )}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <div className="font-bold text-blue-900 dark:text-blue-400">
                        {req.request_type === 'cap_moi' ? 'Cấp mới' : req.request_type === 'tach_so' ? 'Tách sổ' : 'Cấp đổi'}
                      </div>
                      <div className="text-gray-500 dark:text-slate-400">{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{req.certificate_no}</div>
                      <div className="text-gray-500 dark:text-slate-400">{req.projects?.name || '-'} {req.legal_lot_code ? '· ' + req.legal_lot_code : ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900 dark:text-slate-100">{req.requester?.full_name || '-'}</div>
                      <div className="text-gray-500 dark:text-slate-400">{req.requester?.email || '-'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <ItemStatusBadge status={req.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setReviewRequest(req)}
                          className={`px-3 py-1 rounded font-semibold text-xs transition-colors cursor-pointer ${
                            isApprover && req.status === 'pending'
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                              : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 border border-blue-200 dark:border-slate-700'
                          }`}
                        >
                          {isApprover && req.status === 'pending' ? 'Xem & Phê duyệt' : 'Chi tiết'}
                        </button>
                        {isApprover && req.status === 'pending' && (
                          <button
                            onClick={() => handleRejectDeclaration(req)}
                            className="px-3 py-1 rounded text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-rose-950/50 border border-red-200 dark:border-rose-800 font-semibold text-xs cursor-pointer"
                          >
                            Từ chối
                          </button>
                        )}
                      </div>
                      {req.status === 'rejected' && req.rejection_reason && (
                        <div className="text-red-600 dark:text-red-400 text-[11px] mt-1 text-right">Lý do: {req.rejection_reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      )}


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

      {reviewRequest && (
        <ReviewDeclarationRequestModal
          isOpen={!!reviewRequest}
          onClose={() => setReviewRequest(null)}
          onSuccess={loadDeclarationRequests}
          request={reviewRequest}
        />
      )}

      {/* Duplicate Certificate Ack Dialog (for single or bulk approve) */}
      <DuplicateCertificateAckDialog
        isOpen={Boolean(duplicateAckState?.isOpen)}
        items={duplicateAckState?.items || []}
        isSubmitting={isAckSubmitting}
        onConfirm={handleConfirmDuplicateAck}
        onCancel={() => setDuplicateAckState(null)}
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

      {/* Void Ticket Modal */}
      {voidModalData && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold">Hủy phiếu giao dịch</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isVoiding) {
                    setVoidModalData(null);
                    setVoidReason('');
                  }
                }}
                disabled={isVoiding}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg p-3 text-xs text-rose-800 dark:text-rose-300">
              <p className="font-semibold mb-1">Cảnh báo hành động:</p>
              <p>Phiếu giao dịch sẽ được chuyển sang trạng thái <span className="font-bold">Đã hủy (cancelled)</span> và tài sản liên quan sẽ được tự động hoàn trả về <span className="font-bold">Trong kho (in_stock)</span>.</p>
            </div>

            <div className="text-xs space-y-2 bg-gray-50 dark:bg-slate-800/60 p-3 rounded-lg border border-gray-200 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Số GCN:</span>
                <span className="font-semibold text-gray-900 dark:text-slate-100">
                  {voidModalData.item.confirmed_asset?.certificate_no || voidModalData.item.asset?.certificate_no || '-'}
                </span>
              </div>
              {voidModalData.item.voucher_code && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">Mã phiếu (PN/PX):</span>
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                    {voidModalData.item.voucher_code}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">Trạng thái hiện tại:</span>
                <ItemStatusBadge status={voidModalData.item.status} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                Lý do hủy phiếu (bắt buộc, tối thiểu 5 ký tự): <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Nhập lý do hủy phiếu (tối thiểu 5 ký tự)..."
                className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 dark:bg-slate-800 dark:text-slate-100"
                disabled={isVoiding}
              />
              {voidReason.trim().length > 0 && voidReason.trim().length < 5 && (
                <p className="text-[11px] text-red-500 mt-1">
                  Lý do hủy phải có tối thiểu 5 ký tự (hiện có {voidReason.trim().length} ký tự).
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setVoidModalData(null);
                  setVoidReason('');
                }}
                disabled={isVoiding}
                className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={voidReason.trim().length < 5 || isVoiding}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm cursor-pointer transition-colors"
              >
                {isVoiding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang hủy...
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" /> Xác nhận Hủy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Requests;