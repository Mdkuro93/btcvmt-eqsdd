import React, { useState } from 'react';
import { ProjectReportRow, ProjectReportStats } from '../types';
import { Building2, AlertCircle } from 'lucide-react';
import { isHighRiseAsset, getAreaSubLabel } from '../constants/assetTypes';

interface ProjectReportTableProps {
  rows: ProjectReportRow[];
  stats: ProjectReportStats;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  tableDensity: 'comfortable' | 'compact';
  onDensityChange: (d: 'comfortable' | 'compact') => void;
  pageSize: number;
  onPageSizeChange: (s: number) => void;
}

export const ProjectReportTable: React.FC<ProjectReportTableProps> = ({
  rows,
  stats,
  loading,
  error,
  onRetry,
  tableDensity,
  onDensityChange,
  pageSize,
  onPageSizeChange,
}) => {
  const [page, setPage] = useState(1);

  const cellPadding = tableDensity === 'compact' ? 'py-1.5 px-2 text-[11px]' : 'py-2.5 px-3 text-xs';
  const totalPages = Math.ceil(rows.length / pageSize) || 1;
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  // Dynamic KPI calculation directly from current rows to guarantee 100% synchronization
  const displayStats: ProjectReportStats = {
    totalLots: rows.length,
    // Chỉ tính tổng SUM(area) của các tài sản KHÔNG THUỘC HIGH_RISE_ASSET_TYPES (Bảo toàn số liệu diện tích đất chuẩn)
    totalArea: rows.filter(r => !isHighRiseAsset(r.col_d_asset_type)).reduce((sum, r) => sum + (Number(r.col_g_area) || 0), 0),
    totalHighRiseArea: rows.filter(r => isHighRiseAsset(r.col_d_asset_type)).reduce((sum, r) => sum + (Number(r.col_g_area) || 0), 0),
    cdtCount: rows.reduce((sum, r) => sum + (Number(r.col_k_cdt_count) || 0), 0),
    cdtArea: rows.reduce((sum, r) => sum + (Number(r.col_l_cdt_area) || 0), 0),
    investorCount: rows.reduce((sum, r) => sum + (Number(r.col_n_investor_count) || 0), 0),
    investorArea: rows.reduce((sum, r) => sum + (Number(r.col_o_investor_area) || 0), 0),
    unsplitCount: rows.reduce((sum, r) => sum + (Number(r.col_p_unsplit_count) || 0), 0),
    unsplitArea: rows.reduce((sum, r) => sum + (Number(r.col_q_unsplit_area) || 0), 0),
    unissuedCount: rows.reduce((sum, r) => sum + (Number(r.col_r_unissued_count) || 0), 0),
    unissuedArea: rows.reduce((sum, r) => sum + (Number(r.col_s_unissued_area) || 0), 0),
    soldCount: rows.reduce((sum, r) => sum + (Number(r.col_t_sold_count) || 0), 0),
    soldArea: rows.reduce((sum, r) => sum + (Number(r.col_u_sold_area) || 0), 0),
  };

  return (
    <div className="space-y-4">
      {/* QUICK SUMMARY CARDS FOR PROJECT TRACKING */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface  p-3.5 rounded-xl border border-gray-200  shadow-xs transition-colors">
          <div className="text-[11px] font-semibold text-gray-500 ">Tổng quy hoạch</div>
          <div className="text-lg font-bold text-gray-900  mt-0.5">
            {displayStats.totalLots} <span className="text-xs font-normal text-gray-500">lô</span>
          </div>
          <div className="text-[10px] text-gray-600  font-medium">{displayStats.totalArea.toLocaleString('vi-VN')} m² (Đất)</div>
          {displayStats.totalHighRiseArea !== undefined && displayStats.totalHighRiseArea > 0 && (
            <div className="text-[9px] text-purple-600  mt-0.5 font-medium">+{displayStats.totalHighRiseArea.toLocaleString('vi-VN')} m² (3D)</div>
          )}
        </div>

        <div className="bg-surface  p-3.5 rounded-xl border border-blue-200  shadow-xs transition-colors">
          <div className="text-[11px] font-semibold text-blue-700 ">Tồn Chủ đầu tư</div>
          <div className="text-lg font-bold text-blue-800  mt-0.5">
            {displayStats.cdtCount} <span className="text-xs font-normal text-blue-500">sổ</span>
          </div>
          <div className="text-[10px] text-blue-600 ">{displayStats.cdtArea.toLocaleString('vi-VN')} m²</div>
        </div>

        <div className="bg-surface  p-3.5 rounded-xl border border-purple-200  shadow-xs transition-colors">
          <div className="text-[11px] font-semibold text-purple-700 ">Tồn Nhà đầu tư</div>
          <div className="text-lg font-bold text-purple-800  mt-0.5">
            {displayStats.investorCount} <span className="text-xs font-normal text-purple-500">sổ</span>
          </div>
          <div className="text-[10px] text-purple-600 ">{displayStats.investorArea.toLocaleString('vi-VN')} m²</div>
        </div>

        <div className="bg-surface  p-3.5 rounded-xl border border-amber-200  shadow-xs transition-colors">
          <div className="text-[11px] font-semibold text-amber-700 ">Trong sổ lớn (P/Q)</div>
          <div className="text-lg font-bold text-amber-800  mt-0.5">
            {displayStats.unsplitCount} <span className="text-xs font-normal text-amber-500">lô</span>
          </div>
          <div className="text-[10px] text-amber-600 ">{displayStats.unsplitArea.toLocaleString('vi-VN')} m²</div>
        </div>

        <div className="bg-surface  p-3.5 rounded-xl border border-rose-200  shadow-xs transition-colors">
          <div className="text-[11px] font-semibold text-rose-700 ">Chưa cấp sổ (R/S)</div>
          <div className="text-lg font-bold text-rose-800  mt-0.5">
            {displayStats.unissuedCount} <span className="text-xs font-normal text-rose-500">lô</span>
          </div>
          <div className="text-[10px] text-rose-600 ">{displayStats.unissuedArea.toLocaleString('vi-VN')} m²</div>
        </div>

        <div className="bg-surface  p-3.5 rounded-xl border border-emerald-200  shadow-xs transition-colors">
          <div className="text-[11px] font-semibold text-emerald-700 ">Đã bán khách hàng</div>
          <div className="text-lg font-bold text-emerald-800  mt-0.5">
            {displayStats.soldCount} <span className="text-xs font-normal text-emerald-500">sổ</span>
          </div>
          <div className="text-[10px] text-emerald-600 ">{displayStats.soldArea.toLocaleString('vi-VN')} m²</div>
        </div>
      </div>

      {/* MATRIX TABLE CONTAINER */}
      <div className="bg-surface  shadow-md border border-gray-300  rounded-xl overflow-hidden transition-colors">
        {/* Table Toolbar */}
        <div className="p-3.5 bg-gradient-to-r from-amber-100/90 via-amber-50 to-orange-50/80    border-b border-amber-300  flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-black text-amber-950  text-xs sm:text-sm uppercase tracking-tight flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-amber-800 " />
              Bảng Kê Chi Tiết BĐS Theo Dự Án
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-200  text-amber-950  border border-amber-400 ">
              {rows.length} bất động sản
            </span>
            <span className="text-[11px] text-amber-900/80  hidden xl:inline">
              Theo dõi xuyên suốt: Chưa cấp sổ → Trong sổ lớn → Đã ra sổ nhỏ tồn CĐT / NĐT / Đã bán
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Density Selector */}
            <div className="flex items-center bg-surface  p-0.5 rounded-lg border border-gray-300  shadow-2xs">
              <button
                type="button"
                onClick={() => onDensityChange('comfortable')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tableDensity === 'comfortable'
                    ? 'bg-accent  text-accent-ink shadow-xs'
                    : 'text-gray-600  hover:text-gray-900 '
                }`}
                title="Chế độ dòng chi tiết, dễ đọc"
              >
                Chi tiết
              </button>
              <button
                type="button"
                onClick={() => onDensityChange('compact')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tableDensity === 'compact'
                    ? 'bg-accent  text-accent-ink shadow-xs'
                    : 'text-gray-600  hover:text-gray-900 '
                }`}
                title="Chế độ dòng thu gọn, tối đa hóa số dòng hiển thị"
              >
                Thu gọn
              </button>
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-xs text-gray-700  font-medium">
              <span className="hidden sm:inline">Dòng/trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  onPageSizeChange(Number(e.target.value));
                  setPage(1);
                }}
                className="text-xs border border-gray-300  rounded-lg py-1 px-2 bg-surface  font-semibold text-gray-800  focus:ring-1 focus:ring-amber-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500 (Tất cả)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto max-h-[72vh] overflow-y-auto">
          <table className="min-w-full text-left border-collapse">
            <thead className="sticky top-0 z-30 shadow-2xs">
              {/* TẦNG 1: HEADER LỚN BAO TRÙM */}
              <tr className="text-center font-bold text-[11px] uppercase tracking-wider bg-[#FFC000] text-amber-950 border-b border-amber-500">
                <th rowSpan={3} className="px-2.5 py-2 border border-amber-500 min-w-[45px] sticky left-0 z-40 bg-[#FFB300] text-amber-950 font-black">
                  STT
                </th>
                <th colSpan={6} rowSpan={2} className="px-3 py-2 border border-amber-500 bg-[#FFC000] text-amber-950 font-black">
                  THÔNG TIN BẤT ĐỘNG SẢN THEO QUY HOẠCH
                </th>
                <th colSpan={2} rowSpan={2} className="px-3 py-2 border border-amber-500 bg-[#FFD54F] text-amber-950 font-black">
                  SỐ GCN QSDĐ
                </th>
                <th colSpan={12} className="px-3 py-2 border border-amber-500 bg-[#FFE082] text-amber-950 font-black">
                  THÔNG TIN TÌNH TRẠNG GCN QSDĐ
                </th>
                <th colSpan={5} rowSpan={2} className="px-3 py-2 border border-amber-500 bg-[#ECEFF1]  text-slate-900  font-black">
                  TRẠNG THÁI TSĐB & QUẢN LÝ LƯU KHO
                </th>
              </tr>

              {/* TẦNG 2: HEADER NHÓM CON (TRONG KHỐI THÔNG TIN TÌNH TRẠNG GCN QSDĐ) */}
              <tr className="text-center font-bold text-[10px] uppercase tracking-wider border-b border-amber-500 bg-[#FFF59D]  text-amber-950">
                <th colSpan={3} className="px-3 py-1.5 border border-amber-400  bg-[#FFE082] text-blue-950 font-black">
                  GCN tồn Chủ đầu tư
                </th>
                <th colSpan={3} className="px-3 py-1.5 border border-amber-400  bg-[#FFE57F] text-purple-950 font-black">
                  GCN tồn Nhà đầu tư
                </th>
                <th colSpan={4} className="px-3 py-1.5 border border-amber-400  bg-[#FFF9C4] text-rose-950 font-black">
                  GCN chờ CQNN cấp
                </th>
                <th colSpan={2} className="px-3 py-1.5 border border-amber-400  bg-[#C8E6C9] text-emerald-950 font-black">
                  GCN đã bán cho khách hàng
                </th>
              </tr>

              {/* TẦNG 3: CỘT CHI TIẾT (ĐÃ LOẠI BỎ CÁC KÝ TỰ MÃ HÓA THÔ NHƯ (A), (D), [C]) */}
              <tr className="text-center font-bold text-[10px] uppercase tracking-wider text-amber-950 border-b border-amber-500 bg-[#FFF9C4]  ">
                {/* Khối 1: Thông tin quy hoạch */}
                <th className="px-2.5 py-2 border border-amber-400  min-w-[150px] sticky left-11 z-40 bg-[#FFF9C4] ">
                  Mã Tài Sản / TSĐB
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[160px]">
                  Dự Án (Pháp lý)
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[110px]">
                  Loại Tài Sản
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[90px]">
                  Nhóm Sổ
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[130px] font-black text-blue-900 ">
                  Lô đất (Mã Lô)
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[100px]">
                  Diện Tích (m²)
                </th>

                {/* Khối 2: Số GCN */}
                <th className="px-2.5 py-2 border border-amber-400  min-w-[130px] font-bold text-blue-900  bg-amber-50/60 ">
                  Số nhỏ
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[130px] font-bold text-amber-900  bg-amber-50/60 ">
                  Số lớn
                </th>

                {/* Khối 3 - a: GCN tồn Chủ đầu tư */}
                <th className="px-2.5 py-2 border border-amber-400  min-w-[150px] text-blue-950 ">
                  Tên Chủ đầu tư
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[90px]">
                  Số lượng GCN
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[100px]">
                  Diện tích
                </th>

                {/* Khối 3 - b: GCN tồn Nhà đầu tư */}
                <th className="px-2.5 py-2 border border-amber-400  min-w-[150px] text-purple-950 ">
                  Tên Nhà Đầu tư
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[90px]">
                  Số lượng GCN
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[100px]">
                  Diện tích
                </th>

                {/* Khối 3 - c: GCN chờ CQNN cấp */}
                <th className="px-2 py-2 border border-amber-400  min-w-[120px] text-amber-900 ">
                  SL chưa tách sổ nhỏ
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[110px] text-amber-900 ">
                  DT chưa tách sổ
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[110px] text-rose-900  font-black">
                  Số chưa cấp
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[110px] text-rose-900  font-black">
                  DT chưa cấp
                </th>

                {/* Khối 3 - d: GCN đã bán */}
                <th className="px-2 py-2 border border-amber-400  min-w-[90px] text-emerald-900 ">
                  Số lượng GCN
                </th>
                <th className="px-2 py-2 border border-amber-400  min-w-[100px] text-emerald-900 ">
                  Diện tích
                </th>

                {/* Khối 4: Trạng thái TSĐB */}
                <th className="px-2.5 py-2 border border-amber-400  min-w-[120px]">
                  Trạng Thái Pháp Lý
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[120px]">
                  Trạng Thái Kinh Doanh
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[130px]">
                  Trạng Thái Lưu Kho
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[120px]">
                  Đơn vị quản lý sổ
                </th>
                <th className="px-2.5 py-2 border border-amber-400  min-w-[150px]">
                  Ghi chú
                </th>
              </tr>
            </thead>

            {/* TABLE BODY */}
            <tbody className="divide-y divide-gray-200  bg-surface ">
              {loading ? (
                <tr>
                  <td colSpan={26} className="py-16 text-center text-gray-400 ">
                    Đang tổng hợp dữ liệu bất động sản theo dự án...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={26} className="py-16 text-center">
                    <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
                    <p className="mt-2 text-sm text-red-700  font-semibold">{error}</p>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-accent-ink bg-accent hover:brightness-95 transition-colors shadow-xs cursor-pointer"
                      >
                        Tải lại dữ liệu
                      </button>
                    )}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={26} className="py-16 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto" />
                    <p className="mt-2 text-sm text-gray-500 ">
                      Không tìm thấy bất động sản nào theo bộ lọc dự án hiện tại.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r, index) => {
                  const globalIdx = (page - 1) * pageSize + index + 1;
                  const isUnissued = r.col_r_unissued_count === 1;
                  const isUnsplit = r.col_p_unsplit_count === 1;

                  return (
                    <tr
                      key={`${r.col_a_system_id}-${index}`}
                      className={`hover:bg-amber-50/40  transition-colors ${
                        isUnissued ? 'bg-rose-50/20 ' : (isUnsplit ? 'bg-amber-50/20 ' : '')
                      }`}
                    >
                      <td className={`${cellPadding} text-center font-bold text-gray-700  border-r border-gray-200  bg-gray-50  sticky left-0 z-10`}>
                        {globalIdx}
                      </td>
                      <td className={`${cellPadding} font-mono font-semibold text-gray-900  border-r border-gray-200  bg-surface  sticky left-11 z-10`}>
                        {r.col_a_system_id}
                      </td>
                      <td className={`${cellPadding} font-medium text-gray-900  border-r border-gray-200 `}>
                        {r.col_c_project_name}
                      </td>
                      <td className={`${cellPadding} text-gray-700  border-r border-gray-200 `}>
                        {r.col_d_asset_type}
                      </td>
                      <td className={`${cellPadding} text-center text-gray-700  border-r border-gray-200 `}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          r.col_e_cert_group === 'Sổ nhỏ'
                            ? 'bg-blue-100 text-blue-800  '
                            : (r.col_e_cert_group === 'Sổ lớn'
                              ? 'bg-amber-100 text-amber-800  '
                              : 'bg-gray-100 text-gray-600  ')
                        }`}>
                          {r.col_e_cert_group}
                        </span>
                      </td>
                      <td className={`${cellPadding} font-bold text-blue-900  border-r border-gray-200 `}>
                        {r.col_f_lot_code}
                      </td>
                      <td className={`${cellPadding} text-right font-semibold text-gray-900  border-r border-gray-200 `}>
                        <div>{r.col_g_area ? r.col_g_area.toLocaleString('vi-VN') : '-'}</div>
                        {r.col_g_area > 0 && r.col_d_asset_type && (
                          <div className="text-[10px] text-gray-400  font-normal">
                            {getAreaSubLabel(r.col_d_asset_type)}
                          </div>
                        )}
                      </td>

                      {/* Cột I: Số nhỏ */}
                      <td className={`${cellPadding} font-bold text-blue-700  border-r border-gray-200 `}>
                        {r.col_i_small_cert_no || '-'}
                      </td>
                      {/* Cột J: Số lớn */}
                      <td className={`${cellPadding} font-semibold text-amber-800  border-r border-gray-200 `}>
                        {r.col_j_master_cert_no || '-'}
                      </td>

                      {/* CĐT (Tên CĐT, K, L) */}
                      <td className={`${cellPadding} font-medium text-blue-950  border-r border-gray-200  truncate max-w-[160px]`} title={r.col_k_cdt_name}>
                        {r.col_k_cdt_name || '-'}
                      </td>
                      <td className={`${cellPadding} text-center font-bold text-blue-800  border-r border-gray-200 `}>
                        {r.col_k_cdt_count}
                      </td>
                      <td className={`${cellPadding} text-right text-blue-900  border-r border-gray-200 `}>
                        {r.col_l_cdt_area > 0 ? r.col_l_cdt_area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* NĐT (Tên NĐT, N, O) */}
                      <td className={`${cellPadding} font-medium text-purple-900  border-r border-gray-200  truncate max-w-[150px]`} title={r.col_m_investor_name}>
                        {r.col_m_investor_name || '-'}
                      </td>
                      <td className={`${cellPadding} text-center font-bold text-purple-800  border-r border-gray-200 `}>
                        {r.col_n_investor_count}
                      </td>
                      <td className={`${cellPadding} text-right text-purple-900  border-r border-gray-200 `}>
                        {r.col_o_investor_area > 0 ? r.col_o_investor_area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* CHƯA TÁCH (P, Q) */}
                      <td className={`${cellPadding} text-center font-bold text-amber-700  border-r border-gray-200  bg-amber-50/40 `}>
                        {r.col_p_unsplit_count}
                      </td>
                      <td className={`${cellPadding} text-right text-amber-800  border-r border-gray-200  bg-amber-50/40 `}>
                        {r.col_q_unsplit_area > 0 ? r.col_q_unsplit_area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* CHƯA CẤP (R, S) */}
                      <td className={`${cellPadding} text-center font-black text-rose-700  border-r border-gray-200  bg-rose-50/50 `}>
                        {r.col_r_unissued_count}
                      </td>
                      <td className={`${cellPadding} text-right font-bold text-rose-800  border-r border-gray-200  bg-rose-50/50 `}>
                        {r.col_s_unissued_area > 0 ? r.col_s_unissued_area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* ĐÃ BÁN (T, U) */}
                      <td className={`${cellPadding} text-center font-bold text-emerald-700  border-r border-gray-200 `}>
                        {r.col_t_sold_count}
                      </td>
                      <td className={`${cellPadding} text-right text-emerald-800  border-r border-gray-200 `}>
                        {r.col_u_sold_area > 0 ? r.col_u_sold_area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* TRẠNG THÁI TSĐB (Z, AA, AB, AC, AD) */}
                      <td className={`${cellPadding} text-gray-700  border-r border-gray-200 `}>
                        {r.col_z_legal_status}
                      </td>
                      <td className={`${cellPadding} text-gray-700  border-r border-gray-200 `}>
                        {r.col_aa_business_status}
                      </td>
                      <td className={`${cellPadding} text-gray-700  border-r border-gray-200 `}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          r.col_ab_custody_status.includes('kho')
                            ? 'bg-emerald-100 text-emerald-800  '
                            : (r.col_ab_custody_status.includes('Thế chấp')
                              ? 'bg-rose-100 text-rose-800  '
                              : 'bg-gray-100 text-gray-700  ')
                        }`}>
                          {r.col_ab_custody_status}
                        </span>
                      </td>
                      <td className={`${cellPadding} text-gray-700  border-r border-gray-200 `}>
                        {r.col_ac_managing_unit}
                      </td>
                      <td className={`${cellPadding} text-gray-600  border-r border-gray-200 `}>
                        {r.col_ad_notes || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* TABLE FOOTER SUMMARY */}
            {rows.length > 0 && (
              <tfoot className="bg-amber-100/80  font-bold border-t-2 border-amber-500 text-[11px] text-gray-900 ">
                <tr>
                  <td colSpan={6} className="px-3 py-2.5 text-center font-black uppercase text-amber-950  border-r border-amber-300 ">
                    TỔNG CỘNG ({rows.length} bất động sản)
                  </td>
                  <td className="px-3 py-2.5 text-right font-black text-amber-950  border-r border-amber-300 ">
                    {displayStats.totalArea.toLocaleString('vi-VN')}
                  </td>
                  <td className="border-r border-amber-300  text-center">-</td>
                  <td className="border-r border-amber-300  text-center">-</td>
                  <td className="border-r border-amber-300  text-center">-</td>
                  <td className="px-2 py-2.5 text-center font-black text-blue-900  border-r border-amber-300 ">
                    {displayStats.cdtCount}
                  </td>
                  <td className="px-2 py-2.5 text-right font-black text-blue-900  border-r border-amber-300 ">
                    {displayStats.cdtArea.toLocaleString('vi-VN')}
                  </td>
                  <td className="border-r border-amber-300  text-center">-</td>
                  <td className="px-2 py-2.5 text-center font-black text-purple-900  border-r border-amber-300 ">
                    {displayStats.investorCount}
                  </td>
                  <td className="px-2 py-2.5 text-right font-black text-purple-900  border-r border-amber-300 ">
                    {displayStats.investorArea.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-2 py-2.5 text-center font-black text-amber-900  border-r border-amber-300 ">
                    {displayStats.unsplitCount}
                  </td>
                  <td className="px-2 py-2.5 text-right font-black text-amber-900  border-r border-amber-300 ">
                    {displayStats.unsplitArea.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-2 py-2.5 text-center font-black text-rose-900  border-r border-amber-300 ">
                    {displayStats.unissuedCount}
                  </td>
                  <td className="px-2 py-2.5 text-right font-black text-rose-900  border-r border-amber-300 ">
                    {displayStats.unissuedArea.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-2 py-2.5 text-center font-black text-emerald-900  border-r border-amber-300 ">
                    {displayStats.soldCount}
                  </td>
                  <td className="px-2 py-2.5 text-right font-black text-emerald-900  border-r border-amber-300 ">
                    {displayStats.soldArea.toLocaleString('vi-VN')}
                  </td>
                  <td colSpan={5} className="border-r border-amber-300  text-center text-gray-500">
                    -
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Controls */}
        {rows.length > 0 && (
          <div className="bg-surface  px-4 py-3 flex items-center justify-between border-t border-gray-200  sm:px-6 rounded-b-xl transition-colors">
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 ">
                  Hiển thị <span className="font-medium">{(page - 1) * pageSize + 1}</span> đến{' '}
                  <span className="font-medium">{Math.min(page * pageSize, rows.length)}</span> trong{' '}
                  <span className="font-medium">{rows.length}</span> bất động sản
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300  bg-surface  text-sm font-medium text-gray-500  hover:bg-gray-50  disabled:opacity-50 cursor-pointer"
                  >
                    Trước
                  </button>
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300  bg-surface  text-sm font-medium text-gray-700 ">
                    Trang {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300  bg-surface  text-sm font-medium text-gray-500  hover:bg-gray-50  disabled:opacity-50 cursor-pointer"
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