import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  ShieldCheck, Clock, AlertTriangle, XCircle, RefreshCw, Send, Warehouse as WarehouseIcon,
  Loader2, FileSearch, Lock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchMyAccessOverview,
  requestWarehouseAccess,
  MyAccessOverview,
  MyWarehouseCatalogItem,
} from '../api/accessRequests';

type RowState = 'admin' | 'active' | 'expiring' | 'expired' | 'pending' | 'rejected' | 'none';

const EXPIRING_DAYS = 30;

interface Row {
  warehouse: MyWarehouseCatalogItem;
  state: RowState;
  expiresAt: string | null;
  rejectReason: string | null;
  requestedAt: string | null;
}

const fmt = (iso: string | null | undefined) => (iso ? format(new Date(iso), 'dd/MM/yyyy') : '—');

function buildRows(overview: MyAccessOverview, isAdmin: boolean): Row[] {
  const now = Date.now();
  const soon = now + EXPIRING_DAYS * 24 * 60 * 60 * 1000;

  return overview.warehouses.map(w => {
    if (isAdmin) {
      return {
        warehouse: w,
        state: 'admin',
        expiresAt: null,
        rejectReason: null,
        requestedAt: null,
      };
    }

    const acc = overview.access.find(a => a.warehouse_id === w.id);
    const reqs = overview.requests.filter(r => r.warehouse_id === w.id); // đã sắp mới nhất trước
    const pending = reqs.find(r => r.status === 'pending');
    const latest = reqs[0];
    const expiresAt = acc?.expires_at ?? null;

    let state: RowState = 'none';
    if (pending) {
      state = 'pending';
    } else if (acc) {
      if (!expiresAt) state = 'active';
      else if (new Date(expiresAt).getTime() <= now) state = 'expired';
      else if (new Date(expiresAt).getTime() <= soon) state = 'expiring';
      else state = 'active';
    } else if (latest && latest.status === 'rejected') {
      state = 'rejected';
    }

    return {
      warehouse: w,
      state,
      expiresAt,
      rejectReason: state === 'rejected' ? latest?.reject_reason ?? null : null,
      requestedAt: pending?.created_at ?? null,
    };
  });
}

const canSelect = (s: RowState) => s === 'none' || s === 'rejected' || s === 'expiring' || s === 'expired';

const StateBadge: React.FC<{ row: Row }> = ({ row }) => {
  switch (row.state) {
    case 'admin':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <span className="text-[11px] leading-none">🟢</span> Toàn quyền (Quản trị viên)
        </span>
      );
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
          <ShieldCheck className="w-3.5 h-3.5" />
          {row.expiresAt ? `Đang có quyền — đến ${fmt(row.expiresAt)}` : 'Đang có quyền — không thời hạn'}
        </span>
      );
    case 'expiring':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5" /> Sắp hết hạn — {fmt(row.expiresAt)}
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
          <XCircle className="w-3.5 h-3.5" /> Đã hết hạn — {fmt(row.expiresAt)}
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
          <Clock className="w-3.5 h-3.5" /> Đang chờ duyệt — gửi {fmt(row.requestedAt)}
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
          <XCircle className="w-3.5 h-3.5" /> Bị từ chối{row.rejectReason ? `: ${row.rejectReason}` : ''}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
          <Lock className="w-3.5 h-3.5" /> Chưa có quyền
        </span>
      );
  }
};

export const MyAccess: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [overview, setOverview] = useState<MyAccessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const role = (profile?.role || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'super_admin' || role === 'btc_manager';

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchMyAccessOverview(user.id);
      setOverview(data);
      // Trạng thái tài khoản có thể đã đổi (được duyệt) kể từ lúc đăng nhập
      refreshProfile().catch(() => {});
    } catch (err: any) {
      setLoadError(err?.message || 'Không tải được dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (overview ? buildRows(overview, isAdmin) : []), [overview, isAdmin]);
  const hasActive = isAdmin || rows.some(r => r.state === 'active' || r.state === 'expiring' || r.state === 'admin');

  const toggle = (id: string) => {
    if (isAdmin) return;
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (isAdmin || selected.length === 0) {
      if (!isAdmin) toast.error('Vui lòng chọn ít nhất một kho');
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestWarehouseAccess({ warehouseIds: selected, purpose });
      if (res.created > 0) {
        toast.success(`Đã gửi yêu cầu cho ${res.created} kho. Quản lý kho phụ trách sẽ duyệt.`);
      } else {
        toast('Không có yêu cầu mới: các kho đã chọn đã có quyền còn hạn hoặc đang chờ duyệt.');
      }
      setSelected([]);
      setPurpose('');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quyền truy cập của tôi</h1>
          <p className="text-sm text-gray-600 mt-1">
            Xem kho nào bạn được tra cứu, xin thêm kho mới hoặc gia hạn kho sắp hết hạn.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
        </button>
      </div>

      {isAdmin && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900 flex items-start gap-3 shadow-xs">
          <span className="text-base shrink-0 leading-none mt-0.5">💡</span>
          <div className="leading-relaxed font-medium">
            Bạn đang đăng nhập với vai trò Quản trị hệ thống, bạn có toàn quyền truy cập tất cả các kho.
          </div>
        </div>
      )}

      {!isAdmin && profile?.status === 'pending' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Tài khoản của bạn đang chờ duyệt.</strong> Khi Quản lý kho hoặc Quản trị viên duyệt ít nhất một kho,
            tài khoản sẽ được kích hoạt và bạn có thể tra cứu dữ liệu của kho đó. Bạn có thể bấm "Tải lại" để cập nhật.
          </div>
        </div>
      )}

      {hasActive && (isAdmin || profile?.status !== 'pending') && (
        <Link
          to="/lookup"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg"
        >
          <FileSearch className="w-4 h-4" /> Đi tới Tra cứu tình trạng
        </Link>
      )}

      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">{loadError}</div>
      )}

      {loading && !overview ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
        </div>
      ) : (
        overview && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
            <div className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <div className="p-6 text-sm text-slate-500">Chưa có kho nào trong hệ thống.</div>
              )}
              {rows.map(row => {
                const selectable = !isAdmin && canSelect(row.state);
                return (
                  <label
                    key={row.warehouse.id}
                    className={`flex items-center gap-4 px-4 py-3 ${selectable ? 'cursor-pointer hover:bg-slate-50' : 'bg-white'}`}
                  >
                    {!isAdmin && (
                      <input
                        type="checkbox"
                        disabled={!selectable}
                        checked={selected.includes(row.warehouse.id)}
                        onChange={() => toggle(row.warehouse.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A] disabled:opacity-30"
                      />
                    )}
                    <WarehouseIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{row.warehouse.name}</div>
                      {row.warehouse.code && (
                        <div className="text-xs text-slate-400 font-mono">{row.warehouse.code}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <StateBadge row={row} />
                      {!isAdmin && (row.state === 'expiring' || row.state === 'expired') && (
                        <div className="text-[11px] text-slate-500 mt-1">Chọn để xin gia hạn</div>
                      )}
                      {!isAdmin && row.state === 'rejected' && (
                        <div className="text-[11px] text-slate-500 mt-1">Chọn để gửi lại</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {!isAdmin && rows.some(r => canSelect(r.state)) && (
              <div className="p-4 bg-slate-50 border-t border-gray-200 space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Mục đích / lý do (tùy chọn)</label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    placeholder="VD: Bổ sung dự án mới cần đối chiếu hồ sơ..."
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] resize-none"
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || selected.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Gửi yêu cầu {selected.length > 0 ? `(${selected.length} kho)` : ''}
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

export default MyAccess;