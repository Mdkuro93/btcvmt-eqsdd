import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Eye,
  Info,
  Building2,
  Layers,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Asset, Project, ReassignAssetCodeResult } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { reassignAssetCode, fetchProjects } from '../api/assets';
import { COLLATERAL_TYPES } from '../lib/assetIdentifier';

interface ReassignAssetCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  projects?: Project[];
  onSuccess?: (newCode?: string) => void;
}

export const ReassignAssetCodeModal: React.FC<ReassignAssetCodeModalProps> = ({
  isOpen,
  onClose,
  asset,
  projects: initialProjects = [],
  onSuccess,
}) => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [projectList, setProjectList] = useState<Project[]>(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(asset.project_id || '');
  const [selectedCollateralType, setSelectedCollateralType] = useState<string>(asset.collateral_type || 'BDS');
  const [reason, setReason] = useState<string>('');
  const [confirmHistory, setConfirmHistory] = useState<boolean>(false);

  const [previewResult, setPreviewResult] = useState<ReassignAssetCodeResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [loadingApply, setLoadingApply] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ oldCode: string | null; newCode: string | null } | null>(null);

  // Tải danh sách dự án thời gian thực nếu chưa có
  useEffect(() => {
    if (!isOpen) return;
    if (initialProjects.length > 0) {
      setProjectList(initialProjects);
    } else {
      fetchProjects()
        .then(setProjectList)
        .catch(err => console.warn('Không thể tải dự án cho ReassignAssetCodeModal:', err));
    }
  }, [isOpen, initialProjects]);

  // Reset state khi mở modal với asset mới
  useEffect(() => {
    if (isOpen) {
      setSelectedProjectId(asset.project_id || '');
      setSelectedCollateralType(asset.collateral_type || 'BDS');
      setReason('');
      setConfirmHistory(false);
      setPreviewResult(null);
      setErrorMessage(null);
      setSuccessInfo(null);
    }
  }, [isOpen, asset.id, asset.asset_code, asset.project_id, asset.collateral_type]);

  if (!isOpen) return null;

  // Xóa preview khi người dùng đổi tham số dự án hoặc loại tài sản
  const handleProjectChange = (newProjId: string) => {
    setSelectedProjectId(newProjId);
    setPreviewResult(null);
    setErrorMessage(null);
  };

  const handleCollateralTypeChange = (newType: string) => {
    setSelectedCollateralType(newType);
    setPreviewResult(null);
    setErrorMessage(null);
  };

  // 1. Xem trước (apply = false)
  const handlePreview = async () => {
    if (reason.trim().length < 10) {
      toast.error('Vui lòng nhập lý do tái cấp mã ít nhất 10 ký tự trước khi xem trước.');
      return;
    }
    setLoadingPreview(true);
    setErrorMessage(null);
    setPreviewResult(null);

    try {
      const res = await reassignAssetCode({
        assetId: asset.id,
        reason: reason.trim(),
        newProjectId: selectedProjectId || null,
        newCollateralType: selectedCollateralType || null,
        confirmHistory: false,
        apply: false,
      });
      setPreviewResult(res);
      toast.success('Đã lấy thông tin xem trước từ máy chủ.');
    } catch (err: any) {
      const msg = String(err?.message || 'Lỗi khi xem trước mã tài sản');
      const code = String(err?.code || '');
      if (code === '42501' && (msg.includes('lịch sử') || msg.includes('quản trị viên'))) {
        setErrorMessage('Chỉ quản trị viên được tái cấp mã GCN đã phát sinh lịch sử.');
      } else {
        setErrorMessage(msg);
      }
      toast.error(msg);
    } finally {
      setLoadingPreview(false);
    }
  };

  // 2. Áp dụng tái cấp mã (apply = true)
  const handleApply = async () => {
    if (!previewResult) {
      toast.error('Vui lòng bấm "Xem trước" để kiểm tra tính hợp lệ trước khi áp dụng.');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Lý do tái cấp mã phải có ít nhất 10 ký tự.');
      return;
    }
    if (previewResult.hasHistory) {
      if (!isAdmin) {
        toast.error('Chỉ quản trị viên được tái cấp mã GCN đã phát sinh lịch sử.');
        return;
      }
      if (!confirmHistory) {
        toast.error('Vui lòng tích ô xác nhận rủi ro khi thay đổi mã GCN đã có lịch sử.');
        return;
      }
    }

    setLoadingApply(true);
    setErrorMessage(null);

    try {
      const res = await reassignAssetCode({
        assetId: asset.id,
        reason: reason.trim(),
        newProjectId: selectedProjectId || null,
        newCollateralType: selectedCollateralType || null,
        confirmHistory: confirmHistory,
        apply: true,
      });

      setSuccessInfo({
        oldCode: res.oldCode || asset.asset_code || '(Chưa có mã)',
        newCode: res.newCode || '(Chưa xác định)',
      });
      toast.success(`Tái cấp mã thành công: ${res.oldCode} ➔ ${res.newCode}`);

      if (onSuccess) {
        onSuccess(res.newCode || undefined);
      }
    } catch (err: any) {
      const msg = String(err?.message || 'Lỗi khi tái cấp mã');
      const code = String(err?.code || '');
      if (code === '42501' && (msg.includes('lịch sử') || msg.includes('quản trị viên'))) {
        setErrorMessage('Chỉ quản trị viên được tái cấp mã GCN đã phát sinh lịch sử.');
      } else {
        setErrorMessage(msg);
      }
      toast.error(msg);
    } finally {
      setLoadingApply(false);
    }
  };

  // Chi tiết lịch sử tiếng Việt
  const hist = previewResult?.history || {};
  const historyItems: string[] = [];
  if (hist.transactions && hist.transactions > 0) {
    historyItems.push(`${hist.transactions} giao dịch kho (xuất, nhập, luân chuyển...)`);
  }
  if (hist.inventory_audits && hist.inventory_audits > 0) {
    historyItems.push(`${hist.inventory_audits} lần kiểm kê kho`);
  }
  if (hist.lineage && hist.lineage > 0) {
    historyItems.push(`${hist.lineage} liên kết phả hệ / tách sổ / cấp đổi`);
  }
  if (hist.declaration_requests && hist.declaration_requests > 0) {
    historyItems.push(`${hist.declaration_requests} hồ sơ cấp đổi/tách`);
  }
  if (hist.ownership_transfers && hist.ownership_transfers > 0) {
    historyItems.push(`${hist.ownership_transfers} lần chuyển quyền sở hữu`);
  }
  if (hist.mortgaged) {
    historyItems.push('GCN đang trong trạng thái THẾ CHẤP ngân hàng');
  }
  if (hist.checked_out) {
    historyItems.push('GCN đang trong trạng thái ĐÃ XUẤT KHO');
  }

  const isApplyDisabled =
    loadingApply ||
    loadingPreview ||
    !previewResult ||
    reason.trim().length < 10 ||
    (previewResult.hasHistory && (!isAdmin || !confirmHistory));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 to-[#1E3A8A] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <RefreshCw className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                Tái Cấp Mã Định Danh Tài Sản (GCN)
              </h3>
              <p className="text-xs text-amber-100 mt-0.5">
                Cấp lại mã theo Dự án / Loại TSĐB qua RPC máy chủ nguyên tử
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700 dark:text-slate-300">
          {/* Màn hình thành công */}
          {successInfo ? (
            <div className="py-6 px-4 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Tái cấp mã tài sản thành công!
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Mã tài sản đã được cập nhật nguyên tử trên hệ thống và lưu nhật ký thay đổi.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-3 font-mono text-sm">
                <span className="text-slate-500 line-through">{successInfo.oldCode}</span>
                <ArrowRight className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700">
                  {successInfo.newCode}
                </span>
              </div>

              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-[#1E3A8A] text-white rounded-lg font-semibold hover:bg-blue-800 transition-colors"
                >
                  Đóng hộp thoại
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Thông tin GCN hiện tại */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-500 block mb-0.5">Số GCN QSDĐ:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {asset.certificate_no || 'Chưa có số GCN'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Mã tài sản hiện tại:</span>
                  <span className="font-mono font-bold text-[#1E3A8A] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                    {asset.asset_code || 'Chưa gán mã'}
                  </span>
                </div>
              </div>

              {/* Chú thích quan trọng về kho */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Lưu ý:</strong> Kho lưu trữ không ảnh hưởng đến cấu trúc mã tài sản (mã phụ thuộc vào Vùng miền, Địa bàn tỉnh của Dự án và Loại TSĐB). Nếu GCN nhập sai kho, vui lòng dùng tính năng <strong>Luân chuyển kho</strong> thay vì tái cấp mã.
                </p>
              </div>

              {/* Form chọn Dự án và Loại TSĐB */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    Dự án gắn với GCN <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={e => handleProjectChange(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chọn Dự án --</option>
                    {projectList.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Loại Tài Sản Đảm Bảo (TSĐB) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCollateralType}
                    onChange={e => handleCollateralTypeChange(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                  >
                    {COLLATERAL_TYPES.map(ct => (
                      <option key={ct.code} value={ct.code}>
                        [{ct.code}] {ct.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lý do tái cấp mã (bắt buộc >= 10 ký tự) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-800 dark:text-slate-200">
                    Lý do tái cấp mã <span className="text-red-500">*</span>
                  </label>
                  <span
                    className={`font-mono text-[11px] ${
                      reason.trim().length >= 10 ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {reason.trim().length}/10 ký tự tối thiểu
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={e => {
                    setReason(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Nhập lý do chi tiết (VD: Chọn nhầm dự án khi nhập kho đợt 1 / Cấu hình mã vùng mới cập nhật...)"
                  className="w-full px-3 py-2 border rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                />
              </div>

              {/* Nút Xem trước */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={loadingPreview || loadingApply || reason.trim().length < 10}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg font-semibold border border-slate-300 dark:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loadingPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <Eye className="w-4 h-4 text-blue-600" />
                  )}
                  <span>Xem trước tiền tố & Kiểm tra lịch sử</span>
                </button>
                <span className="text-slate-500 text-[11px]">
                  (Gọi máy chủ kiểm tra điều kiện, không ghi vào CSDL)
                </span>
              </div>

              {/* Báo lỗi nếu có */}
              {errorMessage && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Không thể tái cấp mã</p>
                    <p className="leading-relaxed">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Kết quả Xem trước */}
              {previewResult && (
                <div className="space-y-3.5 p-4 bg-blue-50/60 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between border-b border-blue-200 dark:border-blue-800 pb-2">
                    <span className="font-bold text-[#1E3A8A] dark:text-blue-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Kết quả kiểm tra tiền tố mới
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Tiền tố dự kiến: <strong className="text-blue-700 dark:text-blue-300">{previewResult.newPrefix}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                      Mã cũ: {previewResult.oldCode || '(Chưa có)'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/80 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold">
                      Tiền tố mới: {previewResult.newPrefix}xxxxxxxx
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    * Lưu ý: 8 chữ số thứ tự chính xác sẽ được máy chủ cấp nguyên tử ngay khi bấm "Tái cấp mã" để đảm bảo không trùng lặp số giữa các người dùng.
                  </p>

                  {/* Cảnh báo đỏ nếu GCN đã phát sinh lịch sử */}
                  {previewResult.hasHistory && (
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-rose-950 dark:text-rose-100">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>CẢNH BÁO: GCN đã phát sinh lịch sử dữ liệu trong hệ thống</span>
                      </div>

                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-800 dark:text-rose-300">
                        {historyItems.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>

                      {!isAdmin ? (
                        <div className="p-2.5 bg-white/70 dark:bg-slate-900/70 rounded-lg border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-semibold text-center">
                          ⚠️ Chỉ quản trị viên (Admin / Super Admin) mới có quyền tái cấp mã cho GCN đã phát sinh giao dịch/lịch sử.
                        </div>
                      ) : (
                        <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={confirmHistory}
                            onChange={e => setConfirmHistory(e.target.checked)}
                            className="mt-0.5 rounded border-rose-400 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-rose-950 dark:text-rose-100 leading-relaxed">
                            Tôi xác nhận GCN này đã phát sinh giao dịch/lịch sử và hiểu việc tái cấp mã làm thay đổi mã trên hệ thống; nhãn, hợp đồng, tài liệu ngoài hệ thống phải cập nhật theo.
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!successInfo && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loadingApply}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplyDisabled}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loadingApply ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tái cấp mã...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Xác nhận tái cấp mã</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
