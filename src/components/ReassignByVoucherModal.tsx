import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Tag,
  Info,
  Building2,
  Layers,
  ArrowRight,
  Download,
  AlertCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Project, ReassignBulkRowResult } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { reassignAssetCodesBulk, fetchProjects } from '../api/assets';
import { COLLATERAL_TYPES } from '../lib/assetIdentifier';

interface ReassignByVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialVoucherCode?: string;
  projects?: Project[];
  onSuccess?: () => void;
}

export const ReassignByVoucherModal: React.FC<ReassignByVoucherModalProps> = ({
  isOpen,
  onClose,
  initialVoucherCode = '',
  projects: initialProjects = [],
  onSuccess,
}) => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [projectList, setProjectList] = useState<Project[]>(initialProjects);
  const [voucherCode, setVoucherCode] = useState<string>(initialVoucherCode);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedCollateralType, setSelectedCollateralType] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [confirmHistory, setConfirmHistory] = useState<boolean>(false);

  const [previewRows, setPreviewRows] = useState<ReassignBulkRowResult[]>([]);
  const [appliedRows, setAppliedRows] = useState<ReassignBulkRowResult[]>([]);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [loadingApply, setLoadingApply] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState<boolean>(false);
  const [hasApplied, setHasApplied] = useState<boolean>(false);

  // Tải danh mục dự án nếu chưa có
  useEffect(() => {
    if (!isOpen) return;
    if (initialProjects.length > 0) {
      setProjectList(initialProjects);
    } else {
      fetchProjects()
        .then(setProjectList)
        .catch(err => console.warn('Không thể tải dự án cho ReassignByVoucherModal:', err));
    }
  }, [isOpen, initialProjects]);

  // Reset state khi mở modal
  useEffect(() => {
    if (isOpen) {
      setVoucherCode(initialVoucherCode || '');
      setSelectedProjectId('');
      setSelectedCollateralType('');
      setReason('');
      setConfirmHistory(false);
      setPreviewRows([]);
      setAppliedRows([]);
      setErrorMessage(null);
      setIsConfirmDialogOpen(false);
      setHasApplied(false);
    }
  }, [isOpen, initialVoucherCode]);

  // Xóa kết quả xem trước khi thay đổi bất kỳ ô input nào (buộc phải xem trước lại)
  const handleInputChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    if (previewRows.length > 0 || hasApplied) {
      setPreviewRows([]);
      setAppliedRows([]);
      setHasApplied(false);
      setErrorMessage(null);
    }
  };

  // Thống kê kết quả
  const stats = useMemo(() => {
    const list = hasApplied ? appliedRows : previewRows;
    let ready = 0;
    let skipped = 0;
    let error = 0;
    let history = 0;

    for (const r of list) {
      if (r.status === 'ready' || r.status === 'applied') ready++;
      else if (r.status === 'skipped') skipped++;
      else if (r.status === 'error') error++;

      if (r.hasHistory) history++;
    }

    return { total: list.length, ready, skipped, error, history };
  }, [previewRows, appliedRows, hasApplied]);

  if (!isOpen) return null;

  // Dịch mã lỗi từ máy chủ
  const translateServerError = (err: any): string => {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');

    if (msg.includes('BULK_BLOCKED')) {
      let blockedList = '';
      if (msg.includes('được đổi:')) {
        blockedList = msg.slice(msg.indexOf('được đổi:') + 'được đổi:'.length).trim();
      } else {
        const parts = msg.split(':');
        if (parts.length >= 3) {
          blockedList = parts.slice(2).join(':').trim();
        } else if (parts.length === 2) {
          blockedList = parts[1].trim();
        }
      }
      if (blockedList) {
        return `Không thể tái cấp: có GCN vướng điều kiện trong phiếu, phiếu này sẽ không GCN nào được đổi: ${blockedList}`;
      }
      return 'Không thể tái cấp: có GCN vướng điều kiện trong phiếu, phiếu này sẽ không GCN nào được đổi.';
    }
    if (msg.includes('HISTORY_UNCONFIRMED')) {
      return 'Có GCN đã phát sinh lịch sử. Vui lòng tích xác nhận tái cấp mã để tiếp tục.';
    }
    if (code === '42501') {
      return 'Bạn không có quyền tái cấp cả phiếu này (quản lý kho chỉ được tái cấp phiếu thuộc kho mình phụ trách; hoặc cần quyền quản trị viên khi có lịch sử).';
    }
    if (code === 'P0002' || msg.includes('P0002') || msg.toLowerCase().includes('không tìm thấy')) {
      return 'Không tìm thấy mã phiếu nhập này.';
    }
    return msg || 'Lỗi khi xử lý tái cấp mã theo phiếu nhập.';
  };

  // 1. Xem trước (apply = false)
  const handlePreview = async () => {
    const cleanVoucher = voucherCode.trim();
    if (!cleanVoucher) {
      toast.error('Vui lòng nhập mã phiếu nhập kho.');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Vui lòng nhập lý do tái cấp mã ít nhất 10 ký tự.');
      return;
    }

    setLoadingPreview(true);
    setErrorMessage(null);
    setPreviewRows([]);
    setAppliedRows([]);
    setHasApplied(false);

    try {
      const rows = await reassignAssetCodesBulk({
        voucherCode: cleanVoucher,
        reason: reason.trim(),
        newProjectId: selectedProjectId || null,
        newCollateralType: selectedCollateralType || null,
        confirmHistory: false,
        apply: false,
      });

      setPreviewRows(rows);
      if (rows.length === 0) {
        toast.error('Phiếu nhập không có GCN nào để tái cấp mã.');
      } else {
        toast.success(`Đã kiểm tra ${rows.length} GCN thuộc phiếu nhập.`);
      }
    } catch (err: any) {
      const friendly = translateServerError(err);
      setErrorMessage(friendly);
      toast.error(friendly);
    } finally {
      setLoadingPreview(false);
    }
  };

  // 2. Thực thi áp dụng (apply = true)
  const handleApply = async () => {
    const cleanVoucher = voucherCode.trim();
    if (!cleanVoucher || previewRows.length === 0) {
      toast.error('Vui lòng xem trước trước khi áp dụng.');
      return;
    }
    if (stats.error > 0) {
      toast.error('Có GCN bị lỗi điều kiện. Toàn bộ phiếu không thể áp dụng.');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Lý do tái cấp mã phải có ít nhất 10 ký tự.');
      return;
    }
    if (stats.history > 0) {
      if (!isAdmin) {
        toast.error('Chỉ quản trị viên mới được tái cấp mã cho GCN đã phát sinh lịch sử.');
        return;
      }
      if (!confirmHistory) {
        toast.error('Vui lòng tích xác nhận tái cấp mã cho các GCN đã phát sinh lịch sử.');
        return;
      }
    }

    setIsConfirmDialogOpen(false);
    setLoadingApply(true);
    setErrorMessage(null);

    try {
      const rows = await reassignAssetCodesBulk({
        voucherCode: cleanVoucher,
        reason: reason.trim(),
        newProjectId: selectedProjectId || null,
        newCollateralType: selectedCollateralType || null,
        confirmHistory: confirmHistory,
        apply: true,
      });

      setAppliedRows(rows);
      setHasApplied(true);
      toast.success(`Tái cấp mã thành công cho phiếu nhập ${cleanVoucher}!`);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      const friendly = translateServerError(err);
      setErrorMessage(friendly);
      toast.error(friendly);
    } finally {
      setLoadingApply(false);
    }
  };

  // 3. Tải CSV kết quả (UTF-8 with BOM)
  const handleExportCSV = () => {
    const targetRows = hasApplied ? appliedRows : previewRows;
    if (targetRows.length === 0) {
      toast.error('Không có dữ liệu để xuất CSV.');
      return;
    }

    const headers = ['Số GCN', 'Mã cũ', 'Mã mới', 'Trạng thái', 'Thông báo/Ghi chú'];
    const csvLines = [headers.map(h => `"${h}"`).join(',')];

    for (const r of targetRows) {
      let statusText: string = r.status;
      if (r.status === 'ready') statusText = 'Sẵn sàng';
      else if (r.status === 'applied') statusText = 'Đã áp dụng';
      else if (r.status === 'skipped') statusText = 'Bỏ qua (đã đúng mã)';
      else if (r.status === 'error') statusText = 'Lỗi';

      const line = [
        `"${(r.certificateNo || '').replace(/"/g, '""')}"`,
        `"${(r.oldCode || '-').replace(/"/g, '""')}"`,
        `"${(hasApplied ? (r.newCode || '-') : (r.newPrefix ? `${r.newPrefix}...` : '-')).replace(/"/g, '""')}"`,
        `"${statusText.replace(/"/g, '""')}"`,
        `"${(r.message || (r.hasHistory ? 'Đã có lịch sử' : '')).replace(/"/g, '""')}"`,
      ];
      csvLines.push(line.join(','));
    }

    const bom = '\uFEFF';
    const csvBlob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ket_qua_tai_cap_ma_${voucherCode.trim() || 'phieu'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Đã tải file CSV kết quả.');
  };

  const isApplyDisabled =
    loadingApply ||
    loadingPreview ||
    hasApplied ||
    previewRows.length === 0 ||
    stats.error > 0 ||
    stats.ready === 0 ||
    reason.trim().length < 10 ||
    (stats.history > 0 && (!isAdmin || !confirmHistory));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-800 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-purple-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Tag className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Tái Cấp Mã Hàng Loạt Theo Phiếu Nhập
                <span className="text-[11px] font-mono font-normal bg-purple-500/40 px-2 py-0.5 rounded-full border border-purple-400/30">
                  RPC 0098
                </span>
              </h2>
              <p className="text-xs text-purple-200 mt-0.5">
                Áp dụng nguyên tử (All-or-Nothing) cho toàn bộ GCN thuộc một phiếu nhập kho cấp mới
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-purple-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 dark:text-slate-100 text-sm">
          {/* Form thông tin đầu vào */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/70">
            {/* Mã phiếu nhập */}
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mã Phiếu Nhập Kho <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={voucherCode}
                disabled={hasApplied || loadingPreview || loadingApply}
                onChange={e => handleInputChange(setVoucherCode, e.target.value)}
                placeholder="VD: PNK-2026/05-012..."
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-50"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Chỉ nhận phiếu nhập "cấp mới", tối đa 2.000 GCN.
              </p>
            </div>

            {/* Chọn dự án mới (tùy chọn) */}
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Dự Án Pháp Lý Mới (Tùy chọn)
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <select
                  value={selectedProjectId}
                  disabled={hasApplied || loadingPreview || loadingApply}
                  onChange={e => handleInputChange(setSelectedProjectId, e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">(Giữ nguyên dự án hiện tại của từng GCN)</option>
                  {projectList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Bỏ trống nếu mã sai do cấu hình vùng/tỉnh.
              </p>
            </div>

            {/* Chọn loại tài sản mới (tùy chọn) */}
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Loại Tài Sản Mới (Tùy chọn)
              </label>
              <div className="relative">
                <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <select
                  value={selectedCollateralType}
                  disabled={hasApplied || loadingPreview || loadingApply}
                  onChange={e => handleInputChange(setSelectedCollateralType, e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">(Giữ nguyên loại tài sản của từng GCN)</option>
                  {COLLATERAL_TYPES.map(ct => (
                    <option key={ct.code} value={ct.code}>
                      {ct.shortName} - {ct.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Bỏ trống nếu không thay đổi loại tài sản.
              </p>
            </div>
          </div>

          {/* Hướng dẫn nghiệp vụ kho */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Quy tắc nghiệp vụ:</strong> Kho lưu trữ không ảnh hưởng đến cấu trúc mã tài sản (mã phụ thuộc vào vùng, địa bàn của dự án và loại TSĐB). Nhập nhầm kho: dùng Luân chuyển kho (người dùng thường) hoặc Sửa kho không phiếu (quản trị viên).
            </div>
          </div>

          {/* Nhập lý do tái cấp mã */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Lý Do Tái Cấp Mã Cho Phiếu <span className="text-rose-500">*</span>
              </label>
              <span
                className={`text-[11px] font-mono ${
                  reason.trim().length >= 10 ? 'text-emerald-600 font-semibold' : 'text-slate-400'
                }`}
              >
                {reason.trim().length}/10 ký tự tối thiểu
              </span>
            </div>
            <textarea
              rows={2}
              value={reason}
              disabled={hasApplied || loadingPreview || loadingApply}
              onChange={e => handleInputChange(setReason, e.target.value)}
              placeholder="VD: Cập nhật lại mã tỉnh theo quyết định phân vùng địa bàn mới cho toàn bộ phiếu..."
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Thanh nút Xem trước */}
          {!hasApplied && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handlePreview}
                disabled={loadingPreview || loadingApply || !voucherCode.trim() || reason.trim().length < 10}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {loadingPreview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang kiểm tra phiếu...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Xem Trước Danh Sách GCN</span>
                  </>
                )}
              </button>

              {previewRows.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Thay đổi bất kỳ ô nào ở trên sẽ yêu cầu xem trước lại.
                </span>
              )}
            </div>
          )}

          {/* Báo lỗi máy chủ (nếu có) */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-xl flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Thông báo từ máy chủ:</strong> {errorMessage}
              </div>
            </div>
          )}

          {/* Khung cảnh báo lỗi ALL-OR-NOTHING nếu có dòng error */}
          {stats.error > 0 && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/60 border-2 border-rose-400 dark:border-rose-800 rounded-xl flex items-start gap-3 text-xs text-rose-950 dark:text-rose-100">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <p className="font-bold text-sm text-rose-800 dark:text-rose-300">
                  Không thể tái cấp mã cho phiếu này!
                </p>
                <p className="mt-1">
                  Có <strong>{stats.error}</strong> GCN vướng điều kiện (xem chi tiết ở bảng dưới). Theo quy tắc an toàn máy chủ (All-or-Nothing), <strong>toàn bộ phiếu này sẽ không GCN nào được đổi</strong> để tránh phân mảnh dữ liệu.
                </p>
              </div>
            </div>
          )}

          {/* Khung cảnh báo GCN đã có lịch sử */}
          {stats.history > 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl space-y-2.5 text-xs text-amber-950 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900 dark:text-amber-300">
                    Cảnh báo: Có {stats.history} GCN trong phiếu đã phát sinh giao dịch / lịch sử!
                  </p>
                  <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-300/90 leading-relaxed">
                    Việc tái cấp mã sẽ thay đổi mã định danh trên hệ thống. Tài liệu in ấn, hồ sơ công chứng hoặc hợp đồng ngoài thực tế phải được đồng bộ theo.
                  </p>
                </div>
              </div>

              {/* Checkbox xác nhận */}
              <div className="pt-2 border-t border-amber-200 dark:border-amber-800/80">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin || hasApplied || loadingApply}
                    checked={confirmHistory}
                    onChange={e => setConfirmHistory(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 disabled:opacity-50"
                  />
                  <span className="font-medium text-amber-950 dark:text-amber-100">
                    Tôi xác nhận tái cấp mã cho các GCN đã phát sinh giao dịch/lịch sử và hiểu rõ các rủi ro vận hành.
                  </span>
                </label>
                {!isAdmin && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 ml-6.5 font-medium">
                    (Chỉ quản trị viên cấp cao mới có quyền xác nhận tái cấp mã cho GCN đã phát sinh lịch sử).
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Bảng kết quả (Preview hoặc Applied) */}
          {(previewRows.length > 0 || appliedRows.length > 0) && (
            <div className="space-y-2 pt-1">
              {/* Thanh tổng kết & nút tải CSV */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {hasApplied ? 'Kết quả áp dụng:' : 'Thống kê xem trước:'}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {stats.ready} {hasApplied ? 'đã đổi' : 'sẽ đổi'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    {stats.skipped} bỏ qua (đã đúng mã)
                  </span>
                  {stats.error > 0 && (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {stats.error} vướng điều kiện
                    </span>
                  )}
                  {stats.history > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                      <Clock className="w-3.5 h-3.5" />
                      {stats.history} có lịch sử
                    </span>
                  )}
                  <span className="text-slate-500 font-mono text-[11px]">
                    (Tổng: {stats.total} GCN)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Tải CSV kết quả</span>
                </button>
              </div>

              {/* Bảng danh sách GCN */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">STT</th>
                      <th className="py-2.5 px-3">Số GCN</th>
                      <th className="py-2.5 px-3">Mã Cũ</th>
                      <th className="py-2.5 px-3">{hasApplied ? 'Mã Mới Đã Cấp' : 'Tiền Tố Mới'}</th>
                      <th className="py-2.5 px-3">Trạng Thái</th>
                      <th className="py-2.5 px-3">Lịch Sử / Thông Báo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(hasApplied ? appliedRows : previewRows).map((row, idx) => {
                      const isError = row.status === 'error';
                      const isReady = row.status === 'ready' || row.status === 'applied';
                      const isSkipped = row.status === 'skipped';

                      return (
                        <tr
                          key={row.assetId || idx}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                            isError ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200 font-mono">
                            {row.certificateNo}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                            {hasApplied && row.oldCode ? (
                              <span className="line-through text-slate-400">{row.oldCode}</span>
                            ) : (
                              row.oldCode || '-'
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px]">
                            {hasApplied ? (
                              <span className="font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                                {row.newCode || '-'}
                              </span>
                            ) : (
                              <span className="text-purple-900 dark:text-purple-300 font-medium">
                                {row.newPrefix ? `${row.newPrefix}...` : '-'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {isReady && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                {hasApplied ? 'Đã cấp mã' : 'Sẵn sàng'}
                              </span>
                            )}
                            {isSkipped && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                Bỏ qua (đã đúng)
                              </span>
                            )}
                            {isError && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3 h-3" />
                                Lỗi điều kiện
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {row.hasHistory && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Đã có lịch sử
                                </span>
                              )}
                              {row.message && (
                                <span className={isError ? 'text-rose-700 font-medium' : ''}>
                                  {row.message}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            {hasApplied && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Đã hoàn tất tái cấp mã cho phiếu {voucherCode}!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              {hasApplied ? 'Đóng' : 'Hủy bỏ'}
            </button>

            {!hasApplied && (
              <button
                type="button"
                disabled={isApplyDisabled}
                onClick={() => setIsConfirmDialogOpen(true)}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loadingApply ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang áp dụng...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Áp Dụng Tái Cấp ({stats.ready} GCN)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog trước khi ghi thật vào DB */}
      {isConfirmDialogOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-start gap-3 text-purple-900 dark:text-purple-300">
              <div className="p-2.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                  Xác nhận tái cấp mã cả phiếu?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Thao tác này sẽ thực thi tái cấp mã nguyên tử cho toàn bộ GCN đủ điều kiện trong phiếu nhập.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1.5 font-mono">
              <div>• Phiếu nhập: <strong className="text-purple-700">{voucherCode}</strong></div>
              <div>• Số GCN sẽ đổi: <strong>{stats.ready}</strong></div>
              <div>• Số GCN bỏ qua: <strong>{stats.skipped}</strong></div>
              {stats.history > 0 && (
                <div className="text-amber-700 font-semibold">• GCN có lịch sử: <strong>{stats.history}</strong> (đã xác nhận)</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmDialogOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={loadingApply}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                {loadingApply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Đồng Ý Áp Dụng</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
