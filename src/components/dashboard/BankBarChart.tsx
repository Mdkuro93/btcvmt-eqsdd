import React, { useState } from 'react';
import { Landmark, ArrowUpDown } from 'lucide-react';

export interface BankBarItem {
  bankName: string;
  count: number;
  totalValue: number;
  percentage: number;
}

interface BankBarChartProps {
  data: BankBarItem[];
  totalMortgaged: number;
  onBarClick?: (item: BankBarItem) => void;
}

export const BankBarChart: React.FC<BankBarChartProps> = ({
  data,
  totalMortgaged,
  onBarClick,
}) => {
  const [metric, setMetric] = useState<'count' | 'value'>('count');
  const [hoveredBank, setHoveredBank] = useState<string | null>(null);

  // Top banks (take up to 7, aggregate others if needed)
  const sortedData = [...data].sort((a, b) => {
    return metric === 'count' ? b.count - a.count : b.totalValue - a.totalValue;
  });

  const maxVal = Math.max(
    ...sortedData.map((d) => (metric === 'count' ? d.count : d.totalValue)),
    1
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
      {/* Header with Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
            <Landmark className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">Biểu Đồ Thế Chấp Ngân Hàng</h3>
            <p className="text-xs text-slate-500">So sánh quy mô tài sản thế chấp giữa các ngân hàng</p>
          </div>
        </div>

        {/* Metric Switch */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setMetric('count')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
              metric === 'count'
                ? 'bg-white text-purple-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Số GCN
          </button>
          <button
            onClick={() => setMetric('value')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
              metric === 'value'
                ? 'bg-white text-purple-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Giá trị định giá
          </button>
        </div>
      </div>

      {/* Chart List */}
      <div className="mt-4 space-y-3.5 flex-1">
        {sortedData.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Chưa có Giấy chứng nhận nào đang thế chấp ngân hàng.
          </div>
        ) : (
          sortedData.slice(0, 7).map((item) => {
            const currentVal = metric === 'count' ? item.count : item.totalValue;
            const barWidthPercent = Math.max(Math.round((currentVal / maxVal) * 100), 4);
            const isHovered = hoveredBank === item.bankName;

            return (
              <div
                key={item.bankName}
                onMouseEnter={() => setHoveredBank(item.bankName)}
                onMouseLeave={() => setHoveredBank(null)}
                onClick={() => onBarClick && onBarClick(item)}
                className={`group cursor-pointer p-2 rounded-xl transition-all ${
                  isHovered ? 'bg-purple-50/70 scale-[1.01]' : 'hover:bg-slate-50'
                }`}
              >
                {/* Bank Name & Value Labels */}
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 truncate max-w-[200px] sm:max-w-[240px]">
                      {item.bankName}
                    </span>
                    <span className="text-[11px] text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                      {item.percentage}%
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    {metric === 'count' ? (
                      <span className="font-bold text-slate-800">{item.count} GCN</span>
                    ) : (
                      <span className="font-bold font-mono text-emerald-700">
                        {item.totalValue > 0
                          ? `${(item.totalValue / 1_000_000_000).toLocaleString('vi-VN', {
                              maximumFractionDigits: 1,
                            })} tỷ đ`
                          : 'Chưa có giá trị'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Horizontal Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/60">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isHovered
                        ? 'bg-purple-600 shadow-sm'
                        : 'bg-gradient-to-r from-purple-500 to-indigo-600'
                    }`}
                    style={{ width: `${barWidthPercent}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Tổng cộng: <strong className="text-slate-800">{totalMortgaged}</strong> GCN đang thế chấp</span>
        <span className="text-purple-600 font-semibold">Bấm thanh để xem danh sách chi tiết</span>
      </div>
    </div>
  );
};
