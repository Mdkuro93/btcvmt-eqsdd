import React, { useEffect, useState, useMemo } from 'react';
import { fetchAssets, fetchProjects } from '../api/assets';
import { Asset, Project } from '../types';
import { computeReportSummary } from '../lib/reportEngine';
import { formatPlotCode } from '../lib/assetIdentifier';
import { Loader2, Download, LandPlot, Building2, ShieldCheck, FileSpreadsheet, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';

export const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Filters
  const [selectedRegion, setSelectedRegion] = useState<string>('Tất cả vùng');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedMortgageStatus, setSelectedMortgageStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [reportPeriod, setReportPeriod] = useState<string>('Năm 2026');

  // Pagination for DOM performance
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedRegion, selectedProjectId, selectedMortgageStatus, searchTerm, reportPeriod]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsResult, allProjects] = await Promise.all([
        fetchAssets({}, 1, 10000),
        fetchProjects()
      ]);
      setAssets(assetsResult.data || []);
      setProjects(allProjects);
    } catch (error) {
      toast.error('Lỗi tải dữ liệu báo cáo');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Filtered Assets and Statistics
  const { filteredAssets, stats } = useMemo(() => {
    return computeReportSummary(assets, {
      selectedRegion,
      selectedProjectId,
      selectedMortgageStatus,
      searchTerm
    });
  }, [assets, selectedRegion, selectedProjectId, selectedMortgageStatus, searchTerm]);

  const displayAssets = useMemo(() => {
    return filteredAssets.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredAssets, page, pageSize]);

  // Excel Export matching exact template structure from user image
  const exportExcel = () => {
    try {
      const headerTitle = `BÁO CÁO THEO DÕI CHI TIẾT TỒN KHO BẤT ĐỘNG SẢN ${selectedRegion.toUpperCase()}`;
      
      // Create Worksheet Matrix
      const wsData: any[][] = [];

      // Row 1: Logo / Company Name
      wsData.push(['SUN GROUP / BTC VMT', '', '', '', headerTitle]);
      // Row 2: Report Period
      wsData.push(['Kỳ báo cáo:', reportPeriod]);
      wsData.push([]); // Blank row

      // Row 4: Top Level Section Header (Combined Colors / Groups)
      const row4 = [
        'STT',
        'THÔNG TIN CHUNG', '', '', '', '', '', '', // 7 empty for span
        'THÔNG TIN PHÁP LÝ CỦA GCN QSDĐ', '', '', '', '', '', '', '', '', '', // 10 empty for span
        'THÔNG TIN TÀI SẢN CẦM CỐ, THẾ CHẤP CÁC TỔ CHỨC TÍN DỤNG', '', '', '', '', '', '', '', // 8 empty for span
        'GHI CHÚ'
      ];
      wsData.push(row4);

      // Row 5: Detailed Columns
      const row5 = [
        'STT',
        // THÔNG TIN CHUNG
        'Dự án',
        'Loại tài sản',
        'Nhóm sổ',
        'Phân khu',
        'Số thửa đất/căn/lô',
        'Mã lô đất',
        'Diện tích (m²)',
        // THÔNG TIN PHÁP LÝ GCN
        'Chủ sở hữu',
        'Thửa đất số',
        'Tờ bản đồ số',
        'Địa chỉ',
        'Số CN QSDĐ',
        'Số vào sổ cấp',
        'Ngày vào sổ',
        'Đơn vị quản lý sổ',
        'Mục đích sử dụng',
        'Thời hạn sử dụng',
        // THẾ CHẤP
        'Tình trạng thế chấp',
        'Ngân hàng cầm cố, thế chấp 1',
        'Đơn vị vay 1',
        'Ngân hàng cầm cố, thế chấp 2',
        'Đơn vị vay 2',
        'Giá trị định giá (VNĐ)',
        'Tỷ lệ đảm bảo (%)',
        'Giá trị đảm bảo (VNĐ)',
        // GHI CHÚ
        'Ghi chú'
      ];
      wsData.push(row5);

      // Rows 6+: Data
      filteredAssets.forEach((asset, idx) => {
        const isMortgaged = asset.mortgage_status === 'mortgaged';
        const valuation = asset.mortgage_valuation || 0;
        const guaranteeRatio = asset.collateral_ratio || 0;
        const guaranteeVal = asset.collateral_value || 0;
        
        let notesArr = [];
        if (asset.notes) notesArr.push(asset.notes);
        if (asset.custody_status === 'checked_out') notesArr.push(`Đang xuất mượn cho ${asset.current_holder_dept || 'Bộ phận'}`);
        if (asset.lifecycle_status === 'invalidated') notesArr.push('Sổ đã hủy do tách thửa');
        const notesStr = notesArr.length > 0 ? notesArr.join(' - ') : 'Lưu kho an toàn';

        const plotCode = formatPlotCode(asset.subdivision, asset.lot_no, asset.land_lot_no);

        const projectDisplayName = asset.business_project_name 
          ? `${asset.projects?.name || ''} (KD: ${asset.business_project_name})`
          : (asset.projects?.name || '-');

        const plotCodeDisplay = asset.business_plot_code 
          ? `${plotCode} [KD: ${asset.business_plot_code}]` 
          : plotCode;

        const row = [
          idx + 1,
          // Thông tin chung
          projectDisplayName,
          asset.usage_purpose || '-',
          asset.parent_asset_id ? 'Sổ con (Tách thửa)' : (asset.lifecycle_status === 'invalidated' ? 'Sổ gốc (Đã tách)' : 'Sổ chính'),
          asset.subdivision || '-',
          asset.lot_no || asset.land_lot_no || '-',
          plotCodeDisplay,
          asset.area || 0,
          // Thông tin pháp lý GCN
          asset.owner_name || 'Công ty Cổ phần Đầu tư VMT',
          asset.land_lot_no || '-',
          asset.map_sheet_no || '-',
          asset.address_detail || (asset.province ? `${asset.district || ''}, ${asset.province}` : '-'),
          asset.certificate_no,
          `CH-${asset.certificate_no.replace(/\D/g, '') || String(100 + idx)}`,
          asset.created_at ? new Date(asset.created_at).toLocaleDateString('vi-VN') : '15/01/2024',
          asset.warehouses?.name || 'Kho Trung Tâm BTC',
          asset.usage_purpose || '-',
          asset.usage_term || '-',
          // Thế chấp
          isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
          isMortgaged ? (asset.mortgage_bank || 'BIDV - CN TP.HCM') : '-',
          isMortgaged ? (asset.mortgage_unit || 'Ban Nguồn Vốn') : '-',
          '-',
          '-',
          valuation ? valuation : 0,
          guaranteeRatio ? `${guaranteeRatio}%` : '-',
          guaranteeVal ? guaranteeVal : 0,
          // Ghi chú
          asset.custody_status === 'checked_out'
            ? `Đang xuất mượn cho ${asset.current_holder_dept || 'Bộ phận'}`
            : (asset.lifecycle_status === 'invalidated' ? 'Sổ đã hủy do tách thửa' : 'Lưu kho an toàn')
        ];
        wsData.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Column widths formatting
      ws['!cols'] = [
        { wch: 5 },  // STT
        { wch: 28 }, // Dự án
        { wch: 22 }, // Loại tài sản
        { wch: 18 }, // Nhóm sổ
        { wch: 15 }, // Phân khu
        { wch: 18 }, // Số thửa/căn/lô
        { wch: 20 }, // Map khu-lô
        { wch: 14 }, // Diện tích
        { wch: 28 }, // Chủ sở hữu
        { wch: 12 }, // Thửa đất số
        { wch: 12 }, // Tờ bản đồ số
        { wch: 35 }, // Địa chỉ
        { wch: 18 }, // Số GCN
        { wch: 16 }, // Số vào sổ
        { wch: 14 }, // Ngày vào sổ
        { wch: 24 }, // Đơn vị quản lý sổ
        { wch: 24 }, // Mục đích
        { wch: 16 }, // Thời hạn
        { wch: 18 }, // Tình trạng thế chấp
        { wch: 28 }, // Ngân hàng 1
        { wch: 20 }, // Đơn vị vay 1
        { wch: 20 }, // Ngân hàng 2
        { wch: 20 }, // Đơn vị vay 2
        { wch: 20 }, // Giá trị định giá
        { wch: 16 }, // Tỷ lệ
        { wch: 20 }, // Giá trị đảm bảo
        { wch: 30 }, // Ghi chú
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo Chi tiết BĐS');
      XLSX.writeFile(wb, `Bao-Cao-Chi-Tiet-Ton-Kho-BDS-${selectedRegion.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Xuất file Excel báo cáo thành công!');
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi xuất Excel: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <Toaster position="top-right" />

      {/* HEADER BANNER LIKE EXCEL SPREADSHEET */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center text-white font-black text-xl shadow-md border border-amber-600">
              SUN
            </div>
            <div>
              <div className="text-xs font-bold text-amber-700 uppercase tracking-widest">TẬP ĐOÀN SUN GROUP / TẬP ĐOÀN VMT</div>
              <h1 className="text-xl sm:text-2xl font-black text-red-700 uppercase tracking-tight">
                BÁO CÁO THEO DÕI CHI TIẾT TỒN KHO BẤT ĐỘNG SẢN {selectedRegion.toUpperCase()}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>Kỳ báo cáo: <strong className="text-gray-800">{reportPeriod}</strong></span>
                <span>•</span>
                <span>Ngày lập: <strong className="text-gray-800">{new Date().toLocaleDateString('vi-VN')}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportExcel}
              disabled={loading || filteredAssets.length === 0}
              className="inline-flex items-center px-4 py-2.5 text-sm font-bold rounded-lg shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-900 disabled:opacity-50 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 mr-2" /> Xuất File Excel Chuẩn Mẫu
            </button>
          </div>
        </div>

        {/* CONTROLS & FILTERS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-1">
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
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="min-w-full divide-y divide-gray-300 text-xs text-left border-collapse">
            
            {/* LEVEL 1: CATEGORY SECTIONS HEADER */}
            <thead>
              <tr className="text-center font-black uppercase text-[11px] tracking-wide text-gray-900">
                <th rowSpan={2} className="px-3 py-3 bg-amber-400 border border-gray-400 w-10 sticky left-0 z-20">
                  STT
                </th>

                {/* SECTION 1: THÔNG TIN CHUNG (YELLOW/GOLD) */}
                <th colSpan={7} className="px-4 py-2 bg-amber-300 border border-gray-400 text-amber-950">
                  THÔNG TIN CHUNG
                </th>

                {/* SECTION 2: THÔNG TIN PHÁP LÝ GCN QSDĐ (LIGHT GREEN) */}
                <th colSpan={10} className="px-4 py-2 bg-emerald-300 border border-gray-400 text-emerald-950">
                  THÔNG TIN PHÁP LÝ CỦA GCN QSDĐ
                </th>

                {/* SECTION 3: THÔNG TIN THẾ CHẤP NGÂN HÀNG (PINK/RED) */}
                <th colSpan={8} className="px-4 py-2 bg-red-300 border border-gray-400 text-red-950">
                  THÔNG TIN TÀI SẢN CẦM CỐ, THẾ CHẤP CÁC TỔ CHỨC TÍN DỤNG
                </th>

                {/* SECTION 4: GHI CHÚ */}
                <th rowSpan={2} className="px-4 py-3 bg-amber-300 border border-gray-400 text-amber-950 min-w-[200px]">
                  GHI CHÚ
                </th>
              </tr>

              {/* LEVEL 2: SUB-COLUMNS HEADER */}
              <tr className="text-center font-bold text-[10px] uppercase tracking-wider text-gray-800 border-b border-gray-400">
                {/* THÔNG TIN CHUNG COLUMNS */}
                <th className="px-3 py-2 bg-amber-200 border border-gray-300 min-w-[140px]">Dự án</th>
                <th className="px-3 py-2 bg-amber-200 border border-gray-300 min-w-[120px]">Loại tài sản</th>
                <th className="px-3 py-2 bg-amber-200 border border-gray-300 min-w-[100px]">Nhóm sổ</th>
                <th className="px-3 py-2 bg-amber-200 border border-gray-300 min-w-[100px]">Phân Khu</th>
                <th className="px-3 py-2 bg-amber-200 border border-gray-300 min-w-[100px]">Số thửa/lô</th>
                <th className="px-3 py-2 bg-amber-200 border border-gray-300 min-w-[120px] font-bold text-blue-900">Mã lô đất</th>
                <th className="px-3 py-2 bg-amber-200 border border-gray-300 min-w-[90px]">Diện tích (m²)</th>

                {/* THÔNG TIN PHÁP LÝ GCN COLUMNS */}
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[160px]">Chủ sở hữu</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[80px]">Thửa đất số</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[80px]">Tờ bản đồ</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[180px]">Địa chỉ</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[110px]">Số CN QSDĐ</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[100px]">Số vào sổ cấp</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[90px]">Ngày vào sổ</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[140px]">Đơn vị quản lý sổ</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[140px]">Mục đích sử dụng</th>
                <th className="px-3 py-2 bg-emerald-200 border border-gray-300 min-w-[100px]">Thời hạn sử dụng</th>

                {/* THẾ CHẤP COLUMNS */}
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[110px]">Tình trạng thế chấp</th>
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[160px]">Ngân hàng thế chấp 1</th>
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[120px]">Đơn vị vay 1</th>
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[140px]">Ngân hàng thế chấp 2</th>
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[120px]">Đơn vị vay 2</th>
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[120px]">Giá trị định giá</th>
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[90px]">Tỷ lệ đảm bảo</th>
                <th className="px-3 py-2 bg-red-200 border border-gray-300 min-w-[120px]">Giá trị đảm bảo</th>
              </tr>
            </thead>

            {/* TABLE DATA BODY */}
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={27} className="px-4 py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto" />
                    <p className="mt-2 text-xs text-gray-500 font-semibold">Đang tổng hợp dữ liệu báo cáo...</p>
                  </td>
                </tr>
              ) : filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={27} className="px-4 py-16 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto" />
                    <p className="mt-2 text-xs text-gray-500 font-medium">Không tìm thấy dữ liệu bất động sản phù hợp với tiêu chí chọn.</p>
                  </td>
                </tr>
              ) : (
                displayAssets.map((asset, index) => {
                  const isMortgaged = asset.mortgage_status === 'mortgaged';
                  const valuation = asset.mortgage_valuation || 0;
                  const guaranteeRatio = asset.collateral_ratio || 0;
                  const guaranteeVal = asset.collateral_value || 0;
                  
                  let notesArr = [];
                  if (asset.notes) notesArr.push(asset.notes);
                  if (asset.custody_status === 'checked_out') notesArr.push(`Đang xuất mượn cho ${asset.current_holder_dept || 'Bộ phận'}`);
                  if (asset.lifecycle_status === 'invalidated') notesArr.push('Sổ đã hủy do tách thửa');
                  const notesStr = notesArr.length > 0 ? notesArr.join(' - ') : 'Lưu kho an toàn';

                  return (
                    <tr key={asset.id} className="hover:bg-amber-50/40 transition-colors">
                      {/* STT */}
                      <td className="px-3 py-2 text-center font-bold text-gray-700 border-r border-gray-200 bg-gray-50 sticky left-0 z-10">
                        {(page - 1) * pageSize + index + 1}
                      </td>

                      {/* THÔNG TIN CHUNG */}
                      <td className="px-3 py-2 font-semibold text-gray-900 border-r border-gray-200">
                        <div>{asset.projects?.name || '-'}</div>
                        {asset.business_project_name && (
                          <div className="text-[10px] text-emerald-700 font-normal">KD: {asset.business_project_name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.usage_purpose || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {asset.parent_asset_id ? (
                          <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-medium">Sổ con (Tách)</span>
                        ) : asset.lifecycle_status === 'invalidated' ? (
                          <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-medium">Sổ gốc (Đã tách)</span>
                        ) : (
                          <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium">Sổ chính</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.subdivision || '-'}</td>
                      <td className="px-3 py-2 font-mono text-gray-800 border-r border-gray-200">{asset.lot_no || asset.land_lot_no || '-'}</td>
                      <td className="px-3 py-2 border-r border-gray-200">
                        <span className="font-semibold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] border border-blue-100">
                          {formatPlotCode(asset.subdivision, asset.lot_no, asset.land_lot_no)}
                        </span>
                        {asset.business_plot_code && (
                          <div className="text-[10px] font-bold text-indigo-700 mt-0.5">KD: {asset.business_plot_code}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-200 text-right">
                        {asset.area ? asset.area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* THÔNG TIN PHÁP LÝ GCN */}
                      <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-200">{asset.owner_name || 'Công ty Cổ phần Đầu tư VMT'}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-800 border-r border-gray-200">{asset.land_lot_no || '-'}</td>
                      <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-200">{asset.map_sheet_no || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200 truncate max-w-[200px]" title={asset.address_detail || ''}>
                        {asset.address_detail || (asset.province ? `${asset.district || ''}, ${asset.province}` : '-')}
                      </td>
                      <td className="px-3 py-2 font-bold text-[#1E3A8A] border-r border-gray-200">{asset.certificate_no}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono border-r border-gray-200">CH-{asset.certificate_no.replace(/\D/g, '') || String(100 + index)}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200">
                        {asset.created_at ? new Date(asset.created_at).toLocaleDateString('vi-VN') : '15/01/2024'}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 border-r border-gray-200">{asset.warehouses?.name || 'Kho Trung Tâm BTC'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.usage_purpose || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.usage_term || '-'}</td>

                      {/* THÔNG TIN THẾ CHẤP NGÂN HÀNG */}
                      <td className="px-3 py-2 border-r border-gray-200 text-center font-bold">
                        {isMortgaged ? (
                          <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded-full inline-block">Đã thế chấp</span>
                        ) : (
                          <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full inline-block">Chưa thế chấp</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-red-900 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_bank || 'BIDV - CN TP.HCM') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_unit || 'Ban Nguồn Vốn') : '-'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-200">-</td>
                      <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-200">-</td>
                      <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-200 text-right">
                        {valuation ? `${valuation.toLocaleString('vi-VN')} đ` : '-'}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-200">
                        {guaranteeRatio ? `${guaranteeRatio}%` : '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-emerald-700 border-r border-gray-200 text-right">
                        {guaranteeVal ? `${guaranteeVal.toLocaleString('vi-VN')} đ` : '-'}
                      </td>

                      {/* GHI CHÚ */}
                      <td className="px-3 py-2 text-gray-600 text-[11px]">
                        {asset.custody_status === 'checked_out' ? (
                          <span className="text-amber-700 font-semibold">Đang mượn tại {asset.current_holder_dept || 'Ban NV'}</span>
                        ) : asset.lifecycle_status === 'invalidated' ? (
                          <span className="text-gray-400 italic">Sổ gốc đã hủy (sau tách)</span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Lưu kho an toàn</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {filteredAssets.length > 0 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-b-xl">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Hiển thị <span className="font-medium">{(page - 1) * pageSize + 1}</span> đến{' '}
                  <span className="font-medium">{Math.min(page * pageSize, filteredAssets.length)}</span> trong{' '}
                  <span className="font-medium">{filteredAssets.length}</span> kết quả
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
                    Trang {page} / {Math.ceil(filteredAssets.length / pageSize) || 1}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(Math.ceil(filteredAssets.length / pageSize), p + 1))}
                    disabled={page >= Math.ceil(filteredAssets.length / pageSize)}
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
    </div>
  );
};
