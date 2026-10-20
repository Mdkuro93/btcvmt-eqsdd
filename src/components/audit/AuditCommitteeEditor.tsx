import React from 'react';
import { Users, Plus, Trash2, RotateCcw, CheckSquare, Square } from 'lucide-react';

export interface CommitteeMember {
  id: string;
  fullName: string;
  position: string;   // Chức vụ thực tế (ví dụ: Quản lý kho, Chuyên viên QLTS, Thủ kho)
  roleLabel: string;  // Vai trò hội đồng (Trưởng ban, Thành viên giám sát, Thành viên phụ trách...)
  isSigner: boolean;  // Có ký tên ở phần cuối biên bản hay không
  signTitle: string;  // Tiêu đề chức danh ký tên (ví dụ: TRƯỞNG BAN KIỂM KÊ)
}

interface Props {
  committee: CommitteeMember[];
  onUpdateMember: (id: string, field: keyof CommitteeMember, value: any) => void;
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
  onResetCommittee: () => void;
}

export const AuditCommitteeEditor: React.FC<Props> = ({
  committee,
  onUpdateMember,
  onAddMember,
  onRemoveMember,
  onResetCommittee,
}) => {
  return (
    <div className="bg-slate-50 border-b border-slate-300 px-5 py-4 print:hidden animate-in fade-in duration-200 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-blue-600" />
            Cấu hình thành viên Hội đồng kiểm kê (Tùy chỉnh linh hoạt)
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Thông tin sẽ tự động hiển thị tại Mục I (Thành phần) và Mục IV (Phần Ký tên xác nhận) trên cả bản xem trước và bản in.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetCommittee}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-md transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 mr-1 text-slate-500" /> Đặt lại mặc định
          </button>
          <button
            type="button"
            onClick={onAddMember}
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3 h-3 mr-1" /> Thêm thành viên
          </button>
        </div>
      </div>

      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
        {committee.map((member, index) => (
          <div
            key={member.id}
            className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
              <div className="sm:col-span-1 font-bold text-slate-400 text-center">
                #{index + 1}
              </div>

              {/* Họ và tên */}
              <div className="sm:col-span-4 space-y-0.5">
                <label className="text-[10px] uppercase font-semibold text-slate-500 block">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={member.fullName}
                  onChange={(e) => onUpdateMember(member.id, 'fullName', e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full px-2.5 py-1 border border-slate-300 rounded font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs bg-slate-50/50"
                />
              </div>

              {/* Chức vụ */}
              <div className="sm:col-span-3 space-y-0.5">
                <label className="text-[10px] uppercase font-semibold text-slate-500 block">
                  Chức vụ
                </label>
                <input
                  type="text"
                  value={member.position}
                  onChange={(e) => onUpdateMember(member.id, 'position', e.target.value)}
                  placeholder="Ví dụ: Quản lý kho"
                  className="w-full px-2.5 py-1 border border-slate-300 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                />
              </div>

              {/* Vai trò hội đồng */}
              <div className="sm:col-span-3 space-y-0.5">
                <label className="text-[10px] uppercase font-semibold text-slate-500 block">
                  Vai trò kiểm kê
                </label>
                <input
                  type="text"
                  value={member.roleLabel}
                  onChange={(e) => onUpdateMember(member.id, 'roleLabel', e.target.value)}
                  placeholder="Ví dụ: Trưởng ban kiểm kê"
                  className="w-full px-2.5 py-1 border border-slate-300 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                />
              </div>

              {/* Xóa */}
              <div className="sm:col-span-1 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onRemoveMember(member.id)}
                  disabled={committee.length <= 1}
                  className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 transition-colors cursor-pointer rounded"
                  title="Xóa thành viên này"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Dòng 2: Cấu hình ký tên */}
            <div className="flex items-center gap-4 pt-1.5 border-t border-slate-100 text-[11px] text-slate-600">
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium select-none">
                <input
                  type="checkbox"
                  checked={member.isSigner}
                  onChange={(e) => onUpdateMember(member.id, 'isSigner', e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span>Có ký tên ở cuối biên bản</span>
              </label>

              {member.isSigner && (
                <div className="inline-flex items-center gap-1.5 flex-1 max-w-sm">
                  <span className="text-slate-400 shrink-0">Tiêu đề ký:</span>
                  <input
                    type="text"
                    value={member.signTitle}
                    onChange={(e) => onUpdateMember(member.id, 'signTitle', e.target.value)}
                    placeholder="TRƯỞNG BAN KIỂM KÊ / THỦ KHO..."
                    className="w-full px-2 py-0.5 text-[11px] font-bold uppercase border border-slate-200 rounded text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
