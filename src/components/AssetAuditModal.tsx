import React, { useEffect, useState } from 'react';
import { Asset, AuditLog } from '../types';
import { fetchAuditLogs } from '../api/auditLogs';
import { 
  X, 
  History, 
  User, 
  Clock, 
  ArrowRight, 
  Calendar, 
  FileText, 
  Code, 
  CheckCircle2, 
  RefreshCw, 
  UploadCloud, 
  Layers, 
  Building2, 
  Tag, 
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface Props {
  asset: Asset;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, { label: string; icon?: any }> = {
  business_project_name: { label: 'Tên Dự Án Kinh Doanh (Bán hàng)', icon: Building2 },
  business_plot_code: { label: 'Mã Lô Kinh Doanh (Mã bán hàng)', icon: Tag },
  project_id: { label: 'Dự Án Pháp Lý' },
  subdivision: { label: 'Phân Khu', icon: Layers },
  lot_no: { label: 'Số Lô / Thửa Pháp Lý' },
  land_lot_no: { label: 'Số Thửa Bản Đồ' },
  map_sheet_no: { label: 'Số Tờ Bản Đồ' },
  area: { label: 'Diện Tích (m²)' },
  owner_name: { label: 'Chủ Sở Hữu' },
  asset_type: { label: 'Loại Tài Sản' },
  usage_purpose: { label: 'Mục Đích Sử Dụng' },
  land_use_purpose: { label: 'Mục Đích Sử Dụng Đất' },
  land_use_term: { label: 'Thời Hạn Sử Dụng' },
  sale_status: { label: 'Trạng Thái Kinh Doanh' },
  custody_status: { label: 'Trạng Thái Lưu Kho' },
  lifecycle_status: { label: 'Trạng Thái Pháp Lý' },
  mortgage_status: { label: 'Trạng Thái Thế Chấp' },
  mortgage_bank: { label: 'Ngân Hàng Thế Chấp' },
  warehouse_id: { label: 'Kho Lưu Trữ' },
  notes: { label: 'Ghi Chú' },
  certificate_no: { label: 'Số GCN QSDĐ' },
  certificate_group: { label: 'Nhóm Sổ' },
};

function formatValue(val: any): string {
  if (val === null || val === undefined || val === '') return '(Trống / Chưa gán)';
  if (typeof val === 'boolean') return val ? 'Có' : 'Không';
  if (typeof val === 'number') return val.toLocaleString('vi-VN');
  
  // Statuses
  if (val === 'ready_for_sale') return 'Sẵn sàng bán';
  if (val === 'not_ready') return 'Chưa sẵn sàng bán';
  if (val === 'sold') return 'Đã bán';
  if (val === 'in_stock') return 'Trong kho';
  if (val === 'checked_out') return 'Đang mượn';
  if (val === 'active') return 'Đang hiệu lực';
  if (val === 'split') return 'Đã tách thửa';
  if (val === 'invalidated') return 'Vô hiệu';
  if (val === 'mortgaged') return 'Đang thế chấp';
  if (val === 'none') return 'Không thế chấp';

  return String(val);
}

export const AssetAuditModal: React.FC<Props> = ({ asset, onClose }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRawJson, setShowRawJson] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs(asset.id);
      setLogs(data);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [asset.id]);

  const toggleJson = (logId: string) => {
    setShowRawJson(prev => ({ ...prev, [logId]: !prev[logId] }));
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Khởi Tạo Bản Ghi
          </span>
        );
      case 'BULK_UPDATE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Layers className="w-3.5 h-3.5" />
            Sửa Hàng Loạt
          </span>
        );
      case 'IMPORT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <UploadCloud className="w-3.5 h-3.5" />
            Nhập Từ Excel
          </span>
        );
      case 'UPDATE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <RefreshCw className="w-3.5 h-3.5" />
            Cập Nhật Thông Tin
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <History className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Lịch Sử Biến Động & Audit Log</h2>
                <span className="bg-blue-600/60 text-blue-100 text-[11px] px-2 py-0.5 rounded-full font-mono">
                  {logs.length} bản ghi
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Số GCN: <strong className="text-white font-mono">{asset.certificate_no}</strong> | Mã: {asset.asset_code || asset.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Asset Overview Card */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-600 block text-[11px]">Dự Án Pháp Lý</span>
            <span className="font-semibold text-slate-800 truncate block">{asset.projects?.name || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-600 block text-[11px]">Dự Án Kinh Doanh</span>
            <span className="font-semibold text-emerald-700 truncate block">
              {asset.business_project_name || '(Chưa gán)'}
            </span>
          </div>
          <div>
            <span className="text-slate-600 block text-[11px]">Số Lô / Mã KD</span>
            <span className="font-mono font-bold text-indigo-700 block">
              {asset.lot_no || 'N/A'} {asset.business_plot_code ? `➔ ${asset.business_plot_code}` : ''}
            </span>
          </div>
          <div>
            <span className="text-slate-600 block text-[11px]">Người cập nhật cuối</span>
            <span className="font-medium text-slate-700 block truncate">
              {asset.updater?.full_name || asset.updater?.email || 'Hệ thống'}
            </span>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs">Đang tải lịch sử thay đổi...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600 space-y-3 bg-white rounded-2xl border border-dashed border-slate-300 p-8">
              <ShieldCheck className="w-12 h-12 text-slate-300" />
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">Chưa có lịch sử biến động</p>
                <p className="text-xs text-slate-600 mt-1 max-w-xs">
                  Mọi thao tác chỉnh sửa đơn lẻ, sửa hàng loạt hoặc import Excel sẽ được tự động lưu vết tại đây.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {logs.map((log) => {
                const dateObj = new Date(log.created_at);
                const timeAgo = formatDistanceToNow(dateObj, { addSuffix: true, locale: vi });
                const isJsonOpen = !!showRawJson[log.id];

                const oldData = log.old_data || {};
                const newData = log.new_data || {};
                const changedKeys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));

                return (
                  <div key={log.id} className="relative group">
                    {/* Dot on timeline */}
                    <div className="absolute -left-6 top-3.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-600 shadow-xs ring-2 ring-blue-100" />

                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-all overflow-hidden">
                      {/* Event Header */}
                      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getActionBadge(log.action)}
                          <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-600" />
                            {log.profiles?.full_name || log.changed_by_name || log.profiles?.email || 'Người dùng hệ thống'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                          <Clock className="w-3.5 h-3.5 text-slate-600" />
                          <span>{format(dateObj, 'dd/MM/yyyy HH:mm:ss')}</span>
                          <span className="text-slate-600">({timeAgo})</span>
                        </div>
                      </div>

                      {/* Event Notes */}
                      {log.notes && (
                        <div className="px-4 py-2 bg-blue-50/40 border-b border-blue-50 text-xs text-blue-900 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{log.notes}</span>
                        </div>
                      )}

                      {/* Field Differences Table */}
                      <div className="p-4">
                        {changedKeys.length > 0 ? (
                          <div className="border border-slate-100 rounded-lg overflow-hidden">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-100/70 text-slate-600 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-200">
                                <tr>
                                  <th className="py-2 px-3 w-1/3">Trường dữ liệu</th>
                                  <th className="py-2 px-3 w-1/3 text-rose-700">Giá trị cũ</th>
                                  <th className="py-2 px-3 w-1/3 text-emerald-700">Giá trị mới</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {changedKeys.map((key) => {
                                  const fieldMeta = FIELD_LABELS[key];
                                  const label = fieldMeta ? fieldMeta.label : key;
                                  const Icon = fieldMeta?.icon;
                                  const oldV = oldData[key];
                                  const newV = newData[key];

                                  return (
                                    <tr key={key} className="hover:bg-slate-50/60 transition-colors">
                                      <td className="py-2 px-3 font-medium text-slate-700">
                                        <div className="flex items-center gap-1.5">
                                          {Icon && <Icon className="w-3.5 h-3.5 text-blue-600" />}
                                          <span>{label}</span>
                                        </div>
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 font-mono text-[11px] bg-rose-50/30">
                                        {formatValue(oldV)}
                                      </td>
                                      <td className="py-2 px-3 text-emerald-900 font-semibold font-mono text-[11px] bg-emerald-50/40">
                                        <div className="flex items-center gap-1">
                                          <ArrowRight className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span>{formatValue(newV)}</span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-600 italic py-1">
                            {log.action === 'CREATE' ? 'Khởi tạo tài sản mới với đầy đủ thuộc tính.' : 'Không có chi tiết trường thay đổi.'}
                          </div>
                        )}

                        {/* Raw JSON toggle */}
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleJson(log.id)}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
                          >
                            <Code className="w-3.5 h-3.5" />
                            <span>{isJsonOpen ? 'Ẩn chi tiết Payload JSON' : 'Xem chi tiết Payload JSON'}</span>
                            {isJsonOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          <span className="text-slate-600 font-mono text-[10px]">ID: {log.id}</span>
                        </div>

                        {isJsonOpen && (
                          <div className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto space-y-2">
                            <div>
                              <span className="text-rose-400 font-bold block mb-1">OLD_DATA:</span>
                              <pre className="text-[10px] text-rose-200">{JSON.stringify(oldData, null, 2)}</pre>
                            </div>
                            <div className="border-t border-slate-800 pt-2">
                              <span className="text-emerald-400 font-bold block mb-1">NEW_DATA:</span>
                              <pre className="text-[10px] text-emerald-200">{JSON.stringify(newData, null, 2)}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Hệ thống tự động ghi vết theo chuẩn bảo mật Supabase Postgres Trigger & Webhook
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors shadow-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
