import React, { useState, useEffect } from 'react';
import { fetchTransactions, decideTransactionItem } from '../api/transactions';
import { DEFAULT_PERMISSIONS_BY_ROLE } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, FileText, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';

const TYPE_LABEL: Record<string, string> = {
  checkout: 'Mượn/Xuất sổ',
  checkin: 'Nhập sổ',
  split: 'Tách sổ',
  mortgage: 'Thế chấp',
  sale_update: 'Xuất bán',
};

const ITEM_STATUS_BADGE: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: 'Chờ duyệt', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
  approved: { label: 'Đã duyệt', className: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Từ chối', className: 'bg-red-100 text-red-800', icon: XCircle },
  completed: { label: 'Hoàn tất', className: 'bg-blue-100 text-blue-800', icon: CheckCircle },
};

function ItemStatusBadge({ status }: { status: string }) {
  const meta = ITEM_STATUS_BADGE[status] || ITEM_STATUS_BADGE.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>
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
      return `Ngày nhập dự kiến: ${details.checkinDate || '-'}`;
    case 'mortgage':
      return `${details.bank || ''} · Định giá ${Number(details.valuation || 0).toLocaleString('vi-VN')}`;
    case 'sale_update':
      return details.saleStatus === 'sold' ? 'Đã bán' : 'Sẵn sàng bán';
    case 'split':
      return `QĐ ${details.decisionNo || ''} · ${(details.splitChildren || []).length} sổ con`;
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

  const effectivePerms = profile?.permissions && profile.permissions.length > 0
    ? profile.permissions
    : DEFAULT_PERMISSIONS_BY_ROLE[profile?.role || 'viewer'] || [];
  const isApprover = effectivePerms.includes('request.approve');

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await fetchTransactions();
      setTransactions(data || []);
    } catch (error) {
      toast.error('Lỗi tải danh sách phiếu yêu cầu');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDecide = async (itemId: string, decision: 'approved' | 'rejected') => {
    if (!user) return;
    setDecidingItemId(itemId);
    try {
      await decideTransactionItem(itemId, decision, user.id);
      toast.success(decision === 'approved' ? 'Đã duyệt' : 'Đã từ chối');
      await loadTransactions();
    } catch (error: any) {
      toast.error('Lỗi khi xử lý: ' + (error.message || ''));
      console.error(error);
    } finally {
      setDecidingItemId(null);
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
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isApprover ? 'Duyệt phiếu yêu cầu' : 'Phiếu yêu cầu của tôi'}
        </h1>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
            <p className="mt-2 text-sm text-gray-500">Đang tải dữ liệu phiếu...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">Chưa có phiếu yêu cầu nào.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {transactions.map((tx) => {
              const { total, pending, approved, rejected } = summarize(tx.items || []);
              const isOpen = expanded.has(tx.id);
              return (
                <div key={tx.id}>
                  <button
                    onClick={() => toggleExpand(tx.id)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-[#1E3A8A]">
                          {TYPE_LABEL[tx.type] || tx.type} · {tx.details?.ticketCode}
                        </div>
                        <div className="text-xs text-gray-500">
                          {tx.requester?.email} · {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="font-semibold text-gray-900">{total}</span> GCN —
                      {pending > 0 && <span className="text-yellow-700">{pending} chờ duyệt</span>}
                      {approved > 0 && <span className="text-green-700 ml-1">{approved} đã duyệt</span>}
                      {rejected > 0 && <span className="text-red-700 ml-1">{rejected} từ chối</span>}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="bg-gray-50 px-6 py-4">
                      <p className="text-xs text-gray-500 mb-3">{detailsSummary(tx.type, tx.details)}</p>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 uppercase">
                            <th className="py-1 pr-4">Số GCN</th>
                            <th className="py-1 pr-4">Trạng thái</th>
                            {isApprover && <th className="py-1 pr-4 text-right">Thao tác</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {(tx.items || []).map((item: any) => (
                            <tr key={item.id} className="border-t border-gray-200">
                              <td className="py-2 pr-4 font-medium text-gray-900">
                                {item.asset?.certificate_no}
                                {tx.type === 'split' && item.asset?.mortgage_status === 'mortgaged' && (
                                  <span className="ml-2 inline-flex items-center text-xs text-rose-600">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Đang thế chấp
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-4"><ItemStatusBadge status={item.status} /></td>
                              {isApprover && (
                                <td className="py-2 pr-4 text-right">
                                  {item.status === 'pending' ? (
                                    <div className="flex justify-end gap-2">
                                      <button
                                        disabled={decidingItemId === item.id}
                                        onClick={() => handleDecide(item.id, 'rejected')}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                      >
                                        Từ chối
                                      </button>
                                      <button
                                        disabled={decidingItemId === item.id}
                                        onClick={() => handleDecide(item.id, 'approved')}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                      >
                                        {decidingItemId === item.id ? 'Đang xử lý...' : 'Duyệt'}
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">
                                      {item.decider?.full_name || item.decider?.email}
                                      {item.decided_at ? ` · ${format(new Date(item.decided_at), 'dd/MM/yyyy HH:mm')}` : ''}
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
