import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Asset, Warehouse, Profile, CorrectAssetWarehouseResult } from '../types';
import { correctAssetWarehouse } from '../api/assets';
import {
  X,
  Loader2,
  Warehouse as WarehouseIcon,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface BulkWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedAssets: Asset[];
  warehouses: Warehouse[];
  currentUser?: Profile | { id?: string; email?: string; full_name?: string; role?: string } | null;
}

function formatErrorMessage(err: any): string {
  const msg: string = err?.message || String(err || '');
  const code: string = err?.code || '';

  if (msg.includes('WH_BLOCKED:')) {
    const afterColon = msg.split('WH_BLOCKED:')[1]?.trim() || '';
    return `Không thể sửa kho: ${afterColon}`;
  }
  if (code === '42501' || msg.includes('42501') || msg.toLowerCase().includes('không được đổi kho của gcn trực tiếp') || msg.toLowerCase().includes('chỉ quản trị viên')) {
    return 'Chỉ quản trị viên được sửa kho không phiếu. Chuyển hàng giữa các kho: dùng Luân chuyển kho.';
  }
  if (code === 'P0002' || msg.includes('P0002') || msg.includes('Không tìm thấy kho đích')) {
    return 'Không tìm thấy kho đích';
  }
  return msg;
}

export const BulkWarehouseModal: React.FC<BulkWarehouseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedAssets,
  warehouses,
  currentUser,
}) => {
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewResults, setPreviewResults] = useState<CorrectAssetWarehouseResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTargetWarehouseId('');
      setReason('');
      setIsPreviewing(false);
      setIsApplying(false);
      setPreviewResults(null);
      setErrorMsg(null);
      setShowConfirm(false);
    }
  }, [isOpen]);

  if (!isOpen || selectedAssets.length === 0) return null;

  const userRole = (currentUser as any)?.role || '';
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const count = selectedAssets.length;
  const targetWh = warehouses.find(w => w.id === targetWarehouseId);

  const nReady = previewResults ? previewResults.filter(r => r.status === 'ready').length : 0;
  const nSkipped = previewResults ? previewResults.filter(r => r.status === 'skipped').length : 0;
  const nError = previewResults ? previewResults.filter(r => r.status === 'error').length : 0;

  const handleTargetWarehouseChange = (val: string) => {
    setTargetWarehouseId(val);
    setPreviewResults(null);
    setErrorMsg(null);
    setShowConfirm(false);
  };

  const handleReasonChange = (val: string) => {
    setReason(val);
    setPreviewResults(null);
    setErrorMsg(null);
    setShowConfirm(false);
  };

  const handlePreview = async () => {
    if (!targetWarehouseId) {
      setErrorMsg('Vui lòng chọn kho lưu trữ đích.');
      return;
    }
    const cleanReason = reason.trim();
    if (cleanReason.length < 10) {
      setErrorMsg('Lý do sửa kho bắt buộc phải có ít nhất 10 ký tự.');
      return;
    }

    setIsPreviewing(true);
    setErrorMsg(null);
    setShowConfirm(false);

    try {
      const assetIds = selectedAssets.map(a => a.id);
      const res = await correctAssetWarehouse({
        assetIds,
        targetWarehouseId,
        reason: cleanReason,
        apply: false,
      });
      setPreviewResults(res);
    } catch (err: any) {
      console.error('Lỗi xem trước sửa kho:', err);
      const msg = formatErrorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!targetWarehouseId) {
      setErrorMsg('Vui lòng chọn kho lưu trữ đích.');
      return;
    }
    const cleanReason = reason.trim();
    if (cleanReason.length < 10) {
      setErrorMsg('Lý do sửa kho bắt buộc phải có ít nhất 10 ký tự.');
      return;
    }

    setIsApplying(true);
    setErrorMsg(null);

    try {
      const assetIds = selectedAssets.map(a => a.id);
      const res = await correctAssetWarehouse({
        assetIds,
        targetWarehouseId,
        reason: cleanReason,
        apply: true,
      });

      const appliedCount = res.filter(r => r.applied || r.status === 'applied').length;
      toast.success(`Đã sửa kho thành công cho ${appliedCount} GCN!`);
      setShowConfirm(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Lỗi khi áp dụng sửa kho:', err);
      const msg = formatErrorMessage(err);
      setErrorMsg(msg);
      toast.error(msg);
      setShowConfirm(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl text-white">
              <WarehouseIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Sửa Kho (Không Phiếu)</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full text-amber-100">
                  Quản trị viên
                </span>
              </div>
              <p className="text-xs text-amber-100 mt-0.5">
                Áp dụng cho <span className="font-bold underline">{count}</span> Giấy chứng nhận đã chọn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPreviewing || isApplying}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Khung cảnh báo nghiệp vụ */}
        <div className="p-4 bg-amber-50/90 border-b border-amber-200 text-xs text-amber-900 flex items-start gap-2.5 shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Lưu ý quan trọng:</strong> Chỉ dùng để sửa nhập nhầm kho. Chuyển hàng thật giữa các kho: dùng{' '}
            <Link
              to="/warehouse-transfers"
              onClick={onClose}
              className="font-bold text-blue-700 hover:text-blue-900 underline inline-flex items-center gap-0.5"
            >
              Luân chuyển kho
            </Link>{' '}
            (có phiếu xuất/nhập và kho đích xác nhận).
          </div>
        </div>

        {/* Nội dung chính */}
        {!isAdmin ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">Không có quyền truy cập</h4>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Chỉ quản trị viên (admin, super_admin) mới được sửa kho không phiếu. Chuyển hàng giữa các kho vui lòng sử dụng chức năng Luân chuyển kho.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Link
                to="/warehouse-transfers"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
              >
                Tới trang Luân chuyển kho
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="flex-1 whitespace-pre-line">{errorMsg}</span>
              </div>
            )}

            {/* Chọn kho đích */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Kho lưu trữ đích mới <span className="text-rose-500">*</span>
              </label>
              <select
                value={targetWarehouseId}
                onChange={e => handleTargetWarehouseChange(e.target.value)}
                disabled={isPreviewing || isApplying}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none transition-all cursor-pointer font-medium text-slate-800"
              >
                <option value="">-- Chọn kho lưu trữ đích --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ''} {w.is_central ? '- Kho trung tâm' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Lý do sửa kho (Bắt buộc >= 10 ký tự) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Lý do sửa kho (bắt buộc, tối thiểu 10 ký tự) <span className="text-rose-500">*</span>
                </label>
                <span className={`text-[11px] font-mono ${reason.trim().length >= 10 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                  {reason.trim().length}/10 ký tự
                </span>
              </div>
              <textarea
                value={reason}
                onChange={e => handleReasonChange(e.target.value)}
                disabled={isPreviewing || isApplying}
                rows={2}
                placeholder="Nhập lý do chi tiết sửa sai kho (VD: Nhập nhầm kho ban đầu khi khai báo lô đất Cồn Dầu...)"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all placeholder:text-slate-400 text-slate-800"
              />
            </div>

            {/* Bảng xem trước kết quả */}
            {previewResults && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">Kết quả kiểm tra trước ({previewResults.length} GCN):</span>
                  {/* Dòng tổng */}
                  <div className="flex items-center gap-2 font-mono font-medium text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                    <span className="text-emerald-700 font-bold">{nReady} sẽ đổi</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-600 font-bold">{nSkipped} bỏ qua</span>
                    <span className="text-slate-300">/</span>
                    <span className={`font-bold ${nError > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{nError} vướng</span>
                  </div>
                </div>

                {/* Có lỗi vướng điều kiện: Khung đỏ khóa nút */}
                {nError > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="font-medium">
                      Không thể sửa kho: có {nError} GCN vướng điều kiện, lô này sẽ không GCN nào được đổi.
                    </span>
                  </div>
                )}

                {/* Bảng chi tiết preview */}
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="py-2 px-3">Số GCN</th>
                        <th className="py-2 px-3">Kho hiện tại → Kho mới</th>
                        <th className="py-2 px-3 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewResults.map((r) => {
                        const isReady = r.status === 'ready';
                        const isSkipped = r.status === 'skipped';
                        const isErr = r.status === 'error';

                        return (
                          <tr key={r.assetId} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {r.certificateNo}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="truncate max-w-[110px] text-slate-500">{r.oldWarehouse || 'Chưa gán kho'}</span>
                                <ArrowRight className="w-3 h-3 text-amber-500 shrink-0" />
                                <span className="font-semibold text-amber-800 truncate max-w-[110px]">{r.newWarehouse || targetWh?.name}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              {isReady && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Sẵn sàng
                                </span>
                              )}
                              {isSkipped && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200" title={r.message || 'Đã ở kho đích'}>
                                  Đã ở kho đích (Bỏ qua)
                                </span>
                              )}
                              {isErr && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200" title={r.message || 'Vướng điều kiện'}>
                                  <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                  <span className="truncate max-w-[150px]">{r.message || 'Lỗi'}</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Hộp xác nhận trước khi áp dụng */}
            {showConfirm && (
              <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-xl text-xs text-amber-950 space-y-2.5 animate-in fade-in duration-150">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-700" />
                  Xác nhận áp dụng sửa kho không phiếu:
                </div>
                <div className="space-y-1 text-slate-700 pl-5">
                  <p>• Số lượng GCN sẽ đổi: <strong className="text-emerald-700">{nReady} GCN</strong></p>
                  <p>• Kho lưu trữ đích: <strong className="text-amber-900">{targetWh?.name}</strong></p>
                  <p>• Lý do: <em>"{reason.trim()}"</em></p>
                  <p className="text-[11px] text-slate-500 italic">• Thao tác này sẽ cập nhật trực tiếp vào CSDL và ghi nhận nhật ký kiểm toán (audit_logs).</p>
                </div>
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    disabled={isApplying}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={isApplying}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isApplying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Xác nhận áp dụng ngay</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        {isAdmin && (
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500">
              {previewResults ? `${nReady} GCN sẵn sàng / ${count} đã chọn` : `Chưa xem trước kết quả`}
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isPreviewing || isApplying}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>

              {/* Nút Xem trước */}
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewing || isApplying || !targetWarehouseId || reason.trim().length < 10}
                className="px-4.5 py-2 text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isPreviewing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang kiểm tra...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5 text-slate-600" />
                    <span>Xem trước</span>
                  </>
                )}
              </button>

              {/* Nút Áp dụng sửa kho */}
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={
                  isApplying ||
                  !previewResults ||
                  nError > 0 ||
                  nReady === 0 ||
                  showConfirm
                }
                className="px-4.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                {isApplying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Áp dụng sửa kho ({nReady})</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
