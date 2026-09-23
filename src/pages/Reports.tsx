import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { fetchAssets, fetchProjects, fetchWarehouses } from '../api/assets';
import { fetchReportStatistics, fetchReportDetailedAssets, ReportStatistics } from '../api/reports';
import { Asset, Project, Warehouse } from '../types';
import { formatPlotCode } from '../lib/assetIdentifier';
import { Loader2, Download, LandPlot, Building2, ShieldCheck, FileSpreadsheet, AlertCircle, Warehouse as WarehouseIcon, ShieldAlert, SlidersHorizontal, ArrowLeftRight, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import { LoadingFallback } from '../components/LoadingFallback';
import { ReportSnapshotsManager } from '../components/ReportSnapshotsManager';
import { MortgagedAssetsReview } from '../components/MortgagedAssetsReview';
import { useAuth } from '../contexts/AuthContext';

export const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tableAssets, setTableAssets] = useState<Asset[]>([]);
  const [mortgagedAssetsForReview, setMortgagedAssetsForReview] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

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

  // Active Tab: 'standard' | 'mortgaged_review'
  const [activeTab, setActiveTab] = useState<'standard' | 'mortgaged_review'>('standard');

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
        const [allProjects, allWarehouses] = await Promise.all([
          fetchProjects(),
          fetchWarehouses()
        ]);
        setProjects(allProjects);
        setWarehouses(allWarehouses);
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
      const [statsResult, tableResult] = await Promise.all([
        fetchReportStatistics(filterParams),
        fetchAssets({
          search: searchTerm,
          projectId: selectedProjectId,
          mortgageStatus: selectedMortgageStatus,
          warehouseId: selectedWarehouseId
        }, page, pageSize)
      ]);

      setReportStats(statsResult);

      // Filter table rows by region if region filter is active
      let filteredPageRows = tableResult.data || [];
      if (selectedRegion && selectedRegion !== 'Tất cả vùng') {
        const searchReg = selectedRegion.replace('Vùng ', '').trim().toLowerCase();
        filteredPageRows = filteredPageRows.filter(asset => {
          const regionName = asset.projects?.areas?.regions?.name || (asset.warehouses as any)?.regions?.name || '';
          return regionName.toLowerCase().includes(searchReg);
        });
      }
      setTableAssets(filteredPageRows);

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
      const toastId = toast.loading('Đang trích xuất dữ liệu chi tiết cho file Excel...');
      
      const detailedAssets = await fetchReportDetailedAssets({
        selectedRegion,
        warehouseId: selectedWarehouseId,
        projectId: selectedProjectId,
        mortgageStatus: selectedMortgageStatus,
        searchTerm,
        allowedWarehouseIds: managedWarehouseIds
      });

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

      {/* ROLE-AWARE REPORT TAB NAVIGATION */}
      {canViewMortgageReview && (
        <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('standard')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'standard'
                  ? 'bg-[#1E3A8A] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Báo Cáo Chi Tiết Tồn Kho BĐS (27 Cột Chuẩn Mẫu)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'standard' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                {totalAccessibleCount} GCN
              </span>
            </button>

            <button
              onClick={() => setActiveTab('mortgaged_review')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'mortgaged_review'
                  ? 'bg-red-800 text-white shadow-sm'
                  : 'text-gray-600 hover:text-red-900 hover:bg-red-50'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-rose-300" />
              <span>Rà Soát GCN Đang Thế Chấp & Quyền Sở Hữu</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'mortgaged_review' 
                  ? 'bg-white/25 text-white' 
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                {mortgagedCount} GCN
              </span>
            </button>
          </div>

          <div className="text-[11px] text-gray-500 pr-3 hidden lg:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Chế độ quản trị: <strong>{profile?.full_name || 'Admin/Quản lý kho'}</strong></span>
          </div>
        </div>
      )}

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
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase tracking-widest">TẬP ĐOÀN SUN GROUP</div>
            <h1 className="text-xl sm:text-2xl font-black text-red-700 uppercase tracking-tight">
              BÁO CÁO THEO DÕI CHI TIẾT TỒN KHO BẤT ĐỘNG SẢN {selectedRegion.toUpperCase()}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>Kỳ báo cáo: <strong className="text-gray-800">{reportPeriod}</strong></span>
              <span>•</span>
              <span>Ngày lập: <strong className="text-gray-800">{new Date().toLocaleDateString('vi-VN')}</strong></span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ReportSnapshotsManager
              currentAssets={tableAssets}
              currentRegion={selectedRegion}
              currentWarehouseName={currentWarehouseName}
              onRefreshParent={loadData}
            />

            <button
              onClick={exportExcel}
              disabled={loading || exporting || stats.totalCount === 0}
              className="inline-flex items-center px-4 py-2.5 text-sm font-bold rounded-lg shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-900 disabled:opacity-50 transition-all cursor-pointer"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang Xuất File...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" /> Xuất File Excel Chuẩn Mẫu
                </>
              )}
            </button>
          </div>
        </div>

        {/* WAREHOUSE SCOPE NOTICE FOR WAREHOUSE MANAGERS */}
        {isWarehouseManager && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <WarehouseIcon className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Phạm vi dữ liệu Quản lý kho:</strong> Báo cáo tự động giới hạn hiển thị các GCN thuộc các kho do bạn phụ trách{' '}
                {availableWarehouses.length > 0 ? (
                  <span className="font-bold text-amber-950">({availableWarehouses.map(w => w.name).join(', ')})</span>
                ) : (
                  <span className="italic">(Toàn bộ kho được phân công)</span>
                )}
              </span>
            </div>
            <span className="text-[11px] font-semibold bg-amber-200/60 text-amber-800 px-2.5 py-0.5 rounded-full whitespace-nowrap">
              Quyền Quản Lý Kho
            </span>
          </div>
        )}

        {/* CONTROLS & FILTERS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Chọn Vùng Báo Cáo</label>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 border border-amber-300 rounded-md bg-amber-50/50 text-amber-900 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="Tất cả vùng">Tất cả các vùng miền</option>
              <option value="Vùng Miền Trung">Vùng Miền Trung</option>
              <option value="Vùng Miền Nam">Vùng Miền Nam</option>
              <option value="Vùng Miền Bắc">Vùng Miền Bắc</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Kho Lưu Trữ</label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-blue-200 rounded-md bg-blue-50/40 text-blue-900 font-medium"
            >
              <option value="">-- {isWarehouseManager ? 'Tất cả kho phụ trách' : 'Tất cả các kho'} --</option>
              {availableWarehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Dự án</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-800"
            >
              <option value="">-- Tất cả dự án --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Trạng thái Thế chấp</label>
            <select
              value={selectedMortgageStatus}
              onChange={(e) => setSelectedMortgageStatus(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-800"
            >
              <option value="">-- Tất cả trạng thái thế chấp --</option>
              <option value="none">Chưa thế chấp</option>
              <option value="mortgaged">Đang thế chấp ngân hàng</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Kỳ báo cáo</label>
            <input
              type="text"
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-800 font-medium"
              placeholder="VD: Năm 2026, Quý 1/2026"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tìm kiếm chi tiết</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Số GCN, CSH, số thửa..."
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-800"
            />
          </div>
        </div>
      </div>

      {/* QUICK SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
          <div className="p-3 bg-amber-100 text-amber-800 rounded-lg">
            <LandPlot className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Tổng số GCN</div>
            <div className="text-xl font-bold text-gray-900">{stats.totalCount} <span className="text-xs font-normal text-gray-500">sổ</span></div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
          <div className="p-3 bg-blue-100 text-blue-800 rounded-lg">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Tổng diện tích đất</div>
            <div className="text-xl font-bold text-gray-900">{stats.totalArea.toLocaleString('vi-VN')} <span className="text-xs font-normal text-gray-500">m²</span></div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
          <div className="p-3 bg-red-100 text-red-800 rounded-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Đang thế chấp NH</div>
            <div className="text-xl font-bold text-red-700">{stats.mortgagedCount} <span className="text-xs font-normal text-gray-500">sổ</span></div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-3">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-lg">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Tổng định giá thế chấp</div>
            <div className="text-lg font-bold text-emerald-700">
              {stats.totalMortgageValuation ? (stats.totalMortgageValuation / 1e9).toFixed(1) + ' tỷ VNĐ' : '0 VNĐ'}
            </div>
          </div>
        </div>
      </div>

      {/* MATRIX EXCEL TABLE REPORT */}
      <div className="bg-white shadow-md border border-gray-300 rounded-xl overflow-hidden">
        {/* Matrix Table Toolbar */}
        <div className="p-3.5 bg-gradient-to-r from-amber-50/90 via-slate-50 to-emerald-50/80 border-b border-gray-300 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-black text-gray-900 text-xs sm:text-sm uppercase tracking-tight flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-amber-700" />
              Ma Trận Chi Tiết (27 Cột Nghiệp Vụ)
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              {stats.totalCount} bản ghi
            </span>
            <span className="text-xs text-gray-300 hidden md:inline">|</span>
            <span className="text-[11px] text-gray-600 hidden lg:inline">
              Cố định 2 cột <strong>[STT]</strong> và <strong>[Dự Án]</strong> giúp đối chiếu dễ dàng khi cuộn ngang 27 cột
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Density Selector */}
            <div className="flex items-center bg-white p-0.5 rounded-lg border border-gray-300 shadow-2xs">
              <button
                type="button"
                onClick={() => setTableDensity('comfortable')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  tableDensity === 'comfortable'
                    ? 'bg-[#1E3A8A] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Chế độ dòng chi tiết, dễ đọc"
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
                title="Chế độ dòng thu gọn, tối đa hóa số dòng hiển thị"
              >
                Thu gọn
              </button>
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
              <span className="hidden sm:inline">Dòng/trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="text-xs border border-gray-300 rounded-lg py-1 px-2 bg-white font-semibold text-gray-800 focus:ring-1 focus:ring-amber-500"
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
                <th rowSpan={2} className="px-3 py-2 border border-gray-300 min-w-[50px] sticky left-0 z-40 bg-slate-200 text-gray-800">STT</th>
                <th rowSpan={2} className="px-3 py-2 border border-gray-300 min-w-[130px] sticky left-12 z-40 bg-slate-200 text-gray-800">Mã Tài Sản / TSĐB</th>
                <th colSpan={7} className="px-3 py-1.5 border border-amber-300 bg-amber-100 text-amber-900 font-bold">THÔNG TIN CHUNG</th>
                <th colSpan={8} className="px-3 py-1.5 border border-emerald-300 bg-emerald-100 text-emerald-900 font-bold">THÔNG TIN PHÁP LÝ</th>
                <th colSpan={6} className="px-3 py-1.5 border border-rose-300 bg-rose-100 text-rose-900 font-bold">THÔNG TIN TÀI SẢN CẦM CỐ, THẾ CHẤP CÁC TỔ CHỨC TÍN DỤNG</th>
                <th colSpan={5} className="px-3 py-1.5 border border-slate-300 bg-slate-100 text-slate-800 font-bold">TRẠNG THÁI TSĐB</th>
              </tr>
              {/* TIER 2: 26 DETAILED COLUMN HEADERS */}
              <tr className="text-center font-bold text-[10px] uppercase tracking-wider text-gray-800 border-b border-gray-400 bg-slate-50">
                <th className="px-3 py-2 border border-gray-300 min-w-[150px] bg-amber-50">Dự Án (Pháp lý)</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[150px] bg-amber-50">Tên Dự Án Kinh Doanh</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[110px] bg-amber-50">Loại Tài Sản</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[90px] bg-amber-50">Nhóm Sổ</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[150px] bg-amber-100 text-blue-950">Mã lô đất (Mã Lô Pháp Lý)</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[130px] bg-amber-100 text-indigo-950">Mã Lô Kinh Doanh</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[90px] bg-amber-50">Diện Tích (m²)</th>
                
                <th className="px-3 py-2 border border-gray-300 min-w-[160px] bg-emerald-50">Chủ Sở Hữu</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[110px] bg-emerald-50">Số Thửa Bản Đồ</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[110px] bg-emerald-50">Số Tờ Bản Đồ</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[140px] bg-emerald-100 font-bold text-[#1E3A8A]">Số GCN QSDĐ</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[120px] bg-emerald-50">Số vào sổ cấp</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[110px] bg-emerald-50">Ngày vào sổ</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[150px] bg-emerald-50">Mục Đích Sử Dụng</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[130px] bg-emerald-50">Thời Hạn Sử Dụng</th>
                
                <th className="px-3 py-2 border border-gray-300 min-w-[120px] bg-rose-50">Trạng Thái Thế Chấp</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[180px] bg-rose-100 text-rose-950 font-bold">Ngân Hàng Thế Chấp</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[160px] bg-rose-100 text-rose-950 font-bold">Đơn vị vay</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[110px] bg-rose-50">Giá trị định giá</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[110px] bg-rose-50">Tỷ lệ đảm bảo</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[110px] bg-rose-50">Giá trị TSĐB</th>
                
                <th className="px-3 py-2 border border-gray-300 min-w-[130px]">Trạng Thái Pháp Lý</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[140px]">Trạng Thái Kinh Doanh</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[130px]">Trạng Thái Lưu Kho</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[140px]">Đơn vị quản lý sổ</th>
                <th className="px-3 py-2 border border-gray-300 min-w-[150px]">Ghi chú</th>
              </tr>
            </thead>

            {/* TABLE DATA BODY */}
            <tbody className="divide-y divide-gray-200 bg-white">
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
                    <tr key={asset.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className={`${cellPadding} text-center font-bold text-gray-700 border-r border-gray-200 bg-gray-50 sticky left-0 z-10`}>
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className={`${cellPadding} font-mono text-gray-800 border-r border-gray-200 bg-white sticky left-12 z-10`}>
                        {asset.asset_code || '-'}
                      </td>
                      <td className={`${cellPadding} font-semibold text-gray-900 border-r border-gray-200`}>
                        {asset.projects?.name || '-'}
                      </td>
                      <td className={`${cellPadding} font-semibold text-emerald-700 border-r border-gray-200`}>
                        {asset.business_project_name || '-'}
                      </td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>{asset.asset_type || '-'}</td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>
                        {asset.parent_asset_id ? 'Sổ con (Tách)' : (asset.lifecycle_status === 'invalidated' ? 'Sổ gốc (Đã tách)' : (asset.certificate_group === 'so_nho' ? 'Sổ nhỏ' : 'Sổ lớn'))}
                      </td>
                      <td className={`${cellPadding} border-r border-gray-200 font-semibold text-blue-900 bg-blue-50/50`}>
                        {asset.legal_lot_code || '-'}
                      </td>
                      <td className={`${cellPadding} font-bold text-indigo-700 border-r border-gray-200 bg-indigo-50/50`}>
                        {asset.business_plot_code || '-'}
                      </td>
                      <td className={`${cellPadding} font-bold text-gray-900 border-r border-gray-200 text-right`}>
                        {asset.area ? `${asset.area.toLocaleString('vi-VN')}` : '-'}
                      </td>

                      <td className={`${cellPadding} font-semibold text-gray-900 border-r border-gray-200`}>{asset.current_owner_entity?.name || asset.investor_entities?.name || '-'}</td>
                      <td className={`${cellPadding} text-center font-semibold text-gray-800 border-r border-gray-200`}>{asset.land_lot_no || '-'}</td>
                      <td className={`${cellPadding} text-center text-gray-700 border-r border-gray-200`}>{asset.map_sheet_no || '-'}</td>
                      <td className={`${cellPadding} font-bold text-[#1E3A8A] border-r border-gray-200`}>{asset.certificate_no}</td>
                      <td className={`${cellPadding} text-gray-600 font-mono border-r border-gray-200`}>{asset.registry_no || '-'}</td>
                      <td className={`${cellPadding} text-gray-600 border-r border-gray-200`}>
                        {asset.registry_date ? new Date(asset.registry_date).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}
                      </td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>{asset.usage_purpose || '-'}</td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>
                        {asset.usage_term_type === 'long_term' ? 'Lâu dài' : (asset.usage_term_date ? new Date(asset.usage_term_date).toLocaleDateString('vi-VN') : '-')}
                      </td>

                      <td className={`${cellPadding} border-r border-gray-200 text-center font-bold`}>
                        {isMortgaged ? (
                          <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded-full inline-block">Đã thế chấp</span>
                        ) : (
                          <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full inline-block">Không</span>
                        )}
                      </td>
                      <td className={`${cellPadding} font-semibold text-red-900 border-r border-gray-200`}>
                        {isMortgaged ? (asset.mortgage_bank || '-') : '-'}
                      </td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>
                        {isMortgaged ? (asset.mortgage_unit || '-') : '-'}
                      </td>
                      <td className={`${cellPadding} text-right text-gray-700 border-r border-gray-200`}>{valuation > 0 ? valuation.toLocaleString('vi-VN') : '-'}</td>
                      <td className={`${cellPadding} text-center text-gray-700 border-r border-gray-200`}>{guaranteeRatio > 0 ? `${guaranteeRatio}%` : '-'}</td>
                      <td className={`${cellPadding} text-right text-gray-700 border-r border-gray-200`}>{guaranteeVal > 0 ? guaranteeVal.toLocaleString('vi-VN') : '-'}</td>

                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>{asset.lifecycle_status === 'invalidated' ? 'Vô hiệu lực' : 'Đang hiệu lực'}</td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>{asset.sale_status === 'ready_for_sale' ? 'Sẵn sàng bán' : 'Chưa sẵn sàng'}</td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>{asset.custody_status === 'in_stock' ? 'Lưu kho an toàn' : (asset.custody_status === 'checked_out' ? 'Đã xuất kho' : 'Báo mất')}</td>
                      <td className={`${cellPadding} font-medium text-gray-800 border-r border-gray-200`}>{asset.managing_unit || '-'}</td>
                      <td className={`${cellPadding} text-gray-700 border-r border-gray-200`}>{asset.notes || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {stats.totalCount > 0 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-b-xl">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
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
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Trước
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                    Trang {page} / {Math.ceil(stats.totalCount / pageSize) || 1}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(Math.ceil(stats.totalCount / pageSize), p + 1))}
                    disabled={page >= Math.ceil(stats.totalCount / pageSize)}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
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
</div>
);
};