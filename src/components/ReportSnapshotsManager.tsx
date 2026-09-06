import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Unlock, 
  ShieldAlert, 
  ShieldCheck, 
  History, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  Eye, 
  Download, 
  Plus, 
  X, 
  FileSpreadsheet, 
  Loader2,
  Database,
  Building2,
  Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { ReportSnapshot, DenormalizedReportAsset, Asset } from '../types';
import { 
  fetchReportSnapshots, 
  createReportSnapshot, 
  reopenReportingPeriod, 
  lockReportingPeriod, 
  deleteReportSnapshot 
} from '../api/reportSnapshots';
import { fetchAuditLogs } from '../api/auditLogs';
import { AuditLog } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface ReportSnapshotsManagerProps {
  currentAssets: Asset[];
  currentRegion: string;
  currentWarehouseName?: string;
  onRefreshParent?: () => void;
}

export const ReportSnapshotsManager: React.FC<ReportSnapshotsManagerProps> = ({
  currentAssets,
  currentRegion,
  currentWarehouseName,
  onRefreshParent,
}) => {
  const { profile } = useAuth();
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Modals state
  const [showListModal, setShowListModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState<ReportSnapshot | null>(null);
  
  // Reopen Period state
  const [reopenTarget, setReopenTarget] = useState<ReportSnapshot | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);

  // Lock target state
  const [lockTarget, setLockTarget] = useState<ReportSnapshot | null>(null);
  const [lockNotes, setLockNotes] = useState('');
  const [isSubmittingLock, setIsSubmittingLock] = useState(false);

  // Audit Logs modal
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // New Snapshot Form State
  const defaultYear = new Date().getFullYear();
  const defaultMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const [newCode, setNewCode] = useState(`BC-${defaultYear}-${defaultMonth}`);
  const [newPeriod, setNewPeriod] = useState(`Tháng ${defaultMonth}/${defaultYear}`);
  const [newTitle, setNewTitle] = useState(`Báo cáo Tồn kho GCN QSDĐ & TSĐB Kỳ Tháng ${defaultMonth}/${defaultYear}`);
  const [newDept, setNewDept] = useState('Ban Tài Chính VMT');
  const [newStatus, setNewStatus] = useState<'open' | 'locked'>('locked');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Frozen data search & filter
  const [frozenSearchTerm, setFrozenSearchTerm] = useState('');

  useEffect(() => {
    loadSnapshots();
  }, []);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      const data = await fetchReportSnapshots();
      setSnapshots(data);
    } catch (err: any) {
      console.error('Lỗi tải danh sách kỳ báo cáo:', err);
      toast.error('Lỗi tải danh sách kỳ báo cáo');
    } finally {
      setLoading(false);
    }
  };

  // Open Reopen Dialog
  const handleInitiateReopen = (snapshot: ReportSnapshot) => {
    setReopenTarget(snapshot);
    setReopenReason('');
  };

  // Execute RPC reopen_reporting_period
  const handleConfirmReopen = async () => {
    if (!reopenTarget) return;
    if (!reopenReason || reopenReason.trim().length < 5) {
      toast.error('Vui lòng nhập lý do mở khóa rõ ràng (tối thiểu 5 ký tự)');
      return;
    }

    setIsSubmittingReopen(true);
    try {
      const res = await reopenReportingPeriod(reopenTarget.id, reopenReason, {
        id: profile?.id,
        full_name: profile?.full_name,
        email: profile?.email,
      });

      toast.success(res.message || 'Mở khóa kỳ báo cáo thành công!');
      setReopenTarget(null);
      setReopenReason('');
      await loadSnapshots();
      if (viewingSnapshot && viewingSnapshot.id === reopenTarget.id) {
        setViewingSnapshot(prev => prev ? { ...prev, period_status: 'open', reopened_at: new Date().toISOString(), reopen_reason: reopenReason } : null);
      }
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi mở khóa: ' + (err.message || 'Không thể thực thi'));
    } finally {
      setIsSubmittingReopen(false);
    }
  };

  // Execute lock_reporting_period
  const handleConfirmLock = async () => {
    if (!lockTarget) return;
    setIsSubmittingLock(true);
    try {
      const res = await lockReportingPeriod(lockTarget.id, lockNotes, {
        id: profile?.id,
        full_name: profile?.full_name,
        email: profile?.email,
      });

      toast.success(res.message || 'Đã chốt và khóa kỳ báo cáo!');
      setLockTarget(null);
      setLockNotes('');
      await loadSnapshots();
      if (viewingSnapshot && viewingSnapshot.id === lockTarget.id) {
        setViewingSnapshot(prev => prev ? { ...prev, period_status: 'locked', locked_at: new Date().toISOString() } : null);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi khóa: ' + (err.message || 'Không thể khóa'));
    } finally {
      setIsSubmittingLock(false);
    }
  };

  // Handle Delete Snapshot (Protected by RLS)
  const handleDeleteSnapshot = async (snapshot: ReportSnapshot) => {
    if (snapshot.period_status === 'locked') {
      toast.error('Chính sách RLS: Kỳ báo cáo đã bị KHÓA (locked). Cấm mọi thao tác xóa!');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa kỳ báo cáo "${snapshot.title}"?`)) {
      return;
    }

    try {
      await deleteReportSnapshot(snapshot.id);
      toast.success('Đã xóa kỳ báo cáo');
      await loadSnapshots();
      if (viewingSnapshot?.id === snapshot.id) setViewingSnapshot(null);
    } catch (err: any) {
      toast.error('Không thể xóa: ' + err.message);
    }
  };

  // Submit New Snapshot with Denormalized Data
  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newPeriod.trim() || !newTitle.trim()) {
      toast.error('Vui lòng điền đầy đủ Mã báo cáo, Kỳ báo cáo và Tiêu đề');
      return;
    }

    if (currentAssets.length === 0) {
      toast.error('Không có tài sản nào trong bộ lọc hiện tại để nộp báo cáo!');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const snapshot = await createReportSnapshot({
        report_code: newCode.trim(),
        report_period: newPeriod.trim(),
        title: newTitle.trim(),
        region: currentRegion,
        warehouse_name: currentWarehouseName || 'Kho Tổng Trung Tâm Tập Đoàn VMT',
        department_name: newDept.trim() || 'Ban Tài Chính VMT',
        submitted_by: profile?.id || null,
        submitted_by_name: profile?.full_name || profile?.email || 'Quản trị viên',
        period_status: newStatus,
        notes: newNotes.trim(),
        assets: currentAssets,
      });

      toast.success(
        newStatus === 'locked' 
          ? 'Đã nộp và CHỐT KHÓA kỳ báo cáo thành công! Dữ liệu tĩnh đã được niêm phong.'
          : 'Đã lưu kỳ báo cáo ở trạng thái MỞ (Open).'
      );

      setShowCreateModal(false);
      setNewNotes('');
      await loadSnapshots();
      setViewingSnapshot(snapshot);
      setShowListModal(true);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi nộp báo cáo: ' + (err.message || 'Không thể tạo bản ghi'));
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // View Audit Logs for Reopens
  const handleViewAuditLogs = async (recordId?: string) => {
    setLoadingAudit(true);
    setShowAuditModal(true);
    try {
      const logs = await fetchAuditLogs(recordId);
      // Filter logs related to report snapshots or reopening
      const filtered = logs.filter(l => 
        l.action === 'REOPEN_REPORT_PERIOD' || 
        l.action === 'LOCK_REPORT_PERIOD' ||
        (recordId && l.record_id === recordId)
      );
      setAuditLogs(filtered);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải nhật ký kiểm toán');
    } finally {
      setLoadingAudit(false);
    }
  };

  // Export Frozen Snapshot to Excel
  const exportFrozenExcel = (snapshot: ReportSnapshot) => {
    try {
      const wsData: any[][] = [];
      wsData.push(['TẬP ĐOÀN SUN GROUP / TẬP ĐOÀN VMT', '', '', 'BAN TÀI CHÍNH TẬP ĐOÀN']);
      wsData.push([snapshot.title.toUpperCase()]);
      wsData.push([`Mã báo cáo: ${snapshot.report_code} | Kỳ báo cáo: ${snapshot.report_period} | Trạng thái: ${snapshot.period_status === 'locked' ? 'ĐÃ KHÓA (LOCKED)' : 'ĐANG MỞ (OPEN)'}`]);
      wsData.push([`Ngày nộp: ${new Date(snapshot.submitted_at).toLocaleDateString('vi-VN')} | Đơn vị nộp: ${snapshot.department_name || 'Ban Tài Chính'} | Kho: ${snapshot.warehouse_name || 'Tất cả'}`]);
      if (snapshot.locked_at) {
        wsData.push([`Thời điểm khóa: ${new Date(snapshot.locked_at).toLocaleString('vi-VN')} bởi ${snapshot.locked_by_name || 'Admin'}`]);
      }
      wsData.push([]); // blank

      // Headers
      wsData.push([
        'STT',
        'Mã Tài Sản',
        'Số GCN',
        'Dự Án (Tĩnh)',
        'Dự Án KD (Tĩnh)',
        'Vùng / Miền (Tĩnh)',
        'Kho Lưu Trữ (Tĩnh)',
        'Đơn Vị Quản Lý (Tĩnh)',
        'Bộ Phận Đang Mượn (Tĩnh)',
        'Loại Tài Sản (Tĩnh)',
        'Loại Đất (Tĩnh)',
        'Mục Đích Sử Dụng (Tĩnh)',
        'Thời Hạn (Tĩnh)',
        'Chủ Sở Hữu (Tĩnh)',
        'Nhóm Sổ',
        'Phân Khu',
        'Số Lô',
        'Thửa Đất Số',
        'Tờ Bản Đồ',
        'Mã Lô Đất',
        'Diện Tích (m²)',
        'Địa Chỉ Chi Tiết (Tĩnh)',
        'Trạng Thái Thế Chấp',
        'Ngân Hàng Thế Chấp (Tĩnh)',
        'Đơn Vị Vay (Tĩnh)',
        'Giá Trị Định Giá (VNĐ)',
        'Tỷ Lệ Đảm Bảo (%)',
        'Giá Trị Đảm Bảo (VNĐ)',
        'Trạng Thái Lưu Kho',
        'Tình Trạng Pháp Lý',
        'Ghi Chú'
      ]);

      snapshot.report_data.forEach((item, index) => {
        wsData.push([
          index + 1,
          item.asset_code,
          item.certificate_no,
          item.project_name,
          item.business_project_name || '-',
          item.region_name || '-',
          item.warehouse_name,
          item.department_name || '-',
          item.current_holder_dept || '-',
          item.asset_type_name,
          item.land_use_type_name,
          item.usage_purpose || '-',
          item.usage_term || '-',
          item.owner_name,
          item.certificate_group_label || 'Sổ chính',
          item.subdivision || '-',
          item.lot_no || '-',
          item.land_lot_no || '-',
          item.map_sheet_no || '-',
          item.plot_code,
          item.area || 0,
          item.address_detail,
          item.mortgage_status_label,
          item.mortgage_bank_name || 'Không',
          item.mortgage_unit_name || 'Không',
          item.mortgage_valuation || 0,
          item.collateral_ratio ? `${item.collateral_ratio}%` : '-',
          item.collateral_value || 0,
          item.custody_status_label,
          item.lifecycle_status_label,
          item.notes || ''
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dữ Liệu Tĩnh Đã Chốt');
      XLSX.writeFile(wb, `${snapshot.report_code}-${snapshot.report_period.replace(/[\/\s]/g, '-')}-Du-Lieu-Tinh.xlsx`);
      toast.success('Xuất file Excel dữ liệu tĩnh thành công!');
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi xuất Excel: ' + err.message);
    }
  };

  // Filtered frozen assets
  const filteredFrozenAssets = viewingSnapshot?.report_data.filter(item => {
    if (!frozenSearchTerm.trim()) return true;
    const term = frozenSearchTerm.toLowerCase();
    return (
      item.certificate_no.toLowerCase().includes(term) ||
      (item.asset_code && item.asset_code.toLowerCase().includes(term)) ||
      item.project_name.toLowerCase().includes(term) ||
      item.plot_code.toLowerCase().includes(term) ||
      (item.department_name && item.department_name.toLowerCase().includes(term)) ||
      (item.mortgage_bank_name && item.mortgage_bank_name.toLowerCase().includes(term)) ||
      (item.owner_name && item.owner_name.toLowerCase().includes(term))
    );
  }) || [];

  return (
    <>
      {/* ACTION BUTTONS GROUP */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg shadow-sm text-white bg-emerald-700 hover:bg-emerald-800 transition cursor-pointer"
        >
          <Lock className="w-4 h-4 mr-1.5" />
          Chốt & Nộp Kỳ Báo Cáo
        </button>

        <button
          type="button"
          onClick={() => {
            setShowListModal(true);
            loadSnapshots();
          }}
          className="inline-flex items-center px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 shadow-sm transition cursor-pointer"
        >
          <History className="w-4 h-4 mr-1.5 text-blue-600" />
          Lịch Sử Kỳ Báo Cáo ({snapshots.length})
          {snapshots.some(s => s.period_status === 'locked') && (
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700">
              RLS Locked
            </span>
          )}
        </button>
      </div>

      {/* ==============================================================================
          MODAL 1: NỘP & CHỐT KỲ BÁO CÁO (DENORMALIZATION ENGINE)
         ============================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200 overflow-hidden transform transition-all animate-in fade-in zoom-in duration-150">
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/15 rounded-lg">
                  <Database className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Nộp & Chốt Kỳ Báo Cáo CSDL</h3>
                  <p className="text-xs text-emerald-100">
                    Lưu toàn bộ dữ liệu tĩnh (Denormalization JSONB) & Khóa an toàn bằng RLS
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSnapshot} className="p-6 space-y-5">
              {/* Thông tin cảnh báo nguyên lý tĩnh */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-900 leading-relaxed">
                <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block mb-0.5 text-amber-950">
                    Cơ chế Lưu Dữ Liệu Tĩnh (Denormalization) Bảo Vệ Lịch Sử:
                  </strong>
                  Toàn bộ tên phòng ban, tên loại đất, tên tài sản và tên dự án của{' '}
                  <span className="font-bold text-amber-950">{currentAssets.length} tài sản</span> sẽ được lưu dưới dạng chuỗi văn bản tĩnh vào trường <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">report_data (JSONB)</code>. Nếu sau này có thay đổi tên danh mục hay dự án, số liệu của kỳ báo cáo này sẽ không bao giờ bị biến động sai lệch.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Mã kỳ báo cáo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="Ví dụ: BC-2026-09"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Tên kỳ hiển thị <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                    placeholder="Ví dụ: Tháng 09/2026"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Tiêu đề báo cáo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ví dụ: Báo cáo Kiểm kê Tồn kho GCN QSDĐ Tháng 09/2026"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Đơn vị lập báo cáo (Tĩnh)
                  </label>
                  <input
                    type="text"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    placeholder="Ban Tài Chính VMT"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Trạng thái khởi tạo
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold"
                  >
                    <option value="locked">🔒 Khóa ngay (Locked - Áp dụng RLS cấm sửa/xóa)</option>
                    <option value="open">🟢 Mở (Open - Cho phép hiệu chỉnh tiếp)</option>
                  </select>
                </div>
              </div>

              {/* Tóm tắt số liệu sẽ được chốt */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center justify-between">
                  <span>Số Liệu Snapshot Sẽ Niêm Phong</span>
                  <span className="text-emerald-700 font-mono">{currentAssets.length} GCN</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="bg-white p-2 rounded-lg border border-gray-200">
                    <span className="text-gray-500 block text-[11px]">Tổng số GCN</span>
                    <strong className="text-sm font-bold text-gray-900">{currentAssets.length}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-gray-200">
                    <span className="text-gray-500 block text-[11px]">Tổng diện tích</span>
                    <strong className="text-sm font-bold text-gray-900">
                      {currentAssets.reduce((sum, a) => sum + (a.area || 0), 0).toLocaleString('vi-VN')} m²
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-gray-200">
                    <span className="text-gray-500 block text-[11px]">Tổng định giá</span>
                    <strong className="text-sm font-bold text-blue-700">
                      {(currentAssets.reduce((sum, a) => sum + (a.mortgage_valuation || 0), 0) / 1e9).toFixed(1)} tỷ
                    </strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-gray-200">
                    <span className="text-gray-500 block text-[11px]">Đang thế chấp</span>
                    <strong className="text-sm font-bold text-amber-700">
                      {currentAssets.filter(a => a.mortgage_status === 'mortgaged').length} GCN
                    </strong>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú kỳ báo cáo
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ghi chú đối chiếu số liệu kho, biên bản bàn giao hoặc quyết định chốt sổ..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="inline-flex items-center px-5 py-2 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isSubmittingCreate ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Đang xử lý Denormalization...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {newStatus === 'locked' ? 'Nộp & Chốt Khóa RLS Ngay' : 'Lưu Kỳ Báo Cáo'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL 2: DANH SÁCH KỲ BÁO CÁO & QUẢN LÝ KHÓA RLS
         ============================================================================== */}
      {showListModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1E3A8A] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/15 rounded-lg">
                  <ShieldAlert className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">
                    Quản Lý Kỳ Báo Cáo & Khóa RLS CSDL
                  </h3>
                  <p className="text-xs text-blue-200">
                    Chính sách RLS ngăn chặn tuyệt đối UPDATE & DELETE khi kỳ báo cáo đã khóa (locked)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleViewAuditLogs()}
                  className="text-xs font-semibold px-2.5 py-1.5 bg-blue-800 hover:bg-blue-700 rounded-lg text-blue-100 flex items-center gap-1.5 transition"
                >
                  <History className="w-3.5 h-3.5" />
                  Nhật Ký Audit
                </button>
                <button 
                  onClick={() => setShowListModal(false)}
                  className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content list */}
            <div className="p-6 overflow-y-auto space-y-4">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-500 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <p className="text-sm">Đang tải danh sách kỳ báo cáo...</p>
                </div>
              ) : snapshots.length === 0 ? (
                <div className="py-12 text-center text-gray-500 space-y-3">
                  <FileText className="w-12 h-12 mx-auto text-gray-300" />
                  <p className="text-base font-semibold text-gray-700">Chưa có kỳ báo cáo nào được nộp</p>
                  <p className="text-xs text-gray-500">
                    Bấm &quot;Chốt & Nộp Kỳ Báo Cáo&quot; để lưu snapshot tĩnh đầu tiên
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {snapshots.map((snap) => {
                    const isLocked = snap.period_status === 'locked';
                    return (
                      <div 
                        key={snap.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isLocked 
                            ? 'bg-red-50/40 border-red-200 hover:border-red-300' 
                            : 'bg-emerald-50/30 border-emerald-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-gray-200 text-gray-800">
                                {snap.report_code}
                              </span>
                              <span className="text-sm font-bold text-gray-900">
                                {snap.title}
                              </span>
                              
                              {/* RLS Status Badge */}
                              {isLocked ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                  <Lock className="w-3 h-3" />
                                  ĐÃ KHÓA (LOCKED - CẤM SỬA/XÓA)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <Unlock className="w-3 h-3" />
                                  ĐANG MỞ (OPEN)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap pt-0.5">
                              <span>Kỳ: <strong className="text-gray-800">{snap.report_period}</strong></span>
                              <span>•</span>
                              <span>Số lượng GCN tĩnh: <strong className="text-emerald-800 font-bold">{snap.total_assets}</strong></span>
                              <span>•</span>
                              <span>Tổng diện tích: <strong className="text-gray-800">{snap.total_area?.toLocaleString('vi-VN')} m²</strong></span>
                              <span>•</span>
                              <span>Tổng định giá: <strong className="text-blue-800 font-bold">{(snap.total_valuation / 1e9).toFixed(1)} tỷ</strong></span>
                              <span>•</span>
                              <span>Nộp bởi: <strong className="text-gray-800">{snap.submitted_by_name || 'Admin'}</strong></span>
                            </div>

                            {isLocked && snap.locked_at && (
                              <div className="text-[11px] text-red-700 flex items-center gap-1.5 pt-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                <span>
                                  Niêm phong lúc: <strong>{new Date(snap.locked_at).toLocaleString('vi-VN')}</strong> bởi <strong>{snap.locked_by_name || 'Admin'}</strong>
                                </span>
                              </div>
                            )}

                            {!isLocked && snap.reopened_at && (
                              <div className="text-[11px] text-amber-800 flex items-center gap-1.5 pt-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>
                                  Được mở khóa lúc: <strong>{new Date(snap.reopened_at).toLocaleString('vi-VN')}</strong>. Lý do: &quot;<strong>{snap.reopen_reason}</strong>&quot;
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Action buttons for this snapshot */}
                          <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0">
                            {/* View Frozen Static Data */}
                            <button
                              type="button"
                              onClick={() => setViewingSnapshot(snap)}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Xem Dữ Liệu Tĩnh ({snap.report_data?.length || 0})
                            </button>

                            {/* Export Excel */}
                            <button
                              type="button"
                              onClick={() => exportFrozenExcel(snap)}
                              className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                              title="Xuất Excel dữ liệu tĩnh"
                            >
                              <Download className="w-3.5 h-3.5 text-gray-600" />
                            </button>

                            {/* Reopen Action (Requirement 1: Thông qua RPC reopen_reporting_period) */}
                            {isLocked ? (
                              <button
                                type="button"
                                onClick={() => handleInitiateReopen(snap)}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer"
                                title="Mở khóa kỳ báo cáo thông qua hàm RPC reopen_reporting_period()"
                              >
                                <Unlock className="w-3.5 h-3.5 mr-1" />
                                Mở Khóa (RPC)
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setLockTarget(snap)}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-lg bg-red-700 hover:bg-red-800 text-white shadow-xs cursor-pointer"
                                title="Chốt và khóa kỳ báo cáo bằng RLS"
                              >
                                <Lock className="w-3.5 h-3.5 mr-1" />
                                Chốt & Khóa
                              </button>
                            )}

                            {/* Delete Button (RLS guard test) */}
                            <button
                              type="button"
                              onClick={() => handleDeleteSnapshot(snap)}
                              className={`p-1.5 rounded-lg border transition ${
                                isLocked 
                                  ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50' 
                                  : 'border-red-200 text-red-600 hover:bg-red-50 cursor-pointer'
                              }`}
                              title={isLocked ? 'RLS Policy cấm xóa khi đã khóa' : 'Xóa kỳ báo cáo'}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Quy tắc CSDL: Row Level Security (RLS) & Trigger Guard đang hoạt động</span>
              </div>
              <button
                type="button"
                onClick={() => setShowListModal(false)}
                className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL 3: DIALOG MỞ KHÓA KỲ BÁO CÁO (HÀM RPC reopen_reporting_period)
         ============================================================================== */}
      {reopenTarget && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/15 rounded-lg">
                  <Unlock className="w-5 h-5 text-amber-100" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Mở Khóa Kỳ Báo Cáo</h3>
                  <p className="text-xs text-amber-100">Hàm RPC: reopen_reporting_period()</p>
                </div>
              </div>
              <button 
                onClick={() => setReopenTarget(null)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
                <strong className="block font-bold text-amber-950 mb-1">
                  Cảnh báo Bảo mật & Nhật Ký Kiểm Toán:
                </strong>
                Báo cáo <span className="font-bold font-mono">[{reopenTarget.report_code} - {reopenTarget.report_period}]</span> hiện đang bị KHÓA bởi chính sách RLS.
                Để mở lại trạng thái <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">open</code>, hệ thống bắt buộc phải ghi vết lý do mở khóa vào <strong className="text-amber-950">audit_logs</strong> theo quy định an toàn CSDL.
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Lý do mở khóa kỳ báo cáo <span className="text-red-500">* (Bắt buộc, tối thiểu 5 ký tự)</span>
                </label>
                <textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Ví dụ: Theo yêu cầu của Ban Lãnh Đạo cập nhật số liệu giải chấp lô B2-12-35 ngày 04/09..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setReopenTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isSubmittingReopen || reopenReason.trim().length < 5}
                  onClick={handleConfirmReopen}
                  className="inline-flex items-center px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isSubmittingReopen ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Đang thực thi RPC...
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4 mr-2" />
                      Xác Nhận Mở Khóa & Ghi Audit Log
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL 4: DIALOG CHỐT VÀ KHÓA KỲ BÁO CÁO
         ============================================================================== */}
      {lockTarget && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-gradient-to-r from-red-700 to-red-800 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/15 rounded-lg">
                  <Lock className="w-5 h-5 text-red-100" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Chốt Sổ & Khóa Kỳ Báo Cáo</h3>
                  <p className="text-xs text-red-200">Kích hoạt bảo vệ RLS cấm sửa/xóa</p>
                </div>
              </div>
              <button 
                onClick={() => setLockTarget(null)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 leading-relaxed">
                <strong className="block font-bold text-red-950 mb-1">
                  Xác nhận khóa kỳ báo cáo:
                </strong>
                Sau khi khóa, chính sách Row Level Security (RLS) trên PostgreSQL sẽ cấm toàn bộ thao tác UPDATE và DELETE (kể cả với tài khoản Admin).
                Mọi nhu cầu sửa dữ liệu sau này bắt buộc phải gọi hàm RPC <code className="font-mono bg-red-100 px-1 py-0.5 rounded text-red-900">reopen_reporting_period()</code> có ghi lý do.
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú chốt sổ (Tùy chọn)
                </label>
                <textarea
                  value={lockNotes}
                  onChange={(e) => setLockNotes(e.target.value)}
                  placeholder="Ví dụ: Đã đối chiếu khớp hồ sơ thủ kho và ban tài chính..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setLockTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isSubmittingLock}
                  onClick={handleConfirmLock}
                  className="inline-flex items-center px-4 py-2 text-sm font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isSubmittingLock ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Đang khóa...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Xác Nhận Khóa Kỳ Báo Cáo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL 5: XEM CHI TIẾT DỮ LIỆU TĨNH ĐÃ CHỐT (DENORMALIZED REPORT_DATA JSONB)
         ============================================================================== */}
      {viewingSnapshot && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-black/60 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-7xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[92vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-900 via-blue-950 to-gray-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Database className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-2 py-0.5 bg-white/20 rounded font-bold">
                      {viewingSnapshot.report_code}
                    </span>
                    <h3 className="font-bold text-base sm:text-lg">
                      {viewingSnapshot.title}
                    </h3>
                    {viewingSnapshot.period_status === 'locked' ? (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-900/80 text-red-200 border border-red-700 font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> ĐÃ KHÓA (RLS PROTECTED)
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-900/80 text-emerald-200 border border-emerald-700 font-bold flex items-center gap-1">
                        <Unlock className="w-3 h-3" /> ĐANG MỞ (OPEN)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 mt-0.5">
                    Trích xuất từ trường <code className="text-emerald-300 font-mono">report_data</code> (JSONB) lưu tĩnh - Hoàn toàn độc lập với các thay đổi danh mục hiện tại
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportFrozenExcel(viewingSnapshot)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white transition shadow-sm"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Xuất Excel Dữ Liệu Tĩnh
                </button>
                <button 
                  onClick={() => setViewingSnapshot(null)}
                  className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter toolbar & Snapshot statistics */}
            <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
                <span>Kỳ: <strong className="text-gray-900">{viewingSnapshot.report_period}</strong></span>
                <span>•</span>
                <span>Tổng GCN tĩnh: <strong className="text-emerald-700 font-bold">{viewingSnapshot.total_assets}</strong></span>
                <span>•</span>
                <span>Tổng diện tích: <strong className="text-gray-900">{viewingSnapshot.total_area?.toLocaleString('vi-VN')} m²</strong></span>
                <span>•</span>
                <span>Tổng định giá: <strong className="text-blue-700 font-bold">{(viewingSnapshot.total_valuation / 1e9).toFixed(1)} tỷ VNĐ</strong></span>
                <span>•</span>
                <span>Đơn vị nộp: <strong className="text-gray-900">{viewingSnapshot.department_name || 'Ban Tài Chính VMT'}</strong></span>
              </div>

              <div className="w-full md:w-72">
                <input
                  type="text"
                  value={frozenSearchTerm}
                  onChange={(e) => setFrozenSearchTerm(e.target.value)}
                  placeholder="Lọc số GCN, lô đất, dự án tĩnh..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Table with static text values */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left text-gray-700 border-collapse">
                <thead className="bg-gray-100 text-gray-800 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-gray-300">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-center w-12">STT</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Số GCN</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Mã Lô Đất</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Dự Án (Tĩnh)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Kho Lưu Trữ (Tĩnh)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Đơn Vị Quản Lý (Tĩnh)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Loại Đất / Mục Đích (Tĩnh)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap text-right">Diện Tích (m²)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Chủ Sở Hữu (Tĩnh)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Thế Chấp</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Ngân Hàng (Tĩnh)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap text-right">Định Giá (VNĐ)</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Tình Trạng Kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFrozenAssets.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-gray-400">
                        Không tìm thấy tài sản tĩnh nào phù hợp bộ lọc tìm kiếm
                      </td>
                    </tr>
                  ) : (
                    filteredFrozenAssets.map((asset, idx) => (
                      <tr key={asset.asset_id || idx} className="hover:bg-blue-50/40 transition">
                        <td className="py-2 px-3 border-r border-gray-200 text-center text-gray-500 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 font-mono font-bold text-red-700 whitespace-nowrap">
                          {asset.certificate_no}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 font-mono text-gray-900 whitespace-nowrap">
                          {asset.plot_code}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 whitespace-nowrap font-medium text-gray-900">
                          {asset.project_name}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 whitespace-nowrap text-gray-600">
                          {asset.warehouse_name}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 whitespace-nowrap text-gray-700 font-medium">
                          {asset.department_name || '-'}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 whitespace-nowrap text-gray-600">
                          {asset.land_use_type_name}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">
                          {asset.area ? asset.area.toLocaleString('vi-VN') : 0}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 text-gray-700 whitespace-nowrap">
                          {asset.owner_name}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 whitespace-nowrap">
                          {asset.mortgage_status_label === 'Đã thế chấp' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              Đã thế chấp
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                              Chưa thế chấp
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 text-gray-600 whitespace-nowrap">
                          {asset.mortgage_bank_name || '-'}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 text-right font-mono font-bold text-blue-700 whitespace-nowrap">
                          {asset.mortgage_valuation ? asset.mortgage_valuation.toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 whitespace-nowrap text-gray-600">
                          {asset.custody_status_label}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600 shrink-0">
              <div>
                Đang hiển thị <strong>{filteredFrozenAssets.length}</strong> / <strong>{viewingSnapshot.report_data?.length || 0}</strong> tài sản tĩnh đã chốt
              </div>
              <button
                type="button"
                onClick={() => setViewingSnapshot(null)}
                className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Đóng màn hình
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL 6: NHẬT KÝ AUDIT TRAIL MỞ KHÓA KỲ BÁO CÁO
         ============================================================================== */}
      {showAuditModal && (
        <div className="fixed inset-0 z-65 overflow-y-auto bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <History className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Nhật Ký Kiểm Toán (Audit Logs)</h3>
                  <p className="text-xs text-gray-300">Lịch sử các lần mở khóa & chốt kỳ báo cáo</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAuditModal(false)}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
              {loadingAudit ? (
                <div className="py-8 text-center text-gray-500 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs">Đang tải nhật ký kiểm toán...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-xs">
                  Chưa có sự kiện mở khóa hoặc chốt kỳ nào trong nhật ký kiểm toán.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 rounded-xl border border-gray-200 bg-gray-50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                        log.action === 'REOPEN_REPORT_PERIOD' 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-gray-400 font-mono text-[11px]">
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <div className="text-gray-800 font-medium">
                      {log.notes}
                    </div>
                    <div className="text-gray-500 text-[11px] flex items-center gap-2">
                      <span>Thực hiện bởi: <strong>{log.changed_by_name || log.profiles?.full_name || 'Admin'}</strong></span>
                      {log.new_data?.reopen_reason && (
                        <span>• Lý do: <strong className="text-amber-900">&quot;{log.new_data.reopen_reason}&quot;</strong></span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
