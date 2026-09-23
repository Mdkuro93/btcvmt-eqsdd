import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  FileText, 
  Building2, 
  Warehouse, 
  Calendar, 
  AlertTriangle,
  Landmark
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Asset } from '../../types';

interface AssetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  assets: Asset[];
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  assets,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const filteredAssets = useMemo(() => {
    if (!searchTerm.trim()) return assets;
    const s = searchTerm.trim().toLowerCase();
    return assets.filter(a => 
      (a.certificate_no && a.certificate_no.toLowerCase().includes(s)) ||
      (a.asset_code && a.asset_code.toLowerCase().includes(s)) ||
      (a.legal_lot_code && a.legal_lot_code.toLowerCase().includes(s)) ||
      (a.projects?.name && a.projects.name.toLowerCase().includes(s)) ||
      (a.business_project_name && a.business_project_name.toLowerCase().includes(s)) ||
      (a.warehouses?.name && a.warehouses.name.toLowerCase().includes(s)) ||
      (a.mortgage_bank && a.mortgage_bank.toLowerCase().includes(s)) ||
      (a.current_holder_dept && a.current_holder_dept.toLowerCase().includes(s))
    );
  }, [assets, searchTerm]);

  const handleCopy = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">{title}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                {assets.length} GCN
              </span>
            </div>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Tìm theo số GCN, mã TSĐB, dự án, ngân hàng, người giữ..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>
          <Link
            to="/assets"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Mở trong Danh mục GCN</span>
          </Link>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-4">
          {filteredAssets.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              Không tìm thấy Giấy chứng nhận nào khớp với từ khóa tìm kiếm.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 w-10 text-center">STT</th>
                    <th className="py-2.5 px-3">Số GCN & Mã TSĐB</th>
                    <th className="py-2.5 px-3">Dự Án / Kho</th>
                    <th className="py-2.5 px-3">Tình Trạng Lưu Kho</th>
                    <th className="py-2.5 px-3">Thế Chấp & Ngân Hàng</th>
                    <th className="py-2.5 px-3">Đơn Vị Mượn / Ngày Hạn</th>
                    <th className="py-2.5 px-3 text-right">Diện tích</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredAssets.map((asset, idx) => {
                    const isOverdue = 
                      asset.custody_status === 'checked_out' &&
                      asset.expected_return_date &&
                      new Date(asset.expected_return_date) < new Date();

                    return (
                      <tr key={asset.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <span>{asset.certificate_no}</span>
                            {asset.certificate_group === 'so_lon' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                                Sổ lớn
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[11px] text-slate-500">
                              {asset.asset_code || '-'}
                            </span>
                            {asset.asset_code && (
                              <button
                                onClick={e => handleCopy(asset.asset_code!, e)}
                                className="text-slate-400 hover:text-slate-600 p-0.5"
                                title="Sao chép mã TSĐB"
                              >
                                {copiedCode === asset.asset_code ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                            {asset.legal_lot_code && (
                              <span className="text-[11px] text-slate-400">
                                · Lô: {asset.legal_lot_code}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-800 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="truncate max-w-[160px]" title={asset.projects?.name || asset.business_project_name || ''}>
                              {asset.projects?.name || asset.business_project_name || 'Chưa gắn dự án'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                            <Warehouse className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]" title={asset.warehouses?.name || ''}>
                              {asset.warehouses?.name || 'Kho trung tâm'}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          {asset.custody_status === 'in_stock' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                              Trong kho
                            </span>
                          ) : asset.custody_status === 'checked_out' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                              Đang mượn
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                              Đã xuất kho
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {asset.mortgage_status === 'mortgaged' ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                  Đang thế chấp
                                </span>
                                {asset.mortgage_bank && (
                                  <span className="font-semibold text-slate-900 text-[11px] truncate max-w-[120px]" title={asset.mortgage_bank}>
                                    {asset.mortgage_bank}
                                  </span>
                                )}
                              </div>
                              {asset.collateral_value ? (
                                <div className="text-[11px] font-medium text-emerald-700">
                                  {Number(asset.collateral_value).toLocaleString('vi-VN')} đ
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {asset.custody_status === 'checked_out' ? (
                            <div>
                              <div className="font-medium text-slate-800 text-[11px]">
                                {asset.current_holder_dept || 'Chưa rõ đơn vị'}
                              </div>
                              <div className="text-[11px] flex items-center gap-1 mt-0.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                                  Hạn: {asset.expected_return_date || '-'}
                                </span>
                                {isOverdue && (
                                  <span className="px-1 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 whitespace-nowrap">
                                    Quá hạn
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                          {asset.area ? `${Number(asset.area).toLocaleString('vi-VN')} m²` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            Hiển thị <span className="font-bold text-slate-800">{filteredAssets.length}</span> / {assets.length} GCN
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-100 transition-colors shadow-2xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
