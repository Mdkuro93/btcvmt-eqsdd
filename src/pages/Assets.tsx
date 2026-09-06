import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAssets, fetchProjects, createAsset, fetchWarehouses, deleteAsset, deleteMultipleAssets, createMultipleAssets } from '../api/assets';
import { createTransaction } from '../api/transactions';
import { Asset, TransactionType } from '../types';
import { StatusBadges } from '../components/StatusBadges';
import { RequestModal } from '../components/RequestModal';
import { CreateAssetModal } from '../components/CreateAssetModal';
import { EditAssetModal } from '../components/EditAssetModal';
import { ImportExcelModal } from '../components/ImportExcelModal';
import { AssetHistoryModal } from '../components/AssetHistoryModal';
import { AssetExtensionModal } from '../components/AssetExtensionModal';
import { requestExtension } from '../api/assets';
import { CalendarClock } from 'lucide-react';
import { BulkEditModal } from '../components/BulkEditModal';
import { AssetAuditModal } from '../components/AssetAuditModal';
import { ConfirmModal } from '../components/ConfirmModal';
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
  History,
  Database,
  RefreshCw,
  Info,
  CheckCircle2,
  XCircle,
  Layers,
  SlidersHorizontal,
  ArrowLeftRight,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { supabase, isSupabaseConfigured, supabaseUrl } from '../lib/supabase';
import { canTransferAsset, canBulkTransferAssets } from '../lib/permissions';
import { AssetTransferModal } from '../components/AssetTransferModal';
import { AssetTransferHistory } from '../components/AssetTransferHistory';

import { LoadingFallback } from '../components/LoadingFallback';
import { mockStore } from '../lib/mockStore';

export const Assets: React.FC = () => {
  const { user, profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Supabase Data Source & Error tracking
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'supabase' | 'mock'>(isSupabaseConfigured ? 'supabase' : 'mock');
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [collateralType, setCollateralType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [custodyStatus, setCustodyStatus] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [saleStatus, setSaleStatus] = useState('');
  const [mortgageStatus, setMortgageStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [subdivision, setSubdivision] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // Selection
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);
  const [auditAsset, setAuditAsset] = useState<Asset | null>(null);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [extensionAsset, setExtensionAsset] = useState<Asset | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ urlOrPath: string; certificateNo?: string; title?: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Deletion Modal States
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; certificateNo: string } | null>(null);
  const [isDeleteMultipleModalOpen, setIsDeleteMultipleModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Ownership Transfer Modal States
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetAssets, setTransferTargetAssets] = useState<Asset[]>([]);
  const [transferRefreshCounter, setTransferRefreshCounter] = useState(0);

  const handleTransferSuccess = () => {
    loadAssets();
    setTransferRefreshCounter(c => c + 1);
    if (detailAsset) {
      setTimeout(() => {
        const updatedList = mockStore.getAssets();
        const found = updatedList.find(a => a.id === detailAsset.id);
        if (found) setDetailAsset(found);
      }, 50);
    }
  };

  useEffect(() => {
    loadProjects();
    fetchWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  // Debounce search inputs to avoid triggering API on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [debouncedSubdivision, setDebouncedSubdivision] = useState(subdivision);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedSubdivision(subdivision);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, subdivision]);

  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (error) {
      console.error('Failed to load projects', error);
      toast.error('Lỗi tải danh sách dự án');
    }
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetchAssets({
        search: debouncedSearch,
        collateralType: collateralType || undefined,
        projectId,
        custody_status: custodyStatus,
        lifecycle_status: lifecycleStatus,
        sale_status: saleStatus,
        mortgage_status: mortgageStatus,
        warehouseId,
        subdivision: debouncedSubdivision,
      }, page, pageSize);

      setAssets(res.data || []);
      setTotalCount(res.totalCount || 0);
      setDataSource(res.source || (isSupabaseConfigured ? 'supabase' : 'mock'));

      if (res.error) {
        setFetchError(res.error);
      }
    } catch (error: any) {
      console.error('Failed to load assets', error);
      const errMsg = error?.message || 'Không thể kết nối hoặc truy vấn dữ liệu từ Supabase';
      setFetchError(errMsg);
      setDataSource('mock');
      toast.error('Lỗi truy vấn Supabase: ' + errMsg);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, debouncedSubdivision, collateralType, projectId, custodyStatus, lifecycleStatus, saleStatus, mortgageStatus, warehouseId, page, pageSize]);

  const handleRetryConnection = async () => {
    setIsRetrying(true);
    await loadAssets();
    setIsRetrying(false);
    toast.success('Đã thử lại truy vấn Supabase');
  };

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debouncedSubdivision, collateralType, projectId, custodyStatus, lifecycleStatus, saleStatus, mortgageStatus, warehouseId]);

  // Fetch data on filter / page change
  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Realtime subscription: Subscribe ONCE with safe debounce and clean unsubscribe on unmount
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let reloadTimer: any = null;
    const channel = supabase.channel('assets_table_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          loadAssets();
        }, 500);
      })
      .subscribe();

    return () => {
      clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [loadAssets]);

  const isAssetOverdue = (asset: Asset) => {
    if (asset.custody_status === 'checked_out' && asset.expected_return_date) {
      const returnDate = new Date(asset.expected_return_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return returnDate < today;
    }
    return false;
  };

  const handleDeleteAsset = (id: string, certificateNo: string) => {
    setAssetToDelete({ id, certificateNo });
  };

  const confirmDeleteSingle = async () => {
    if (!assetToDelete) return;
    setIsDeleting(true);
    try {
      await deleteAsset(assetToDelete.id);
      toast.success(`Đã xoá GCN ${assetToDelete.certificateNo}`);
      setSelectedAssetIds(prev => {
        const next = new Set(prev);
        next.delete(assetToDelete.id);
        return next;
      });
      setAssetToDelete(null);
      await loadAssets();
    } catch (error: any) {
      toast.error('Lỗi khi xoá GCN: ' + (error?.message || 'Lỗi không xác định'));
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedAssetIds(new Set(assets.map(a => a.id)));
    } else {
      setSelectedAssetIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedAssetIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAssetIds(newSet);
  };

  const handleCreateRequest = async (type: TransactionType, details: any) => {
    if (!user || !profile) return;
    try {
      await createTransaction(
        user.id,
        type,
        details,
        Array.from(selectedAssetIds)
      );
      toast.success('Gửi yêu cầu thành công!');
      setSelectedAssetIds(new Set());
      loadAssets();
    } catch (error: any) {
      console.error(error);
      toast.error('Lỗi gửi yêu cầu: ' + error.message);
    }
  };

  const handleCreateAsset = async (assetData: Partial<Asset>) => {
    await createAsset(assetData);
    loadAssets();
  };

  const handleImportMultiple = async (assetsData: Partial<Asset>[]) => {
    try {
      await createMultipleAssets(assetsData);
      toast.success(`Đã import thành công ${assetsData.length} GCN`);
      loadAssets();
    } catch (err: any) {
      toast.error('Lỗi khi lưu dữ liệu vào hệ thống: ' + err.message);
    }
  };

  const handleDeleteMultiple = () => {
    if (selectedAssetIds.size === 0) return;
    setIsDeleteMultipleModalOpen(true);
  };

  const confirmDeleteMultiple = async () => {
    const ids = Array.from(selectedAssetIds);
    if (ids.length === 0) return;
    setIsDeleting(true);
    try {
      await deleteMultipleAssets(ids);
      toast.success(`Đã xóa thành công ${ids.length} GCN`);
      setSelectedAssetIds(new Set());
      setIsDeleteMultipleModalOpen(false);
      await loadAssets();
    } catch (error: any) {
      toast.error('Lỗi khi xóa tài sản: ' + (error?.message || 'Lỗi không xác định'));
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Đã copy mã: ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const selectedAssetsList = assets.filter(a => selectedAssetIds.has(a.id));

  return (
    <div className="space-y-4">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Quản Lý GCN QSDĐ & TSĐB</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              {totalCount} tài sản
            </span>

            {/* Supabase Connection Status Badge */}
            {isSupabaseConfigured && !fetchError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <Database className="w-3 h-3" /> Supabase Live
              </span>
            ) : fetchError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                <XCircle className="w-3 h-3 text-red-500" /> Lỗi Supabase
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <Info className="w-3 h-3 text-amber-500" /> Demo Mode (Chưa có .env Supabase)
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Định danh tự động theo vùng/loại TSĐB (VMT_BDS_xxxxx) · Quản lý phân khu riêng biệt & kiểm tra trùng lặp
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportAssetsToExcel(assets, 'Danh_sach_GCN_QSDD_VMT')}
            className="inline-flex items-center px-3.5 py-2 border border-emerald-300 text-xs font-semibold rounded-lg shadow-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors"
            title="Xuất toàn bộ danh sách đang hiển thị ra file Excel"
          >
            <Download className="mr-1.5 h-4 w-4 text-emerald-600" />
            Xuất Excel
          </button>

          {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
            <>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center px-3.5 py-2 border border-blue-200 text-xs font-semibold rounded-lg shadow-xs text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <Upload className="mr-1.5 h-4 w-4" />
                Import / Cập nhật Excel
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-lg shadow-xs text-white bg-[#1E3A8A] hover:bg-blue-800 transition-colors"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Khai báo GCN mới
              </button>
            </>
          )}
        </div>
      </div>

      {/* Supabase Error Alert Notification if fetch or connection fails */}
      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl shadow-xs text-xs text-red-900 animate-fadeIn">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-red-900 text-sm">Lỗi kết nối / truy vấn Supabase</h4>
                <p className="mt-1 text-red-700">
                  Hệ thống không thể tải dữ liệu từ bảng <code className="px-1 py-0.5 bg-red-100 rounded text-red-900 font-mono">assets</code> trong Supabase. Đang tự động chuyển sang dữ liệu dự phòng (Mock Store).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetryConnection}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? 'Đang thử lại...' : 'Thử kết nối lại Supabase'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    className="px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 text-red-800 font-medium rounded-lg transition-colors"
                  >
                    {showErrorDetails ? 'Ẩn chi tiết kỹ thuật' : 'Xem chi tiết lỗi'}
                  </button>
                </div>

                {showErrorDetails && (
                  <div className="mt-3 p-3 bg-white border border-red-200 rounded-lg text-red-950 font-mono text-[11px] overflow-x-auto leading-relaxed">
                    <div className="font-bold text-gray-700 mb-1">Chi tiết thông báo lỗi (Error Details):</div>
                    <pre className="whitespace-pre-wrap">{fetchError}</pre>
                    <div className="mt-2 text-gray-500 border-t border-red-100 pt-1.5">
                      Gợi ý: Kiểm tra biến môi trường <code className="text-gray-800 font-bold">VITE_SUPABASE_URL</code> và <code className="text-gray-800 font-bold">VITE_SUPABASE_ANON_KEY</code> trong cài đặt hoặc bảng <code className="text-gray-800 font-bold">assets</code> trong Supabase database.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFetchError(null)}
              className="text-red-400 hover:text-red-700 p-1 rounded-md"
              title="Đóng thông báo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Supabase Not Configured Info Notice (if .env keys not provided) */}
      {!isSupabaseConfigured && !fetchError && (
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-blue-950">Chưa cấu hình Supabase:</span> Ứng dụng đang hiển thị dữ liệu mẫu từ Mock Store. Cấu hình biến môi trường <code className="px-1.5 py-0.5 bg-blue-100/80 rounded font-mono text-blue-950">VITE_SUPABASE_URL</code> và <code className="px-1.5 py-0.5 bg-blue-100/80 rounded font-mono text-blue-950">VITE_SUPABASE_ANON_KEY</code> để đồng bộ dữ liệu thực tế.
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Search */}
        <div className="relative sm:col-span-2">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Tìm theo Mã TS, Số GCN, Tên DA/Mã lô KD, CSH, Thửa..."
            className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Phân khu Filter */}
        <div className="relative">
          <input
            type="text"
            placeholder="Lọc theo Phân khu (Khu A, Block B...)"
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            value={subdivision}
            onChange={(e) => setSubdivision(e.target.value)}
          />
        </div>

        {/* Loại TSĐB */}
        <div>
          <select
            value={collateralType}
            onChange={(e) => setCollateralType(e.target.value)}
            className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả Loại TSĐB</option>
            {COLLATERAL_TYPES.map(ct => (
              <option key={ct.code} value={ct.code}>
                [{ct.shortName}] {ct.name}
              </option>
            ))}
          </select>
        </div>

        {/* Dự án */}
        <div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả dự án</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Lưu kho */}
        <div>
          <select
            value={custodyStatus}
            onChange={e => setCustodyStatus(e.target.value)}
            className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả (Lưu kho)</option>
            <option value="in_stock">Trong kho BTC</option>
            <option value="checked_out">Đang mượn / Xuất kho</option>
          </select>
        </div>

        {/* Vòng đời */}
        <div>
          <select
            value={lifecycleStatus}
            onChange={e => setLifecycleStatus(e.target.value)}
            className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả (Vòng đời)</option>
            <option value="active">Đang hiệu lực (Active)</option>
            <option value="split">Đã tách một phần</option>
            <option value="invalidated">Vô hiệu / Hết hiệu lực</option>
          </select>
        </div>

        {/* Kinh doanh */}
        <div>
          <select
            value={saleStatus}
            onChange={e => setSaleStatus(e.target.value)}
            className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả (Kinh doanh)</option>
            <option value="not_ready">Chưa SS bán</option>
            <option value="ready_for_sale">Sẵn sàng bán</option>
            <option value="sold">Đã bán</option>
          </select>
        </div>

        {/* Thế chấp */}
        <div>
          <select
            value={mortgageStatus}
            onChange={e => setMortgageStatus(e.target.value)}
            className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả (Thế chấp)</option>
            <option value="none">Không thế chấp</option>
            <option value="mortgaged">Đang thế chấp</option>
          </select>
        </div>

        {/* Kho */}
        <div>
          <select
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
            className="block w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Tất cả (Kho giữ)</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedAssetIds.size > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-600 text-white rounded-lg text-xs">
              <CheckSquare className="w-4 h-4" />
            </span>
            <div className="text-xs text-blue-950 font-semibold">
              Đang chọn <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">{selectedAssetIds.size}</span> tài sản / GCN
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportAssetsToExcel(selectedAssetsList, 'Danh_sach_GCN_Duoc_Chon')}
              className="inline-flex items-center px-3 py-1.5 border border-emerald-300 text-xs font-semibold rounded-lg text-emerald-800 bg-white hover:bg-emerald-50 transition-colors shadow-xs"
              title="Xuất các dòng đang chọn ra Excel"
            >
              <Download className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              Xuất Excel ({selectedAssetIds.size})
            </button>

            {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
              <button
                onClick={() => setIsBulkEditOpen(true)}
                className="inline-flex items-center px-3.5 py-1.5 border border-blue-400 text-xs font-bold rounded-lg text-white bg-blue-700 hover:bg-blue-800 transition-colors shadow-xs"
              >
                <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                Sửa Hàng Loạt ({selectedAssetIds.size})
              </button>
            )}

            {canBulkTransferAssets(profile, selectedAssetsList) && (
              <button
                type="button"
                onClick={() => {
                  setTransferTargetAssets(selectedAssetsList);
                  setIsTransferModalOpen(true);
                }}
                className="inline-flex items-center px-3.5 py-1.5 border border-indigo-400 text-xs font-bold rounded-lg text-white bg-indigo-700 hover:bg-indigo-800 transition-colors shadow-xs cursor-pointer"
                title="Chuyển nhượng quyền sở hữu CĐT / NĐT cho các GCN đang chọn"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
                Chuyển Nhượng ({selectedAssetIds.size})
              </button>
            )}

            {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
              <button
                onClick={handleDeleteMultiple}
                className="inline-flex items-center px-3 py-1.5 border border-red-200 text-xs font-semibold rounded-lg text-red-700 bg-white hover:bg-red-50 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Xóa ({selectedAssetIds.size})
              </button>
            )}

            {profile?.role !== 'viewer' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center px-3.5 py-1.5 border border-transparent text-xs font-bold rounded-lg text-white bg-[#1E3A8A] hover:bg-blue-800 transition-colors shadow-xs"
              >
                Tạo yêu cầu luân chuyển / mượn
              </button>
            )}

            <button
              onClick={() => setSelectedAssetIds(new Set())}
              className="text-xs text-slate-500 hover:text-slate-800 underline px-2 py-1 cursor-pointer"
            >
              Bỏ chọn tất cả
            </button>
          </div>
        </div>
      )}

      {/* Main Table Container with Header Toolbar */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-3.5 bg-gray-50/90 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-bold text-gray-900 text-xs sm:text-sm">
              Danh Sách GCN & Tài Sản Đảm Bảo
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1E3A8A] border border-blue-200">
              {totalCount} GCN
            </span>
            <span className="text-xs text-gray-300 hidden md:inline">|</span>
            <span className="text-[11px] text-gray-500 hidden lg:inline">
              Hiển thị toàn bộ thông tin mã định danh, dự án, thửa đất, số GCN, tình trạng kho & thế chấp
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Density switch */}
            <div className="flex items-center bg-white p-0.5 rounded-lg border border-gray-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setTableDensity('comfortable')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  tableDensity === 'comfortable'
                    ? 'bg-[#1E3A8A] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Hiển thị đầy đủ thông tin chi tiết trên từng dòng"
              >
                Chi tiết
              </button>
              <button
                type="button"
                onClick={() => setTableDensity('compact')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  tableDensity === 'compact'
                    ? 'bg-[#1E3A8A] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Chế độ dòng thu gọn"
              >
                Thu gọn
              </button>
            </div>

            {/* Page Size */}
            <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
              <span className="hidden sm:inline">Hiển thị:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="text-xs border border-gray-300 rounded-lg py-1 px-2 bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-blue-500"
              >
                <option value={10}>10 / trang</option>
                <option value={25}>25 / trang</option>
                <option value={50}>50 / trang</option>
                <option value={100}>100 / trang</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="overflow-x-auto max-h-[72vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left border-separate border-spacing-0">
            <thead className="sticky top-0 bg-slate-100 z-20 shadow-2xs">
              <tr>
                <th scope="col" className="px-3 py-3 w-10 text-center sticky left-0 bg-slate-100 z-30 border-b border-gray-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={assets.length > 0 && selectedAssetIds.size === assets.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-800 uppercase tracking-wider sticky left-10 bg-slate-100 z-30 border-b border-gray-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] min-w-[150px]">
                  Mã TSĐB
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 min-w-[200px]">
                  Dự Án & Phân Khu
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-[#1E3A8A] uppercase tracking-wider bg-blue-50/80 border-b border-gray-300 min-w-[140px]">
                  Mã Lô Đất / KD
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 min-w-[150px]">
                  Thửa / Lô & Diện Tích
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 min-w-[220px]">
                  Số GCN & Chủ Sở Hữu
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 min-w-[140px]">
                  Loại TS & Mục Đích SD
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 min-w-[220px]">
                  Kho & Trạng Thái & Thế Chấp
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider sticky right-0 bg-slate-100 z-30 border-b border-l border-gray-300 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)] w-32">
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-6">
                    <LoadingFallback
                      message="Đang tải danh sách GCN và TSĐB..."
                      onRetry={() => loadAssets()}
                      onForceLocal={() => {
                        const allFiltered = mockStore.getAssets({
                          search: debouncedSearch,
                          collateralType: collateralType || undefined,
                          projectId,
                          custody_status: custodyStatus,
                          lifecycle_status: lifecycleStatus,
                          sale_status: saleStatus,
                          mortgage_status: mortgageStatus,
                          warehouseId,
                          subdivision: debouncedSubdivision,
                        });
                        setTotalCount(allFiltered.length);
                        const startIndex = (page - 1) * pageSize;
                        setAssets(allFiltered.slice(startIndex, startIndex + pageSize));
                        setLoading(false);
                        toast.success('Đã tải dữ liệu tài sản cục bộ');
                      }}
                    />
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto" />
                    <p className="mt-2 text-sm text-gray-500 font-medium">Không tìm thấy tài sản nào phù hợp với bộ lọc.</p>
                  </td>
                </tr>
              ) : (
                assets.map((asset) => {
                  const overdue = isAssetOverdue(asset);
                  const displayCode = asset.asset_code || `VMT_${asset.collateral_type || 'BDS'}_${(asset.id.replace(/\D/g, '') || '1').padStart(8, '0')}`;
                  const plotCode = formatPlotCode(asset.subdivision, asset.lot_no, asset.land_lot_no);
                  const isMortgaged = asset.mortgage_status === 'mortgaged';
                  
                  return (
                    <tr key={asset.id} className={`hover:bg-blue-50/30 transition-colors ${overdue ? 'bg-red-50/40' : ''}`}>
                      {/* Checkbox (Sticky Left) */}
                      <td className="px-3 py-2.5 text-center sticky left-0 bg-white z-10 border-b border-gray-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          checked={selectedAssetIds.has(asset.id)}
                          onChange={() => handleSelectOne(asset.id)}
                        />
                      </td>

                      {/* 1. Mã TSĐB (Sticky Left) */}
                      <td className="px-3 py-2.5 whitespace-nowrap sticky left-10 bg-white z-10 border-b border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-xs font-bold text-[#1E3A8A] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {displayCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(displayCode)}
                            className="text-gray-400 hover:text-blue-600 p-0.5 rounded transition-colors cursor-pointer"
                            title="Sao chép mã tài sản"
                          >
                            {copiedCode === displayCode ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5">
                          <span className="font-semibold text-gray-700">[{asset.collateral_type || 'BDS'}]</span>
                          <span>·</span>
                          <span>{asset.certificate_group === 'so_lon' ? 'Sổ lớn' : 'Sổ nhỏ'}</span>
                          {asset.parent_asset_id && (
                            <span className="text-[10px] bg-purple-100 text-purple-800 px-1 py-0.2 rounded font-semibold">
                              Sổ con
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Dự Án & Phân Khu */}
                      <td className="px-3 py-2.5 border-b border-gray-200 min-w-[200px]">
                        <div className="text-xs font-bold text-gray-900 leading-snug">
                          {asset.projects?.name || <span className="text-gray-400 font-normal italic">Chưa gán dự án</span>}
                        </div>
                        {asset.business_project_name && (
                          <div className="mt-1">
                            <span className="inline-flex items-center text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" title={`Tên dự án kinh doanh: ${asset.business_project_name}`}>
                              KD: {asset.business_project_name}
                            </span>
                          </div>
                        )}
                        <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                          {asset.subdivision && (
                            <span className="font-medium text-gray-700">Khu: {asset.subdivision}</span>
                          )}
                          {asset.projects?.areas?.name && (
                            <>
                              <span>·</span>
                              <span>{asset.projects.areas.name}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 3. Mã Lô Đất & Mã KD */}
                      <td className="px-3 py-2.5 border-b border-gray-200 bg-blue-50/20 min-w-[140px]">
                        {plotCode !== '-' ? (
                          <span className="inline-block px-2.5 py-1 rounded text-xs font-bold text-blue-900 bg-blue-100 border border-blue-200 shadow-2xs">
                            {plotCode}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Chưa xác định</span>
                        )}
                        {asset.business_plot_code && (
                          <div className="mt-1">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200" title={`Mã lô kinh doanh: ${asset.business_plot_code}`}>
                              KD: {asset.business_plot_code}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 4. Thửa / Lô & Diện Tích */}
                      <td className="px-3 py-2.5 border-b border-gray-200 min-w-[150px]">
                        <div className="text-xs font-bold text-gray-800">
                          {asset.lot_no ? `Lô ${asset.lot_no}` : `Thửa #${asset.land_lot_no || '-'}`}
                          {asset.map_sheet_no && ` · Tờ #${asset.map_sheet_no}`}
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex items-center text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {asset.area ? `${asset.area.toLocaleString('vi-VN')} m²` : 'Chưa có DT'}
                          </span>
                        </div>
                      </td>

                      {/* 5. Số GCN & Chủ Sở Hữu */}
                      <td className="px-3 py-2.5 border-b border-gray-200 min-w-[220px]">
                        <button
                          type="button"
                          onClick={() => setDetailAsset(asset)}
                          className="text-left font-bold text-[#1E3A8A] hover:underline text-xs block cursor-pointer"
                        >
                          Số GCN: {asset.certificate_no}
                        </button>
                          {asset.custody_status === 'checked_out' && ['super_admin', 'admin', 'btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'chuyen_vien'].includes(profile?.role || '') && (
                            <button
                              type="button"
                              onClick={() => setExtensionAsset(asset)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              title="Xin gia hạn thời gian mượn sổ"
                            >
                              <CalendarClock className="w-4 h-4" />
                            </button>
                          )}

                        <div className="text-xs text-gray-800 font-medium mt-1 leading-snug">
                          {asset.owner_name || <span className="text-gray-400 italic">Chưa có tên CSH</span>}
                        </div>
                        {asset.current_owner_entity && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center text-[10px] font-semibold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              <Building2 className="w-3 h-3 mr-1 text-indigo-600" />
                              {asset.current_owner_entity.name}
                              {asset.current_owner_entity.company_code && ` (${asset.current_owner_entity.company_code})`}
                            </span>
                            {asset.current_owner_role === 'cdt' ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                CĐT
                              </span>
                            ) : asset.current_owner_role === 'ndt' ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                                NĐT
                              </span>
                            ) : null}
                          </div>
                        )}
                        {asset.scan_file_url && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc({
                                urlOrPath: asset.scan_file_url!,
                                certificateNo: asset.certificate_no,
                                title: `Bản scan GCN - ${asset.asset_code || asset.certificate_no}`,
                              })
                            }
                            className="inline-flex items-center text-[11px] text-blue-600 hover:text-blue-800 hover:underline mt-1 font-medium cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1 text-blue-500" /> Bản scan GCN
                          </button>
                        )}
                      </td>

                      {/* 6. Loại Tài Sản & Mục Đích SD */}
                      <td className="px-3 py-2.5 border-b border-gray-200 min-w-[140px]">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-gray-800 bg-gray-100 border border-gray-200">
                          {asset.asset_type || asset.usage_purpose || asset.collateral_type || 'Bất động sản'}
                        </span>
                        {tableDensity === 'comfortable' && asset.usage_term && (
                          <div className="text-[11px] text-gray-500 mt-1">
                            Thời hạn: {asset.usage_term}
                          </div>
                        )}
                      </td>

                      {/* 7. Kho & Trạng Thái & Thế Chấp */}
                      <td className="px-3 py-2.5 border-b border-gray-200 min-w-[220px]">
                        <div className="text-xs font-bold text-gray-900 flex items-center gap-1">
                          <span className="text-gray-500">Kho:</span> {asset.warehouses?.name || <span className="text-gray-400 font-normal italic">Chưa gán kho</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <StatusBadges
                            custody_status={asset.custody_status}
                            lifecycle_status={asset.lifecycle_status}
                            sale_status={asset.sale_status}
                            mortgage_status={asset.mortgage_status}
                          />
                        </div>
                        {asset.custody_status === 'checked_out' && (
                          <div className="text-[11px] text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mt-1 font-medium">
                            Bên mượn: {asset.current_holder_dept || 'Phòng ban nghiệp vụ'}
                          </div>
                        )}
                        {isMortgaged && (
                          <div className="text-[11px] text-red-900 bg-red-50 px-2 py-0.5 rounded border border-red-200 mt-1 font-medium">
                            NH: {asset.mortgage_bank || 'Đang thế chấp'}
                            {asset.mortgage_valuation ? ` (${(Number(asset.mortgage_valuation) / 1e9).toFixed(1)} tỷ)` : ''}
                          </div>
                        )}
                      </td>

                      {/* 8. Thao Tác (Sticky Right) */}
                      <td className="px-3 py-2.5 whitespace-nowrap text-center sticky right-0 bg-white/95 backdrop-blur-xs z-10 border-b border-l border-gray-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)] w-32">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setDetailAsset(asset)}
                            className="p-1.5 text-gray-600 hover:text-[#1E3A8A] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            title="Xem chi tiết đầy đủ GCN"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* Sửa / Điều chỉnh */}
                          {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
                            <button
                              type="button"
                              onClick={() => setEditingAsset(asset)}
                              className="p-1.5 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Điều chỉnh / Cập nhật thông tin"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Chuyển nhượng quyền sở hữu */}
                          {canTransferAsset(profile, asset) && (
                            <button
                              type="button"
                              onClick={() => {
                                setTransferTargetAssets([asset]);
                                setIsTransferModalOpen(true);
                              }}
                              className="p-1.5 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Chuyển nhượng quyền sở hữu CĐT / NĐT"
                            >
                              <ArrowLeftRight className="w-4 h-4" />
                            </button>
                          )}

                          {/* Lịch sử Audit Trail */}
                          <button
                            type="button"
                            onClick={() => setAuditAsset(asset)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Xem lịch sử thay đổi & Lưu vết (Audit Trail)"
                          >
                            <History className="w-4 h-4" />
                          </button>

                          {/* Lịch sử luân chuyển */}
                          <button
                            type="button"
                            onClick={() => setHistoryAsset(asset)}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            title="Lịch sử luân chuyển kho"
                          >
                            <Tag className="w-4 h-4" />
                          </button>

                          {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteAsset(asset.id, asset.certificate_no)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Xóa GCN"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalCount > 0 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="text-xs text-gray-700">
              Hiển thị <span className="font-semibold">{(page - 1) * pageSize + 1}</span> đến{' '}
              <span className="font-semibold">{Math.min(page * pageSize, totalCount)}</span> trong{' '}
              <span className="font-semibold">{totalCount}</span> tài sản
            </div>
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="text-xs border-gray-300 rounded-md py-1"
              >
                <option value={10}>10 / trang</option>
                <option value={25}>25 / trang</option>
                <option value={50}>50 / trang</option>
                <option value={100}>100 / trang</option>
              </select>

              <div className="flex space-x-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 text-xs border rounded-md disabled:opacity-40 hover:bg-gray-50"
                >
                  Trước
                </button>
                <span className="px-3 py-1 text-xs font-semibold bg-gray-100 rounded-md">
                  {page} / {Math.ceil(totalCount / pageSize) || 1}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
                  disabled={page >= Math.ceil(totalCount / pageSize)}
                  className="px-2.5 py-1 text-xs border rounded-md disabled:opacity-40 hover:bg-gray-50"
                >
                  Sau
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Asset Detail Modal */}
      {detailAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-200">
            <div className="bg-[#1E3A8A] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold">Chi tiết GCN #{detailAsset.certificate_no}</h3>
                  <span className="px-2 py-0.5 bg-blue-500/40 text-blue-100 text-xs font-mono font-bold rounded">
                    {detailAsset.asset_code || `VMT_${detailAsset.collateral_type || 'BDS'}_${detailAsset.id.slice(-5)}`}
                  </span>
                </div>
                <p className="text-xs text-blue-200 mt-0.5">Chủ sở hữu: {detailAsset.owner_name || 'Chưa cập nhật'}</p>
              </div>
              <button onClick={() => setDetailAsset(null)} className="text-white/80 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                <div>
                  <span className="text-gray-500 block text-[11px]">Mã Định Danh:</span>
                  <span className="font-mono font-bold text-blue-900">
                    {detailAsset.asset_code || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Loại TSĐB:</span>
                  <span className="font-semibold text-gray-900">{detailAsset.collateral_type || 'BDS'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Dự Án (Pháp lý):</span>
                  <span className="font-semibold text-gray-900">{detailAsset.projects?.name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[11px]">Phân Khu:</span>
                  <span className="font-bold text-blue-800 bg-blue-100/60 px-2 py-0.5 rounded inline-block">
                    {detailAsset.subdivision || 'Chưa phân khu'}
                  </span>
                </div>
              </div>

              {/* Commercial Info Block */}
              <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-3.5 space-y-2">
                <h4 className="font-bold text-blue-900 uppercase flex items-center text-xs">
                  <span className="w-2 h-2 rounded-full bg-blue-600 mr-2" /> Thông Tin Thương Mại / Bán Hàng (Commercial Info)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-white p-2.5 rounded border border-blue-100">
                    <span className="text-gray-500 block text-[11px] font-medium">Tên Dự Án Kinh Doanh:</span>
                    <strong className="text-emerald-800 text-xs font-bold block mt-0.5">
                      {detailAsset.business_project_name || <span className="text-gray-400 font-normal italic">Chưa thiết lập</span>}
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-blue-100">
                    <span className="text-gray-500 block text-[11px] font-medium">Mã Lô Kinh Doanh:</span>
                    <strong className="text-indigo-800 text-xs font-bold block mt-0.5">
                      {detailAsset.business_plot_code || <span className="text-gray-400 font-normal italic">Chưa thiết lập</span>}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Ownership Block (CĐT / NĐT) */}
              <div className="border border-indigo-200 bg-indigo-50/50 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-indigo-950 uppercase flex items-center text-xs">
                    <Building2 className="w-3.5 h-3.5 mr-1.5 text-indigo-700" /> Pháp Nhân Sở Hữu (CĐT / NĐT)
                  </h4>
                  {canTransferAsset(profile, detailAsset) && (
                    <button
                      type="button"
                      onClick={() => {
                        setTransferTargetAssets([detailAsset]);
                        setIsTransferModalOpen(true);
                      }}
                      className="inline-flex items-center px-2.5 py-1 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer shadow-xs"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Chuyển Nhượng
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-white p-2.5 rounded border border-indigo-100">
                    <span className="text-gray-500 block text-[11px] font-medium">Pháp Nhân Đang Sở Hữu:</span>
                    <strong className="text-indigo-950 text-xs font-bold block mt-0.5">
                      {detailAsset.current_owner_entity?.name ? (
                        <span>
                          {detailAsset.current_owner_entity.name}{' '}
                          {detailAsset.current_owner_entity.company_code && `(${detailAsset.current_owner_entity.company_code})`}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-normal italic">Chưa liên kết pháp nhân CĐT/NĐT</span>
                      )}
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-indigo-100">
                    <span className="text-gray-500 block text-[11px] font-medium">Vai Trò Chủ Sở Hữu:</span>
                    <div className="mt-1">
                      {detailAsset.current_owner_role === 'cdt' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 inline-block">
                          Chủ đầu tư (CĐT)
                        </span>
                      ) : detailAsset.current_owner_role === 'ndt' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 inline-block">
                          Nhà đầu tư (NĐT)
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Chưa xác định vai trò</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal & Cadastral Block */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <h4 className="font-bold text-[#1E3A8A] uppercase flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1" /> Thông tin Thửa đất & Địa chính
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><span className="text-gray-500 block">Số Lô / Thửa:</span> <strong>{detailAsset.lot_no || '-'}</strong></div>
                  <div><span className="text-gray-500 block">Số Thửa Đất:</span> <strong>{detailAsset.land_lot_no || '-'}</strong></div>
                  <div><span className="text-gray-500 block">Số Tờ Bản Đồ:</span> <strong>{detailAsset.map_sheet_no || '-'}</strong></div>
                  <div><span className="text-gray-500 block">Diện Tích:</span> <strong>{detailAsset.area ? `${detailAsset.area} m²` : '-'}</strong></div>
                  <div><span className="text-gray-500 block">Số Vào Sổ:</span> <strong>{detailAsset.registry_no || '-'}</strong></div>
                  <div><span className="text-gray-500 block">Ngày Vào Sổ:</span> <strong>{detailAsset.registry_date || '-'}</strong></div>
                  <div><span className="text-gray-500 block">Cơ Quan Cấp:</span> <strong>{detailAsset.managing_unit || '-'}</strong></div>
                  <div><span className="text-gray-500 block">Loại Tài Sản:</span> <strong>{detailAsset.asset_type || '-'}</strong></div>
                </div>
                <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-3">
                  <div><span className="text-gray-500 block">Địa chỉ chi tiết:</span> {detailAsset.address_detail || '-'}</div>
                  <div><span className="text-gray-500 block">Mục đích / Thời hạn sử dụng:</span> {detailAsset.usage_purpose || 'Đất ở'} ({detailAsset.usage_term || (detailAsset.usage_term_type === 'long_term' ? 'Lâu dài' : detailAsset.usage_term_date || 'Có thời hạn')})</div>
                </div>
              </div>

              {/* Mortgage Block */}
              {detailAsset.mortgage_status === 'mortgaged' && (
                <div className="border border-amber-300 bg-amber-50/70 rounded-lg p-4 space-y-2">
                  <h4 className="font-bold text-amber-900 uppercase flex items-center">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Hồ Sơ Thế Chấp Ngân Hàng
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div><strong>Ngân hàng 1:</strong> {detailAsset.mortgage_bank || '-'}</div>
                    <div><strong>Đơn vị thực hiện:</strong> {detailAsset.mortgage_unit || '-'}</div>
                    <div><strong>Định giá:</strong> {detailAsset.mortgage_valuation ? `${Number(detailAsset.mortgage_valuation).toLocaleString('vi-VN')} VNĐ` : '-'}</div>
                    {detailAsset.mortgage_bank_2 && <div><strong>Ngân hàng 2:</strong> {detailAsset.mortgage_bank_2}</div>}
                    {detailAsset.collateral_ratio && <div><strong>Tỷ lệ ĐB:</strong> {detailAsset.collateral_ratio}%</div>}
                    <div><strong>Dự kiến giải chấp:</strong> {detailAsset.mortgage_expected_release_date || '-'}</div>
                  </div>
                </div>
              )}

              {/* Scan file URL */}
              {detailAsset.scan_file_url && (
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        urlOrPath: detailAsset.scan_file_url!,
                        certificateNo: detailAsset.certificate_no,
                        title: `Bản scan GCN - ${detailAsset.asset_code || detailAsset.certificate_no}`,
                      })
                    }
                    className="inline-flex items-center px-3.5 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer shadow-xs"
                  >
                    <Eye className="w-4 h-4 mr-1.5 text-blue-600" /> Xem Bản Scan Giấy Chứng Nhận Đính Kèm
                  </button>
                </div>
              )}

              {/* Transfer History Block */}
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <AssetTransferHistory assetId={detailAsset.id} refreshTrigger={transferRefreshCounter} />
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                {canTransferAsset(profile, detailAsset) && (
                  <button
                    onClick={() => {
                      setTransferTargetAssets([detailAsset]);
                      setIsTransferModalOpen(true);
                    }}
                    className="inline-flex items-center px-3.5 py-1.5 bg-indigo-700 text-white text-xs font-semibold rounded-lg hover:bg-indigo-800 transition-colors cursor-pointer shadow-xs"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" /> Chuyển Nhượng
                  </button>
                )}
                {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
                  <button
                    onClick={() => {
                      const a = detailAsset;
                      setDetailAsset(null);
                      setEditingAsset(a);
                    }}
                    className="inline-flex items-center px-3.5 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Sửa / Cập Nhật Thông Tin
                  </button>
                )}
              </div>
              <button
                onClick={() => setDetailAsset(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Asset Modal */}
      {editingAsset && (
        <EditAssetModal
          isOpen={true}
          onClose={() => setEditingAsset(null)}
          asset={editingAsset}
          onSuccess={loadAssets}
          projects={projects}
          warehouses={warehouses}
        />
      )}

      {/* Other Modals */}
      {profile && (
        <>
          <RequestModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSubmit={handleCreateRequest}
            selectedAssets={selectedAssetsList}
            userRole={profile.role}
            warehouses={warehouses}
          />
          <CreateAssetModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSubmit={handleCreateAsset}
            projects={projects}
            warehouses={warehouses}
          />
          <ImportExcelModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={() => {
              setIsImportModalOpen(false);
              loadAssets();
            }}
            currentUser={profile ? { id: profile.id, email: profile.email, full_name: profile.full_name } : null}
          />
        </>
      )}

      {/* Bulk Edit Modal */}
      {isBulkEditOpen && (
        <BulkEditModal
          selectedAssets={selectedAssetsList}
          currentUser={profile ? { id: profile.id, email: profile.email, full_name: profile.full_name } : null}
          onClose={() => setIsBulkEditOpen(false)}
          onSuccess={() => {
            setSelectedAssetIds(new Set());
            loadAssets();
          }}
        />
      )}

      {/* Audit Log Timeline Modal */}
      {auditAsset && (
        <AssetAuditModal
          asset={auditAsset}
          onClose={() => setAuditAsset(null)}
        />
      )}

      {/* Asset Transaction History Modal */}
      {historyAsset && (
        <AssetHistoryModal
          assetId={historyAsset.id}
          certificateNo={historyAsset.certificate_no}
          onClose={() => setHistoryAsset(null)}
        />
      )}

      {/* Asset Extension Modal */}
      {extensionAsset && (
        <AssetExtensionModal
          isOpen={!!extensionAsset}
          onClose={() => setExtensionAsset(null)}
          asset={extensionAsset}
          onSubmit={async (days, reason) => {
            await requestExtension(extensionAsset.id, days, reason, profile);
            toast.success(`Đã xin gia hạn thành công thêm ${days} ngày.`);
            setExtensionAsset(null);
            loadAssets();
          }}
        />
      )}

      {/* Single Asset Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!assetToDelete}
        onClose={() => setAssetToDelete(null)}
        onConfirm={confirmDeleteSingle}
        title="Xác nhận xóa GCN QSDĐ"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn GCN "${assetToDelete?.certificateNo}" khỏi hệ thống không? Hành động này sẽ được ghi nhận vào nhật ký và không thể hoàn tác.`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />

      {/* Bulk Delete Confirm Modal */}
      <ConfirmModal
        isOpen={isDeleteMultipleModalOpen}
        onClose={() => setIsDeleteMultipleModalOpen(false)}
        onConfirm={confirmDeleteMultiple}
        title="Xác nhận xóa nhiều GCN QSDĐ"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedAssetIds.size} GCN QSDĐ đang chọn không? Tất cả các bản ghi đã chọn sẽ bị xóa khỏi cơ sở dữ liệu.`}
        confirmText={`Xóa ${selectedAssetIds.size} GCN`}
        confirmVariant="danger"
        loading={isDeleting}
      />
      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          fileUrlOrPath={previewDoc.urlOrPath}
          certificateNo={previewDoc.certificateNo}
          title={previewDoc.title || 'Xem Bản Scan GCN'}
        />
      )}

      {/* Asset Ownership Transfer Modal */}
      <AssetTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setTransferTargetAssets([]);
        }}
        onSuccess={handleTransferSuccess}
        assets={transferTargetAssets}
        currentUser={profile}
      />
    </div>
  );
};
