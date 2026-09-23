import React, { useState, useMemo, useEffect } from 'react';
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
  Landmark,
  GitFork,
  Loader2,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Asset } from '../../types';
import { fetchAssetLineage } from '../../api/assets';

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

  // Lineage State
  const [selectedAssetForLineage, setSelectedAssetForLineage] = useState<Asset | null>(null);
  const [lineageData, setLineageData] = useState<{ parent: Asset | null; children: Asset[] } | null>(null);
  const [loadingLineage, setLoadingLineage] = useState(false);

  useEffect(() => {
    if (selectedAssetForLineage) {
      setLoadingLineage(true);
      fetchAssetLineage(selectedAssetForLineage.id)
        .then(data => setLineageData(data))
        .catch(err => {
          console.error('Failed to load asset lineage:', err);
          setLineageData({ parent: null, children: [] });
        })
        .finally(() => setLoadingLineage(false));
    } else {
      setLineageData(null);
    }
  }, [selectedAssetForLineage]);

  const handleOpenLineage = (asset: Asset, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAssetForLineage(asset);
  };

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
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 flex-wrap">
                            <span>{asset.certificate_no}</span>
                            {asset.certificate_group === 'so_lon' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                                Sổ lớn
                              </span>
                            )}
                            {(asset.status === 'REVOKED' || asset.invalidation_type === 'FULL') && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
                                ĐÃ THU HỒI / VÔ HIỆU TOÀN PHẦN
                              </span>
                            )}
                            {asset.invalidation_type === 'PARTIAL' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">
                                VÔ HIỆU MỘT PHẦN
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
                                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
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
                          {asset.parent_asset_id && (
                            <button
                              onClick={(e) => handleOpenLineage(asset, e)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline mt-0.5 cursor-pointer text-left"
                            >
                              <GitFork className="w-3 h-3 text-blue-500 shrink-0" />
                              <span>Tách/Cấp đổi từ Sổ gốc{asset.parent_asset ? `: [${asset.parent_asset.certificate_no} - ${asset.parent_asset.asset_code || ''}]` : ''}</span>
                            </button>
                          )}
                          <div className="mt-0.5">
                            <button
                              onClick={(e) => handleOpenLineage(asset, e)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 transition-colors cursor-pointer"
                            >
                              <GitFork className="w-3 h-3 text-blue-600" />
                              Nguồn gốc & Phả hệ sổ
                            </button>
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

                        <td className="py-2.5 px-3 text-right">
                          {asset.invalidation_type === 'PARTIAL' && asset.original_area ? (
                            <div>
                              <span className="text-[10px] text-slate-400 line-through block">
                                {Number(asset.original_area).toLocaleString('vi-VN')} m²
                              </span>
                              <span className="font-bold text-slate-900 text-xs">
                                {Number(asset.area).toLocaleString('vi-VN')} m²
                              </span>
                              <span className="text-[9px] text-amber-600 block font-medium">Giảm DT</span>
                            </div>
                          ) : (
                            <span className="font-medium text-slate-900">
                              {asset.area ? `${Number(asset.area).toLocaleString('vi-VN')} m²` : '-'}
                            </span>
                          )}
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
            className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* LINEAGE MODAL: Nguồn Gốc & Phả Hệ Sổ */}
      {selectedAssetForLineage && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitFork className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Nguồn Gốc & Phả Hệ Sổ (Asset Lineage)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    GCN: {selectedAssetForLineage.certificate_no} — Mã: {selectedAssetForLineage.asset_code || 'Chưa cấp mã'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAssetForLineage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Trạng thái hiệu lực */}
              {(selectedAssetForLineage.status === 'REVOKED' || selectedAssetForLineage.invalidation_type === 'FULL') ? (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                      🔴 ĐÃ THU HỒI / VÔ HIỆU TOÀN PHẦN
                    </span>
                    <p className="text-xs text-red-700 mt-1.5 leading-relaxed">
                      Giấy chứng nhận này đã bị thu hồi hoặc vô hiệu hoàn toàn sau khi hoàn tất thủ tục tách toàn phần hoặc cấp đổi. Sổ không còn giá trị pháp lý trong kho lưu trữ.
                    </p>
                  </div>
                </div>
              ) : selectedAssetForLineage.invalidation_type === 'PARTIAL' ? (
                <div className="p-3.5 bg-slate-100 border border-slate-300 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-800 border border-slate-400">
                      ⚪ VÔ HIỆU MỘT PHẦN
                    </span>
                    <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                      Sổ gốc đã được trích tách một phần diện tích để cấp GCN mới. Sổ gốc vẫn tiếp tục lưu hành với diện tích đã được giảm trừ:
                    </p>
                    <div className="mt-2 text-xs font-mono font-bold text-slate-800 flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 w-fit">
                      <span>Diện tích gốc: {selectedAssetForLineage.original_area || selectedAssetForLineage.area} m²</span>
                      <span>→</span>
                      <span className="text-blue-700">Diện tích còn lại: {selectedAssetForLineage.area} m²</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold">GCN đang có hiệu lực pháp lý và lưu hành bình thường</span>
                </div>
              )}

              {/* SỔ GỐC (Parent Asset) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <GitFork className="w-3.5 h-3.5 text-blue-600" />
                  Sổ Gốc / Nguồn Gốc Hình Thành
                </div>
                {lineageData?.parent ? (
                  <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-bold text-xs text-slate-900">
                        Tách/Cấp đổi từ Sổ gốc: [{lineageData.parent.certificate_no} - {lineageData.parent.asset_code || 'Chưa có mã'}]
                      </div>
                      {lineageData.parent.is_in_warehouse ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                          🔴 Đang lưu tại {lineageData.parent.warehouses?.name || 'Kho'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                          🟢 Đã xuất kho / Đã thu hồi
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                      <div>Dự án: <strong className="text-slate-800">{lineageData.parent.projects?.name || '-'}</strong></div>
                      <div>Diện tích: <strong className="text-slate-800">{lineageData.parent.area} m²</strong></div>
                      <div>
                        Quan hệ: <strong className="text-blue-700">
                          {selectedAssetForLineage.relationship_type === 'RENEW' ? 'Cấp đổi' : (selectedAssetForLineage.relationship_type === 'SPLIT_PARTIAL' ? 'Tách 1 phần' : 'Tách toàn phần')}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic p-3 bg-white rounded-lg border border-slate-200">
                    GCN cấp mới lần đầu hoặc không liên kết từ sổ gốc trước đó.
                  </div>
                )}
              </div>

              {/* SỔ CON ĐÃ TÁCH TỪ SỔ NÀY (Child Assets) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    Sổ con đã tách từ sổ này ({lineageData?.children.length || 0})
                  </div>
                </div>

                {loadingLineage ? (
                  <div className="flex items-center justify-center py-6 text-slate-400 gap-2 text-xs bg-white rounded-lg border border-slate-200">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    Đang truy xuất phả hệ sổ...
                  </div>
                ) : lineageData?.children && lineageData.children.length > 0 ? (
                  <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200 overflow-hidden">
                    {lineageData.children.map((child) => (
                      <div key={child.id} className="p-3 text-xs flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{child.certificate_no}</span>
                            <span className="font-mono text-slate-500 font-normal">[{child.asset_code || 'Chưa cấp mã'}]</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Diện tích: <strong className="text-slate-800">{child.area} m²</strong> · Kho: {child.warehouses?.name || 'Kho lưu trữ'}
                          </div>
                        </div>
                        <div>
                          {child.is_in_warehouse ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Trong kho
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Đã xuất kho
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic p-3 bg-white rounded-lg border border-slate-200">
                    Chưa phát sinh sổ con nào từ Giấy chứng nhận này.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedAssetForLineage(null)}
                className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
