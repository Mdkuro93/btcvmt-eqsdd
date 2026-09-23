import React from 'react';

interface StorageProgressBarProps {
  inStock: number;
  total: number;
  className?: string;
}

export const StorageProgressBar: React.FC<StorageProgressBarProps> = ({
  inStock,
  total,
  className = '',
}) => {
  const percent = total > 0 ? Math.min(Math.round((inStock / total) * 100), 100) : 0;

  // Determine color theme based on safety levels
  // >= 70%: An toàn (Xanh lá)
  // 40% - 69%: Trung bình (Vàng cam)
  // < 40%: Thấp/Cần lưu ý (Cam đỏ)
  let barGradient = 'from-emerald-500 to-teal-500';
  let badgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  let indicatorColor = 'bg-emerald-500';

  if (percent < 40) {
    barGradient = 'from-rose-500 to-amber-500';
    badgeColor = 'text-rose-700 bg-rose-50 border-rose-200';
    indicatorColor = 'bg-rose-500';
  } else if (percent < 70) {
    barGradient = 'from-amber-500 to-emerald-500';
    badgeColor = 'text-amber-700 bg-amber-50 border-amber-200';
    indicatorColor = 'bg-amber-500';
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Header labels */}
      <div className="flex justify-between items-center text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${indicatorColor}`} />
          <span className={`font-bold px-1.5 py-0.2 rounded border text-[10px] ${badgeColor}`}>
            {percent}% tại kho
          </span>
        </div>
        <span className="text-slate-500 font-medium">
          <strong className="text-slate-800">{inStock}</strong>/{total} GCN
        </span>
      </div>

      {/* Progress track */}
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-200/60 shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${barGradient}`}
          style={{ width: `${percent}%` }}
          title={`Lưu kho: ${percent}% (${inStock}/${total} GCN)`}
        />
      </div>
    </div>
  );
};
