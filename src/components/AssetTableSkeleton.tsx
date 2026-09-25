import React from 'react';

interface AssetTableSkeletonProps {
  rowCount?: number;
  tableDensity?: 'normal' | 'compact';
}

export const AssetTableSkeleton: React.FC<AssetTableSkeletonProps> = ({
  rowCount = 8,
  tableDensity = 'normal',
}) => {
  const rowPadding = tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3';

  return (
    <div className="overflow-x-auto relative animate-pulse">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
            <th className={`${rowPadding} w-10 min-w-[40px] text-center whitespace-nowrap`}>
              <div className="w-4 h-4 bg-slate-200 rounded mx-auto" />
            </th>
            <th className={`${rowPadding} min-w-[170px] whitespace-nowrap`}>Số GCN & Mã TSĐB</th>
            <th className={`${rowPadding} min-w-[150px] whitespace-nowrap`}>Dự Án / Kho</th>
            <th className={`${rowPadding} min-w-[140px] whitespace-nowrap`}>Dự Án KD / Lô KD</th>
            <th className={`${rowPadding} min-w-[140px] whitespace-nowrap`}>Mã Lô PL & Thửa/Tờ</th>
            <th className={`${rowPadding} min-w-[100px] text-right whitespace-nowrap`}>Diện tích</th>
            <th className={`${rowPadding} min-w-[160px] whitespace-nowrap`}>Chủ Sở Hữu (CĐT/NĐT)</th>
            <th className={`${rowPadding} min-w-[140px] whitespace-nowrap`}>Trạng Thái</th>
            <th className={`${rowPadding} min-w-[150px] whitespace-nowrap`}>Thế Chấp & Ngân Hàng</th>
            <th className={`${rowPadding} w-[80px] min-w-[80px] max-w-[80px] text-center sticky right-0 z-20 !bg-slate-100 text-slate-700 font-semibold border-l border-slate-200 uppercase tracking-wider text-xs whitespace-nowrap shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
              Thao tác
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: rowCount }).map((_, idx) => (
            <tr key={idx} className="bg-white">
              {/* Checkbox */}
              <td className={`${rowPadding} w-10 min-w-[40px] text-center`}>
                <div className="w-4 h-4 bg-slate-200 rounded mx-auto" />
              </td>

              {/* Số GCN & Mã TSĐB */}
              <td className={`${rowPadding} min-w-[170px]`}>
                <div className="space-y-1.5">
                  <div className="h-4 w-28 bg-slate-200 rounded" />
                  <div className="h-3 w-36 bg-slate-100 rounded" />
                </div>
              </td>

              {/* Dự Án / Kho */}
              <td className={`${rowPadding} min-w-[150px]`}>
                <div className="space-y-1.5">
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                </div>
              </td>

              {/* Dự Án KD / Lô KD */}
              <td className={`${rowPadding} min-w-[140px]`}>
                <div className="space-y-1.5">
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                  <div className="h-3 w-16 bg-slate-100 rounded" />
                </div>
              </td>

              {/* Mã Lô PL & Thửa/Tờ */}
              <td className={`${rowPadding} min-w-[140px]`}>
                <div className="space-y-1.5">
                  <div className="h-4 w-20 bg-slate-200 rounded" />
                  <div className="h-3 w-16 bg-slate-100 rounded" />
                </div>
              </td>

              {/* Diện tích */}
              <td className={`${rowPadding} min-w-[100px] text-right`}>
                <div className="h-4 w-14 bg-slate-200 rounded ml-auto" />
              </td>

              {/* Chủ Sở Hữu */}
              <td className={`${rowPadding} min-w-[160px]`}>
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                </div>
              </td>

              {/* Trạng Thái */}
              <td className={`${rowPadding} min-w-[140px]`}>
                <div className="flex gap-1">
                  <div className="h-5 w-16 bg-slate-200 rounded" />
                  <div className="h-5 w-14 bg-slate-100 rounded" />
                </div>
              </td>

              {/* Thế Chấp & Ngân Hàng */}
              <td className={`${rowPadding} min-w-[150px]`}>
                <div className="h-4 w-24 bg-slate-200 rounded" />
              </td>

              {/* Thao tác (Sticky) */}
              <td className={`${rowPadding} w-[80px] min-w-[80px] max-w-[80px] text-center sticky right-0 z-10 !bg-white border-l border-slate-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap`}>
                <div className="flex items-center justify-center gap-1.5">
                  <div className="w-6 h-6 bg-slate-200 rounded-lg" />
                  <div className="w-6 h-6 bg-slate-200 rounded-lg" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
