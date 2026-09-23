import React, { useMemo } from 'react';
import { Users, AlertCircle, Clock, CheckCircle2, FileText, ArrowRight, Building2, Landmark, HelpCircle } from 'lucide-react';
import { Asset } from '../../types';

export interface DeptWorkloadRow {
  key: string;
  name: string;
  role: string;
  isCapitalDept: boolean;

  // Phiếu chờ xử lý
  pendingRequestsCount: number;

  // Tổng GCN đang quản lý / xử lý
  totalHolding: number;
  allAssets: Asset[];

  // Dành cho Phòng Nguồn Vốn:
  // 1. Mượn làm hồ sơ vay/thế chấp
  capitalProcessingCount: number;
  capitalProcessingAssets: Asset[];
  // 2. Đã nộp Ngân hàng thế chấp
  capitalMortgagedCount: number;
  capitalMortgagedAssets: Asset[];

  // Dành cho Các Ban Khác:
  // 1. MƯỢN TẠM NỘI BỘ (trích đo, công chứng, quy hoạch, thủ tục...)
  internalBorrowTotal: number;
  onTimeCount: number;
  expiringSoonCount: number; // <= 3 days left
  overdueCount: number;      // overdue
  internalBorrowAssets: Asset[];
  overdueAssets: Asset[];

  // 2. XUẤT BÀN GIAO / XUẤT BÁN / TÁCH SỔ (Không tính quá hạn mượn)
  permanentOutTotal: number;
  permanentOutAssets: Asset[];
}

interface DepartmentWorkloadMatrixProps {
  assets: Asset[];
  pendingTransactions: any[];
  onInspectAssets?: (title: string, subtitle: string, assets: Asset[]) => void;
  isReadOnly?: boolean;
}

export const DepartmentWorkloadMatrix: React.FC<DepartmentWorkloadMatrixProps> = ({
  assets,
  pendingTransactions,
  onInspectAssets,
  isReadOnly = false,
}) => {
  // Aggregate workload and asset custody per department
  const workloadData = useMemo(() => {
    const now = new Date();

    // 4 canonical departments
    const depts = [
      {
        key: 'capital_dept',
        name: 'Phòng Nguồn Vốn',
        role: 'capital_dept',
        isCapitalDept: true,
        matcher: (holder: string, dept: string) => {
          const t = `${holder} ${dept}`.toLowerCase();
          return t.includes('vốn') || t.includes('capital') || t.includes('pnv');
        },
      },
      {
        key: 'project_dept',
        name: 'Ban PTDA & Ban Đối Ngoại',
        role: 'project_dept',
        isCapitalDept: false,
        matcher: (holder: string, dept: string) => {
          const t = `${holder} ${dept}`.toLowerCase();
          return (
            t.includes('dự án') ||
            t.includes('ptda') ||
            t.includes('project') ||
            t.includes('đối ngoại') ||
            t.includes('bđn') ||
            t.includes('nông nghiệp')
          );
        },
      },
      {
        key: 're_dept',
        name: 'Khối Bất Động Sản (SPG)',
        role: 're_dept',
        isCapitalDept: false,
        matcher: (holder: string, dept: string) => {
          const t = `${holder} ${dept}`.toLowerCase();
          return t.includes('spg') || t.includes('bđs') || t.includes('bất động sản') || t.includes('kinh doanh');
        },
      },
      {
        key: 'investor',
        name: 'Chủ Đầu Tư / Nhà Đầu Tư',
        role: 'investor',
        isCapitalDept: false,
        matcher: (holder: string, dept: string) => {
          const t = `${holder} ${dept}`.toLowerCase();
          return t.includes('đầu tư') || t.includes('investor') || t.includes('cđt') || t.includes('chủ');
        },
      },
    ];

    // Build raw state map
    const deptRows: Record<string, DeptWorkloadRow> = {};
    depts.forEach((d) => {
      deptRows[d.key] = {
        key: d.key,
        name: d.name,
        role: d.role,
        isCapitalDept: d.isCapitalDept,
        pendingRequestsCount: 0,
        totalHolding: 0,
        allAssets: [],
        capitalProcessingCount: 0,
        capitalProcessingAssets: [],
        capitalMortgagedCount: 0,
        capitalMortgagedAssets: [],
        internalBorrowTotal: 0,
        onTimeCount: 0,
        expiringSoonCount: 0,
        overdueCount: 0,
        internalBorrowAssets: [],
        overdueAssets: [],
        permanentOutTotal: 0,
        permanentOutAssets: [],
      };
    });

    const otherDept: DeptWorkloadRow = {
      key: 'other',
      name: 'Các Phòng Ban Khác / Vãng Lai',
      role: 'user',
      isCapitalDept: false,
      pendingRequestsCount: 0,
      totalHolding: 0,
      allAssets: [],
      capitalProcessingCount: 0,
      capitalProcessingAssets: [],
      capitalMortgagedCount: 0,
      capitalMortgagedAssets: [],
      internalBorrowTotal: 0,
      onTimeCount: 0,
      expiringSoonCount: 0,
      overdueCount: 0,
      internalBorrowAssets: [],
      overdueAssets: [],
      permanentOutTotal: 0,
      permanentOutAssets: [],
    };

    // Helper: phân loại mục đích mượn/xuất
    // 1. Xuất vĩnh viễn / hoàn tất thủ tục bàn giao / bán / tách:
    // 'chuyển nhượng', 'xuất bán', 'sang tên cho khách', 'tách sổ', 'thu hồi', 'bàn giao'
    const isPermanentOutReason = (purpose: string = '', notes: string = '') => {
      const text = `${purpose} ${notes}`.toLowerCase();
      return (
        text.includes('xuất bán') ||
        text.includes('bán') ||
        text.includes('sang tên') ||
        text.includes('chuyển nhượng') ||
        text.includes('tách sổ') ||
        text.includes('thu hồi') ||
        text.includes('bàn giao') ||
        text.includes('đổi sổ')
      );
    };

    // 1. Xử lý TOÀN BỘ tài sản thế chấp do Phòng Nguồn Vốn phụ trách (ngân hàng)
    // Sổ đã nộp Ngân hàng thế chấp: mortgage_status === 'mortgaged'
    assets.forEach((asset) => {
      if (asset.mortgage_status === 'mortgaged') {
        const capRow = deptRows['capital_dept'];
        capRow.capitalMortgagedCount++;
        capRow.capitalMortgagedAssets.push(asset);
        capRow.totalHolding++;
        capRow.allAssets.push(asset);
      }
    });

    // 2. Xử lý các tài sản đang mượn ra ngoài (custody_status === 'checked_out')
    const checkedOutAssets = assets.filter((a) => a.custody_status === 'checked_out');

    checkedOutAssets.forEach((asset) => {
      const holder = asset.current_holder_dept || '';
      const matched = depts.find((d) => d.matcher(holder, holder));
      const target = matched ? deptRows[matched.key] : otherDept;

      target.allAssets.push(asset);
      target.totalHolding++;

      // Nếu là PHÒNG NGUỒN VỐN:
      if (target.isCapitalDept) {
        // Đây là số sổ PNV đang mượn ra làm hồ sơ thế chấp/giải chấp/thủ tục vay
        target.capitalProcessingCount++;
        target.capitalProcessingAssets.push(asset);
        return;
      }

      // ĐỐI VỚI CÁC BAN KHÁC:
      // Phân tách giữa:
      // A. Xuất bàn giao / Xuất bán / Tách sổ (Không tính đếm ngược hạn trả)
      // B. Mượn tạm nội bộ (Đi trích đo, công chứng, quy hoạch...) -> Có tính đếm hạn
      const isPermOut = isPermanentOutReason(asset.borrow_purpose || '', asset.notes || '');

      if (isPermOut) {
        target.permanentOutTotal++;
        target.permanentOutAssets.push(asset);
      } else {
        // Mượn tạm nội bộ
        target.internalBorrowTotal++;
        target.internalBorrowAssets.push(asset);

        if (asset.expected_return_date) {
          const expected = new Date(asset.expected_return_date);
          const diffDays = Math.ceil((expected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            target.overdueCount++;
            target.overdueAssets.push(asset);
          } else if (diffDays <= 3) {
            target.expiringSoonCount++;
          } else {
            target.onTimeCount++;
          }
        } else {
          // Chưa có ngày hẹn cụ thể -> Tạm tính là đúng hạn
          target.onTimeCount++;
        }
      }
    });

    // 3. Đếm Phiếu Chờ Xử Lý từ pendingTransactions
    (pendingTransactions || []).forEach((tx) => {
      const creatorRole = tx.created_by?.role || '';
      const creatorDept = tx.created_by?.department || '';
      const itemsCount = (tx.items || []).filter((i: any) => i.status === 'pending').length;

      if (itemsCount > 0) {
        const matched = depts.find((d) => d.role === creatorRole || d.matcher(creatorDept, creatorDept));
        if (matched) {
          deptRows[matched.key].pendingRequestsCount += itemsCount;
        } else {
          otherDept.pendingRequestsCount += itemsCount;
        }
      }
    });

    const result = depts.map((d) => deptRows[d.key]);
    if (otherDept.totalHolding > 0 || otherDept.pendingRequestsCount > 0) {
      result.push(otherDept);
    }
    return result;
  }, [assets, pendingTransactions]);

  const totalHoldingAll = workloadData.reduce((sum, d) => sum + d.totalHolding, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-100 text-indigo-800">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Ma Trận Workload &amp; Tình Hình Nắm Giữ GCN Liên Phòng Ban
            </h3>
            <p className="text-xs text-slate-500">
              Theo dõi chuẩn hóa theo mục đích nghiệp vụ: Thế chấp ngân hàng (Nguồn Vốn) và Mượn tạm/Xuất bàn giao (Các Ban)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg">
            {totalHoldingAll} GCN đang quản lý/luân chuyển
          </span>
          {isReadOnly && (
            <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200">
              Chế độ Giám sát (Read-only)
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Đơn Vị / Phòng Ban</th>
              <th className="py-3 px-3 text-center">Phiếu Chờ Xử Lý</th>
              <th className="py-3 px-3 text-center">Tổng GCN Đang Xử Lý</th>
              <th className="py-3 px-4 text-center">Mượn Tạm Nội Bộ</th>
              <th className="py-3 px-4 text-center">Thế Chấp NH / Xuất Bàn Giao</th>
              <th className="py-3 px-4 min-w-[200px]">Trạng Thái &amp; Tiến Độ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {workloadData.map((dept) => {
              // Phân nhánh hiển thị riêng cho PHÒNG NGUỒN VỐN vs CÁC BAN KHÁC
              const isCapital = dept.isCapitalDept;

              return (
                <tr key={dept.key} className="hover:bg-slate-50/60 transition-colors">
                  {/* 1. ĐƠN VỊ / PHÒNG BAN */}
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      {isCapital ? (
                        <Landmark className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span>{dept.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 pl-5">
                      Mã vai trò: <span className="font-mono text-slate-600 font-medium">{dept.role}</span>
                    </div>
                  </td>

                  {/* 2. PHIẾU CHỜ XỬ LÝ (Màu xanh dương) */}
                  <td className="py-3.5 px-3 text-center">
                    {dept.pendingRequestsCount > 0 ? (
                      <span className="inline-flex items-center justify-center font-bold px-2.5 py-1 rounded-lg text-xs bg-blue-50 text-blue-700 border border-blue-200">
                        {dept.pendingRequestsCount} phiếu
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">—</span>
                    )}
                  </td>

                  {/* 3. TỔNG GCN ĐANG NẮM GIỮ / XỬ LÝ */}
                  <td className="py-3.5 px-3 text-center">
                    {dept.totalHolding > 0 ? (
                      <button
                        onClick={() =>
                          onInspectAssets &&
                          onInspectAssets(
                            `GCN đơn vị đang quản lý: ${dept.name}`,
                            `Tổng cộng ${dept.totalHolding} Giấy chứng nhận liên quan`,
                            dept.allAssets
                          )
                        }
                        className="inline-flex items-center justify-center font-bold px-2.5 py-1 rounded-lg text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
                        title="Bấm xem toàn bộ danh sách GCN"
                      >
                        {dept.totalHolding} sổ
                      </button>
                    ) : (
                      <span className="text-slate-400 font-normal">—</span>
                    )}
                  </td>

                  {/* 4. MƯỢN TẠM NỘI BỘ (Sub-badges: Đúng hạn / Sắp hạn / Quá hạn) */}
                  <td className="py-3.5 px-4 text-center">
                    {isCapital ? (
                      // Đối với PNV: Mượn ra làm hồ sơ vay / thủ tục thế chấp
                      dept.capitalProcessingCount > 0 ? (
                        <button
                          onClick={() =>
                            onInspectAssets &&
                            onInspectAssets(
                              'GCN mượn làm thủ tục vay/thế chấp',
                              `Phòng Nguồn Vốn đang mượn ${dept.capitalProcessingCount} GCN ra ngoài kho để làm việc với Ngân hàng`,
                              dept.capitalProcessingAssets
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                          title="Bấm để xem danh sách sổ đang mượn làm thủ tục vay"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>{dept.capitalProcessingCount} sổ làm thủ tục TC</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )
                    ) : (
                      // Đối với các Ban: Mượn tạm đi trích đo, công chứng, pháp lý...
                      dept.internalBorrowTotal > 0 ? (
                        <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                          {/* Đúng hạn */}
                          {dept.onTimeCount > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title="Đúng thời hạn hoàn trả"
                            >
                              {dept.onTimeCount} đúng hạn
                            </span>
                          )}

                          {/* Sắp đến hạn */}
                          {dept.expiringSoonCount > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                              title="Sắp đến hạn hoàn trả trong 3 ngày"
                            >
                              {dept.expiringSoonCount} sắp hạn
                            </span>
                          )}

                          {/* Quá hạn */}
                          {dept.overdueCount > 0 && (
                            <button
                              onClick={() =>
                                onInspectAssets &&
                                onInspectAssets(
                                  `GCN mượn QUÁ HẠN: ${dept.name}`,
                                  `Đang có ${dept.overdueCount} Giấy chứng nhận quá hạn hoàn trả kho`,
                                  dept.overdueAssets
                                )
                              }
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition-colors cursor-pointer"
                              title="Bấm để xem danh sách GCN quá hạn"
                            >
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>{dept.overdueCount} quá hạn!</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )
                    )}
                  </td>

                  {/* 5. THẾ CHẤP NH / XUẤT BÀN GIAO */}
                  <td className="py-3.5 px-4 text-center">
                    {isCapital ? (
                      // Đối với PNV: Số sổ ĐÃ nộp két sắt Ngân hàng thế chấp
                      dept.capitalMortgagedCount > 0 ? (
                        <button
                          onClick={() =>
                            onInspectAssets &&
                            onInspectAssets(
                              'GCN đã nộp Ngân hàng thế chấp',
                              `Tổng cộng ${dept.capitalMortgagedCount} Giấy chứng nhận đang nằm tại các Ngân hàng liên kết`,
                              dept.capitalMortgagedAssets
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                          title="Bấm để xem danh sách sổ đang thế chấp ngân hàng"
                        >
                          <Landmark className="w-3.5 h-3.5 text-blue-600" />
                          <span>{dept.capitalMortgagedCount} sổ đã nộp NH</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )
                    ) : (
                      // Đối với Các Ban: Số sổ đã xuất bàn giao / xuất bán / tách sổ (không phải mượn)
                      dept.permanentOutTotal > 0 ? (
                        <button
                          onClick={() =>
                            onInspectAssets &&
                            onInspectAssets(
                              `GCN xuất bàn giao / bán / tách: ${dept.name}`,
                              `Đang có ${dept.permanentOutTotal} GCN thuộc nhóm xuất bàn giao, xuất bán hoặc tách sổ`,
                              dept.permanentOutAssets
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
                          title="Bấm để xem chi tiết các sổ xuất bán / bàn giao"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                          <span>{dept.permanentOutTotal} sổ xuất bàn giao/bán</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )
                    )}
                  </td>

                  {/* 6. TRẠNG THÁI & TIẾN ĐỘ (Progress bar hoặc Badge tóm tắt trực quan) */}
                  <td className="py-3.5 px-4">
                    {dept.totalHolding === 0 ? (
                      <span className="text-slate-400 text-xs">—</span>
                    ) : isCapital ? (
                      // Trạng thái cho Phòng Nguồn Vốn
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                          <span className="text-blue-700">{dept.capitalMortgagedCount} tại NH</span>
                          {dept.capitalProcessingCount > 0 && (
                            <span className="text-amber-700">{dept.capitalProcessingCount} đang làm thủ tục</span>
                          )}
                        </div>
                        {/* Thanh tỷ lệ thế chấp: Xanh dương (Đã nộp NH) + Vàng (Đang làm hồ sơ) */}
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex border border-slate-200/60 shadow-2xs">
                          <div
                            className="bg-blue-600 h-full transition-all duration-300"
                            style={{
                              width: `${(dept.capitalMortgagedCount / dept.totalHolding) * 100}%`,
                            }}
                            title={`Đã nộp NH: ${dept.capitalMortgagedCount} sổ`}
                          />
                          <div
                            className="bg-amber-400 h-full transition-all duration-300"
                            style={{
                              width: `${(dept.capitalProcessingCount / dept.totalHolding) * 100}%`,
                            }}
                            title={`Đang làm hồ sơ thế chấp: ${dept.capitalProcessingCount} sổ`}
                          />
                        </div>
                      </div>
                    ) : (
                      // Trạng thái cho Các Ban Khác
                      <div className="space-y-1.5">
                        {dept.internalBorrowTotal > 0 ? (
                          <>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                              <span className="text-emerald-700">{dept.onTimeCount} đúng hạn</span>
                              {dept.expiringSoonCount > 0 && (
                                <span className="text-amber-700">{dept.expiringSoonCount} sắp hạn</span>
                              )}
                              {dept.overdueCount > 0 && (
                                <span className="text-rose-700 font-bold">{dept.overdueCount} quá hạn</span>
                              )}
                            </div>

                            {/* Tri-color Progress Bar cho mượn tạm */}
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex border border-slate-200/60 shadow-2xs">
                              {dept.onTimeCount > 0 && (
                                <div
                                  className="bg-emerald-500 h-full transition-all duration-300"
                                  style={{
                                    width: `${(dept.onTimeCount / dept.internalBorrowTotal) * 100}%`,
                                  }}
                                  title={`Đúng hạn: ${dept.onTimeCount} GCN`}
                                />
                              )}
                              {dept.expiringSoonCount > 0 && (
                                <div
                                  className="bg-amber-400 h-full transition-all duration-300"
                                  style={{
                                    width: `${(dept.expiringSoonCount / dept.internalBorrowTotal) * 100}%`,
                                  }}
                                  title={`Sắp đến hạn: ${dept.expiringSoonCount} GCN`}
                                />
                              )}
                              {dept.overdueCount > 0 && (
                                <div
                                  className="bg-rose-500 h-full transition-all duration-300"
                                  style={{
                                    width: `${(dept.overdueCount / dept.internalBorrowTotal) * 100}%`,
                                  }}
                                  title={`Quá hạn: ${dept.overdueCount} GCN`}
                                />
                              )}
                            </div>
                          </>
                        ) : dept.permanentOutTotal > 0 ? (
                          <div className="flex items-center gap-1.5 text-xs text-purple-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                            <span>100% xuất bàn giao / bán</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};