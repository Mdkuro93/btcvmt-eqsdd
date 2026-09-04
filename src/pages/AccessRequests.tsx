import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAccessRequests, approveAccessRequest, rejectAccessRequest } from '../api/accessRequests';
import { fetchViewerWarehouseAccess, extendViewerWarehouseAccess, revokeViewerWarehouseAccess } from '../api/viewerAccess';
import { fetchWarehouses } from '../api/assets';
import { AccessRequest, ViewerWarehouseAccess, Warehouse } from '../types';
import { 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Filter, 
  Warehouse as WarehouseIcon, 
  UserCheck, 
  Trash2, 
  RefreshCw, 
  Calendar, 
  AlertTriangle,
  FileCheck,
  Building2,
  Mail,
  Phone,
  HelpCircle,
  ChevronRight,
  Copy,
  User,
  KeyRound
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const AccessRequests: React.FC = () => {
  const { user, profile } = useAuth();

  const [activeTab, setActiveTab] = useState<'pending' | 'active_viewers' | 'history'>('pending');
  const [loading, setLoading] = useState(true);

  // Data states
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [viewerAccessList, setViewerAccessList] = useState<ViewerWarehouseAccess[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('all');

  // Modal States for Approval
  const [approveModalReq, setApproveModalReq] = useState<AccessRequest | null>(null);
  const [approvalDuration, setApprovalDuration] = useState<number | 'permanent'>(90); // 90 days default
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [approvedSuccessInfo, setApprovedSuccessInfo] = useState<{
    fullName: string;
    username: string;
    email: string;
    warehouseName: string;
    duration: string;
  } | null>(null);

  // Modal States for Rejection
  const [rejectModalReq, setRejectModalReq] = useState<AccessRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Modal States for Extending Access
  const [extendModalItem, setExtendModalItem] = useState<ViewerWarehouseAccess | null>(null);
  const [extendDuration, setExtendDuration] = useState<number | 'permanent'>(90);
  const [isExtending, setIsExtending] = useState(false);

  // Modal States for Revoking
  const [revokeModalItem, setRevokeModalItem] = useState<ViewerWarehouseAccess | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reqsData, accessData, whsData] = await Promise.all([
        fetchAccessRequests('all'),
        fetchViewerWarehouseAccess(),
        fetchWarehouses(),
      ]);
      setRequests(reqsData);
      setViewerAccessList(accessData);
      setWarehouses(whsData);
    } catch (err) {
      console.warn('Error loading access request management data:', err);
      toast.error('Lỗi tải dữ liệu yêu cầu truy cập');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter requests based on warehouse_manager role permissions
  const filterByManagerRole = <T extends { warehouse_id: string }>(items: T[]): T[] => {
    if (!profile) return items;
    if (profile.role === 'warehouse_manager' && profile.managed_warehouse_ids) {
      return items.filter(i => profile.managed_warehouse_ids?.includes(i.warehouse_id));
    }
    return items;
  };

  const pendingRequests = filterByManagerRole(requests.filter(r => r.status === 'pending'));
  const processedRequests = filterByManagerRole(requests.filter(r => r.status !== 'pending'));
  const filteredViewerAccess = filterByManagerRole(viewerAccessList);

  // Search filter
  const applySearchFilter = (items: any[]) => {
    return items.filter(item => {
      const matchWarehouse = selectedWarehouseFilter === 'all' || item.warehouse_id === selectedWarehouseFilter;
      const text = `${item.full_name || ''} ${item.email || ''} ${item.organization || ''} ${item.profiles?.full_name || ''} ${item.profiles?.email || ''} ${item.warehouses?.name || ''}`.toLowerCase();
      const matchSearch = text.includes(searchTerm.toLowerCase());
      return matchWarehouse && matchSearch;
    });
  };

  // Approval handler
  const handleApprove = async () => {
    if (!approveModalReq || !user) return;
    setIsApproving(true);

    let expiresAt: string | null = null;
    if (approvalDuration !== 'permanent') {
      const d = new Date();
      d.setDate(d.getDate() + approvalDuration);
      expiresAt = d.toISOString();
    }

    const reqToApprove = approveModalReq;
    const durLabel = approvalDuration === 'permanent' ? 'Vô thời hạn' : `${approvalDuration} ngày`;
    const derivedUser = reqToApprove.email.split('@')[0].toLowerCase();
    const whName = reqToApprove.warehouses?.name || 'Kho lưu trữ';

    try {
      await approveAccessRequest({
        requestId: reqToApprove.id,
        reviewerId: user.id,
        expiresAt,
        notes: approvalNotes,
      });

      toast.success(`Đã duyệt cấp quyền xem kho cho ${reqToApprove.email}`);
      setApproveModalReq(null);
      setApprovalNotes('');
      setApprovedSuccessInfo({
        fullName: reqToApprove.full_name,
        username: derivedUser,
        email: reqToApprove.email,
        warehouseName: whName,
        duration: durLabel,
      });
      await loadData();
    } catch (err: any) {
      toast.error('Lỗi khi duyệt: ' + (err.message || 'Thao tác thất bại'));
    } finally {
      setIsApproving(false);
    }
  };

  // Rejection handler
  const handleReject = async () => {
    if (!rejectModalReq || !user) return;
    if (!rejectReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối');
      return;
    }
    setIsRejecting(true);

    try {
      await rejectAccessRequest({
        requestId: rejectModalReq.id,
        reviewerId: user.id,
        rejectReason: rejectReason.trim(),
      });

      toast.success(`Đã từ chối yêu cầu của ${rejectModalReq.email}`);
      setRejectModalReq(null);
      setRejectReason('');
      await loadData();
    } catch (err: any) {
      toast.error('Lỗi khi từ chối: ' + (err.message || 'Thao tác thất bại'));
    } finally {
      setIsRejecting(false);
    }
  };

  // Extension handler
  const handleExtend = async () => {
    if (!extendModalItem) return;
    setIsExtending(true);

    let newExpiresAt: string | null = null;
    if (extendDuration !== 'permanent') {
      const base = extendModalItem.expires_at ? new Date(extendModalItem.expires_at) : new Date();
      // If already expired, extend from today
      const startDate = base.getTime() < Date.now() ? new Date() : base;
      startDate.setDate(startDate.getDate() + extendDuration);
      newExpiresAt = startDate.toISOString();
    }

    try {
      await extendViewerWarehouseAccess(extendModalItem.id, newExpiresAt);
      toast.success('Đã gia hạn quyền xem kho thành công!');
      setExtendModalItem(null);
      await loadData();
    } catch (err: any) {
      toast.error('Lỗi khi gia hạn: ' + (err.message || ''));
    } finally {
      setIsExtending(false);
    }
  };

  // Revoke handler
  const handleRevoke = async () => {
    if (!revokeModalItem) return;
    setIsRevoking(true);
    try {
      await revokeViewerWarehouseAccess(revokeModalItem.id);
      toast.success('Đã thu hồi quyền xem kho!');
      setRevokeModalItem(null);
      await loadData();
    } catch (err: any) {
      toast.error('Lỗi thu hồi quyền: ' + (err.message || ''));
    } finally {
      setIsRevoking(false);
    }
  };

  // Expiration helper
  const getExpirationStatus = (expiresAt: string | null) => {
    if (!expiresAt) {
      return { label: 'Vô thời hạn', status: 'permanent', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    const exp = new Date(expiresAt).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return { label: 'Đã hết hạn', status: 'expired', badge: 'bg-red-100 text-red-800 border-red-200', diffDays };
    }
    if (diffDays <= 7) {
      return { label: `Còn ${diffDays} ngày (Sắp hết hạn)`, status: 'warning', badge: 'bg-amber-100 text-amber-800 border-amber-200', diffDays };
    }
    return { label: `Còn ${diffDays} ngày`, status: 'valid', badge: 'bg-blue-100 text-blue-800 border-blue-200', diffDays };
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#1E3A8A] text-white rounded-xl shadow-md shadow-blue-900/10">
            <WarehouseIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Duyệt Quyền Xem Kho & Quản Lý Viewer</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Phê duyệt, gia hạn và thu hồi quyền xem Giấy chứng nhận QSDĐ theo từng kho lưu trữ
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'pending'
              ? 'bg-[#1E3A8A] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Yêu cầu chờ duyệt
          {pendingRequests.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === 'pending' ? 'bg-amber-400 text-slate-950' : 'bg-red-500 text-white'
            }`}>
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('active_viewers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'active_viewers'
              ? 'bg-[#1E3A8A] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Danh sách Viewer đã duyệt ({filteredViewerAccess.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-[#1E3A8A] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          Lịch sử đã xử lý ({processedRequests.length})
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên, email, cơ quan, kho..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedWarehouseFilter}
            onChange={e => setSelectedWarehouseFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30"
          >
            <option value="all">Tất cả kho lưu trữ</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} {w.is_central ? '(Kho Tổng)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: PENDING REQUESTS */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500">Đang tải danh sách yêu cầu chờ duyệt...</div>
          ) : applySearchFilter(pendingRequests).length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Không có yêu cầu nào đang chờ duyệt</p>
              <p className="text-xs text-slate-500">Tất cả các yêu cầu đăng ký viewer theo kho đã được thẩm duyệt đầy đủ.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">Người gửi</th>
                    <th className="py-3 px-4 font-bold">Cơ quan / Đơn vị</th>
                    <th className="py-3 px-4 font-bold">Kho yêu cầu</th>
                    <th className="py-3 px-4 font-bold">Mục đích tra cứu</th>
                    <th className="py-3 px-4 font-bold">Ngày gửi</th>
                    <th className="py-3 px-4 font-bold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearchFilter(pendingRequests).map(req => (
                    <tr key={req.id} className="hover:bg-blue-50/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{req.full_name}</div>
                        <div className="text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" /> {req.email}
                        </div>
                        {req.phone && (
                          <div className="text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" /> {req.phone}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span>{req.organization || '-'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg font-bold text-[11px]">
                          <WarehouseIcon className="w-3 h-3 text-[#1E3A8A]" />
                          {req.warehouses?.name || 'Kho đã chọn'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                        <p className="line-clamp-2 leading-relaxed" title={req.purpose || ''}>
                          {req.purpose || 'Không ghi chú'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          onClick={() => setRejectModalReq(req)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg border border-red-200 transition"
                        >
                          Từ chối
                        </button>
                        <button
                          onClick={() => {
                            setApproveModalReq(req);
                            setApprovalDuration(90);
                            setApprovalNotes('');
                          }}
                          className="px-3.5 py-1.5 bg-[#1E3A8A] hover:bg-blue-800 text-white font-bold rounded-lg transition shadow-sm"
                        >
                          Duyệt cấp quyền
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVE VIEWER PERMISSIONS */}
      {activeTab === 'active_viewers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500">Đang tải danh sách viewer được cấp quyền...</div>
          ) : applySearchFilter(filteredViewerAccess).length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Chưa có bản ghi quyền xem nào</p>
              <p className="text-xs text-slate-500">Các viewer sau khi được phê duyệt sẽ hiển thị tại bảng quản lý này.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">Viewer (Người xem)</th>
                    <th className="py-3 px-4 font-bold">Kho được xem</th>
                    <th className="py-3 px-4 font-bold">Người phê duyệt</th>
                    <th className="py-3 px-4 font-bold">Ngày cấp</th>
                    <th className="py-3 px-4 font-bold">Thời hạn & Trạng thái</th>
                    <th className="py-3 px-4 font-bold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearchFilter(filteredViewerAccess).map(access => {
                    const expStatus = getExpirationStatus(access.expires_at);
                    return (
                      <tr key={access.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{access.profiles?.full_name || 'Người dùng'}</div>
                          <div className="text-slate-500 text-[11px]">{access.profiles?.email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg font-semibold text-[11px]">
                            <WarehouseIcon className="w-3 h-3 text-[#1E3A8A]" />
                            {access.warehouses?.name || 'Kho lưu trữ'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          {access.approver?.full_name || 'Ban Quản Trị'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(access.approved_at).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${expStatus.badge}`}>
                              {expStatus.label}
                            </span>
                            {access.expires_at && (
                              <div className="text-[10px] text-slate-400">
                                Hết hạn: {new Date(access.expires_at).toLocaleDateString('vi-VN')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            onClick={() => {
                              setExtendModalItem(access);
                              setExtendDuration(90);
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#1E3A8A] font-bold rounded-lg border border-blue-200 transition text-[11px]"
                          >
                            Gia hạn
                          </button>
                          <button
                            onClick={() => setRevokeModalItem(access)}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg border border-red-200 transition text-[11px]"
                          >
                            Thu hồi
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROCESSED HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {applySearchFilter(processedRequests).length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">Chưa có lịch sử xử lý yêu cầu nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">Người gửi</th>
                    <th className="py-3 px-4 font-bold">Kho yêu cầu</th>
                    <th className="py-3 px-4 font-bold">Trạng thái</th>
                    <th className="py-3 px-4 font-bold">Người duyệt</th>
                    <th className="py-3 px-4 font-bold">Ngày xử lý</th>
                    <th className="py-3 px-4 font-bold">Ghi chú / Lý do từ chối</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applySearchFilter(processedRequests).map(req => (
                    <tr key={req.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{req.full_name}</div>
                        <div className="text-slate-500 text-[11px]">{req.email}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {req.warehouses?.name}
                      </td>
                      <td className="py-3 px-4">
                        {req.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Đã duyệt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[10px] font-bold">
                            <XCircle className="w-3 h-3" /> Từ chối
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {req.reviewer?.full_name || 'Quản trị viên'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {req.reject_reason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: DUYỆT YÊU CẦU */}
      {approveModalReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Phê Duyệt Quyền Xem Kho</h3>
              </div>
              <button
                onClick={() => setApproveModalReq(null)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div><strong>Người xin cấp:</strong> {approveModalReq.full_name} ({approveModalReq.email})</div>
              <div><strong>Đơn vị:</strong> {approveModalReq.organization || 'Chưa cung cấp'}</div>
              <div><strong>Kho cấp quyền:</strong> <span className="text-[#1E3A8A] font-bold">{approveModalReq.warehouses?.name}</span></div>
            </div>

            {/* Chọn thời hạn xem */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Thời hạn cấp quyền truy cập <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '30 ngày', val: 30 },
                  { label: '90 ngày', val: 90 },
                  { label: '180 ngày', val: 180 },
                  { label: '1 năm (365d)', val: 365 },
                  { label: 'Vô thời hạn', val: 'permanent' },
                ].map(opt => (
                  <button
                    key={opt.val.toString()}
                    type="button"
                    onClick={() => setApprovalDuration(opt.val as any)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold border text-center transition ${
                      approvalDuration === opt.val
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ghi chú */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Ghi chú phê duyệt (Tùy chọn)
              </label>
              <textarea
                rows={2}
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                placeholder="VD: Cấp quyền xem phục vụ thẩm định hồ sơ thế chấp tín dụng..."
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setApproveModalReq(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isApproving}
                onClick={handleApprove}
                className="px-5 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {isApproving ? 'Đang duyệt...' : 'Xác nhận duyệt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: THÔNG BÁO DUYỆT THÀNH CÔNG VÀ THÔNG TIN ĐĂNG NHẬP */}
      {approvedSuccessInfo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
              <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Đã Phê Duyệt Quyền Thành Công!</h3>
                <p className="text-xs text-slate-500">Tài khoản đã sẵn sàng đăng nhập và tra cứu</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Thông tin tài khoản đăng nhập:</div>
              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#1E3A8A]" /> Tên đăng nhập:
                </span>
                <span className="font-bold text-slate-900 font-mono bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-200">
                  {approvedSuccessInfo.username}
                </span>
              </div>

              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" /> Hoặc Email:
                </span>
                <span className="font-medium text-slate-800 font-mono text-[11px]">
                  {approvedSuccessInfo.email}
                </span>
              </div>

              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-600 font-medium flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" /> Hình thức xác thực:
                </span>
                <span className="font-semibold text-blue-900 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                  Mã OTP qua Email / Mật khẩu
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div>• <strong>Kho được xem:</strong> {approvedSuccessInfo.warehouseName}</div>
                <div>• <strong>Thời hạn hiệu lực:</strong> {approvedSuccessInfo.duration}</div>
                <div>• <strong>Trang tra cứu:</strong> <code>/lookup</code> (Tra cứu tình trạng)</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const text = `Tài khoản xem kho GCN:\n- Tên đăng nhập: ${approvedSuccessInfo.username}\n- Email: ${approvedSuccessInfo.email}\n- Phương thức đăng nhập: Nhận mã OTP qua Email hoặc dùng Mật khẩu bảo mật\n- Kho: ${approvedSuccessInfo.warehouseName}\n- Link đăng nhập: ${window.location.origin}/login`;
                  navigator.clipboard.writeText(text);
                  toast.success('Đã sao chép thông tin tài khoản!');
                }}
                className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Sao chép thông tin
              </button>
              <button
                type="button"
                onClick={() => setApprovedSuccessInfo(null)}
                className="px-5 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-100 text-red-700 rounded-xl">
                  <XCircle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Từ Chối Yêu Cầu Truy Cập</h3>
              </div>
              <button
                onClick={() => setRejectModalReq(null)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Từ chối cấp quyền cho tài khoản <strong>{rejectModalReq.email}</strong> đối với kho <strong>{rejectModalReq.warehouses?.name}</strong>.
            </p>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Lý do từ chối <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="VD: Không thuộc phạm vi công tác / Cần văn bản đề xuất chính thức từ đối tác..."
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRejectModalReq(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isRejecting}
                onClick={handleReject}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {isRejecting ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GIA HẠN THỜI HẠN */}
      {extendModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Gia Hạn Quyền Xem Kho</h3>
              </div>
              <button
                onClick={() => setExtendModalItem(null)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div><strong>Viewer:</strong> {extendModalItem.profiles?.full_name} ({extendModalItem.profiles?.email})</div>
              <div><strong>Kho:</strong> {extendModalItem.warehouses?.name}</div>
              <div><strong>Hạn hiện tại:</strong> {extendModalItem.expires_at ? new Date(extendModalItem.expires_at).toLocaleDateString('vi-VN') : 'Vô thời hạn'}</div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Chọn khoảng thời gian gia hạn thêm
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '+30 ngày', val: 30 },
                  { label: '+90 ngày', val: 90 },
                  { label: '+180 ngày', val: 180 },
                  { label: '+1 năm', val: 365 },
                  { label: 'Vô thời hạn', val: 'permanent' },
                ].map(opt => (
                  <button
                    key={opt.val.toString()}
                    type="button"
                    onClick={() => setExtendDuration(opt.val as any)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold border text-center transition ${
                      extendDuration === opt.val
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setExtendModalItem(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isExtending}
                onClick={handleExtend}
                className="px-5 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {isExtending ? 'Đang gia hạn...' : 'Xác nhận gia hạn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: THU HỒI QUYỀN */}
      {revokeModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-red-600 pb-2 border-b border-slate-200">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold">Xác Nhận Thu Hồi Quyền</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn thu hồi quyền xem kho <strong>{revokeModalItem.warehouses?.name}</strong> của tài khoản <strong>{revokeModalItem.profiles?.email}</strong>?
              Sau khi thu hồi, người dùng sẽ ngay lập tức không thể xem hoặc tra cứu bất kỳ GCN nào thuộc kho này.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRevokeModalItem(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isRevoking}
                onClick={handleRevoke}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {isRevoking ? 'Đang thu hồi...' : 'Xác nhận thu hồi'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
