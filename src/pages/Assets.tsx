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
import { BulkEditModal } from '../components/BulkEditModal';
import { AssetAuditModal } from '../components/AssetAuditModal';
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
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const Assets: React.FC = () => {
  const { user, profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    try {
      const { data, totalCount: total } = await fetchAssets({
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
      setAssets(data || []);
      setTotalCount(total || 0);
    } catch (error) {
      console.error('Failed to load assets', error);
      toast.error('Lỗi tải danh sách GCN');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, debouncedSubdivision, collateralType, projectId, custodyStatus, lifecycleStatus, saleStatus, mortgageStatus, warehouseId, page, pageSize]);

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

  const handleDeleteAsset = async (id: string, certificateNo: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn GCN ${certificateNo}?`)) {
      try {
        await deleteAsset(id);
        toast.success(`Đã xoá GCN ${certificateNo}`);
        loadAssets();
      } catch (error) {
        toast.error('Lỗi khi xoá GCN');
        console.error(error);
      }
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

  const handleDeleteMultiple = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN ${selectedAssetIds.size} GCN đã chọn không? Hành động này không thể hoàn tác.`)) {
      return;
    }
    setLoading(true);
    try {
      const ids = Array.from(selectedAssetIds);
      await deleteMultipleAssets(ids);
      toast.success(`Đã xóa thành công ${ids.length} GCN`);
      setSelectedAssetIds(new Set());
      loadAssets();
    } catch (error) {
      toast.error('Lỗi khi xóa tài sản');
      console.error(error);
      setLoading(false);
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
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-gray-900">Quản Lý GCN QSDĐ & TSĐB</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              {totalCount} tài sản
            </span>
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

      {/* Main Table */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left">
            <thead className="bg-gray-50/80">
              <tr>
                <th scope="col" className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={assets.length > 0 && selectedAssetIds.size === assets.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Mã TSĐB
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Dự án
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Loại tài sản
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-[#1E3A8A] uppercase tracking-wider bg-blue-50/70">
                  Mã lô đất
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Số Lô / Thửa & ĐC
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Số GCN & Pháp Lý
                </th>
                <th scope="col" className="px-3 py-3 text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Kho & Trạng Thái
                </th>
                <th scope="col" className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-28">
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
                    <p className="mt-2 text-xs text-gray-500">Đang tải danh sách tài sản...</p>
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto" />
                    <p className="mt-2 text-sm text-gray-500">Không tìm thấy tài sản nào phù hợp.</p>
                  </td>
                </tr>
              ) : (
                assets.map((asset) => {
                  const overdue = isAssetOverdue(asset);
                  const displayCode = asset.asset_code || `VMT_${asset.collateral_type || 'BDS'}_${(asset.id.replace(/\D/g, '') || '1').padStart(8, '0')}`;
                  const plotCode = formatPlotCode(asset.subdivision, asset.lot_no, asset.land_lot_no);
                  
                  return (
                    <tr key={asset.id} className={`hover:bg-gray-50/80 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          checked={selectedAssetIds.has(asset.id)}
                          onChange={() => handleSelectOne(asset.id)}
                        />
                      </td>

                      {/* 1. Mã TSĐB */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-xs font-bold text-[#1E3A8A] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {displayCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(displayCode)}
                            className="text-gray-400 hover:text-blue-600 p-0.5 rounded"
                            title="Sao chép mã tài sản"
                          >
                            {copiedCode === displayCode ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          <span className="font-medium">{asset.collateral_type || 'BDS'}</span> · {asset.certificate_group === 'so_lon' ? 'Sổ lớn' : 'Sổ nhỏ'}
                        </div>
                      </td>

                      {/* 2. Dự Án */}
                      <td className="px-3 py-3">
                        <div className="text-xs text-gray-900 font-semibold truncate max-w-[170px]" title={asset.projects?.name || ''}>
                          {asset.projects?.name || '-'}
                        </div>
                        {asset.business_project_name && (
                          <div className="mt-0.5">
                            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 truncate max-w-[160px]" title={`Tên dự án kinh doanh: ${asset.business_project_name}`}>
                              KD: {asset.business_project_name}
                            </span>
                          </div>
                        )}
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {asset.projects?.areas?.name || ''}
                        </div>
                      </td>

                      {/* 3. Loại tài sản */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-gray-800 bg-gray-100 border border-gray-200">
                          {asset.asset_type || asset.usage_purpose || asset.collateral_type || 'Bất động sản'}
                        </span>
                      </td>

                      {/* 4. Mã lô đất (Phân Khu & "-" & Số thửa/lô) & Mã lô kinh doanh */}
                      <td className="px-3 py-3 whitespace-nowrap bg-blue-50/20">
                        {plotCode !== '-' ? (
                          <span className="inline-block px-2.5 py-1 rounded text-xs font-bold text-blue-900 bg-blue-100 border border-blue-200">
                            {plotCode}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Chưa xác định</span>
                        )}
                        {asset.business_plot_code && (
                          <div className="mt-1">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200" title={`Mã lô kinh doanh / bán hàng: ${asset.business_plot_code}`}>
                              KD: {asset.business_plot_code}
                            </span>
                          </div>
                        )}
                        {asset.subdivision && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Khu: {asset.subdivision}
                          </div>
                        )}
                      </td>

                      {/* 5. Số Lô / Thửa & ĐC */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-xs font-semibold text-gray-800">
                          {asset.lot_no ? `Lô ${asset.lot_no}` : `Thửa #${asset.land_lot_no || '-'}`}
                          {asset.map_sheet_no && ` · Tờ #${asset.map_sheet_no}`}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {asset.area ? `${asset.area.toLocaleString('vi-VN')} m²` : '-'}
                        </div>
                      </td>

                      {/* 6. Số GCN & Pháp Lý */}
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setDetailAsset(asset)}
                          className="text-left font-bold text-gray-900 hover:text-[#1E3A8A] hover:underline text-xs block"
                        >
                          {asset.certificate_no}
                        </button>
                        <div className="text-[11px] text-gray-500 truncate max-w-[160px]" title={asset.owner_name || ''}>
                          {asset.owner_name || 'Chưa có tên CSH'}
                        </div>
                        {asset.scan_file_url && (
                          <a
                            href={asset.scan_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-[10px] text-blue-600 hover:underline mt-0.5"
                          >
                            <FileText className="w-3 h-3 mr-0.5" /> Bản scan
                          </a>
                        )}
                      </td>

                      {/* 7. Kho & Trạng Thái */}
                      <td className="px-3 py-3">
                        <div className="text-xs font-medium text-gray-900">
                          {asset.warehouses?.name || <span className="text-gray-400 italic">Chưa gán kho</span>}
                        </div>
                        <div className="mt-1">
                          <StatusBadges
                            custody_status={asset.custody_status}
                            lifecycle_status={asset.lifecycle_status}
                            sale_status={asset.sale_status}
                            mortgage_status={asset.mortgage_status}
                          />
                        </div>
                        {asset.custody_status === 'checked_out' && (
                          <div className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded mt-1">
                            Bên mượn: {asset.current_holder_dept || 'Phòng ban'}
                          </div>
                        )}
                      </td>

                      {/* 8. Thao Tác (Chi tiết, Sửa, Lịch sử, Xoá) */}
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => setDetailAsset(asset)}
                            className="p-1.5 text-gray-600 hover:text-[#1E3A8A] hover:bg-gray-100 rounded-md transition-colors"
                            title="Xem chi tiết"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Sửa / Điều chỉnh */}
                          {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
                            <button
                              onClick={() => setEditingAsset(asset)}
                              className="p-1.5 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-md transition-colors"
                              title="Điều chỉnh / Cập nhật thông tin"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Lịch sử Audit Trail / Lưu vết */}
                          <button
                            onClick={() => setAuditAsset(asset)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-md transition-colors"
                            title="Xem lịch sử thay đổi & Lưu vết (Audit Trail)"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Lịch sử giao dịch luân chuyển */}
                          <button
                            onClick={() => setHistoryAsset(asset)}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                            title="Lịch sử luân chuyển kho"
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>

                          {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
                            <button
                              onClick={() => handleDeleteAsset(asset.id, asset.certificate_no)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                              title="Xóa GCN"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
                  <a
                    href={detailAsset.scan_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 hover:bg-blue-100"
                  >
                    <ExternalLink className="w-4 h-4 mr-1.5" /> Xem Bản Scan Giấy Chứng Nhận Đính Kèm
                  </a>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-between items-center">
              <div>
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
    </div>
  );
};
