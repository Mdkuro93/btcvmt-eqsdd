import React, { useState, useEffect, useMemo } from 'react';
import { 
  InventoryAudit, 
  InventoryAuditItem, 
  InventoryAuditFindingStatus, 
  Warehouse, 
  Profile 
} from '../types';
import { 
  fetchInventoryAudits, 
  getInventoryAuditDetail, 
  updateInventoryAuditItem, 
  batchUpdateAuditItems, 
  completeInventoryAudit, 
  deleteInventoryAudit 
} from '../api/inventoryAudits';
import { fetchWarehouses } from '../api/assets';
import { CreateAuditModal } from '../components/CreateAuditModal';
import { AuditItemDetailModal } from '../components/AuditItemDetailModal';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { exportInventoryAuditToExcel } from '../lib/excelHelper';
import { formatPlotCode } from '../lib/assetIdentifier';
import { 
  ClipboardCheck, 
  Building2, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  FileSpreadsheet, 
  ArrowLeft, 
  Trash2, 
  Eye, 
  Edit3, 
  CheckCheck, 
  Clock, 
  User, 
  FileText, 
  ChevronRight, 
  ShieldAlert,
  Loader2,
  RefreshCw,
  Sparkles,
  Layers,
  Check
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  profile?: Profile;
}

export const InventoryAudits: React.FC<Props> = ({ profile: propProfile }) => {
  const { profile: authProfile } = useAuth();
  const profile = propProfile || authProfile;
  // Navigation & session state
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [activeAudit, setActiveAudit] = useState<InventoryAudit | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryAuditItem | null>(null);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; certNo?: string } | null>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completingLoading, setCompletingLoading] = useState(false);

  // Filter & search in active audit
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'matched' | 'misplaced' | 'missing'>('all');

  // Permission checks
  const canPerformAudit = 
    profile?.role === 'admin' || 
    profile?.role === 'super_admin' || 
    profile?.role === 'warehouse_manager' || 
    profile?.role === 'btc_manager';

  const isWarehouseAssigned = (warehouseId: string) => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'super_admin' || profile.role === 'btc_manager') return true;
    if (profile.role === 'warehouse_manager') {
      if (!profile.managed_warehouse_ids || profile.managed_warehouse_ids.length === 0) return true;
      return profile.managed_warehouse_ids.includes(warehouseId);
    }
    return false;
  };

  // Load audit list & warehouses
  useEffect(() => {
    loadInitialData();
  }, [selectedWarehouseFilter]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [whList, auditList] = await Promise.all([
        fetchWarehouses(),
        fetchInventoryAudits(selectedWarehouseFilter)
      ]);
      setWarehouses(whList);
      setAudits(auditList);
    } catch (err) {
      console.error('Failed to load audits:', err);
      toast.error('Không thể tải danh sách đợt kiểm kê.');
    } finally {
      setLoading(false);
    }
  };

  // Load active audit detail
  useEffect(() => {
    if (!selectedAuditId) {
      setActiveAudit(null);
      return;
    }

    loadAuditDetail(selectedAuditId);
  }, [selectedAuditId]);

  const loadAuditDetail = async (auditId: string) => {
    setAuditLoading(true);
    try {
      const detail = await getInventoryAuditDetail(auditId);
      if (detail) {
        setActiveAudit(detail);
        setCompletionNotes(detail.notes || '');
      } else {
        toast.error('Không tìm thấy đợt kiểm kê.');
        setSelectedAuditId(null);
      }
    } catch (err) {
      console.error('Failed to load audit detail:', err);
      toast.error('Không thể tải chi tiết đợt kiểm kê.');
    } finally {
      setAuditLoading(false);
    }
  };

  // Quick action: Single item status change
  const handleQuickStatus = async (
    item: InventoryAuditItem,
    status: InventoryAuditFindingStatus
  ) => {
    if (!activeAudit) return;
    if (activeAudit.status === 'completed') {
      toast.error('Đợt kiểm kê này đã hoàn tất, không thể chỉnh sửa.');
      return;
    }

    if (status === 'misplaced') {
      // Open modal to specify actual location
      setEditingItem(item);
      setIsEditItemOpen(true);
      return;
    }

    try {
      const actualFound = status === 'matched';
      const actualLocation = status === 'matched' ? item.expected_location : null;

      await updateInventoryAuditItem(item.id, {
        finding_status: status,
        actual_found: actualFound,
        actual_location: actualLocation,
        note: status === 'matched' ? 'Đã tìm thấy đúng vị trí' : 'Chưa tìm thấy hồ sơ',
      });

      // Update local state instantly for snappy UI
      setActiveAudit(prev => {
        if (!prev || !prev.items) return prev;
        const newItems = prev.items.map(i => 
          i.id === item.id 
            ? { 
                ...i, 
                finding_status: status, 
                actual_found: actualFound, 
                actual_location: actualLocation,
                audited_at: new Date().toISOString() 
              } 
            : i
        );
        const total_found = newItems.filter(i => i.actual_found).length;
        const total_missing = newItems.filter(i => i.finding_status === 'missing').length;
        const total_misplaced = newItems.filter(i => i.finding_status === 'misplaced').length;

        return {
          ...prev,
          items: newItems,
          total_found,
          total_missing,
          total_misplaced,
        };
      });

      if (status === 'matched') {
        toast.success(`Đã xác nhận: ${item.asset?.certificate_no || 'GCN'} đúng vị trí`, { duration: 1500 });
      } else {
        toast.error(`Đã đánh dấu: ${item.asset?.certificate_no || 'GCN'} không tìm thấy`, { duration: 1500 });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi cập nhật.');
    }
  };

  // Save from Edit modal
  const handleSaveItemModal = async (
    itemId: string,
    data: {
      finding_status: InventoryAuditFindingStatus;
      actual_found: boolean;
      actual_location: string | null;
      note: string | null;
    }
  ) => {
    try {
      await updateInventoryAuditItem(itemId, data);
      await loadAuditDetail(activeAudit!.id);
      toast.success('Đã lưu kết quả kiểm kê.');
    } catch (err: any) {
      toast.error(err?.message || 'Không thể lưu thay đổi.');
    }
  };

  // Batch action: Mark all currently filtered items as matched
  const handleBatchMarkMatched = async () => {
    if (!activeAudit || !activeAudit.items) return;
    if (activeAudit.status === 'completed') {
      toast.error('Đợt kiểm kê đã hoàn tất.');
      return;
    }

    const itemsToMark = filteredItems.filter(i => i.finding_status === 'pending');
    if (itemsToMark.length === 0) {
      toast('Không có hồ sơ nào đang ở trạng thái Cần kiểm.', { icon: 'ℹ️' });
      return;
    }

    if (!window.confirm(`Xác nhận đánh dấu ${itemsToMark.length} hồ sơ đang hiển thị là ĐÃ TÌM THẤY ĐÚNG VỊ TRÍ?`)) {
      return;
    }

    try {
      const updates = itemsToMark.map(i => ({
        id: i.id,
        finding_status: 'matched' as const,
        actual_found: true,
        actual_location: i.expected_location,
        note: 'Đã xác nhận đúng vị trí theo đợt kiểm',
      }));

      await batchUpdateAuditItems(activeAudit.id, updates);
      await loadAuditDetail(activeAudit.id);
      toast.success(`Đã đối soát thành công ${itemsToMark.length} hồ sơ!`);
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi cập nhật hàng loạt.');
    }
  };

  // Complete Audit
  const handleCompleteAudit = async () => {
    if (!activeAudit) return;
    setCompletingLoading(true);
    try {
      const completed = await completeInventoryAudit(activeAudit.id, profile, completionNotes);
      if (completed) {
        setActiveAudit(completed);
        setConfirmCompleteOpen(false);
        toast.success('🎉 Đã hoàn tất và chốt kết quả kiểm kê kho thành công!');
        loadInitialData();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi hoàn tất kiểm kê.');
    } finally {
      setCompletingLoading(false);
    }
  };

  // Delete Audit
  const handleDeleteAudit = async (auditId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa đợt kiểm kê này? Mọi dữ liệu đối soát sẽ bị xóa vĩnh viễn.')) {
      return;
    }

    try {
      await deleteInventoryAudit(auditId);
      toast.success('Đã xóa đợt kiểm kê.');
      if (selectedAuditId === auditId) {
        setSelectedAuditId(null);
      }
      loadInitialData();
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi xóa.');
    }
  };

  // Filtered Items for active audit
  const filteredItems = useMemo(() => {
    if (!activeAudit || !activeAudit.items) return [];

    return activeAudit.items.filter(item => {
      // Status filter
      if (statusTab === 'pending' && item.finding_status !== 'pending') return false;
      if (statusTab === 'matched' && item.finding_status !== 'matched') return false;
      if (statusTab === 'misplaced' && item.finding_status !== 'misplaced') return false;
      if (statusTab === 'missing' && item.finding_status !== 'missing') return false;

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const a = item.asset;
        const cert = (a?.certificate_no || '').toLowerCase();
        const code = (a?.asset_code || '').toLowerCase();
        const plot = (a?.subdivision || '' + ' ' + (a?.lot_no || '')).toLowerCase();
        const owner = (a?.owner_name || '').toLowerCase();
        const prj = (a?.business_project_name || a?.projects?.name || '').toLowerCase();
        const loc = (item.expected_location || '').toLowerCase();

        return cert.includes(query) || code.includes(query) || plot.includes(query) || owner.includes(query) || prj.includes(query) || loc.includes(query);
      }

      return true;
    });
  }, [activeAudit, statusTab, searchTerm]);

  // Discrepancy items list
  const discrepancyItems = useMemo(() => {
    if (!activeAudit || !activeAudit.items) return [];
    return activeAudit.items.filter(i => i.finding_status === 'missing' || i.finding_status === 'misplaced');
  }, [activeAudit]);

  const pendingCount = useMemo(() => {
    if (!activeAudit || !activeAudit.items) return 0;
    return activeAudit.items.filter(i => i.finding_status === 'pending').length;
  }, [activeAudit]);

  const progressPercent = useMemo(() => {
    if (!activeAudit || !activeAudit.total_expected || activeAudit.total_expected === 0) return 0;
    const audited = (activeAudit.items || []).filter(i => i.finding_status !== 'pending').length;
    return Math.round((audited / activeAudit.total_expected) * 100);
  }, [activeAudit]);

  if (!profile) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
        <p className="text-xs text-gray-500 mt-2">Đang xác thực thông tin tài khoản...</p>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: ACTIVE AUDIT SESSION EXECUTION
  // =========================================================================
  if (selectedAuditId && activeAudit) {
    const warehouseName = activeAudit.warehouses?.name || activeAudit.warehouse?.name || 'Kho kiểm kê';
    const performerName = activeAudit.performer?.full_name || activeAudit.profiles?.full_name || 'Thủ kho';
    const isCompleted = activeAudit.status === 'completed';
    const canEditThisAudit = canPerformAudit && isWarehouseAssigned(activeAudit.warehouse_id) && !isCompleted;

    return (
      <div className="space-y-6 pb-12">
        {/* Top Breadcrumb & Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => {
                setSelectedAuditId(null);
                loadInitialData();
              }}
              className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all cursor-pointer"
              title="Quay lại danh sách"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-xl font-bold text-gray-900">
                  {warehouseName}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isCompleted 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                    : 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                }`}>
                  {isCompleted ? '✓ Đã hoàn tất kiểm kê' : '● Đang thực hiện'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center space-x-4">
                <span className="flex items-center">
                  <User className="w-3.5 h-3.5 mr-1 text-gray-400" />
                  Người kiểm: <strong className="ml-1 text-gray-700">{performerName}</strong>
                </span>
                <span className="flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                  Bắt đầu: <span className="ml-1 text-gray-700">{format(new Date(activeAudit.started_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
                </span>
                {activeAudit.completed_at && (
                  <span className="flex items-center text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Chốt lúc: <span className="ml-1 font-semibold">{format(new Date(activeAudit.completed_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Excel Exports */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => exportInventoryAuditToExcel(activeAudit, true)}
                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all cursor-pointer shadow-xs"
                title="Xuất danh sách các GCN bị thiếu hoặc để sai vị trí"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5 text-amber-600" />
                Xuất Báo Cáo Chênh Lệch ({discrepancyItems.length})
              </button>
              <button
                onClick={() => exportInventoryAuditToExcel(activeAudit, false)}
                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl transition-all cursor-pointer shadow-xs"
                title="Xuất toàn bộ biên bản kiểm kê đầy đủ"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
                Xuất Toàn Bộ Biên Bản
              </button>
            </div>

            {/* Complete Audit Button */}
            {!isCompleted && canEditThisAudit && (
              <button
                onClick={() => setConfirmCompleteOpen(true)}
                className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Chốt & Hoàn Tất Đợt Kiểm
              </button>
            )}
          </div>
        </div>

        {/* Audit Notes banner if present */}
        {activeAudit.notes && (
          <div className="px-4 py-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start space-x-2.5">
            <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-blue-950">Ghi chú đợt kiểm: </span>
              <span>{activeAudit.notes}</span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Tổng số dự kiến */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tổng GCN Dự Kiến</span>
              <Layers className="w-4 h-4 text-gray-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-gray-900">{activeAudit.total_expected}</span>
              <span className="text-xs text-gray-500 font-medium">100%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>

          {/* Card 2: Tiến độ đối soát */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Đã Đối Soát</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-blue-900">
                {activeAudit.total_expected - pendingCount} / {activeAudit.total_expected}
              </span>
              <span className="text-xs font-bold text-blue-700">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div 
                className={`h-1.5 rounded-full transition-all duration-300 ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Card 3: Đúng vị trí */}
          <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Đúng Vị Trí</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-emerald-900">{activeAudit.total_found - (activeAudit.total_misplaced || 0)}</span>
              <span className="text-xs font-semibold text-emerald-700">Khớp chuẩn</span>
            </div>
            <p className="text-[11px] text-emerald-600/80 mt-1">Đầy đủ hồ sơ tại vị trí dự kiến</p>
          </div>

          {/* Card 4: Sai vị trí */}
          <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Sai Vị Trí</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-amber-900">{activeAudit.total_misplaced || 0}</span>
              <span className="text-xs font-semibold text-amber-700">Cần sắp lại</span>
            </div>
            <p className="text-[11px] text-amber-700/80 mt-1">Tìm thấy tại ngăn/kệ khác</p>
          </div>

          {/* Card 5: Không tìm thấy */}
          <div className="bg-red-50/50 p-4 rounded-xl border border-red-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">Không Tìm Thấy</span>
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-red-900">{activeAudit.total_missing || 0}</span>
              <span className="text-xs font-semibold text-red-700">Khuyết thiếu</span>
            </div>
            <p className="text-[11px] text-red-700/80 mt-1">Cần lập biên bản làm rõ</p>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setStatusTab('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusTab === 'all'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tất cả ({activeAudit.items?.length || 0})
            </button>
            <button
              onClick={() => setStatusTab('pending')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center ${
                statusTab === 'pending'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 mr-1" />
              Cần kiểm ({pendingCount})
            </button>
            <button
              onClick={() => setStatusTab('matched')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center ${
                statusTab === 'matched'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Đúng vị trí ({(activeAudit.total_found || 0) - (activeAudit.total_misplaced || 0)})
            </button>
            <button
              onClick={() => setStatusTab('misplaced')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center ${
                statusTab === 'misplaced'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Sai vị trí ({activeAudit.total_misplaced || 0})
            </button>
            <button
              onClick={() => setStatusTab('missing')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center ${
                statusTab === 'missing'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-red-50 text-red-800 hover:bg-red-100'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Không tìm thấy ({activeAudit.total_missing || 0})
            </button>
          </div>

          {/* Search Input + Batch Mark */}
          <div className="flex items-center space-x-3">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm Số GCN, Mã Lô, Mã TS..."
                className="w-full pl-9 pr-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            {!isCompleted && canEditThisAudit && pendingCount > 0 && (
              <button
                onClick={handleBatchMarkMatched}
                className="inline-flex items-center px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-all cursor-pointer shadow-xs whitespace-nowrap"
                title="Đánh dấu toàn bộ các mục 'Cần kiểm' đang hiển thị là ĐÃ TÌM THẤY ĐÚNG VỊ TRÍ"
              >
                <CheckCheck className="w-4 h-4 mr-1 text-emerald-600" />
                Khớp Hàng Loạt
              </button>
            )}
          </div>
        </div>

        {/* Audit Items Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3.5 text-center w-12">STT</th>
                  <th className="py-3 px-4">Số GCN / Mã Tài Sản</th>
                  <th className="py-3 px-4">Dự Án / Phân Khu / Lô</th>
                  <th className="py-3 px-4">Chủ Sở Hữu / Diện Tích</th>
                  <th className="py-3 px-4">Vị Trí Dự Kiến</th>
                  <th className="py-3 px-4">Kết Quả Đối Soát</th>
                  <th className="py-3 px-4">Vị Trí Thực Tế & Ghi Chú</th>
                  {!isCompleted && canEditThisAudit && (
                    <th className="py-3 px-4 text-center w-48">Thao Tác Nhanh</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-500">
                      <ClipboardCheck className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                      <p className="font-semibold text-sm">Không có hồ sơ nào phù hợp với bộ lọc hiện tại.</p>
                      <p className="text-xs text-gray-400 mt-0.5">Thử chọn tab trạng thái khác hoặc xóa từ khóa tìm kiếm.</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, index) => {
                    const a = item.asset;
                    const isMatched = item.finding_status === 'matched';
                    const isMisplaced = item.finding_status === 'misplaced';
                    const isMissing = item.finding_status === 'missing';
                    const isPending = item.finding_status === 'pending';

                    let rowBg = 'hover:bg-gray-50/80';
                    if (isMatched) rowBg = 'bg-emerald-50/20 hover:bg-emerald-50/40';
                    if (isMisplaced) rowBg = 'bg-amber-50/30 hover:bg-amber-50/50';
                    if (isMissing) rowBg = 'bg-red-50/30 hover:bg-red-50/50';

                    return (
                      <tr key={item.id} className={`transition-colors ${rowBg}`}>
                        {/* STT */}
                        <td className="py-3.5 px-3.5 text-center text-gray-500 font-medium">
                          {index + 1}
                        </td>

                        {/* Số GCN / Mã TS */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-start space-x-2">
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-gray-900 text-sm">{a?.certificate_no || 'Chưa rõ'}</span>
                                {a?.scan_file_url && (
                                  <button
                                    onClick={() => setPreviewDoc({ url: a.scan_file_url!, certNo: a.certificate_no })}
                                    className="p-0.5 text-blue-600 hover:text-blue-800 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                                    title="Xem bản scan GCN gốc"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-500 font-mono block mt-0.5">
                                {a?.asset_code || a?.business_plot_code || '-'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Dự án / Phân khu / Lô */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-800">
                            {a?.business_project_name || a?.projects?.name || '-'}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {a?.subdivision ? `${a.subdivision} - Lô ${a.lot_no || a.land_lot_no || ''}` : '-'}
                          </div>
                        </td>

                        {/* Chủ sở hữu / Diện tích */}
                        <td className="py-3.5 px-4">
                          <div className="text-gray-900 font-medium">{a?.owner_name || '-'}</div>
                          <div className="text-[11px] text-gray-500">
                            {a?.area ? `${a.area.toLocaleString()} m²` : '-'}
                          </div>
                        </td>

                        {/* Vị trí dự kiến */}
                        <td className="py-3.5 px-4">
                          <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium border border-gray-200">
                            {item.expected_location || 'Vị trí kho tiêu chuẩn'}
                          </span>
                        </td>

                        {/* Kết quả đối soát */}
                        <td className="py-3.5 px-4">
                          {isPending && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                              <HelpCircle className="w-3.5 h-3.5 mr-1 text-gray-400" />
                              Cần kiểm đếm
                            </span>
                          )}
                          {isMatched && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              Đúng vị trí
                            </span>
                          )}
                          {isMisplaced && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                              Sai vị trí
                            </span>
                          )}
                          {isMissing && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-900 border border-red-300">
                              <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />
                              Không tìm thấy
                            </span>
                          )}
                        </td>

                        {/* Vị trí thực tế & Ghi chú */}
                        <td className="py-3.5 px-4 max-w-xs">
                          {isMisplaced && (
                            <div className="text-amber-900 font-semibold flex items-center">
                              <span className="text-[10px] uppercase font-bold text-amber-700 mr-1">Tìm thấy tại:</span>
                              <span>{item.actual_location || 'Chưa ghi nhận'}</span>
                            </div>
                          )}
                          {item.note && (
                            <div className="text-[11px] text-gray-600 italic mt-0.5 truncate" title={item.note}>
                              {item.note}
                            </div>
                          )}
                          {isMatched && !item.note && (
                            <span className="text-emerald-700 text-[11px] font-medium">Khớp vị trí lưu kho</span>
                          )}
                          {isMissing && !item.note && (
                            <span className="text-red-600 text-[11px] font-medium">Chưa phát hiện trên kệ</span>
                          )}
                        </td>

                        {/* Thao tác nhanh (One-touch buttons) */}
                        {!isCompleted && canEditThisAudit && (
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              {/* Nút Đúng vị trí */}
                              <button
                                type="button"
                                onClick={() => handleQuickStatus(item, 'matched')}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                  isMatched 
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' 
                                    : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                                }`}
                                title="Đã tìm thấy đúng vị trí"
                              >
                                <Check className="w-4 h-4" />
                              </button>

                              {/* Nút Sai vị trí */}
                              <button
                                type="button"
                                onClick={() => handleQuickStatus(item, 'misplaced')}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                  isMisplaced 
                                    ? 'bg-amber-600 text-white border-amber-700 shadow-xs' 
                                    : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                                }`}
                                title="Tìm thấy nhưng sai vị trí (Nhập vị trí thực tế)"
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>

                              {/* Nút Không tìm thấy */}
                              <button
                                type="button"
                                onClick={() => handleQuickStatus(item, 'missing')}
                                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                  isMissing 
                                    ? 'bg-red-600 text-white border-red-700 shadow-xs' 
                                    : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                                }`}
                                title="Không tìm thấy hồ sơ"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>

                              {/* Nút Sửa chi tiết */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(item);
                                  setIsEditItemOpen(true);
                                }}
                                className="p-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
                                title="Chỉnh sửa chi tiết & ghi chú"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Discrepancy Summary Panel (Bảng Tổng Hợp Chênh Lệch) */}
        {discrepancyItems.length > 0 && (
          <div className="bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-amber-200">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-600 text-white rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-950">
                    Bảng Tổng Hợp Chênh Lệch Kiểm Kê ({discrepancyItems.length} hồ sơ)
                  </h3>
                  <p className="text-xs text-amber-800">
                    Gồm các hồ sơ khuyết thiếu không tìm thấy hoặc lưu trữ sai vị trí quy định
                  </p>
                </div>
              </div>

              <button
                onClick={() => exportInventoryAuditToExcel(activeAudit, true)}
                className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-all shadow-md shadow-amber-700/20 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Xuất Báo Cáo Chênh Lệch (Excel)
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-amber-900/80 uppercase font-bold text-[10px] tracking-wider border-b border-amber-200">
                    <th className="py-2.5 px-3">STT</th>
                    <th className="py-2.5 px-3">Số GCN</th>
                    <th className="py-2.5 px-3">Mã Lô / Dự Án</th>
                    <th className="py-2.5 px-3">Phân Loại Lệch</th>
                    <th className="py-2.5 px-3">Vị Trí Dự Kiến</th>
                    <th className="py-2.5 px-3">Vị Trí Thực Tế</th>
                    <th className="py-2.5 px-3">Ghi Chú Xử Lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/60">
                  {discrepancyItems.map((item, idx) => {
                    const a = item.asset;
                    const isMissing = item.finding_status === 'missing';
                    return (
                      <tr key={item.id} className="hover:bg-amber-100/50">
                        <td className="py-2.5 px-3 text-amber-950 font-medium">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-amber-950">{a?.certificate_no || 'Chưa rõ'}</td>
                        <td className="py-2.5 px-3 text-amber-900">
                          {a?.subdivision ? `${a.subdivision} - Lô ${a.lot_no || ''}` : '-'} ({a?.business_project_name || a?.projects?.name || '-'})
                        </td>
                        <td className="py-2.5 px-3">
                          {isMissing ? (
                            <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-800 border border-red-300 rounded font-bold text-[10px]">
                              ❌ Không tìm thấy (Thiếu)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 bg-amber-200 text-amber-900 border border-amber-400 rounded font-bold text-[10px]">
                              ⚠️ Sai vị trí kệ/ngăn
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700">{item.expected_location || '-'}</td>
                        <td className="py-2.5 px-3 font-semibold text-amber-950">{item.actual_location || (isMissing ? 'Không xác định' : '-')}</td>
                        <td className="py-2.5 px-3 text-gray-800 italic">{item.note || '-'}</td>
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
  }

  // =========================================================================
  // VIEW 2: AUDIT SESSIONS LIST (DANH SÁCH CÁC ĐỢT KIỂM KÊ)
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1E3A8A] via-blue-900 to-indigo-950 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-white/10 rounded-full text-blue-200 text-xs font-semibold backdrop-blur-md">
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Nghiệp Vụ Quản Lý Kho & Pháp Lý</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            Kiểm Kê Kho Tài Sản & Giấy Chứng Nhận
          </h1>
          <p className="text-blue-100/80 text-xs md:text-sm max-w-2xl leading-relaxed">
            Hệ thống đối soát hiện trạng thực tế toàn bộ GCN QSDĐ & TSĐB lưu trữ trong kho. Phát hiện chênh lệch vị trí, hồ sơ khuyết thiếu và tự động xuất biên bản tổng hợp.
          </p>
        </div>

        {canPerformAudit && (
          <div className="relative z-10">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center px-5 py-3 text-xs md:text-sm font-bold text-blue-950 bg-amber-400 hover:bg-amber-300 rounded-2xl transition-all shadow-lg shadow-amber-400/20 hover:scale-102 active:scale-98 cursor-pointer"
            >
              <Plus className="w-5 h-5 mr-2" />
              Bắt Đầu Đợt Kiểm Kê Mới
            </button>
          </div>
        )}
      </div>

      {/* Filter & Warehouse Selector */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <Building2 className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="flex-1 md:w-72">
            <select
              value={selectedWarehouseFilter}
              onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
              className="w-full px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tất cả các kho</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.is_central ? '⭐ [Kho Tổng]' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <span>Tổng số: <strong className="text-gray-900">{audits.length}</strong> đợt kiểm kê</span>
        </div>
      </div>

      {/* Audits List */}
      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-xs text-gray-500 mt-2 font-medium">Đang tải danh sách kiểm kê...</p>
        </div>
      ) : audits.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-xs">
          <div className="p-4 bg-blue-50 text-blue-700 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <ClipboardCheck className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Chưa có đợt kiểm kê nào</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Hãy chọn một kho và bắt đầu đợt kiểm kê mới để đối soát toàn bộ Giấy Chứng Nhận đang lưu trữ.
          </p>
          {canPerformAudit && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-5 inline-flex items-center px-4 py-2.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-all shadow-md shadow-blue-700/20 cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Tạo Đợt Kiểm Kê Đầu Tiên
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {audits.map((audit) => {
            const wh = audit.warehouses || audit.warehouse;
            const perf = audit.performer || audit.profiles;
            const isCompleted = audit.status === 'completed';
            const hasDiscrepancy = (audit.total_missing || 0) > 0 || (audit.total_misplaced || 0) > 0;
            const matchedRate = audit.total_expected > 0 
              ? Math.round((((audit.total_found || 0) - (audit.total_misplaced || 0)) / audit.total_expected) * 100) 
              : 0;

            return (
              <div
                key={audit.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Top */}
                <div className="p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isCompleted 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                          : 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                      }`}>
                        {isCompleted ? '✓ Đã hoàn tất' : '● Đang thực hiện'}
                      </span>
                      <h3 className="text-sm font-bold text-gray-900 mt-1.5 group-hover:text-blue-600 transition-colors">
                        {wh?.name || 'Kho VMT'}
                      </h3>
                    </div>

                    {(profile.role === 'admin' || profile.role === 'super_admin') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAudit(audit.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                        title="Xóa đợt kiểm kê"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {audit.notes && (
                    <p className="text-xs text-gray-600 line-clamp-2 italic bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      "{audit.notes}"
                    </p>
                  )}

                  {/* Summary Metric Pills */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-blue-50/70 p-2 rounded-xl border border-blue-100">
                      <span className="text-[10px] text-blue-700 font-semibold block uppercase">Dự kiến</span>
                      <span className="text-base font-black text-blue-900">{audit.total_expected}</span>
                    </div>
                    <div className="bg-emerald-50/70 p-2 rounded-xl border border-emerald-100">
                      <span className="text-[10px] text-emerald-700 font-semibold block uppercase">Đúng vị trí</span>
                      <span className="text-base font-black text-emerald-900">
                        {(audit.total_found || 0) - (audit.total_misplaced || 0)}
                      </span>
                    </div>
                    <div className={`p-2 rounded-xl border ${hasDiscrepancy ? 'bg-amber-50/70 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                      <span className={`text-[10px] font-semibold block uppercase ${hasDiscrepancy ? 'text-amber-800' : 'text-gray-500'}`}>
                        Lệch / Thiếu
                      </span>
                      <span className={`text-base font-black ${hasDiscrepancy ? 'text-amber-900' : 'text-gray-700'}`}>
                        {(audit.total_missing || 0) + (audit.total_misplaced || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="space-y-1 text-[11px] text-gray-500 pt-1 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span>Người kiểm:</span>
                      <strong className="text-gray-700">{perf?.full_name || 'Thủ kho'}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Thời gian bắt đầu:</span>
                      <span className="text-gray-700">{format(new Date(audit.started_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
                    </div>
                    {audit.completed_at && (
                      <div className="flex items-center justify-between text-emerald-700">
                        <span>Hoàn tất:</span>
                        <span className="font-semibold">{format(new Date(audit.completed_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Bottom Actions */}
                <div className="px-5 py-3.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">
                    Tỷ lệ khớp: <strong className="text-emerald-700">{matchedRate}%</strong>
                  </span>

                  <button
                    onClick={() => setSelectedAuditId(audit.id)}
                    className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all cursor-pointer group-hover:bg-blue-700 group-hover:text-white"
                  >
                    {isCompleted ? 'Xem Kết Quả' : 'Tiếp Tục Kiểm Kê'}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Audit Modal */}
      <CreateAuditModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        profile={profile}
        onCreated={(newAuditId) => {
          setIsCreateOpen(false);
          setSelectedAuditId(newAuditId);
        }}
      />

      {/* Edit Audit Item Modal */}
      <AuditItemDetailModal
        isOpen={isEditItemOpen}
        onClose={() => {
          setIsEditItemOpen(false);
          setEditingItem(null);
        }}
        item={editingItem}
        onSave={handleSaveItemModal}
        onOpenPreviewDoc={(url, certNo) => setPreviewDoc({ url, certNo })}
      />

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={true}
          onClose={() => setPreviewDoc(null)}
          fileUrlOrPath={previewDoc.url}
          certificateNo={previewDoc.certNo}
        />
      )}

      {/* Confirmation Modal for Completing Audit */}
      {confirmCompleteOpen && activeAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-emerald-600">
              <div className="p-3 bg-emerald-50 rounded-2xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Xác Nhận Chốt Đợt Kiểm Kê</h3>
                <p className="text-xs text-gray-500">Kho {activeAudit.warehouses?.name || activeAudit.warehouse?.name}</p>
              </div>
            </div>

            {pendingCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                <p className="font-bold flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1 text-amber-600" />
                  Cảnh báo: Còn {pendingCount} hồ sơ chưa được kiểm đếm!
                </p>
                <p>
                  Khi hoàn tất, toàn bộ hồ sơ chưa kiểm sẽ tự động ghi nhận là trạng thái chưa đối soát. Bạn nên kiểm tra kỹ trước khi chốt.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ghi chú kết luận kiểm kê (Tùy chọn):
              </label>
              <textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Ví dụ: Đã đối chiếu hoàn tất 100%. GCN thiếu đã bàn giao cho Phòng Pháp lý mượn làm thủ tục..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCompleteOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={completingLoading}
                onClick={handleCompleteAudit}
                className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {completingLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Đang chốt...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Xác Nhận Hoàn Tất
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
