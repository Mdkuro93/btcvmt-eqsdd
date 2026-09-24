import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchAssets,
  fetchProjects,
  createAsset,
  fetchWarehouses,
  requestExtension,
} from '../api/assets';
import { adminDeleteAssets } from '../api/assetDeletion';
import { createTransaction, fetchLatestCheckinScanUrl } from '../api/transactions';
import { Asset, TransactionType, Project, Warehouse } from '../types';
import { StatusBadges } from '../components/StatusBadges';
import { RequestModal } from '../components/RequestModal';
import { CreateAssetModal } from '../components/CreateAssetModal';
import { EditAssetModal } from '../components/EditAssetModal';
import { ImportExcelModal } from '../components/ImportExcelModal';
import { AssetHistoryModal } from '../components/AssetHistoryModal';
import { AssetExtensionModal } from '../components/AssetExtensionModal';
import { BulkEditModal } from '../components/BulkEditModal';
import { AssetAuditModal } from '../components/AssetAuditModal';
import { DeleteAssetsModal } from '../components/DeleteAssetsModal';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { exportAssetsToExcel } from '../lib/excelHelper';
import { COLLATERAL_TYPES, formatPlotCode } from '../lib/assetIdentifier';
import {
  Search,
  Loader2,
  AlertCircle,
  Plus,
  AlertTriangle,
  FileText,
  ExternalLink,
  Eye,
  MapPin,
  Building2,
  Trash2,
  Upload,
  Download,
  Edit3,
  ShieldCheck,
  Tag,
  Copy,
  Check,
  CheckSquare,
  Square,
  History,
  Database,
  RefreshCw,
  Info,
  CheckCircle2,
  XCircle,
  Layers,
  SlidersHorizontal,
  ArrowLeftRight,
  CalendarClock,
  Calendar,
  UserCheck,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  X,
  Warehouse as WarehouseIcon,
  CreditCard,
  Building,
  List,
  ListCollapse,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { supabase, isSupabaseConfigured, supabaseUrl } from '../lib/supabase';
import { canTransferAsset, canBulkTransferAssets } from '../lib/permissions';
import { AssetTransferModal } from '../components/AssetTransferModal';
import { AssetTransferHistory } from '../components/AssetTransferHistory';
import { DeclareNewAssetModal } from '../components/DeclareNewAssetModal';
import { LoadingFallback } from '../components/LoadingFallback';
import { useDebounce } from '../hooks/useDebounce';
import { useAssetsQuery } from '../hooks/useAssetsQuery';
import { AssetTableSkeleton } from '../components/AssetTableSkeleton';
import { format } from 'date-fns';

export const Assets: React.FC = () => {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Filters with useDebounce for search
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const [collateralType, setCollateralType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [custodyStatus, setCustodyStatus] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [saleStatus, setSaleStatus] = useState('');
  const [mortgageStatus, setMortgageStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'in_stock' | 'mortgaged' | 'pending'>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Table Density with localStorage persistence
  const [tableDensity, setTableDensity] = useState<'normal' | 'compact'>(() => {
    try {
      const saved = localStorage.getItem('asset_table_density');
      if (saved === 'compact' || saved === 'normal') return saved;
    } catch {
      // ignore
    }
    return 'normal';
  });

  const handleDensityChange = (density: 'normal' | 'compact') => {
    setTableDensity(density);
    try {
      localStorage.setItem('asset_table_density', density);
    } catch (e) {
      console.warn('Cannot write to localStorage:', e);
    }
  };

  const handleQuickFilterClick = (type: 'all' | 'in_stock' | 'mortgaged' | 'pending') => {
    setQuickFilter(type);
    setPage(1);
    if (type === 'all') {
      setCustodyStatus('');
      setMortgageStatus('');
      setStatusFilter('');
    } else if (type === 'in_stock') {
      setCustodyStatus('in_stock');
      setMortgageStatus('');
      setStatusFilter('');
    } else if (type === 'mortgaged') {
      setMortgageStatus('mortgaged');
      setCustodyStatus('');
      setStatusFilter('');
    } else if (type === 'pending') {
      setStatusFilter('PENDING');
      setCustodyStatus('');
      setMortgageStatus('');
    }
  };

  // Reset page when debounced search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Selection
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeclareModalOpen, setIsDeclareModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [auditAsset, setAuditAsset] = useState<Asset | null>(null);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [detailScanUrl, setDetailScanUrl] = useState<string | null>(null);
  const [extensionAsset, setExtensionAsset] = useState<Asset | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ urlOrPath: string; certificateNo?: string; title?: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Deletion Modal States
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; certificateNo: string; assetCode?: string | null; parentAssetId?: string | null } | null>(null);
  const [isDeleteMultipleModalOpen, setIsDeleteMultipleModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Ownership Transfer Modal States
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetAssets, setTransferTargetAssets] = useState<Asset[]>([]);

  // Permissions helpers
  const userRole = profile?.role || '';
  const canCreate =
    ['super_admin', 'admin', 'btc_manager', 'warehouse_manager'].includes(userRole) ||
    profile?.permissions?.includes('asset.create');
  const canDeclare =
    ['capital_dept', 'project_dept', 're_dept', 'chuyen_vien', 'admin', 'super_admin', 'btc_manager'].includes(userRole);
  const canEdit = (asset: Asset) =>
    ['super_admin', 'admin', 'btc_manager', 'warehouse_manager'].includes(userRole) ||
    profile?.permissions?.includes('asset.edit');
  // Chỉ admin / super_admin được xóa GCN (DB cũng kiểm tra lại: hàm admin_delete_assets, migration 0035)
  const canDelete = ['super_admin', 'admin'].includes(userRole);
  const canImport =
    ['super_admin', 'admin', 'btc_manager', 'warehouse_manager'].includes(userRole) ||
    profile?.permissions?.includes('import.excel');

  // Load Projects & Warehouses for dropdowns
  useEffect(() => {
    fetchProjects().then(setProjects).catch(console.error);
    fetchWarehouses().then(setWarehouses).catch(console.error);
  }, []);

  // Filter params memo
  const filterParams = useMemo(() => {
    const filters: any = {};
    if (debouncedSearch.trim()) filters.search = debouncedSearch.trim();
    if (collateralType) filters.collateralType = collateralType;
    if (projectId) filters.projectId = projectId;
    if (warehouseId) filters.warehouseId = warehouseId;
    if (custodyStatus) filters.custodyStatus = custodyStatus;
    if (lifecycleStatus) filters.lifecycleStatus = lifecycleStatus;
    if (saleStatus) filters.saleStatus = saleStatus;
    if (mortgageStatus) filters.mortgageStatus = mortgageStatus;
    if (statusFilter) filters.status = statusFilter;
    return filters;
  }, [debouncedSearch, collateralType, projectId, warehouseId, custodyStatus, lifecycleStatus, saleStatus, mortgageStatus, statusFilter]);

  // TanStack Query for optimal Caching (5m staleTime), Prefetching, and Keep Previous Data
  const {
    assets,
    totalCount,
    isLoading,
    isFetching,
    isPlaceholderData,
    error: queryErrorObj,
    refetch,
    source: querySource,
    invalidate: invalidateAssets,
  } = useAssetsQuery(filterParams, page, pageSize);

  const loading = isLoading;
  const fetchError = queryErrorObj ? queryErrorObj.message : null;
  const dataSource = querySource || (isSupabaseConfigured ? 'supabase' : 'mock');

  const loadAssets = useCallback(() => {
    invalidateAssets();
  }, [invalidateAssets]);

  // Tải link scan OneDrive từ phiếu nhập kho gần nhất khi mở chi tiết GCN
  useEffect(() => {
    let isMounted = true;
    if (detailAsset?.id) {
      fetchLatestCheckinScanUrl(detailAsset.id)
        .then(url => {
          if (isMounted) setDetailScanUrl(url);
        })
        .catch(() => {
          if (isMounted) setDetailScanUrl(null);
        });
    } else {
      setDetailScanUrl(null);
    }
    return () => {
      isMounted = false;
    };
  }, [detailAsset?.id]);

  // Reset page when filters change
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setCollateralType('');
    setProjectId('');
    setWarehouseId('');
    setCustodyStatus('');
    setLifecycleStatus('');
    setSaleStatus('');
    setMortgageStatus('');
    setStatusFilter('');
    setQuickFilter('all');
    setPage(1);
  };

  const handleRefresh = async () => {
    setIsRetrying(true);
    try {
      await refetch();
      toast.success('Đã cập nhật dữ liệu GCN mới nhất');
    } catch (err: any) {
      toast.error('Lỗi khi làm mới: ' + (err.message || 'Không xác định'));
    } finally {
      setIsRetrying(false);
    }
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedAssetIds.size === assets.length && assets.length > 0) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(assets.map(a => a.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedAssetIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAssetIds(next);
  };

  const selectedAssetsList = useMemo(() => {
    return assets.filter(a => selectedAssetIds.has(a.id));
  }, [assets, selectedAssetIds]);

  // Copy helper
  const handleCopy = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    toast.success(`Đã chép: ${text}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Overdue check
  const isAssetOverdue = (asset: Asset) => {
    if (asset.custody_status !== 'checked_out' || !asset.expected_return_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(asset.expected_return_date) < today;
  };

  // Export Excel
  const handleExportExcel = () => {
    try {
      const dataToExport = selectedAssetsList.length > 0 ? selectedAssetsList : assets;
      if (dataToExport.length === 0) {
        toast.error('Không có dữ liệu để xuất Excel');
        return;
      }
      exportAssetsToExcel(dataToExport, `Danh_sach_GCN_QSDD_${format(new Date(), 'ddMMyyyy_HHmm')}`);
      toast.success(`Đã xuất ${dataToExport.length} tài sản ra tệp Excel`);
    } catch (err: any) {
      toast.error('Lỗi xuất Excel: ' + err.message);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div id="assets-page-container" className="space-y-6 pb-12">
      <Toaster position="top-right" />

      {/* Header Bar */}
      <div id="assets-header" className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Quản Lý GCN QSDĐ & TSĐB</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                {totalCount} tài sản
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  dataSource === 'supabase'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
                title={dataSource === 'supabase' ? 'Dữ liệu kết nối trực tiếp Supabase' : 'Chế độ dữ liệu bộ nhớ cục bộ'}
              >
                <Database className="w-3 h-3" />
                {dataSource === 'supabase' ? 'Supabase' : 'Local Store'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Tra cứu, quản lý hồ sơ pháp lý, tình trạng lưu kho và biến động quyền sở hữu GCN
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-refresh-assets"
            onClick={handleRefresh}
            disabled={loading || isRetrying}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying || loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <button
            id="btn-export-excel"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors shadow-2xs"
            title="Xuất Excel danh sách hiện tại"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Xuất Excel {selectedAssetIds.size > 0 ? `(${selectedAssetIds.size})` : ''}</span>
          </button>

          {canImport && (
            <button
              id="btn-import-excel"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors shadow-2xs"
              title="Nhập danh sách từ Excel"
            >
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Nhập Excel</span>
            </button>
          )}

          {canDeclare && (
            <button
              id="btn-declare-asset"
              onClick={() => setIsDeclareModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
              title="Khai báo cấp mới, tách sổ hoặc cấp đổi GCN"
            >
              <FileText className="w-4 h-4" />
              <span>Khai báo GCN</span>
            </button>
          )}

          {canCreate && (
            <button
              id="btn-create-asset"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm mới GCN</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Alert if any */}
      {fetchError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Không thể đồng bộ dữ liệu từ máy chủ</p>
              <p className="text-xs text-rose-700 mt-0.5">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium transition-colors shrink-0"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div id="assets-filter-card" className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {/* Search Input with Debounce feedback */}
          <div className="relative xl:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="filter-search-input"
              type="text"
              value={search}
              onChange={e => handleFilterChange(setSearch, e.target.value)}
              placeholder="Tìm theo Số GCN, Mã TSĐB, Mã Lô, DA..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {search !== debouncedSearch ? (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-500" title="Đang chờ dừng gõ...">
                <Loader2 className="w-4 h-4 animate-spin" />
              </span>
            ) : search ? (
              <button
                onClick={() => handleFilterChange(setSearch, '')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Xóa từ khóa tìm kiếm"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Collateral Type */}
          <div>
            <select
              id="filter-collateral-type"
              value={collateralType}
              onChange={e => handleFilterChange(setCollateralType, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700"
            >
              <option value="">Tất cả Loại TSĐB</option>
              {COLLATERAL_TYPES.map(ct => (
                <option key={ct.code} value={ct.code}>
                  {ct.shortName} - {ct.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <select
              id="filter-project"
              value={projectId}
              onChange={e => handleFilterChange(setProjectId, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700"
            >
              <option value="">Tất cả Dự án Pháp lý</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse Filter */}
          <div>
            <select
              id="filter-warehouse"
              value={warehouseId}
              onChange={e => handleFilterChange(setWarehouseId, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700"
            >
              <option value="">Tất cả Kho lưu trữ</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.is_central ? '(Kho trung tâm)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Custody Status */}
          <div>
            <select
              id="filter-custody-status"
              value={custodyStatus}
              onChange={e => handleFilterChange(setCustodyStatus, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700"
            >
              <option value="">Trạng thái Kho (Tất cả)</option>
              <option value="in_stock">Trong kho</option>
              <option value="checked_out">Đang mượn/xuất</option>
              <option value="in_transit">Đang luân chuyển</option>
            </select>
          </div>

          {/* Lifecycle Status */}
          <div>
            <select
              id="filter-lifecycle-status"
              value={lifecycleStatus}
              onChange={e => handleFilterChange(setLifecycleStatus, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700"
            >
              <option value="">Trạng thái Pháp lý (Tất cả)</option>
              <option value="active">Active (Có hiệu lực)</option>
              <option value="split">Đã tách sổ con</option>
              <option value="invalidated">Vô hiệu / Thu hồi</option>
            </select>
          </div>

          {/* Sale Status */}
          <div>
            <select
              id="filter-sale-status"
              value={saleStatus}
              onChange={e => handleFilterChange(setSaleStatus, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700"
            >
              <option value="">Trạng thái Kinh doanh (Tất cả)</option>
              <option value="not_ready">Chưa sẵn sàng bán</option>
              <option value="ready_for_sale">Sẵn sàng bán</option>
              <option value="sold">Đã xuất bán</option>
            </select>
          </div>

          {/* Mortgage Status */}
          <div>
            <select
              id="filter-mortgage-status"
              value={mortgageStatus}
              onChange={e => handleFilterChange(setMortgageStatus, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-700"
            >
              <option value="">Thế chấp tín dụng (Tất cả)</option>
              <option value="none">Chưa thế chấp</option>
              <option value="mortgaged">Đang thế chấp ngân hàng</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-center gap-2">
            <button
              id="btn-reset-filters"
              onClick={handleResetFilters}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shrink-0"
              title="Đặt lại bộ lọc"
            >
              Đặt lại
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Banner */}
      {selectedAssetIds.size > 0 && (
        <div id="bulk-action-bar" className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-semibold text-blue-900">
              Đã chọn {selectedAssetIds.size} / {totalCount} tài sản
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canBulkTransferAssets(profile, selectedAssetsList) && (
              <button
                id="btn-bulk-transfer"
                onClick={() => {
                  setTransferTargetAssets(selectedAssetsList);
                  setIsTransferModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Chuyển quyền sở hữu ({selectedAssetIds.size})</span>
              </button>
            )}

            <button
              id="btn-bulk-edit"
              onClick={() => setIsBulkEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-600" />
              <span>Sửa hàng loạt</span>
            </button>

            <button
              id="btn-bulk-request"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shadow-2xs"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Tạo yêu cầu kho</span>
            </button>

            {canDelete && (
              <button
                id="btn-bulk-delete"
                onClick={() => setIsDeleteMultipleModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Xóa đã chọn</span>
              </button>
            )}

            <button
              id="btn-clear-selection"
              onClick={() => setSelectedAssetIds(new Set())}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Main Asset Table */}
      <div id="assets-table-container" className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Minimalist Enterprise Table Header Toolbar: Filter Chips & Density Toggle */}
        <div id="assets-table-toolbar" className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* 1-Click Quick Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Bộ lọc:</span>

            <button
              type="button"
              id="chip-filter-all"
              onClick={() => handleQuickFilterClick('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                quickFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300'
              }`}
            >
              Tất cả
            </button>

            <button
              type="button"
              id="chip-filter-in-stock"
              onClick={() => handleQuickFilterClick('in_stock')}
              className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                quickFilter === 'in_stock'
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300'
              }`}
            >
              Tồn kho vật lý
            </button>

            <button
              type="button"
              id="chip-filter-mortgaged"
              onClick={() => handleQuickFilterClick('mortgaged')}
              className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                quickFilter === 'mortgaged'
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300'
              }`}
            >
              Đã xuất thế chấp
            </button>

            <button
              type="button"
              id="chip-filter-pending"
              onClick={() => handleQuickFilterClick('pending')}
              className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                quickFilter === 'pending'
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300'
              }`}
            >
              Chờ phê duyệt
            </button>
          </div>

          {/* Density Toggle & Counter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium hidden sm:flex">
              {isFetching ? (
                <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Đang đồng bộ...
                </span>
              ) : (
                <span>
                  Tổng cộng: <strong className="text-slate-800 font-semibold">{totalCount}</strong> GCN
                </span>
              )}
            </div>

            <div className="flex items-center bg-white border border-slate-300 rounded p-0.5 text-xs">
              <button
                type="button"
                id="btn-density-compact"
                onClick={() => handleDensityChange('compact')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                  tableDensity === 'compact'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Chế độ Compact: Giảm khoảng cách dòng (py-1.5), font chữ text-xs"
              >
                <ListCollapse className="w-3.5 h-3.5" />
                <span>Compact</span>
              </button>

              <button
                type="button"
                id="btn-density-normal"
                onClick={() => handleDensityChange('normal')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                  tableDensity === 'normal'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Chế độ Normal: Khoảng cách vừa phải (py-3), text-sm"
              >
                <List className="w-3.5 h-3.5" />
                <span>Normal</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading / Empty / Data states with Keep Previous Data and Skeleton Loading */}
        {isLoading && assets.length === 0 ? (
          <AssetTableSkeleton rowCount={Math.min(pageSize, 8)} tableDensity={tableDensity} />
        ) : assets.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Không tìm thấy tài sản nào</h3>
            <p className="text-sm text-slate-500 max-w-md mt-1">
              Thử thay đổi bộ lọc tìm kiếm hoặc từ khóa tra cứu để tìm thấy kết quả phù hợp.
            </p>
            <button
              onClick={handleResetFilters}
              className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div className={`overflow-x-auto relative transition-opacity duration-150 ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
            {isFetching && (
              <div className="absolute top-0 left-0 right-0 z-30 h-0.5 bg-blue-500 animate-pulse" />
            )}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className={`${tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'} w-10 text-center`}>
                    <input
                      type="checkbox"
                      checked={selectedAssetIds.size === assets.length && assets.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className={tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'}>Số GCN & Mã TSĐB</th>
                  <th className={tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'}>Dự Án / Kho</th>
                  <th className={tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'}>Dự Án KD / Lô KD</th>
                  <th className={tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'}>Mã Lô PL & Thửa/Tờ</th>
                  <th className={`${tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'} text-right`}>Diện tích</th>
                  <th className={tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'}>Chủ Sở Hữu (CĐT/NĐT)</th>
                  <th className={tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'}>Trạng Thái</th>
                  <th className={tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'}>Thế Chấp & Ngân Hàng</th>
                  <th className={`${tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3'} text-center sticky right-0 z-20 bg-slate-800 text-slate-100 border-l border-slate-700 font-semibold uppercase tracking-wider text-xs whitespace-nowrap`}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {assets.map((asset) => {
                  const isSelected = selectedAssetIds.has(asset.id);
                  const isOverdue = isAssetOverdue(asset);
                  const rowPadding = tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3';
                  const textSize = tableDensity === 'compact' ? 'text-xs' : 'text-sm';

                  const ownerName =
                    asset.current_owner_entity?.name ||
                    asset.investor_entities?.name ||
                    'Chưa cập nhật';
                  const ownerRole =
                    asset.current_owner_role === 'cdt'
                      ? 'Chủ đầu tư'
                      : asset.current_owner_role === 'ndt'
                      ? 'Nhà đầu tư'
                      : null;

                  return (
                    <tr
                      key={asset.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : ''
                      } ${isOverdue ? 'bg-rose-50/30' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className={`${rowPadding} text-center`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(asset.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Số GCN & Mã TSĐB (Gộp cột) */}
                      <td className={rowPadding}>
                        {/* Hàng 1: Số GCN nổi bật */}
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <span className="text-sm font-bold text-slate-900 tracking-tight">{asset.certificate_no}</span>
                          {asset.scan_file_url && (
                            <button
                              onClick={() =>
                                setPreviewDoc({
                                  urlOrPath: asset.scan_file_url!,
                                  certificateNo: asset.certificate_no,
                                  title: `Bản scan GCN ${asset.certificate_no}`,
                                })
                              }
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Xem bản scan tài liệu"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {asset.certificate_group === 'so_lon' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                              Sổ lớn
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                              Phân lô
                            </span>
                          )}
                        </div>

                        {/* Hàng 2: Mã TSĐB font mono nhỏ nhạt màu + Loại TS */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] text-slate-500 tracking-tight" title={asset.asset_code || ''}>
                            {asset.asset_code || '-'}
                          </span>
                          {asset.asset_code && (
                            <button
                              onClick={(e) => handleCopy(asset.asset_code!, e)}
                              className="text-slate-400 hover:text-slate-600 transition-colors"
                              title="Sao chép mã TSĐB"
                            >
                              {copiedCode === asset.asset_code ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                          <span className="inline-block px-1 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 whitespace-nowrap">
                            {asset.collateral_type || 'BDS'}
                          </span>
                          {asset.asset_type && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[90px]" title={asset.asset_type}>
                              · {asset.asset_type}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Dự Án / Kho */}
                      <td className={rowPadding}>
                        <div className="font-medium text-slate-800 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{asset.projects?.name || '-'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <WarehouseIcon className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{asset.warehouses?.name || '-'}</span>
                        </div>
                      </td>

                      {/* Dự Án KD / Lô KD */}
                      <td className={rowPadding}>
                        <div className="font-medium text-slate-800 truncate max-w-[140px]">
                          {asset.business_project_name || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {asset.business_plot_code ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-medium border border-amber-200/60">
                              Lô KD: {asset.business_plot_code}
                            </span>
                          ) : (
                            '-'
                          )}
                        </div>
                      </td>

                      {/* Mã Lô PL & Thửa/Tờ */}
                      <td className={rowPadding}>
                        <div className="font-semibold text-slate-800">
                          {formatPlotCode(asset.legal_lot_code)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Thửa: <span className="text-slate-700">{asset.land_lot_no || '-'}</span> · Tờ:{' '}
                          <span className="text-slate-700">{asset.map_sheet_no || '-'}</span>
                        </div>
                      </td>

                      {/* Diện tích */}
                      <td className={`${rowPadding} text-right font-medium text-slate-800`}>
                        {asset.area ? `${Number(asset.area).toLocaleString('vi-VN')} m²` : '-'}
                      </td>

                      {/* Chủ Sở Hữu */}
                      <td className={rowPadding}>
                        <div className="font-medium text-slate-900 truncate max-w-[160px]" title={ownerName}>
                          {ownerName}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {ownerRole && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                asset.current_owner_role === 'cdt'
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {ownerRole}
                            </span>
                          )}
                          {asset.current_owner_entity?.company_code && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({asset.current_owner_entity.company_code})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Trạng Thái Badges */}
                      <td className={rowPadding}>
                        <StatusBadges
                          custody_status={asset.custody_status}
                          lifecycle_status={asset.lifecycle_status}
                          sale_status={asset.sale_status}
                          mortgage_status={asset.mortgage_status}
                          showMortgage={false}
                        />
                        {isOverdue && (
                          <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-rose-600">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Quá hạn trả mượn</span>
                          </div>
                        )}
                      </td>

                      {/* Thế Chấp & Ngân Hàng */}
                      <td className={rowPadding}>
                        {asset.mortgage_status === 'mortgaged' ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                Đang thế chấp
                              </span>
                              {asset.mortgage_bank && (
                                <span className="font-semibold text-slate-900 text-xs truncate max-w-[130px]" title={asset.mortgage_bank}>
                                  {asset.mortgage_bank}
                                </span>
                              )}
                            </div>
                            {asset.mortgage_unit && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[150px]" title={asset.mortgage_unit}>
                                ĐV: {asset.mortgage_unit}
                              </div>
                            )}
                            {asset.collateral_value && (
                              <div className="text-[11px] font-semibold text-emerald-700">
                                {Number(asset.collateral_value).toLocaleString('vi-VN')} đ
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs" title="Chưa thế chấp">—</span>
                        )}
                      </td>

                      {/* Cố định Cột Thao Tác (Sticky Action Column) */}
                      <td className={`${rowPadding} text-center whitespace-nowrap sticky right-0 z-10 bg-slate-800 border-l border-slate-700`}>
                        <div className="flex items-center justify-center gap-1">
                          {/* Xem chi tiết */}
                          <button
                            onClick={() => setDetailAsset(asset)}
                            className="p-1.5 text-slate-300 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                            title="Xem chi tiết đầy đủ GCN"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Gia hạn nếu đang mượn */}
                          {asset.custody_status === 'checked_out' && (
                            <button
                              onClick={() => setExtensionAsset(asset)}
                              className="p-1.5 text-slate-300 hover:text-amber-400 hover:bg-slate-700 rounded transition-colors"
                              title="Gia hạn thời gian mượn"
                            >
                              <CalendarClock className="w-4 h-4" />
                            </button>
                          )}

                          {/* Chuyển quyền sở hữu */}
                          {canTransferAsset(profile, asset) && (
                            <button
                              onClick={() => {
                                setTransferTargetAssets([asset]);
                                setIsTransferModalOpen(true);
                              }}
                              className="p-1.5 text-slate-300 hover:text-indigo-400 hover:bg-slate-700 rounded transition-colors"
                              title="Chuyển quyền sở hữu (CĐT / NĐT)"
                            >
                              <ArrowLeftRight className="w-4 h-4" />
                            </button>
                          )}

                          {/* Lịch sử hoạt động */}
                          <button
                            onClick={() => setHistoryAsset(asset)}
                            className="p-1.5 text-slate-300 hover:text-cyan-400 hover:bg-slate-700 rounded transition-colors"
                            title="Xem lịch sử giao dịch & luân chuyển"
                          >
                            <History className="w-4 h-4" />
                          </button>

                          {/* Kiểm toán biến động */}
                          <button
                            onClick={() => setAuditAsset(asset)}
                            className="p-1.5 text-slate-300 hover:text-teal-400 hover:bg-slate-700 rounded transition-colors"
                            title="Kiểm toán thay đổi dữ liệu"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>

                          {/* Sửa thông tin */}
                          {canEdit(asset) && (
                            <button
                              onClick={() => setEditingAsset(asset)}
                              className="p-1.5 text-slate-300 hover:text-amber-400 hover:bg-slate-700 rounded transition-colors"
                              title="Chỉnh sửa thông tin GCN"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Xóa GCN */}
                          {canDelete && (
                            <button
                              onClick={() =>
                                setAssetToDelete({
                                  id: asset.id,
                                  certificateNo: asset.certificate_no,
                                  assetCode: asset.asset_code,
                                  parentAssetId: asset.parent_asset_id,
                                })
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 rounded transition-colors"
                              title="Xóa GCN này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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
        {totalCount > 0 && (
          <div id="assets-pagination" className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 bg-white border border-slate-200 rounded font-medium focus:ring-1 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>trên tổng số <strong className="text-slate-900">{totalCount}</strong> tài sản</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium">
                Trang {page} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  title="Trang trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  title="Trang sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Asset Detail Drawer / Modal */}
      {detailAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Chi tiết GCN QSDĐ: {detailAsset.certificate_no}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mã định danh hệ thống: <span className="font-mono font-medium">{detailAsset.asset_code || '-'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailAsset(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700">
              {/* Trạng thái tổng quan */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Trạng thái vận hành</h4>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center gap-3">
                  <StatusBadges
                    custody_status={detailAsset.custody_status}
                    lifecycle_status={detailAsset.lifecycle_status}
                    sale_status={detailAsset.sale_status}
                    mortgage_status={detailAsset.mortgage_status}
                  />
                  {detailAsset.expected_return_date && (
                    <span className="text-xs text-slate-600 font-medium">
                      · Hạn trả mượn: {detailAsset.expected_return_date}
                    </span>
                  )}
                </div>
              </div>

              {/* Thông tin định danh & pháp lý */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Thông tin Thửa đất & Pháp lý</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white p-4 rounded-lg border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block">Số GCN QSDĐ</span>
                    <span className="font-bold text-slate-900 text-sm">{detailAsset.certificate_no}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Mã Lô Pháp Lý</span>
                    <span className="font-semibold text-slate-800">{formatPlotCode(detailAsset.legal_lot_code)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Diện tích</span>
                    <span className="font-semibold text-slate-800">{detailAsset.area ? `${detailAsset.area} m²` : '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Số Thửa / Tờ Bản Đồ</span>
                    <span className="font-medium text-slate-800">
                      Thửa {detailAsset.land_lot_no || '-'} / Tờ {detailAsset.map_sheet_no || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Nhóm Sổ</span>
                    <span className="font-medium text-slate-800">
                      {detailAsset.certificate_group === 'so_lon' ? 'Sổ lớn (Dự án)' : 'Sổ nhỏ (Phân lô)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Loại Tài Sản</span>
                    <span className="font-medium text-slate-800">{detailAsset.asset_type || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Mục đích sử dụng</span>
                    <span className="font-medium text-slate-800">{detailAsset.usage_purpose || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Thời hạn sử dụng</span>
                    <span className="font-medium text-slate-800">
                      {detailAsset.usage_term_type === 'long_term' ? 'Lâu dài' : detailAsset.usage_term_date || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Số vào sổ / Ngày cấp</span>
                    <span className="font-medium text-slate-800">
                      {detailAsset.registry_no || '-'} {detailAsset.registry_date ? `(${detailAsset.registry_date})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Thông tin Kinh Doanh & Thương Mại */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Thông tin Kinh doanh (Thương mại)</h4>
                <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-lg border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block">Tên Dự Án Kinh Doanh (Bán hàng)</span>
                    <span className="font-semibold text-slate-800">{detailAsset.business_project_name || 'Chưa cập nhật'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Mã Lô Kinh Doanh (Mã bán hàng)</span>
                    <span className="font-semibold text-slate-800">{detailAsset.business_plot_code || 'Chưa cập nhật'}</span>
                  </div>
                </div>
              </div>

              {/* Thông tin Chủ Sở Hữu */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Chủ Sở Hữu Hiện Tại</h4>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">
                      {detailAsset.current_owner_entity?.name || detailAsset.investor_entities?.name || 'Chưa xác định'}
                    </span>
                    {detailAsset.current_owner_entity?.company_code && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs font-mono bg-slate-200 text-slate-700">
                        {detailAsset.current_owner_entity.company_code}
                      </span>
                    )}
                  </div>
                  {detailAsset.current_owner_role && (
                    <span className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
                      {detailAsset.current_owner_role === 'cdt' ? 'Chủ đầu tư' : 'Nhà đầu tư'}
                    </span>
                  )}
                </div>
              </div>

              {/* Thế Chấp Tín Dụng */}
              {detailAsset.mortgage_status === 'mortgaged' && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Thông tin Thế chấp & Tín dụng</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white p-4 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-400 block">Ngân hàng thế chấp</span>
                      <span className="font-semibold text-slate-800">{detailAsset.mortgage_bank || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Đơn vị vay</span>
                      <span className="font-semibold text-slate-800">{detailAsset.mortgage_unit || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Giá trị TSĐB</span>
                      <span className="font-bold text-emerald-700">
                        {detailAsset.collateral_value ? `${Number(detailAsset.collateral_value).toLocaleString('vi-VN')} đ` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Giá trị định giá</span>
                      <span className="font-medium text-slate-800">
                        {detailAsset.mortgage_valuation ? `${Number(detailAsset.mortgage_valuation).toLocaleString('vi-VN')} đ` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Tỷ lệ đảm bảo</span>
                      <span className="font-medium text-slate-800">
                        {detailAsset.collateral_ratio ? `${detailAsset.collateral_ratio}%` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Dự kiến giải chấp</span>
                      <span className="font-medium text-slate-800">{detailAsset.mortgage_expected_release_date || '-'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bản scan & tài liệu đính kèm */}
              {(detailAsset.scan_file_url || detailScanUrl) && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tài liệu đính kèm</h4>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {detailScanUrl && (
                      <a
                        href={detailScanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                        title="Mở bản scan từ phiếu nhập kho gần nhất trên OneDrive trong tab mới"
                      >
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>📄 Xem Bản Scan</span>
                        <ExternalLink className="w-3.5 h-3.5 text-blue-500 ml-0.5" />
                      </a>
                    )}
                    {detailAsset.scan_file_url && (
                      <button
                        onClick={() => {
                          setPreviewDoc({
                            urlOrPath: detailAsset.scan_file_url!,
                            certificateNo: detailAsset.certificate_no,
                            title: `Bản scan GCN ${detailAsset.certificate_no}`,
                          });
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-slate-600" />
                        <span>Xem toàn màn hình bản scan Giấy chứng nhận</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Ghi chú */}
              {detailAsset.notes && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Ghi chú</h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {detailAsset.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setDetailAsset(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Asset Modal */}
      {isCreateModalOpen && (
        <CreateAssetModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          projects={projects}
          warehouses={warehouses}
          onSubmit={async (assetData) => {
            try {
              await createAsset(assetData);
              toast.success('Đã thêm mới Giấy chứng nhận thành công!');
              setIsCreateModalOpen(false);
              loadAssets();
            } catch (err: any) {
              toast.error('Lỗi khi thêm GCN: ' + err.message);
              throw err;
            }
          }}
        />
      )}

      {/* Edit Asset Modal */}
      {editingAsset && (
        <EditAssetModal
          isOpen={!!editingAsset}
          onClose={() => setEditingAsset(null)}
          asset={editingAsset}
          projects={projects}
          warehouses={warehouses}
          onSuccess={() => {
            setEditingAsset(null);
            loadAssets();
          }}
        />
      )}

      {/* Declare Asset Modal */}
      {isDeclareModalOpen && (
        <DeclareNewAssetModal
          isOpen={isDeclareModalOpen}
          onClose={() => setIsDeclareModalOpen(false)}
          onSuccess={() => {
            setIsDeclareModalOpen(false);
            loadAssets();
          }}
        />
      )}

      {/* Import Excel Modal */}
      {isImportModalOpen && (
        <ImportExcelModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          currentUser={profile}
          onSuccess={() => {
            setIsImportModalOpen(false);
            loadAssets();
          }}
        />
      )}

      {/* Bulk Edit Modal */}
      {isBulkEditOpen && (
        <BulkEditModal
          selectedAssets={selectedAssetsList}
          currentUser={profile}
          onClose={() => setIsBulkEditOpen(false)}
          onSuccess={() => {
            setIsBulkEditOpen(false);
            setSelectedAssetIds(new Set());
            loadAssets();
          }}
        />
      )}

      {/* Asset Transfer Modal */}
      {isTransferModalOpen && (
        <AssetTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setTransferTargetAssets([]);
          }}
          assets={transferTargetAssets}
          currentUser={profile}
          onSuccess={() => {
            setIsTransferModalOpen(false);
            setTransferTargetAssets([]);
            setSelectedAssetIds(new Set());
            loadAssets();
          }}
        />
      )}

      {/* Request Modal */}
      {isModalOpen && (
        <RequestModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedAssets={selectedAssetsList}
          userRole={profile?.role as any}
          warehouses={warehouses}
          onSubmit={async (type: TransactionType, details: any) => {
            try {
              await createTransaction({
                type,
                createdBy: profile?.id,
                notes: details.notes || '',
                scan_url: details.scan_url || null,
                desiredReceiveDate: details.desiredReceiveDate,
                items: selectedAssetsList.map(a => ({
                  assetId: a.id,
                  details,
                })),
              });
              toast.success('Đã tạo yêu cầu kho thành công!');
              setIsModalOpen(false);
              setSelectedAssetIds(new Set());
              loadAssets();
            } catch (err: any) {
              toast.error('Lỗi khi gửi yêu cầu kho: ' + err.message);
              throw err;
            }
          }}
        />
      )}

      {/* Asset History Modal */}
      {historyAsset && (
        <AssetHistoryModal
          assetId={historyAsset.id}
          certificateNo={historyAsset.certificate_no}
          onClose={() => setHistoryAsset(null)}
        />
      )}

      {/* Asset Audit Modal */}
      {auditAsset && (
        <AssetAuditModal
          asset={auditAsset}
          onClose={() => setAuditAsset(null)}
        />
      )}

      {/* Asset Extension Modal */}
      {extensionAsset && (
        <AssetExtensionModal
          isOpen={!!extensionAsset}
          onClose={() => setExtensionAsset(null)}
          asset={extensionAsset}
          onSubmit={async (additionalDays: number, reason: string) => {
            try {
              await requestExtension(extensionAsset.id, additionalDays, reason, profile);
              toast.success(`Đã gia hạn mượn thêm ${additionalDays} ngày!`);
              setExtensionAsset(null);
              loadAssets();
            } catch (err: any) {
              toast.error('Lỗi khi gia hạn: ' + err.message);
              throw err;
            }
          }}
        />
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          fileUrlOrPath={previewDoc.urlOrPath}
          certificateNo={previewDoc.certificateNo}
          title={previewDoc.title || 'Xem Bản Scan Giấy Chứng Nhận'}
        />
      )}

      {/* Modal xóa GCN (đơn hoặc hàng loạt) — chỉ admin, bắt buộc lý do, có lưu vết */}
      <DeleteAssetsModal
        isOpen={!!assetToDelete || isDeleteMultipleModalOpen}
        onClose={() => {
          setAssetToDelete(null);
          setIsDeleteMultipleModalOpen(false);
        }}
        assets={
          assetToDelete
            ? [{ id: assetToDelete.id, certificateNo: assetToDelete.certificateNo, assetCode: assetToDelete.assetCode, parentAssetId: assetToDelete.parentAssetId }]
            : selectedAssetsList.map(a => ({ id: a.id, certificateNo: a.certificate_no, assetCode: a.asset_code, parentAssetId: a.parent_asset_id }))
        }
        loading={isDeleting}
        onConfirm={async (reason: string) => {
          // Xóa đúng danh sách đang hiển thị trong hộp thoại (các GCN đã chọn ở trang hiện tại)
          const ids = assetToDelete ? [assetToDelete.id] : selectedAssetsList.map(a => a.id);
          if (ids.length === 0) return;
          setIsDeleting(true);
          try {
            const result = await adminDeleteAssets(ids, reason);
            toast.success(
              assetToDelete
                ? `Đã xóa GCN ${assetToDelete.certificateNo} và ghi nhận vào nhật ký xóa`
                : `Đã xóa ${result.deleted} GCN và ghi nhận vào nhật ký xóa`
            );
            setAssetToDelete(null);
            setIsDeleteMultipleModalOpen(false);
            setSelectedAssetIds(new Set());
            loadAssets();
          } catch (err: any) {
            toast.error('Không thể xóa: ' + (err?.message || 'Thao tác không thành công'));
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    </div>
  );
};

export default Assets;