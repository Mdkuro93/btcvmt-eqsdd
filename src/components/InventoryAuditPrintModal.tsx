import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { updateAuditPrintInfo } from '../api/inventoryAudits';
import { InventoryAudit, InventoryAuditItem } from '../types';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  X,
  Printer,
  FileText,
  Users,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  RotateCcw,
} from 'lucide-react';
import { AuditCommitteeEditor, CommitteeMember } from './audit/AuditCommitteeEditor';
import { AuditPrintAppendix } from './audit/AuditPrintAppendix';

export type { CommitteeMember };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  audit: InventoryAudit | null;
  /** Gọi sau khi lưu DB thành công để trang cha cập nhật bản sao đợt kiểm kê đang mở */
  onPrintInfoSaved?: (patch: Partial<InventoryAudit>) => void;
}

export const InventoryAuditPrintModal: React.FC<Props> = ({
  isOpen,
  onClose,
  audit,
  onPrintInfoSaved,
}) => {
  if (!isOpen || !audit) return null;

  const warehouseName = audit.warehouses?.name || audit.warehouse?.name || 'Kho lưu trữ GCN';
  const warehouseCode = audit.warehouses?.code || audit.warehouse?.code || 'KHO-01';
  const performerName =
    (audit.performer as any)?.full_name ||
    (audit.profiles as any)?.full_name ||
    'Quản lý kho phụ trách';

  const startedDate = audit.started_at ? new Date(audit.started_at) : new Date();
  const completedDate = audit.completed_at ? new Date(audit.completed_at) : new Date();

  // Storage key for caching committee personnel and custom notes for this specific audit
  const storageKey = `audit_committee_v3_${audit.id}`;
  const notesStorageKey = `audit_print_notes_v3_${audit.id}`;

  const defaultCommittee: CommitteeMember[] = useMemo(() => [
    {
      id: 'member-1',
      fullName: performerName,
      position: 'Quản lý kho lưu trữ',
      roleLabel: 'Trưởng ban kiểm kê',
      isSigner: true,
      signTitle: 'TRƯỞNG BAN KIỂM KÊ',
    },
    {
      id: 'member-2',
      fullName: 'Đại diện Ban Quản lý Tài chính',
      position: 'Chuyên viên Quản lý Tài sản',
      roleLabel: 'Thành viên giám sát',
      isSigner: true,
      signTitle: 'ĐẠI DIỆN BAN QUẢN LÝ TÀI CHÍNH',
    },
    {
      id: 'member-3',
      fullName: 'Thủ kho lưu trữ GCN',
      position: 'Thủ kho',
      roleLabel: 'Thành viên bảo quản hồ sơ',
      isSigner: true,
      signTitle: 'THỦ KHO LƯU TRỮ',
    },
  ], [performerName]);

  const [committee, setCommittee] = useState<CommitteeMember[]>(() => {
    if (Array.isArray(audit.print_committee) && audit.print_committee.length > 0) {
      return audit.print_committee as CommitteeMember[];
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return defaultCommittee;
  });

  const [showCommitteeEditor, setShowCommitteeEditor] = useState<boolean>(false);
  const [includeAppendix, setIncludeAppendix] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'discrepancy' | 'matched'>('all');

  // Mục III: Nội dung kết luận và kiến nghị (cho phép chỉnh sửa linh hoạt)
  const defaultPhysicalNotes = 'Đảm bảo điều kiện vật lý, khô ráo, phòng cháy chữa cháy an toàn. Các tem niêm phong và khóa bảo quản nguyên vẹn.';
  const cleanAuditNotes = (audit.notes || '').replace(/\[ĐÃ LƯU TRỮ\]|\[ARCHIVED\]/g, '').trim(); // không in thẻ lưu trữ vào biên bản
  const defaultAdditionalNotes = cleanAuditNotes || 'Hội đồng kiểm kê xác nhận số liệu thực tế khớp đúng với hồ sơ theo dõi tại thời điểm lập biên bản.';

  const [physicalConditionNotes, setPhysicalConditionNotes] = useState<string>(() => {
    if (typeof audit.print_physical_notes === 'string') return audit.print_physical_notes;
    try {
      const saved = localStorage.getItem(`${notesStorageKey}_physical`);
      if (saved !== null) return saved;
    } catch {}
    return defaultPhysicalNotes;
  });

  const [additionalNotes, setAdditionalNotes] = useState<string>(() => {
    if (typeof audit.print_additional_notes === 'string') return audit.print_additional_notes;
    try {
      const saved = localStorage.getItem(`${notesStorageKey}_additional`);
      if (saved !== null) return saved;
    } catch {}
    return defaultAdditionalNotes;
  });

  // Sync default committee if performer changes and no saved custom
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const hasDb = Array.isArray(audit.print_committee) && audit.print_committee.length > 0;
      if (!saved && !hasDb) {
        setCommittee(defaultCommittee);
      }
    } catch {
      setCommittee(defaultCommittee);
    }
  }, [defaultCommittee, storageKey]);

  // Lưu lên DB (gộp thay đổi, chờ 800ms); lỗi quyền thì chỉ cảnh báo 1 lần, nội dung vẫn giữ tạm trên máy này.
  const pendingPatch = useRef<Record<string, any>>({});
  const saveTimer = useRef<number | undefined>(undefined);
  const warnedRef = useRef(false);

  const flushPrintInfo = async () => {
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    const patch = pendingPatch.current;
    pendingPatch.current = {};
    if (Object.keys(patch).length === 0) return;
    try {
      await updateAuditPrintInfo(audit.id, patch);
      onPrintInfoSaved?.(patch as Partial<InventoryAudit>);
    } catch (err: any) {
      if (!warnedRef.current) {
        warnedRef.current = true;
        toast.error((err?.message || 'Không lưu được lên hệ thống.') + ' Nội dung chỉ được giữ tạm trên máy này.');
      }
    }
  };

  const queuePrintInfoSave = (patch: Record<string, any>) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushPrintInfo(); }, 800);
  };

  const handleClose = () => {
    void flushPrintInfo();
    onClose();
  };

  const handleSaveCommittee = (updated: CommitteeMember[]) => {
    queuePrintInfoSave({ print_committee: updated });
    setCommittee(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.warn('Lỗi lưu hội đồng kiểm kê:', err);
    }
  };

  const handleResetCommittee = () => {
    queuePrintInfoSave({ print_committee: null });
    setCommittee(defaultCommittee);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  const handleAddMember = () => {
    const newMember: CommitteeMember = {
      id: `member-${Date.now()}`,
      fullName: '',
      position: 'Cán bộ giám sát',
      roleLabel: 'Thành viên hội đồng',
      isSigner: true,
      signTitle: 'THÀNH VIÊN HỘI ĐỒNG',
    };
    handleSaveCommittee([...committee, newMember]);
  };

  const handleUpdateMember = (id: string, field: keyof CommitteeMember, value: any) => {
    const updated = committee.map((m) => (m.id === id ? { ...m, [field]: value } : m));
    handleSaveCommittee(updated);
  };

  const handleRemoveMember = (id: string) => {
    if (committee.length <= 1) return;
    const updated = committee.filter((m) => m.id !== id);
    handleSaveCommittee(updated);
  };

  const handlePhysicalNotesChange = (val: string) => {
    queuePrintInfoSave({ print_physical_notes: val });
    setPhysicalConditionNotes(val);
    try {
      localStorage.setItem(`${notesStorageKey}_physical`, val);
    } catch {}
  };

  const handleAdditionalNotesChange = (val: string) => {
    queuePrintInfoSave({ print_additional_notes: val });
    setAdditionalNotes(val);
    try {
      localStorage.setItem(`${notesStorageKey}_additional`, val);
    } catch {}
  };

  const handleResetNotes = () => {
    queuePrintInfoSave({ print_physical_notes: null, print_additional_notes: null });
    setPhysicalConditionNotes(defaultPhysicalNotes);
    setAdditionalNotes(defaultAdditionalNotes);
    try {
      localStorage.removeItem(`${notesStorageKey}_physical`);
      localStorage.removeItem(`${notesStorageKey}_additional`);
    } catch {}
  };

  const items: InventoryAuditItem[] = audit.items || [];
  const matchedItems = items.filter((i) => i.finding_status === 'matched');
  const misplacedItems = items.filter((i) => i.finding_status === 'misplaced');
  const missingItems = items.filter((i) => i.finding_status === 'missing');
  const surplusItems = items.filter((i) => i.finding_status === 'surplus');
  const pendingItems = items.filter((i) => i.finding_status === 'pending');

  const discrepancyItems = items.filter(
    (i) => i.finding_status === 'missing' || i.finding_status === 'misplaced' || i.finding_status === 'surplus'
  );

  const displayedAppendixItems = useMemo(() => {
    if (filterMode === 'discrepancy') return discrepancyItems;
    if (filterMode === 'matched') return matchedItems;
    return items;
  }, [items, discrepancyItems, matchedItems, filterMode]);

  const handlePrint = () => {
    window.print();
  };

  const signerMembers = committee.filter((m) => m.isSigner);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:p-0 print:bg-white print:static print:overflow-visible">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-gray-200 flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none">
        
        {/* Modal Action Bar (Ẩn khi in ấn) */}
        <div className="px-5 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight">Xem Trước &amp; In Biên Bản Kiểm Kê A4</h3>
              <p className="text-[11px] text-slate-400">
                Kho: <span className="font-semibold text-slate-200">{warehouseName}</span> · Mã số: <span className="font-mono text-slate-200">BBKK-{warehouseCode}-{format(startedDate, 'yyyyMMdd')}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowCommitteeEditor(!showCommitteeEditor)}
              className={`inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                showCommitteeEditor
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              <span>Hội đồng kiểm kê ({committee.length})</span>
              {showCommitteeEditor ? (
                <ChevronUp className="w-3.5 h-3.5 ml-1 text-slate-300" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 ml-1 text-slate-300" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIncludeAppendix(!includeAppendix)}
              className={`inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                includeAppendix
                  ? 'bg-emerald-800/80 text-emerald-200 border-emerald-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
              title="Bật/tắt in bảng phụ lục chi tiết danh sách từng GCN"
            >
              <Check className={`w-3.5 h-3.5 mr-1 ${includeAppendix ? 'opacity-100' : 'opacity-0'}`} />
              <span>Kèm Phụ Lục Chi Tiết ({items.length})</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 mr-1.5" /> In Biên Bản (A4)
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Quản lý / Chỉnh sửa Thành phần Hội đồng Kiểm Kê */}
        {showCommitteeEditor && (
          <AuditCommitteeEditor
            committee={committee}
            onUpdateMember={handleUpdateMember}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onResetCommittee={handleResetCommittee}
          />
        )}

        {/* Printable Paper Area (Tiêu chuẩn A4: font Times New Roman / Arial sắc nét, căn lề chuẩn) */}
        <div
          id="printable-audit-document"
          className="p-8 sm:p-12 overflow-y-auto print:overflow-visible print:p-0 bg-white text-gray-900 leading-normal text-sm"
          style={{
            fontFamily: "'Times New Roman', 'Arial', sans-serif",
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          {/* CSS nhúng trực tiếp cho in ấn để chuẩn A4, ngắt trang và không mất nét */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 15mm 15mm 15mm 15mm;
              }
              body {
                background: white !important;
                color: #000 !important;
                font-family: 'Times New Roman', 'Arial', sans-serif !important;
                font-size: 11pt !important;
                line-height: 1.4 !important;
              }
              .page-break-before {
                page-break-before: always !important;
                break-before: page !important;
              }
              .avoid-break-inside {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              table {
                border-collapse: collapse !important;
                width: 100% !important;
              }
              th, td {
                border: 1px solid #000 !important;
              }
            }
          ` }} />

          {/* ========================================================================= */}
          {/* PHẦN 1: BIÊN BẢN CHÍNH (TRANG 1) */}
          {/* ========================================================================= */}
          <div>
            {/* Header Quốc hiệu - Tiêu ngữ (Góc trái: TẬP ĐOÀN SUNGROUP, Tên kho, Số biên bản) */}
            <div className="grid grid-cols-12 gap-4 pb-4 border-b border-gray-400">
              <div className="col-span-6 text-left">
                <p className="font-bold text-[13px] uppercase tracking-wider text-gray-950">
                  TẬP ĐOÀN SUNGROUP
                </p>
                <p className="font-bold text-[11px] text-gray-800 uppercase mt-0.5">
                  KHO: {warehouseName}
                </p>
                <p className="text-[11px] text-gray-600 italic mt-0.5 font-mono">
                  Số: BBKK-{warehouseCode}-{format(startedDate, 'yyyyMMdd')}
                </p>
              </div>

              <div className="col-span-6 text-center">
                <p className="font-bold text-[12px] uppercase text-gray-950">
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </p>
                <p className="font-bold text-[11px] underline pb-1 text-gray-900">
                  Độc lập - Tự do - Hạnh phúc
                </p>
                <p className="text-[11px] italic text-gray-700 pt-1">
                  Ngày {format(completedDate, 'dd')} tháng {format(completedDate, 'MM')} năm {format(completedDate, 'yyyy')}
                </p>
              </div>
            </div>

            {/* Tiêu đề biên bản */}
            <div className="text-center py-5">
              <h1 className="text-[18px] md:text-[20px] font-bold uppercase tracking-wide text-gray-950">
                BIÊN BẢN KIỂM KÊ HIỆN TRẠNG KHO GCN QUYỀN SỬ DỤNG ĐẤT
              </h1>
              <p className="text-[12px] text-gray-700 italic mt-1">
                (Địa điểm lưu kho: <strong className="font-semibold text-gray-900">{warehouseName}</strong>)
              </p>
            </div>

            {/* Thời gian & Địa điểm */}
            <div className="space-y-2 mb-4 text-[13px]">
              <p className="text-justify indent-6">
                Hôm nay, vào hồi {format(startedDate, 'HH')} giờ {format(startedDate, 'mm')} phút, ngày{' '}
                {format(startedDate, 'dd/MM/yyyy', { locale: vi })}, Hội đồng kiểm kê đã tiến hành kiểm kê thực tế
                hiện trạng bảo quản và lưu trữ Giấy chứng nhận quyền sử dụng đất (GCN) cùng các hồ sơ tài sản đảm bảo
                tại kho lưu trữ: <strong className="font-bold">{warehouseName}</strong>.
              </p>
            </div>

            {/* Mục I: Thành phần hội đồng kiểm kê */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-bold text-[13px] uppercase">I. THÀNH PHẦN HỘI ĐỒNG KIỂM KÊ:</p>
                <button
                  type="button"
                  onClick={() => setShowCommitteeEditor(true)}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 print:hidden cursor-pointer"
                  title="Mở bảng chỉnh sửa thành phần hội đồng"
                >
                  <Edit3 className="w-3 h-3" /> Chỉnh sửa thành phần
                </button>
              </div>

              <div className="pl-4 space-y-1 text-[13px]">
                {committee.map((member, idx) => (
                  <p key={member.id} className="leading-snug">
                    {idx + 1}. Ông/Bà: <strong className="font-bold text-gray-950">{member.fullName || '(Chưa điền tên)'}</strong>
                    {member.position && <span> - Chức vụ: {member.position}</span>}
                    {member.roleLabel && (
                      <span className="italic text-gray-700"> ({member.roleLabel})</span>
                    )}
                  </p>
                ))}
              </div>
            </div>

            {/* Mục II: Kết quả đối soát tổng hợp */}
            <div className="mb-5">
              <p className="font-bold text-[13px] uppercase mb-1.5">II. KẾT QUẢ ĐỐI SOÁT HIỆN TRẠNG LƯU KHO:</p>
              <table className="w-full border-collapse border border-gray-700 text-[12px]">
                <thead>
                  <tr className="bg-gray-100 text-gray-900">
                    <th className="border border-gray-600 p-2 text-center w-12 font-bold">STT</th>
                    <th className="border border-gray-600 p-2 text-left font-bold">Nội dung đối soát kiểm kê</th>
                    <th className="border border-gray-600 p-2 text-center w-32 font-bold">Số lượng (GCN)</th>
                    <th className="border border-gray-600 p-2 text-left font-bold">Ghi chú đối soát</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-500 p-1.5 text-center font-semibold">1</td>
                    <td className="border border-gray-500 p-1.5">Tổng số lượng GCN trên sổ sách hệ thống dự kiến</td>
                    <td className="border border-gray-500 p-1.5 text-center font-bold text-[13px]">{audit.total_expected}</td>
                    <td className="border border-gray-500 p-1.5 text-gray-700">Dữ liệu kết xuất từ hệ thống quản lý</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-500 p-1.5 text-center font-semibold">2</td>
                    <td className="border border-gray-500 p-1.5">Số lượng GCN tìm thấy đúng vị trí lưu trữ</td>
                    <td className="border border-gray-500 p-1.5 text-center font-bold text-[13px] text-emerald-800">{matchedItems.length}</td>
                    <td className="border border-gray-500 p-1.5 text-emerald-900">Khớp hồ sơ và vị trí lưu trữ thực tế</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-500 p-1.5 text-center font-semibold">3</td>
                    <td className="border border-gray-500 p-1.5">Số lượng GCN tìm thấy nhưng sai vị trí (lệch ngăn/kệ)</td>
                    <td className="border border-gray-500 p-1.5 text-center font-bold text-[13px] text-amber-900">{misplacedItems.length}</td>
                    <td className="border border-gray-500 p-1.5 text-amber-900">Đã cập nhật lại tọa độ vị trí thực tế</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-500 p-1.5 text-center font-semibold">4</td>
                    <td className="border border-gray-500 p-1.5">Số lượng GCN không tìm thấy (Khuyết thiếu / Thất lạc)</td>
                    <td className="border border-gray-500 p-1.5 text-center font-bold text-[13px] text-red-700">{missingItems.length}</td>
                    <td className="border border-gray-500 p-1.5 text-red-700 font-semibold">
                      {missingItems.length > 0 ? 'Cần lập hồ sơ xác minh khẩn cấp' : 'Không có (Đầy đủ)'}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-500 p-1.5 text-center font-semibold">5</td>
                    <td className="border border-gray-500 p-1.5">Số lượng GCN phát sinh thừa thực tế / Khác kho</td>
                    <td className="border border-gray-500 p-1.5 text-center font-bold text-[13px] text-purple-900">{surplusItems.length}</td>
                    <td className="border border-gray-500 p-1.5 text-purple-900">
                      {surplusItems.length > 0 ? 'Hồ sơ nằm ngoài sổ sách quản lý' : 'Không có'}
                    </td>
                  </tr>
                  {pendingItems.length > 0 && (
                    <tr className="bg-yellow-50/50">
                      <td className="border border-gray-500 p-1.5 text-center font-semibold">6</td>
                      <td className="border border-gray-500 p-1.5">Số lượng GCN chưa hoàn tất kiểm kê</td>
                      <td className="border border-gray-500 p-1.5 text-center font-bold text-[13px] text-gray-700">{pendingItems.length}</td>
                      <td className="border border-gray-500 p-1.5 text-gray-600">Đợt kiểm kê đang thực hiện dở dang</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mục III: Ý kiến kết luận & kiến nghị (Cho phép chỉnh sửa trực tiếp) */}
            <div className="space-y-2 mb-6 text-[12px] leading-relaxed">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[13px] uppercase">III. Ý KIẾN KẾT LUẬN &amp; KIẾN NGHỊ:</p>
                <button
                  type="button"
                  onClick={handleResetNotes}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1 print:hidden cursor-pointer"
                  title="Đặt lại nội dung kết luận mặc định"
                >
                  <RotateCcw className="w-3 h-3" /> Đặt lại mặc định
                </button>
              </div>

              {/* Hiện trạng kho lưu trữ (ô nhập liệu trực tiếp) */}
              <div className="space-y-1">
                <span className="font-semibold text-gray-900 block">- Hiện trạng kho lưu trữ:</span>
                {/* Trên màn hình: ô textarea có thể gõ chỉnh sửa */}
                <div className="print:hidden">
                  <textarea
                    rows={2}
                    value={physicalConditionNotes}
                    onChange={(e) => handlePhysicalNotesChange(e.target.value)}
                    placeholder="Nhập thông tin hiện trạng vật lý, an toàn kho lưu trữ..."
                    className="w-full p-2 text-xs border border-blue-200 rounded-md bg-blue-50/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800"
                  />
                </div>
                {/* Khi in ấn: in ra văn bản sạch đẹp chuẩn hành chính */}
                <p className="hidden print:block text-justify indent-6">
                  {physicalConditionNotes}
                </p>
              </div>

              {/* Ghi chú bổ sung (ô nhập liệu trực tiếp) */}
              <div className="space-y-1">
                <span className="font-semibold text-gray-900 block">- Ghi chú bổ sung của đợt kiểm:</span>
                {/* Trên màn hình */}
                <div className="print:hidden">
                  <textarea
                    rows={2}
                    value={additionalNotes}
                    onChange={(e) => handleAdditionalNotesChange(e.target.value)}
                    placeholder="Nhập ghi chú kết luận của Hội đồng kiểm kê..."
                    className="w-full p-2 text-xs border border-blue-200 rounded-md bg-blue-50/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800"
                  />
                </div>
                {/* Khi in ấn */}
                <p className="hidden print:block text-justify indent-6">
                  {additionalNotes}
                </p>
              </div>

              {/* Quy định lưu biên bản */}
              <p className="text-justify indent-6 pt-1">
                - Biên bản này được lập thành 03 bản có giá trị pháp lý như nhau: 01 bản lưu tại Kho lưu trữ, 01 bản nộp Ban Quản lý Tài chính theo dõi, 01 bản gửi Ban Lãnh đạo Tập đoàn.
              </p>
            </div>

            {/* Mục IV: Chữ ký xác nhận của Hội đồng */}
            <div className="avoid-break-inside pt-3">
              <p className="font-bold text-[13px] uppercase mb-3">IV. CHỮ KÝ XÁC NHẬN CỦA HỘI ĐỒNG KIỂM KÊ:</p>
              <div
                className="grid gap-4 text-center text-[12px]"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(2, Math.min(4, signerMembers.length))}, minmax(0, 1fr))`,
                }}
              >
                {signerMembers.map((member) => (
                  <div key={member.id} className="flex flex-col justify-between min-h-[120px]">
                    <div>
                      <p className="font-bold uppercase text-[11px] text-gray-950">{member.signTitle || member.roleLabel}</p>
                      <p className="text-[10px] italic text-gray-500">(Ký và ghi rõ họ tên)</p>
                    </div>
                    <div className="h-16" />
                    <p className="font-bold text-[12px] text-gray-900">{member.fullName || ' '}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* PHẦN 2: BẢNG PHỤ LỤC / CHI TIẾT TỪNG GIẤY CHỨNG NHẬN ĐỐI SOÁT */}
          {/* ========================================================================= */}
          {includeAppendix && (
            <AuditPrintAppendix
              warehouseName={warehouseName}
              warehouseCode={warehouseCode}
              startedDate={startedDate}
              items={items}
              displayedItems={displayedAppendixItems}
              discrepancyCount={discrepancyItems.length}
              matchedCount={matchedItems.length}
              filterMode={filterMode}
              onFilterChange={setFilterMode}
              performerName={performerName}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryAuditPrintModal;