import React, { useState } from 'react';

export interface DonutSegment {
  label: string;
  count: number;
  color: string;
  hoverColor?: string;
  bgBadge: string;
  borderBadge: string;
  textBadge: string;
}

interface DonutChartProps {
  title: string;
  subtitle?: string;
  total: number;
  unit?: string;
  segments: DonutSegment[];
  onSegmentClick?: (segment: DonutSegment) => void;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  title,
  subtitle,
  total,
  unit = 'GCN',
  segments,
  onSegmentClick,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // SVG parameters
  const size = 180;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute strokeDasharray offsets
  let accumulatedPercent = 0;
  const computedSegments = segments.map((seg, idx) => {
    const percent = total > 0 ? seg.count / total : 0;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedPercent * circumference;
    accumulatedPercent += percent;

    return {
      ...seg,
      percent: Math.round(percent * 100),
      strokeDasharray,
      strokeDashoffset,
      idx,
    };
  });

  const activeSegment = hoveredIdx !== null ? computedSegments[hoveredIdx] : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div>
        <h3 className="font-bold text-sm text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      {/* Body: Donut and Legend */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-6">
        {/* SVG Donut */}
        <div className="relative w-[180px] h-[180px] shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox={`0 0 ${size} ${size}`}>
            {/* Background Circle */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Segments */}
            {total > 0 &&
              computedSegments.map((seg) => {
                const isHovered = hoveredIdx === seg.idx;
                return (
                  <circle
                    key={seg.label}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={seg.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    strokeLinecap="butt"
                    fill="transparent"
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setHoveredIdx(seg.idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => onSegmentClick && onSegmentClick(seg)}
                  />
                );
              })}
          </svg>

          {/* Central Data Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            {activeSegment ? (
              <>
                <span className="text-xl font-black text-slate-900 leading-none">
                  {activeSegment.count}
                </span>
                <span className="text-[11px] font-bold text-slate-600 mt-1">
                  {activeSegment.percent}%
                </span>
                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[100px]">
                  {activeSegment.label}
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl font-black text-slate-900 leading-none">{total}</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">
                  {unit}
                </span>
                <span className="text-[10px] text-slate-400">Tổng quỹ</span>
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-2.5">
          {computedSegments.map((seg) => {
            const isHovered = hoveredIdx === seg.idx;
            return (
              <div
                key={seg.label}
                onMouseEnter={() => setHoveredIdx(seg.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => onSegmentClick && onSegmentClick(seg)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isHovered
                    ? `${seg.bgBadge} ${seg.borderBadge} shadow-xs scale-[1.02]`
                    : 'bg-slate-50/70 border-slate-100 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: seg.color }}
                  />
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-800 truncate">{seg.label}</div>
                    <div className="text-[11px] text-slate-500">
                      {seg.percent}% tổng quỹ
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${seg.bgBadge} ${seg.textBadge}`}>
                    {seg.count} {unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
