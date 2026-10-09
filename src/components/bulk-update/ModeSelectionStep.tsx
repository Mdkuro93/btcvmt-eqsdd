import React from 'react';
import { FilePlus, FileText, Landmark, Building2, FileEdit, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { BulkUpdateMode } from '../../api/bulkUpdate';
import { BULK_MODES_CONFIG } from '../../utils/bulkUpdateExcel';

interface Props {
  selectedMode: BulkUpdateMode;
  onSelectMode: (mode: BulkUpdateMode) => void;
  onNext: () => void;
}

export const ModeSelectionStep: React.FC<Props> = ({
  selectedMode,
  onSelectMode,
  onNext,
}) => {
  const modes: {
    id: BulkUpdateMode;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    bgHover: string;
  }[] = [
    {
      id: 'create',
      icon: FilePlus,
      accentColor: 'text-teal-600 bg-teal-50 border-teal-200',
      bgHover: 'hover:border-teal-300',
    },
    {
      id: 'info',
      icon: FileText,
      accentColor: 'text-blue-600 bg-blue-50 border-blue-200',
      bgHover: 'hover:border-blue-300',
    },
    {
      id: 'mortgage',
      icon: Landmark,
      accentColor: 'text-purple-600 bg-purple-50 border-purple-200',
      bgHover: 'hover:border-purple-300',
    },
    {
      id: 'owner',
      icon: Building2,
      accentColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      bgHover: 'hover:border-indigo-300',
    },
    {
      id: 'certificate',
      icon: FileEdit,
      accentColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      bgHover: 'hover:border-emerald-300',
    },
    {
      id: 'reissue',
      icon: RefreshCw,
      accentColor: 'text-amber-600 bg-amber-50 border-amber-200',
      bgHover: 'hover:border-amber-300',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-1">
          Bước 1: Chọn loại cập nhật hàng loạt
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Vui lòng chọn 1 trong 6 chế độ xử lý phù hợp với nghiệp vụ. Mỗi chế độ có bộ cột Excel và quy tắc kiểm soát riêng biệt trên máy chủ.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modes.map((item) => {
            const config = BULK_MODES_CONFIG[item.id];
            const isSelected = selectedMode === item.id;
            const Icon = item.icon;

            return (
              <div
                key={item.id}
                onClick={() => onSelectMode(item.id)}
                className={`relative flex flex-col justify-between p-5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'border-[#1E3A8A] bg-blue-50/50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`p-2.5 rounded-lg border ${item.accentColor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{config.title}</h3>
                      <span className="text-[11px] font-mono font-medium text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                        chế độ: {config.key}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed mb-4">
                    {config.shortDesc}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="text-gray-700 font-medium">
                    Bắt buộc: {config.requiredKeys.length} cột
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => onSelectMode(item.id)}
                      className="text-[#1E3A8A] focus:ring-blue-500 h-4 w-4"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Khung nhắc nổi bật cho chế độ reissue (Cấp đổi) */}
        {selectedMode === 'reissue' && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <p className="font-bold mb-1 text-amber-950">
                Lưu ý quan trọng đối với Cấp đổi hàng loạt:
              </p>
              <p>
                {BULK_MODES_CONFIG.reissue.warningNotice}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onNext}
            className="px-6 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center space-x-2 transition-colors"
          >
            <span>Tiếp tục: Xem & Tải mẫu</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
