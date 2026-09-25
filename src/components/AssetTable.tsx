import React, { useState, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Asset, Warehouse, Project, Profile } from '../types';
import { StatusBadges } from './StatusBadges';
import { formatPlotCode } from '../lib/assetIdentifier';
import { BulkWarehouseModal } from './BulkWarehouseModal';
import { BulkDeleteConfirmModal } from './BulkDeleteConfirmModal';
import {
  FileText,
  Building,
  Warehouse as WarehouseIcon,
  Copy,
  Check,
  Eye,
  CalendarClock,
  ArrowLeftRight,
  History,
  ShieldCheck,
  Edit3,
  Trash2,
  AlertTriangle,
  RefreshCw,
  X,
  CheckSquare,
  Layers,
  Download,
  MoreHorizontal,
} from 'lucide-react';

export interface AssetTableProps {
  assets: Asset[];
  totalCount?: number;
  tableDensity?: 'normal' | 'compact';
  isFetching?: boolean;
  warehouses: Warehouse[];
  projects: Project[];
  currentUser?: Profile | { id: string; email?: string; full_name?: string } | null;
  // Selection state
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  // Row item actions
  onViewDetail: (asset: Asset) => void;
  onEdit?: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;
  onTransfer?: (asset: Asset) => void;
  onHistory?: (asset: Asset) => void;
  onAudit?: (asset: Asset) => void;
  onExtend?: (asset: Asset) => void;
  onPreviewDoc?: (doc: { urlOrPath: string; certificateNo?: string; title?: string }) => void;
  // Permissions
  canEdit?: (asset: Asset) => boolean;
  canDelete?: boolean;
  canTransfer?: (asset: Asset) => boolean;
  // Bulk action hooks
  onBulkEdit?: () => void;
  onBulkRequest?: () => void;
  onBulkTransferOwnership?: () => void;
  onExportExcel?: () => void;
  onRefreshData?: () => void;
}

export const AssetTable: React.FC<AssetTableProps> = ({
  assets,
  totalCount = 0,
  tableDensity = 'normal',
  isFetching = false,
  warehouses,
  projects,
  currentUser,
  selectedIds: propSelectedIds,
  onSelectionChange,
  onViewDetail,
  onEdit,
  onDelete,
  onTransfer,
  onHistory,
  onAudit,
  onExtend,
  onPreviewDoc,
  canEdit,
  canDelete = false,
  canTransfer,
  onBulkEdit,
  onBulkRequest,
  onBulkTransferOwnership,
  onExportExcel,
  onRefreshData,
}) => {
  // Internal selection state if not controlled externally
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const selectedIds = propSelectedIds !== undefined ? propSelectedIds : internalSelectedIds;

  const updateSelectedIds = (newIds: string[]) => {
    if (onSelectionChange) {
      onSelectionChange(newIds);
    } else {
      setInternalSelectedIds(newIds);
    }
  };

  // State for modals
  const [isBulkWarehouseOpen, setIsBulkWarehouseOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Selected asset objects
  const selectedAssets = useMemo(() => {
    const idSet = new Set(selectedIds);
    return assets.filter(a => idSet.has(a.id));
  }, [assets, selectedIds]);

  // Checkbox Select All for current page
  const isAllPageSelected = assets.length > 0 && assets.every(a => selectedIds.includes(a.id));
  const isSomePageSelected = assets.length > 0 && assets.some(a => selectedIds.includes(a.id)) && !isAllPageSelected;

  const handleSelectAll = () => {
    if (isAllPageSelected) {
      const pageAssetIdSet = new Set(assets.map(a => a.id));
      const remaining = selectedIds.filter(id => !pageAssetIdSet.has(id));
      updateSelectedIds(remaining);
    } else {
      const combined = Array.from(new Set([...selectedIds, ...assets.map(a => a.id)]));
      updateSelectedIds(combined);
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      updateSelectedIds(selectedIds.filter(item => item !== id));
    } else {
      updateSelectedIds([...selectedIds, id]);
    }
  };

  const handleDeselectAll = () => {
    updateSelectedIds([]);
  };

  // Copy helper
  const handleCopy = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Overdue check
  const isAssetOverdue = (asset: Asset) => {
    if (asset.custody_status !== 'checked_out' || !asset.expected_return_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(asset.expected_return_date) < today;
  };

  const rowPadding = tableDensity === 'compact' ? 'py-1.5 px-2.5' : 'py-3 px-3';

  return (
    <div className="relative">
      {/* Table Container */}
      <div className={`overflow-x-auto relative transition-opacity duration-150 ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
        {isFetching && (
          <div className="absolute top-0 left-0 right-0 z-30 h-0.5 bg-blue-500 animate-pulse" />
        )}
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
              {/* CỘT CHECKBOX ĐẦU TIÊN BÊN TRÁI */}
              <th className={`${rowPadding} w-10 min-w-[40px] text-center whitespace-nowrap`}>
                <input
                  type="checkbox"
                  id="th-select-all"
                  checked={isAllPageSelected}
                  ref={el => {
                    if (el) el.indeterminate = isSomePageSelected;
                  }}
                  onChange={handleSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                  title={isAllPageSelected ? 'Bỏ chọn trang này' : 'Chọn tất cả trang này'}
                />
              </th>
              <th className={`${rowPadding} min-w-[170px] whitespace-nowrap`}>Số GCN & Mã TSĐB</th>
              <th className={`${rowPadding} min-w-[150px] whitespace-nowrap`}>Dự Án / Kho</th>
              <th className={`${rowPadding} min-w-[140px] whitespace-nowrap`}>Dự Án KD / Lô KD</th>
              <th className={`${rowPadding} min-w-[140px] whitespace-nowrap`}>Mã Lô PL & Thửa/Tờ</th>
              <th className={`${rowPadding} min-w-[100px] text-right whitespace-nowrap`}>Diện tích</th>
              <th className={`${rowPadding} min-w-[160px] whitespace-nowrap`}>Chủ Sở Hữu (CĐT/NĐT)</th>
              <th className={`${rowPadding} min-w-[140px] whitespace-nowrap`}>Trạng Thái</th>
              <th className={`${rowPadding} min-w-[150px] whitespace-nowrap`}>Thế Chấp & Ngân Hàng</th>
              {/* CỘT THAO TÁC THU GỌN w-[80px] */}
              <th className={`${rowPadding} w-[80px] min-w-[80px] max-w-[80px] text-center sticky right-0 z-20 !bg-slate-100 text-slate-700 font-semibold border-l border-slate-200 uppercase tracking-wider text-xs whitespace-nowrap shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700 text-xs sm:text-sm">
            {assets.map((asset) => {
              const isSelected = selectedIds.includes(asset.id);
              const isOverdue = isAssetOverdue(asset);

              const ownerName =
                asset.current_owner_entity?.name ||
                asset.investor_entities?.name ||
                'Chưa cập nhật';
              const ownerRole =
                asset.current_owner_role === 'cdt'
                  ? 'Chủ đầu tư'
                  : asset.current_owner_role === 'ndt'
                  ? 'Nhà đầu tư'
                  : null;

              return (
                <tr
                  key={asset.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    isSelected ? 'bg-blue-50/60' : ''
                  } ${isOverdue ? 'bg-rose-50/30' : ''}`}
                >
                  {/* CỘT CHECKBOX CHỌN TỪNG DÒNG */}
                  <td className={`${rowPadding} w-10 min-w-[40px] text-center`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(asset.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                    />
                  </td>

                  {/* Số GCN & Mã TSĐB */}
                  <td className={`${rowPadding} min-w-[170px]`}>
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <span className="text-sm font-bold text-slate-900 tracking-tight">{asset.certificate_no}</span>
                      {asset.scan_file_url && onPreviewDoc && (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewDoc({
                              urlOrPath: asset.scan_file_url!,
                              certificateNo: asset.certificate_no,
                              title: `Bản scan GCN ${asset.certificate_no}`,
                            })
                          }
                          className="text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                          title="Xem bản scan tài liệu"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {asset.certificate_group === 'so_lon' ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                          Sổ lớn
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          Phân lô
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[11px] text-slate-500 tracking-tight" title={asset.asset_code || ''}>
                        {asset.asset_code || '-'}
                      </span>
                      {asset.asset_code && (
                        <button
                          type="button"
                          onClick={(e) => handleCopy(asset.asset_code!, e)}
                          className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                          title="Sao chép mã TSĐB"
                        >
                          {copiedCode === asset.asset_code ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                      <span className="inline-block px-1 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 whitespace-nowrap">
                        {asset.collateral_type || 'BDS'}
                      </span>
                      {asset.asset_type && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[90px]" title={asset.asset_type}>
                          · {asset.asset_type}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Dự Án / Kho */}
                  <td className={`${rowPadding} min-w-[150px]`}>
                    <div className="font-medium text-slate-800 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[160px]" title={asset.projects?.name || '-'}>
                        {asset.projects?.name || '-'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <WarehouseIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[160px]" title={asset.warehouses?.name || '-'}>
                        {asset.warehouses?.name || '-'}
                      </span>
                    </div>
                  </td>

                  {/* Dự Án KD / Lô KD */}
                  <td className={`${rowPadding} min-w-[140px]`}>
                    <div className="font-medium text-slate-800 truncate max-w-[150px]" title={asset.business_project_name || '-'}>
                      {asset.business_project_name || '-'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {asset.business_plot_code ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-medium border border-amber-200/60 whitespace-nowrap">
                          Lô KD: {asset.business_plot_code}
                        </span>
                      ) : (
                        '-'
                      )}
                    </div>
                  </td>

                  {/* Mã Lô PL & Thửa/Tờ */}
                  <td className={`${rowPadding} min-w-[140px]`}>
                    <div className="font-semibold text-slate-800 whitespace-nowrap">
                      {formatPlotCode(asset.legal_lot_code)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
                      Thửa: <span className="text-slate-700">{asset.land_lot_no || '-'}</span> · Tờ:{' '}
                      <span className="text-slate-700">{asset.map_sheet_no || '-'}</span>
                    </div>
                  </td>

                  {/* Diện tích */}
                  <td className={`${rowPadding} min-w-[100px] text-right font-medium text-slate-800 whitespace-nowrap`}>
                    {asset.area ? `${Number(asset.area).toLocaleString('vi-VN')} m²` : '-'}
                  </td>

                  {/* Chủ Sở Hữu */}
                  <td className={`${rowPadding} min-w-[160px]`}>
                    <div className="font-medium text-slate-900 truncate max-w-[170px]" title={ownerName}>
                      {ownerName}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
                      {ownerRole && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            asset.current_owner_role === 'cdt'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {ownerRole}
                        </span>
                      )}
                      {asset.current_owner_entity?.company_code && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({asset.current_owner_entity.company_code})
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Trạng Thái Badges */}
                  <td className={`${rowPadding} min-w-[140px]`}>
                    <StatusBadges
                      custody_status={asset.custody_status}
                      lifecycle_status={asset.lifecycle_status}
                      sale_status={asset.sale_status}
                      mortgage_status={asset.mortgage_status}
                      showMortgage={false}
                    />
                    {isOverdue && (
                      <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-rose-600 whitespace-nowrap">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>Quá hạn trả mượn</span>
                      </div>
                    )}
                  </td>

                  {/* Thế Chấp & Ngân Hàng */}
                  <td className={`${rowPadding} min-w-[150px]`}>
                    {asset.mortgage_status === 'mortgaged' ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                            Đang thế chấp
                          </span>
                          {asset.mortgage_bank && (
                            <span className="font-semibold text-slate-900 text-xs truncate max-w-[130px]" title={asset.mortgage_bank}>
                              {asset.mortgage_bank}
                            </span>
                          )}
                        </div>
                        {asset.mortgage_unit && (
                          <div className="text-[11px] text-slate-500 truncate max-w-[150px]" title={asset.mortgage_unit}>
                            ĐV: {asset.mortgage_unit}
                          </div>
                        )}
                        {asset.collateral_value && (
                          <div className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
                            {Number(asset.collateral_value).toLocaleString('vi-VN')} đ
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs" title="Chưa thế chấp">—</span>
                    )}
                  </td>

                  {/* CỘT THAO TÁC CỐ ĐỊNH THU GỌN w-[80px] - CHỈ 2 NÚT (Eye + Radix DropdownMenu) */}
                  <td className={`${rowPadding} w-[80px] min-w-[80px] max-w-[80px] text-center whitespace-nowrap sticky right-0 z-10 ${isSelected ? '!bg-blue-50' : '!bg-white'} text-slate-600 border-l border-slate-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
                    <div className="flex items-center justify-center gap-1">
                      {/* Nút 1: Xem chi tiết */}
                      <button
                        type="button"
                        onClick={() => onViewDetail(asset)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Xem chi tiết đầy đủ GCN"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Nút 2: Radix Dropdown Menu portal trực tiếp ra DOM body với z-[9999], chống xén mép */}
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer data-[state=open]:bg-blue-50 data-[state=open]:text-blue-600 outline-none"
                            title="Thao tác khác"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenu.Trigger>

                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={4}
                            avoidCollisions={true}
                            collisionPadding={10}
                            className="z-[9999] min-w-[190px] bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100 outline-none"
                          >
                            {/* Gia hạn mượn */}
                            {asset.custody_status === 'checked_out' && onExtend && (
                              <DropdownMenu.Item
                                onSelect={() => onExtend(asset)}
                                className="px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 hover:text-amber-700 transition-colors cursor-pointer outline-none select-none"
                              >
                                <CalendarClock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>Gia hạn mượn</span>
                              </DropdownMenu.Item>
                            )}

                            {/* Chuyển quyền sở hữu */}
                            {onTransfer && (!canTransfer || canTransfer(asset)) && (
                              <DropdownMenu.Item
                                onSelect={() => onTransfer(asset)}
                                className="px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer outline-none select-none"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                <span>Chuyển quyền sở hữu</span>
                              </DropdownMenu.Item>
                            )}

                            {/* Lịch sử hoạt động */}
                            {onHistory && (
                              <DropdownMenu.Item
                                onSelect={() => onHistory(asset)}
                                className="px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 hover:text-cyan-700 transition-colors cursor-pointer outline-none select-none"
                              >
                                <History className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                                <span>Lịch sử luân chuyển</span>
                              </DropdownMenu.Item>
                            )}

                            {/* Kiểm toán biến động */}
                            {onAudit && (
                              <DropdownMenu.Item
                                onSelect={() => onAudit(asset)}
                                className="px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 hover:text-teal-700 transition-colors cursor-pointer outline-none select-none"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                <span>Kiểm toán thay đổi</span>
                              </DropdownMenu.Item>
                            )}

                            {/* Chỉnh sửa thông tin */}
                            {onEdit && (!canEdit || canEdit(asset)) && (
                              <DropdownMenu.Item
                                onSelect={() => onEdit(asset)}
                                className="px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 hover:text-blue-700 transition-colors cursor-pointer outline-none select-none"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span>Chỉnh sửa thông tin</span>
                              </DropdownMenu.Item>
                            )}

                            {/* Xóa GCN */}
                            {onDelete && canDelete && (
                              <>
                                <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />
                                <DropdownMenu.Item
                                  onSelect={() => onDelete(asset)}
                                  className="px-3 py-2 flex items-center gap-2.5 hover:bg-red-50 text-red-600 transition-colors cursor-pointer outline-none select-none font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  <span>Xóa GCN này</span>
                                </DropdownMenu.Item>
                              </>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. THANH HÀNH ĐỘNG HÀNG LOẠT (BULK ACTION BAR) - LIGHT THEME, TRẢI NẰM CÙNG 1 HÀNG */}
      {selectedIds.length > 0 && (
        <div
          id="bulk-action-floating-bar"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl text-slate-800 py-2 px-4 flex items-center flex-nowrap whitespace-nowrap gap-2 animate-in slide-in-from-bottom-5 duration-200 max-w-[95vw] overflow-x-auto"
        >
          {/* Badge hiển thị số lượng */}
          <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-xs whitespace-nowrap shrink-0">
            <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Đã chọn <strong className="font-bold text-blue-800">{selectedIds.length}</strong></span>
          </div>

          {/* Nút [🗑️ Xóa hàng loạt] (Đỏ) */}
          <button
            type="button"
            id="btn-bulk-delete"
            onClick={() => setIsBulkDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa hàng loạt</span>
          </button>

          {/* Nút [🔄 Chuyển kho] (Xanh dương chính) */}
          <button
            type="button"
            id="btn-bulk-transfer-warehouse"
            onClick={() => setIsBulkWarehouseOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Chuyển kho</span>
          </button>

          {/* Nút [⚖️ Chuyển quyền] -> Nút phụ sáng */}
          {onBulkTransferOwnership && (
            <button
              type="button"
              id="btn-bulk-transfer-ownership"
              onClick={onBulkTransferOwnership}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
              <span>Chuyển quyền</span>
            </button>
          )}

          {/* Nút [✏️ Sửa hàng loạt] -> Nút phụ sáng */}
          {onBulkEdit && (
            <button
              type="button"
              id="btn-bulk-edit-bar"
              onClick={onBulkEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-600" />
              <span>Sửa hàng loạt</span>
            </button>
          )}

          {/* Nút [📦 Yêu cầu kho] -> Nút phụ sáng */}
          {onBulkRequest && (
            <button
              type="button"
              id="btn-bulk-request-bar"
              onClick={onBulkRequest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Yêu cầu kho</span>
            </button>
          )}

          {/* Nút [📥 Xuất Excel] -> Nút phụ sáng */}
          {onExportExcel && (
            <button
              type="button"
              id="btn-bulk-export-bar"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất Excel</span>
            </button>
          )}

          {/* Nút [✖ Bỏ chọn] -> Chữ màu xám nhẹ */}
          <button
            type="button"
            id="btn-bulk-deselect"
            onClick={handleDeselectAll}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 px-2 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0 ml-1"
            title="Hủy chọn tất cả"
          >
            <X className="w-3.5 h-3.5" />
            <span>Bỏ chọn</span>
          </button>
        </div>
      )}

      {/* Modal Chuyển kho hàng loạt */}
      <BulkWarehouseModal
        isOpen={isBulkWarehouseOpen}
        onClose={() => setIsBulkWarehouseOpen(false)}
        selectedAssets={selectedAssets}
        warehouses={warehouses}
        currentUser={currentUser}
        onSuccess={() => {
          updateSelectedIds([]);
          if (onRefreshData) onRefreshData();
        }}
      />

      {/* Modal Xóa hàng loạt */}
      <BulkDeleteConfirmModal
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        selectedAssets={selectedAssets}
        canForceDelete={canDelete}
        onSuccess={() => {
          updateSelectedIds([]);
          if (onRefreshData) onRefreshData();
        }}
      />
    </div>
  );
};
