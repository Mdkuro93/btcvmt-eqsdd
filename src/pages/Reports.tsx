import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchAssets, fetchProjects, fetchWarehouses, fetchRegions } from '../api/assets';
import { fetchReportStatistics, fetchReportDetailedAssets, ReportStatistics } from '../api/reports';
import { Asset, Project, Warehouse, Region, ProjectReportRow } from '../types';
import { formatPlotCode } from '../lib/assetIdentifier';
import { Loader2, Download, LandPlot, Building2, ShieldCheck, FileSpreadsheet, AlertCircle, Warehouse as WarehouseIcon, ShieldAlert, SlidersHorizontal, ArrowLeftRight, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import { LoadingFallback } from '../components/LoadingFallback';
import { ReportSnapshotsManager } from '../components/ReportSnapshotsManager';
import { MortgagedAssetsReview } from '../components/MortgagedAssetsReview';
import { ProjectReportTable } from '../components/ProjectReportTable';
import { fetchProjectReportData, ProjectReportStats } from '../services/projectReportService';
import { exportProjectReportExcel } from '../utils/exportProjectReportExcel';
import { useAuth } from '../contexts/AuthContext';

export const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectReportError, setProjectReportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tableAssets, setTableAssets] = useState<Asset[]>([]);
  const [mortgagedAssetsForReview, setMortgagedAssetsForReview] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);

  // Project Report Data (A -> AD)
  const [projectReportRows, setProjectReportRows] = useState<ProjectReportRow[]>([]);
  const [projectReportStats, setProjectReportStats] = useState<ProjectReportStats>({
    totalLots: 0,
    totalArea: 0,
    cdtCount: 0,
    cdtArea: 0,
    investorCount: 0,
    investorArea: 0,
    unsplitCount: 0,
    unsplitArea: 0,
    unissuedCount: 0,
    unissuedArea: 0,
    soldCount: 0,
    soldArea: 0,
  });
  const [loadingProjectReport, setLoadingProjectReport] = useState<boolean>(false);

  // Server-computed statistics
  const [reportStats, setReportStats] = useState<ReportStatistics>({
    total_count: 0,
    total_area: 0,
    mortgaged_count: 0,
    total_mortgage_valuation: 0,
    in_stock_count: 0,
    total_accessible_assets: 0,
    total_accessible_mortgaged: 0,
    by_warehouse: [],
    by_project: [],
    by_mortgage_bank: []
  });

  // 1-Row Unified Active Tab: 'inventory' | 'project' | 'mortgaged_review'
  const [activeTab, setActiveTab] = useState<'inventory' | 'project' | 'mortgaged_review'>('inventory');

  // Role permissions: Chỉ Admin/Quản lý kho xem được mục Rà soát thế chấp
  const canViewMortgageReview = useMemo(() => {
    const role = profile?.role || '';
    return ['admin', 'super_admin', 'btc_manager', 'warehouse_manager', 'quan_ly'].includes(role) &&
      !['capital_dept', 're_dept', 'project_dept', 'investor', 'viewer', 'user'].includes(role);
  }, [profile?.role]);

  // Warehouse scoping for warehouse_manager
  const isWarehouseManager = profile?.role === 'warehouse_manager';
  const managedWarehouseIds = useMemo(() => {
    if (!isWarehouseManager) return undefined;
    if (profile?.managed_warehouse_ids && profile.managed_warehouse_ids.length > 0) {
      return profile.managed_warehouse_ids;
    }
    return undefined;
  }, [profile, isWarehouseManager]);

  // Filters
  const [selectedRegion, setSelectedRegion] = useState<string>('Tất cả vùng');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedMortgageStatus, setSelectedMortgageStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [reportPeriod, setReportPeriod] = useState<string>('Năm 2026');

  // Pagination & Display density for DOM performance
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // Load auxiliary data (projects, warehouses) once
  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        const [allProjects, allWarehouses, allRegions] = await Promise.all([
          fetchProjects(),
          fetchWarehouses(),
          fetchRegions()
        ]);
        setProjects(allProjects);
        setWarehouses(allWarehouses);
        setRegions(allRegions);
      } catch (err) {
        console.error('Lỗi tải danh mục dự án & kho:', err);
      }
    };
    loadCatalogs();
  }, []);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedRegion, selectedWarehouseId, selectedProjectId, selectedMortgageStatus, searchTerm, reportPeriod]);

  // Load aggregated stats & current page from server
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const filterParams = {
        selectedRegion,
        warehouseId: selectedWarehouseId,
        projectId: selectedProjectId,
        mortgageStatus: selectedMortgageStatus,
        searchTerm,
        allowedWarehouseIds: managedWarehouseIds
      };

      // 1. Fetch aggregated stats from PostgreSQL RPC (super fast, returns single summary record)
      // 2. Fetch paginated assets for display table (only 25-50 rows instead of 10000)
      // 3. Fetch project tracking rows (Columns A -> AD)
      setLoadingProjectReport(true);
      const [statsResult, tableResult, projectResult] = await Promise.all([
        fetchReportStatistics(filterParams),
        fetchAssets({
          search: searchTerm,
          projectId: selectedProjectId,
          mortgageStatus: selectedMortgageStatus,
          warehouseId: selectedWarehouseId,
          selectedRegion,
          allowedWarehouseIds: managedWarehouseIds,
        }, page, pageSize),
        fetchProjectReportData({
          projectId: selectedProjectId || undefined,
          region: selectedRegion,
          warehouseId: selectedWarehouseId || undefined,
          mortgageStatus: selectedMortgageStatus || undefined,
          searchTerm,
          allowedWarehouseIds: managedWarehouseIds,
        }).then(res => {
          setProjectReportError(null);
          return res;
        }).catch(err => {
          // KHÔNG nuốt lỗi: hiện lỗi thật thay vì bảng trống gây hiểu nhầm "không có dữ liệu".
          console.error('[ProjectReport] Error loading project report data:', err);
          setProjectReportError(err?.message || 'Không tải được báo cáo theo dự án. Vui lòng thử lại.');
          return { rows: [], stats: { totalLots: 0, totalArea: 0, cdtCount: 0, cdtArea: 0, investorCount: 0, investorArea: 0, unsplitCount: 0, unsplitArea: 0, unissuedCount: 0, unissuedArea: 0, soldCount: 0, soldArea: 0 } };
        })
      ]);

      setReportStats(statsResult);
      setProjectReportRows(projectResult.rows);
      setProjectReportStats(projectResult.stats);
      setLoadingProjectReport(false);
      setTableAssets(tableResult.data || []);

      // If mortgaged review tab is active or clicked, load mortgaged assets for that tab
      if (activeTab === 'mortgaged_review') {
        const mortgaged = await fetchReportDetailedAssets({
          mortgageStatus: 'mortgaged',
          allowedWarehouseIds: managedWarehouseIds
        });
        setMortgagedAssetsForReview(mortgaged);
      }
    } catch (error: any) {
      const msg = error?.message || 'Không thể tải số liệu báo cáo, vui lòng thử lại';
      setErrorMessage(msg);
      toast.error(msg);
      console.error('Lỗi khi tải dữ liệu báo cáo:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRegion, selectedWarehouseId, selectedProjectId, selectedMortgageStatus, searchTerm, managedWarehouseIds, page, pageSize, activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load mortgaged assets when switching to mortgaged_review tab
  useEffect(() => {
    if (activeTab === 'mortgaged_review' && mortgagedAssetsForReview.length === 0) {
      fetchReportDetailedAssets({
        mortgageStatus: 'mortgaged',
        allowedWarehouseIds: managedWarehouseIds
      }).then(data => setMortgagedAssetsForReview(data)).catch(console.error);
    }
  }, [activeTab, managedWarehouseIds, mortgagedAssetsForReview.length]);

  // Available warehouses for dropdown based on user role
  const availableWarehouses = useMemo(() => {
    if (!isWarehouseManager || !managedWarehouseIds) return warehouses;
    return warehouses.filter(w => managedWarehouseIds.includes(w.id));
  }, [warehouses, isWarehouseManager, managedWarehouseIds]);

  const currentWarehouseName = useMemo(() => {
    if (!selectedWarehouseId) return undefined;
    return warehouses.find(w => w.id === selectedWarehouseId)?.name;
  }, [selectedWarehouseId, warehouses]);

  // Stats alias for rendering
  const stats = useMemo(() => ({
    totalCount: reportStats.total_count,
    totalArea: reportStats.total_area,
    mortgagedCount: reportStats.mortgaged_count,
    totalMortgageValuation: reportStats.total_mortgage_valuation,
    inStockCount: reportStats.in_stock_count
  }), [reportStats]);

  // Badge counts
  const totalAccessibleCount = reportStats.total_accessible_assets || stats.totalCount;
  const mortgagedCount = reportStats.total_accessible_mortgaged || stats.mortgagedCount;

  // Excel Export: Fetches full detailed dataset matching active filters on demand
  const exportExcel = async () => {
    try {
      setExporting(true);

      if (activeTab === 'project') {
        if (projectReportRows.length === 0) {
          toast.error('Không tìm thấy dữ liệu bất động sản theo dự án để xuất Excel');
          return;
        }
        const projName = projects.find(p => p.id === selectedProjectId)?.name || 'Toan-He-Thong';
        exportProjectReportExcel({
          projectName: projName,
          reportPeriod,
          rows: projectReportRows,
          region: selectedRegion
        });
        toast.success(`Xuất file Excel Theo Dõi Dự Án thành công (${projectReportRows.length} BĐS)!`);
        return;
      }

      const toastId = toast.loading('Đang chuẩn bị tải dữ liệu chi tiết cho file Excel...');
      
      const detailedAssets = await fetchReportDetailedAssets(
        {
          selectedRegion,
          warehouseId: selectedWarehouseId,
          projectId: selectedProjectId,
          mortgageStatus: selectedMortgageStatus,
          searchTerm,
          allowedWarehouseIds: managedWarehouseIds
        },
        (loaded, total) => {
          const percent = total > 0 ? Math.round((loaded / total) * 100) : 100;
          toast.loading(`Đang tải dữ liệu: ${loaded.toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')} tài sản (${percent}%)...`, { id: toastId });
        }
      );

      if (detailedAssets.length === 0) {
        toast.dismiss(toastId);
        toast.error('Không tìm thấy dữ liệu để xuất Excel');
        return;
      }

      const headerTitle = `BÁO CÁO THEO DÕI CHI TIẾT TỒN KHO BẤT ĐỘNG SẢN ${selectedRegion.toUpperCase()}`;
      
      const wsData: any[][] = [];

      wsData.push(['SUN GROUP / BTC VMT', '', '', '', headerTitle]);
      wsData.push(['Kỳ báo cáo:', reportPeriod]);
      wsData.push([]); 

      // Row 4: Top Level Section Header 
      const row4 = [
        'THÔNG TIN CHUNG', '', '', '', '', '', '', '', '', 
        'THÔNG TIN PHÁP LÝ', '', '', '', '', '', '', '', 
        'THÔNG TIN TÀI SẢN CẦM CỐ, THẾ CHẤP CÁC TỔ CHỨC TÍN DỤNG', '', '', '', '', '', 
        'TRẠNG THÁI TSĐB', '', '', '', ''
      ];
      wsData.push(row4);

      // Row 5: Detailed Columns
      const row5 = [
        'ID Hệ Thống',
        'Mã Tài Sản / TSĐB',
        'Dự Án (Pháp lý)',
        'Tên Dự Án Kinh Doanh',
        'Loại Tài Sản',
        'Nhóm Sổ',
        'Mã lô đất (Mã Lô Pháp Lý)',
        'Mã Lô Kinh Doanh',
        'Diện Tích (m²)',
        'Chủ Sở Hữu',
        'Số Thửa Bản Đồ',
        'Số Tờ Bản Đồ',
        'Số GCN QSDĐ',
        'Số vào sổ cấp',
        'Ngày vào sổ',
        'Mục Đích Sử Dụng',
        'Thời Hạn Sử Dụng',
        'Trạng Thái Thế Chấp',
        'Ngân Hàng Thế Chấp',
        'Đơn vị vay',
        'Giá trị định giá',
        'Tỷ lệ đảm bảo',
        'Giá trị TSĐB',
        'Trạng Thái Pháp Lý',
        'Trạng Thái Kinh Doanh',
        'Trạng Thái Lưu Kho',
        'Đơn vị quản lý sổ',
        'Ghi chú'
      ];
      wsData.push(row5);

      // Rows 6+: Data
      detailedAssets.forEach((asset) => {
        const isMortgaged = asset.mortgage_status === 'mortgaged';

        let legalStatus = 'Đang hiệu lực';
        if (asset.lifecycle_status === 'invalidated') legalStatus = 'Sổ gốc đã hủy (sau tách)';
        
        let saleStatus = 'Chưa sẵn sàng';
        if (asset.sale_status === 'ready_for_sale') saleStatus = 'Sẵn sàng bán';
        if (asset.sale_status === 'sold') saleStatus = 'Đã bán';

        let custodyStatus = 'Lưu kho an toàn';
        if (asset.custody_status === 'checked_out') custodyStatus = `Đang xuất mượn cho ${asset.current_holder_dept || 'Chưa cập nhật'}`;
        
        let notesArr = [];
        if (asset.notes) notesArr.push(asset.notes);
        const notesStr = notesArr.length > 0 ? notesArr.join(' - ') : '';

        const row = [
          asset.id,
          asset.asset_code || '-',
          asset.projects?.name || '-',
          asset.business_project_name || '-',
          asset.asset_type || '-',
          asset.parent_asset_id ? 'Sổ con' : 'Sổ chính',
          asset.legal_lot_code || '-',
          asset.business_plot_code || '-',
          asset.area || 0,
          asset.current_owner_entity?.name || asset.investor_entities?.name || '-',
          asset.land_lot_no || '-',
          asset.map_sheet_no || '-',
          asset.certificate_no || '-',
          asset.registry_no || '-',
          asset.registry_date ? new Date(asset.registry_date).toLocaleDateString('vi-VN') : 'Chưa cập nhật',
          asset.usage_purpose || '-',
          asset.usage_term_type === 'long_term' ? 'Lâu dài' : (asset.usage_term_date ? new Date(asset.usage_term_date).toLocaleDateString('vi-VN') : '-'),
          isMortgaged ? 'Đã thế chấp' : 'Không thế chấp',
          asset.mortgage_bank || '-',
          asset.mortgage_unit || '-',
          asset.mortgage_valuation || 0,
          asset.collateral_ratio ? `${asset.collateral_ratio}%` : '-',
          asset.collateral_value || 0,
          legalStatus,
          saleStatus,
          custodyStatus,
          asset.managing_unit || '-',
          notesStr
        ];
        wsData.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 15 }, // ID Hệ Thống
        { wch: 20 }, // Mã TS
        { wch: 30 }, // Dự Án (Pháp lý)
        { wch: 30 }, // Tên Dự Án Kinh Doanh
        { wch: 15 }, // Loại tài sản
        { wch: 12 }, // Nhóm sổ
        { wch: 25 }, // Mã Lô Pháp Lý
        { wch: 20 }, // Mã Lô KD
        { wch: 15 }, // Diện Tích
        { wch: 30 }, // Chủ Sở Hữu
        { wch: 15 }, // Số Thửa
        { wch: 15 }, // Số Tờ
        { wch: 20 }, // Số GCN
        { wch: 20 }, // Số vào sổ
        { wch: 15 }, // Ngày vào sổ
        { wch: 25 }, // Mục Đích
        { wch: 15 }, // Thời Hạn
        { wch: 20 }, // TT Thế Chấp
        { wch: 30 }, // NH Thế Chấp
        { wch: 30 }, // Đơn vị vay
        { wch: 20 }, // Giá trị định giá
        { wch: 15 }, // Tỷ lệ
        { wch: 20 }, // Giá trị ĐB
        { wch: 20 }, // TT Pháp Lý
        { wch: 20 }, // TT Kinh Doanh
        { wch: 25 }, // TT Lưu Kho
        { wch: 25 }, // Đơn vị quản lý sổ
        { wch: 30 }, // Ghi chú
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo Chi tiết BĐS');
      XLSX.writeFile(wb, `Bao-Cao-Chi-Tiet-Ton-Kho-BDS-${selectedRegion.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      
      toast.dismiss(toastId);
      toast.success(`Xuất file Excel thành công (${detailedAssets.length} GCN)!`);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi xuất Excel: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <Toaster position="top-right" />

      {/* 1-ROW UNIFIED REPORT TAB NAVIGATION */}
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-[#1E3A8A] dark:bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>📊 Báo Cáo Tồn Kho BĐS</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'inventory' ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200'}`}>
              {totalAccessibleCount} GCN
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('project')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'project'
                ? 'bg-amber-600 dark:bg-amber-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-slate-300 hover:text-amber-900 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>🏢 Báo Cáo Theo Dự Án (MỚI)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'project' ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300'}`}>
              {projectReportRows.length} BĐS
            </span>
          </button>

          {canViewMortgageReview && (
            <button
              type="button"
              onClick={() => setActiveTab('mortgaged_review')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'mortgaged_review'
                  ? 'bg-red-800 dark:bg-rose-700 text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-300 hover:text-red-900 dark:hover:text-rose-400 hover:bg-red-50 dark:hover:bg-rose-950/30'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-rose-300" />
              <span>🚨 Rà Soát Thế Chấp</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'mortgaged_review' 
                  ? 'bg-white/25 text-white' 
                  : 'bg-red-100 dark:bg-rose-950/60 text-red-800 dark:text-rose-300 border border-red-200 dark:border-rose-800'
              }`}>
                {mortgagedCount} GCN
              </span>
            </button>
          )}
        </div>

        <div className="text-[11px] text-gray-500 dark:text-slate-400 pr-3 hidden lg:flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Chế độ quản trị: <strong className="text-slate-800 dark:text-slate-200">{profile?.full_name || 'Admin/Quản lý kho'}</strong></span>
        </div>
      </div>

      {/* RENDER ACTIVE TAB CONTENT */}
      {activeTab === 'mortgaged_review' && canViewMortgageReview ? (
        <MortgagedAssetsReview
          assets={mortgagedAssetsForReview}
          projects={projects}
          warehouses={warehouses}
          managedWarehouseIds={managedWarehouseIds}
          currentUser={profile}
          onRefreshData={loadData}
        />
      ) : (
        <>
          {/* HEADER BANNER LIKE EXCEL SPREADSHEET */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">TẬP ĐOÀN SUN GROUP</div>
            <h1 className="text-xl sm:text-2xl font-black text-red-700 dark:text-rose-500 uppercase tracking-tight">
              {activeTab === 'project' 
                ? `BÁO CÁO TỔNG QUAN / THEO DÕI THEO DỰ ÁN ${selectedRegion.toUpperCase()}`
                : `BÁO CÁO THEO DÕI CHI TIẾT TỒN KHO BẤT ĐỘNG SẢN ${selectedRegion.toUpperCase()}`
              }
            </h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-slate-400">
              <span>Kỳ báo cáo: <strong className="text-gray-800 dark:text-slate-200">{reportPeriod}</strong></span>
              <span>•</span>
              <span>Ngày lập: <strong className="text-gray-800 dark:text-slate-200">{new Date().toLocaleDateString('vi-VN')}</strong></span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ReportSnapshotsManager
              currentAssets={tableAssets}
              currentProjectRows={projectReportRows}
              currentRegion={selectedRegion}
              currentWarehouseName={currentWarehouseName}
              selectedWarehouseId={selectedWarehouseId}
              reportStats={reportStats}
              onRefreshParent={loadData}
            />

            <button
              onClick={exportExcel}
              disabled={loading || exporting || (activeTab === 'inventory' ? stats.totalCount === 0 : projectReportRows.length === 0)}
              className="inline-flex items-center px-4 py-2.5 text-sm font-bold rounded-lg shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang Xuất File...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" /> {activeTab === 'project' ? 'Xuất File Excel Theo Dõi Dự Án' : 'Xuất File Excel Chuẩn Mẫu'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* WAREHOUSE SCOPE NOTICE FOR WAREHOUSE MANAGERS */}
        {isWarehouseManager && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <WarehouseIcon className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Phạm vi dữ liệu Quản lý kho:</strong> Báo cáo tự động giới hạn hiển thị các GCN thuộc các kho do bạn phụ trách{' '}
                {availableWarehouses.length > 0 ? (
                  <span className="font-bold text-amber-950 dark:text-amber-100">({availableWarehouses.map(w => w.name).join(', ')})</span>
                ) : (
                  <span className="italic">(Toàn bộ kho được phân công)</span>
                )}
              </span>
            </div>
            <span className="text-[11px] font-semibold bg-amber-200/60 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 rounded-full whitespace-nowrap">
              Quyền Quản Lý Kho
            </span>
          </div>
        )}

        {/* CONTROLS & FILTERS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Chọn Vùng Báo Cáo</label>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 border border-amber-300 dark:border-amber-800 rounded-md bg-amber-50/50 dark:bg-slate-800 text-amber-900 dark:text-amber-300 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="Tất cả vùng">Tất cả các vùng miền</option>
              {regions.map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Kho Lưu Trữ</label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-blue-200 dark:border-slate-700 rounded-md bg-blue-50/40 dark:bg-slate-800 text-blue-900 dark:text-blue-300 font-medium"
            >
              <option value="">-- {isWarehouseManager ? 'Tất cả kho phụ trách' : 'Tất cả các kho'} --</option>
              {availableWarehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Dự án</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200"
            >
              <option value="">-- Tất cả dự án --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Trạng thái Thế chấp</label>
            <select
              value={selectedMortgageStatus}
              onChange={(e) => setSelectedMortgageStatus(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200"
            >
              <option value="">-- Tất cả trạng thái thế chấp --</option>
              <option value="none">Chưa thế chấp</option>
              <option value="mortgaged">Đang thế chấp ngân hàng</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Kỳ báo cáo</label>
            <input
              type="text"
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 font-medium"
              placeholder="VD: Năm 2026, Quý 1/2026"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1">Tìm kiếm chi tiết</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Số GCN, CSH, số thửa..."
              className="w-full text-xs px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* VIEW MODE CONTENT RENDERING */}
      {activeTab === 'project' ? (
        <ProjectReportTable
          rows={projectReportRows}
          stats={projectReportStats}
          loading={loadingProjectReport}
          error={projectReportError}
          onRetry={() => loadData()}
          tableDensity={tableDensity}
          onDensityChange={setTableDensity}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      ) : (
        <>
          {/* QUICK SUMMARY CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex items-center space-x-3 transition-colors">
          <div className="p-3 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 rounded-lg">
            <LandPlot className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Tổng số GCN</div>
            <div className="text-xl font-bold text-gray-900 dark:text-slate-100">{stats.totalCount} <span className="text-xs font-normal text-gray-500 dark:text-slate-400">sổ</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex items-center space-x-3 transition-colors">
          <div className="p-3 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-400 rounded-lg">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Tổng diện tích đất</div>
            <div className="text-xl font-bold text-gray-900 dark:text-slate-100">{stats.totalArea.toLocaleString('vi-VN')} <span className="text-xs font-normal text-gray-500 dark:text-slate-400">m²</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex items-center space-x-3 transition-colors">
          <div className="p-3 bg-red-100 dark:bg-rose-950/60 text-red-800 dark:text-rose-400 rounded-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Đang thế chấp NH</div>
            <div className="text-xl font-bold text-red-700 dark:text-rose-400">{stats.mortgagedCount} <span className="text-xs font-normal text-gray-500 dark:text-slate-400">sổ</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex items-center space-x-3 transition-colors">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 rounded-lg">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">Tổng định giá thế chấp</div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {stats.totalMortgageValuation ? (stats.totalMortgageValuation / 1e9).toFixed(1) + ' tỷ VNĐ' : '0 VNĐ'}
            </div>
          </div>
        </div>
      </div>

      {/* MATRIX EXCEL TABLE REPORT */}
      <div className="bg-white dark:bg-slate-900 shadow-md border border-gray-300 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
        {/* Matrix Table Toolbar */}
        <div className="p-3.5 bg-gradient-to-r from-amber-50/90 via-slate-50 to-emerald-50/80 dark:from-slate-800 dark:via-slate-850 dark:to-slate-800 border-b border-gray-300 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-black text-gray-900 dark:text-slate-100 text-xs sm:text-sm uppercase tracking-tight flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              Ma Trận Chi Tiết (27 Cột Nghiệp Vụ)
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              {stats.totalCount} bản ghi
            </span>
            <span className="text-xs text-gray-300 dark:text-slate-600 hidden md:inline">|</span>
            <span className="text-[11px] text-gray-600 dark:text-slate-400 hidden lg:inline">
              Cố định 2 cột <strong>[STT]</strong> và <strong>[Dự Án]</strong> giúp đối chiếu dễ dàng khi cuộn ngang 27 cột
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Density Selector */}
            <div className="flex items-center bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-gray-300 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={() => setTableDensity('comfortable')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tableDensity === 'comfortable'
                    ? 'bg-[#1E3A8A] dark:bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                }`}
                title="Chế độ dòng chi tiết, dễ đọc"
              >
                Chi tiết
              </button>
              <button
                type="button"
                onClick={() => setTableDensity('compact')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tableDensity === 'compact'
                    ? 'bg-[#1E3A8A] dark:bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                }`}
                title="Chế độ dòng thu gọn, tối đa hóa số dòng hiển thị"
              >
                Thu gọn
              </button>
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300 font-medium">
              <span className="hidden sm:inline">Dòng/trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="text-xs border border-gray-300 dark:border-slate-700 rounded-lg py-1 px-2 bg-white dark:bg-slate-800 font-semibold text-gray-800 dark:text-slate-200 focus:ring-1 focus:ring-amber-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500 (Tất cả)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[72vh] overflow-y-auto">
          <table className="min-w-full text-left border-collapse">
            
            {/* 2-TIER TABLE HEADER MATCHING MATRIX REPORT */}
            <thead className="sticky top-0 z-30 shadow-2xs">
              {/* TIER 1: 4 MAJOR GROUPS */}
              <tr className="text-center font-bold text-[11px] uppercase tracking-wider">
                <th rowSpan={2} className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[50px] sticky left-0 z-40 bg-slate-200 dark:bg-slate-800 text-gray-800 dark:text-slate-200">STT</th>
                <th rowSpan={2} className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[130px] sticky left-12 z-40 bg-slate-200 dark:bg-slate-800 text-gray-800 dark:text-slate-200">Mã Tài Sản / TSĐB</th>
                <th colSpan={7} className="px-3 py-1.5 border border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold">THÔNG TIN CHUNG</th>
                <th colSpan={8} className="px-3 py-1.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold">THÔNG TIN PHÁP LÝ</th>
                <th colSpan={6} className="px-3 py-1.5 border border-rose-300 dark:border-rose-800 bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 font-bold">THÔNG TIN TÀI SẢN CẦM CỐ, THẾ CHẤP CÁC TỔ CHỨC TÍN DỤNG</th>
                <th colSpan={5} className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold">TRẠNG THÁI TSĐB</th>
              </tr>
              {/* TIER 2: 26 DETAILED COLUMN HEADERS */}
              <tr className="text-center font-bold text-[10px] uppercase tracking-wider text-gray-800 dark:text-slate-300 border-b border-gray-400 dark:border-slate-700 bg-slate-50 dark:bg-slate-850">
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[150px] bg-amber-50 dark:bg-slate-800">Dự Án (Pháp lý)</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[150px] bg-amber-50 dark:bg-slate-800">Tên Dự Án Kinh Doanh</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[110px] bg-amber-50 dark:bg-slate-800">Loại Tài Sản</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[90px] bg-amber-50 dark:bg-slate-800">Nhóm Sổ</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[150px] bg-amber-100 dark:bg-slate-750 text-blue-950 dark:text-blue-300">Mã lô đất (Mã Lô Pháp Lý)</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[130px] bg-amber-100 dark:bg-slate-750 text-indigo-950 dark:text-indigo-300">Mã Lô Kinh Doanh</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[90px] bg-amber-50 dark:bg-slate-800">Diện Tích (m²)</th>
                
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[160px] bg-emerald-50 dark:bg-slate-800">Chủ Sở Hữu</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[110px] bg-emerald-50 dark:bg-slate-800">Số Thửa Bản Đồ</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[110px] bg-emerald-50 dark:bg-slate-800">Số Tờ Bản Đồ</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[140px] bg-emerald-100 dark:bg-slate-750 font-bold text-[#1E3A8A] dark:text-blue-400">Số GCN QSDĐ</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[120px] bg-emerald-50 dark:bg-slate-800">Số vào sổ cấp</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[110px] bg-emerald-50 dark:bg-slate-800">Ngày vào sổ</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[150px] bg-emerald-50 dark:bg-slate-800">Mục Đích Sử Dụng</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[130px] bg-emerald-50 dark:bg-slate-800">Thời Hạn Sử Dụng</th>
                
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[120px] bg-rose-50 dark:bg-slate-800">Trạng Thái Thế Chấp</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[180px] bg-rose-100 dark:bg-slate-750 text-rose-950 dark:text-rose-300 font-bold">Ngân Hàng Thế Chấp</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[160px] bg-rose-100 dark:bg-slate-750 text-rose-950 dark:text-rose-300 font-bold">Đơn vị vay</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[110px] bg-rose-50 dark:bg-slate-800">Giá trị định giá</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[110px] bg-rose-50 dark:bg-slate-800">Tỷ lệ đảm bảo</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[110px] bg-rose-50 dark:bg-slate-800">Giá trị TSĐB</th>
                
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[130px] bg-slate-50 dark:bg-slate-800">Trạng Thái Pháp Lý</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[140px] bg-slate-50 dark:bg-slate-800">Trạng Thái Kinh Doanh</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[130px] bg-slate-50 dark:bg-slate-800">Trạng Thái Lưu Kho</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[140px] bg-slate-50 dark:bg-slate-800">Đơn vị quản lý sổ</th>
                <th className="px-3 py-2 border border-gray-300 dark:border-slate-700 min-w-[150px] bg-slate-50 dark:bg-slate-800">Ghi chú</th>
              </tr>
            </thead>

            {/* TABLE DATA BODY */}
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {loading ? (
                <tr>
                  <td colSpan={28} className="p-8">
                    <LoadingFallback
                      message="Đang tổng hợp dữ liệu báo cáo..."
                      onRetry={() => loadData()}
                    />
                  </td>
                </tr>
              ) : errorMessage ? (
                <tr>
                  <td colSpan={28} className="px-4 py-16 text-center">
                    <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
                    <p className="mt-2 text-sm text-red-700 font-semibold">{errorMessage}</p>
                    <button
                      type="button"
                      onClick={() => loadData()}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white bg-[#1E3A8A] hover:bg-blue-900 transition-colors shadow-xs cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Tải lại dữ liệu
                    </button>
                  </td>
                </tr>
              ) : tableAssets.length === 0 ? (
                <tr>
                  <td colSpan={28} className="px-4 py-16 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto" />
                    <p className="mt-2 text-xs text-gray-500 font-medium">Không tìm thấy dữ liệu bất động sản phù hợp với tiêu chí chọn.</p>
                  </td>
                </tr>
              ) : (
                tableAssets.map((asset, index) => {
                  const isMortgaged = asset.mortgage_status === 'mortgaged';
                  const valuation = asset.mortgage_valuation || 0;
                  const guaranteeRatio = asset.collateral_ratio || 0;
                  const guaranteeVal = asset.collateral_value || 0;
                  const cellPadding = tableDensity === 'compact' ? 'py-1.5 px-2.5 text-[11px]' : 'py-2.5 px-3 text-xs';

                  return (
                    <tr key={asset.id} className="hover:bg-amber-50/40 dark:hover:bg-slate-800/60 transition-colors">
                      <td className={`${cellPadding} text-center font-bold text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-850 sticky left-0 z-10`}>
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className={`${cellPadding} font-mono text-gray-800 dark:text-slate-200 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky left-12 z-10`}>
                        {asset.asset_code || '-'}
                      </td>
                      <td className={`${cellPadding} font-semibold text-gray-900 dark:text-slate-100 border-r border-gray-200 dark:border-slate-800`}>
                        {asset.projects?.name || '-'}
                      </td>
                      <td className={`${cellPadding} font-semibold text-emerald-700 dark:text-emerald-400 border-r border-gray-200 dark:border-slate-800`}>
                        {asset.business_project_name || '-'}
                      </td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{asset.asset_type || '-'}</td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>
                        {asset.parent_asset_id ? 'Sổ con (Tách)' : (asset.lifecycle_status === 'invalidated' ? 'Sổ gốc (Đã tách)' : (asset.certificate_group === 'so_nho' ? 'Sổ nhỏ' : 'Sổ lớn'))}
                      </td>
                      <td className={`${cellPadding} border-r border-gray-200 dark:border-slate-800 font-semibold text-blue-900 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30`}>
                        {asset.legal_lot_code || '-'}
                      </td>
                      <td className={`${cellPadding} font-bold text-indigo-700 dark:text-indigo-300 border-r border-gray-200 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-950/30`}>
                        {asset.business_plot_code || '-'}
                      </td>
                      <td className={`${cellPadding} font-bold text-gray-900 dark:text-slate-100 border-r border-gray-200 dark:border-slate-800 text-right`}>
                        {asset.area ? `${asset.area.toLocaleString('vi-VN')}` : '-'}
                      </td>

                      <td className={`${cellPadding} font-semibold text-gray-900 dark:text-slate-100 border-r border-gray-200 dark:border-slate-800`}>{asset.current_owner_entity?.name || asset.investor_entities?.name || '-'}</td>
                      <td className={`${cellPadding} text-center font-semibold text-gray-800 dark:text-slate-200 border-r border-gray-200 dark:border-slate-800`}>{asset.land_lot_no || '-'}</td>
                      <td className={`${cellPadding} text-center text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{asset.map_sheet_no || '-'}</td>
                      <td className={`${cellPadding} font-bold text-[#1E3A8A] dark:text-blue-400 border-r border-gray-200 dark:border-slate-800`}>{asset.certificate_no}</td>
                      <td className={`${cellPadding} text-gray-600 dark:text-slate-400 font-mono border-r border-gray-200 dark:border-slate-800`}>{asset.registry_no || '-'}</td>
                      <td className={`${cellPadding} text-gray-600 dark:text-slate-400 border-r border-gray-200 dark:border-slate-800`}>
                        {asset.registry_date ? new Date(asset.registry_date).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}
                      </td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{asset.usage_purpose || '-'}</td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>
                        {asset.usage_term_type === 'long_term' ? 'Lâu dài' : (asset.usage_term_date ? new Date(asset.usage_term_date).toLocaleDateString('vi-VN') : '-')}
                      </td>

                      <td className={`${cellPadding} border-r border-gray-200 dark:border-slate-800 text-center font-bold`}>
                        {isMortgaged ? (
                          <span className="text-red-700 dark:text-rose-300 bg-red-100 dark:bg-rose-950/60 px-2 py-0.5 rounded-full inline-block">Đã thế chấp</span>
                        ) : (
                          <span className="text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full inline-block">Không</span>
                        )}
                      </td>
                      <td className={`${cellPadding} font-semibold text-red-900 dark:text-rose-300 border-r border-gray-200 dark:border-slate-800`}>
                        {isMortgaged ? (asset.mortgage_bank || '-') : '-'}
                      </td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>
                        {isMortgaged ? (asset.mortgage_unit || '-') : '-'}
                      </td>
                      <td className={`${cellPadding} text-right text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{valuation > 0 ? valuation.toLocaleString('vi-VN') : '-'}</td>
                      <td className={`${cellPadding} text-center text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{guaranteeRatio > 0 ? `${guaranteeRatio}%` : '-'}</td>
                      <td className={`${cellPadding} text-right text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{guaranteeVal > 0 ? guaranteeVal.toLocaleString('vi-VN') : '-'}</td>

                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{asset.lifecycle_status === 'invalidated' ? 'Vô hiệu lực' : 'Đang hiệu lực'}</td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{asset.sale_status === 'ready_for_sale' ? 'Sẵn sàng bán' : 'Chưa sẵn sàng'}</td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{asset.custody_status === 'in_stock' ? 'Lưu kho an toàn' : (asset.custody_status === 'checked_out' ? 'Đã xuất kho' : 'Báo mất')}</td>
                      <td className={`${cellPadding} font-medium text-gray-800 dark:text-slate-200 border-r border-gray-200 dark:border-slate-800`}>{asset.managing_unit || '-'}</td>
                      <td className={`${cellPadding} text-gray-700 dark:text-slate-300 border-r border-gray-200 dark:border-slate-800`}>{asset.notes || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {stats.totalCount > 0 && (
          <div className="bg-white dark:bg-slate-900 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-slate-800 sm:px-6 rounded-b-xl transition-colors">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-slate-300">
                  Hiển thị <span className="font-medium">{(page - 1) * pageSize + 1}</span> đến{' '}
                  <span className="font-medium">{Math.min(page * pageSize, stats.totalCount)}</span> trong{' '}
                  <span className="font-medium">{stats.totalCount}</span> kết quả
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    Trước
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-gray-700 dark:text-slate-200">
                    Trang {page} / {Math.ceil(stats.totalCount / pageSize) || 1}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(Math.ceil(stats.totalCount / pageSize), p + 1))}
                    disabled={page >= Math.ceil(stats.totalCount / pageSize)}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                  >
                    Tiếp
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </>
  )}
</div>
);
};

export default Reports;