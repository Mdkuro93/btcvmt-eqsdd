import React, { useState, useEffect, useMemo } from 'react';
import { Asset, Project, Warehouse, InvestorEntity, AssetOwnershipTransfer, Profile } from '../types';
import { fetchInvestorEntities, fetchAssetOwnershipTransfers } from '../api/investorEntities';
import { fetchTransactions } from '../api/transactions';
import { AssetTransferModal } from './AssetTransferModal';
import { formatPlotCode } from '../lib/assetIdentifier';
import { 
  ShieldAlert, 
  ArrowLeftRight, 
  Search, 
  Download, 
  Building2, 
  Calendar, 
  Clock, 
  DollarSign, 
  Building, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  ExternalLink,
  ChevronDown,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

interface MortgagedAssetItem {
  asset: Asset;
  mortgageStartDate: Date;
  mortgageStartDateStr: string;
  mortgageDays: number;
  mortgageSource: 'transaction' | 'asset_updated' | 'asset_created';
  currentEntity?: InvestorEntity | null;
  latestTransfer?: AssetOwnershipTransfer | null;
  lastTransferDateStr: string;
}

interface Props {
  assets: Asset[];
  projects: Project[];
  warehouses: Warehouse[];
  managedWarehouseIds?: string[];
  currentUser: Profile | null;
  onRefreshData: () => void;
}

export const MortgagedAssetsReview: React.FC<Props> = ({
  assets,
  projects,
  warehouses,
  managedWarehouseIds,
  currentUser,
  onRefreshData,
}) => {
  const [entities, setEntities] = useState<InvestorEntity[]>([]);
  const [transfers, setTransfers] = useState<AssetOwnershipTransfer[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedDurationFilter, setSelectedDurationFilter] = useState<string>('all');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  // Selection for Transfer
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [transferModalOpen, setTransferModalOpen] = useState<boolean>(false);
  const [transferTargetAssets, setTransferTargetAssets] = useState<Asset[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<'duration' | 'valuation' | 'certificate_no' | 'last_transfer'>('duration');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: longest duration first (mortgageDays desc / date asc)

  useEffect(() => {
    loadAuxiliaryData();
  }, []);

  const loadAuxiliaryData = async () => {
    setLoading(true);
    try {
      const [entitiesRes, transfersRes, transactionsRes] = await Promise.all([
        fetchInvestorEntities().catch(() => []),
        fetchAssetOwnershipTransfers().catch(() => []),
        fetchTransactions().catch(() => [])
      ]);
      setEntities(entitiesRes || []);
      setTransfers(transfersRes || []);
      setTransactions(transactionsRes || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu rà soát thế chấp:', err);
      toast.error('Lỗi khi tải thông tin phụ trợ thế chấp');
    } finally {
      setLoading(false);
    }
  };

  // Build lookup map for transactions to find mortgage approval date
  const mortgageApprovalDateMap = useMemo(() => {
    const map = new Map<string, { date: Date; source: 'transaction' }>();

    transactions.forEach(tx => {
      if (!tx.items || !Array.isArray(tx.items)) return;
      tx.items.forEach((item: any) => {
        const isApproved = item.status === 'approved';
        const isMortgageReason = 
          item.reason === 'thế chấp' || 
          item.details?.reason === 'thế chấp' || 
          item.type === 'mortgage' ||
          (item.type === 'checkout' && (item.details?.reason === 'thế chấp' || item.reason === 'thế chấp'));

        if (isApproved && isMortgageReason) {
          const rawDate = item.decided_at || item.updated_at || tx.created_at;
          if (rawDate) {
            const dateObj = new Date(rawDate);
            const assetId = item.asset_id || item.confirmed_asset_id;
            if (assetId) {
              const existing = map.get(assetId);
              // Store the most recent approved mortgage transaction date
              if (!existing || dateObj.getTime() > existing.date.getTime()) {
                map.set(assetId, { date: dateObj, source: 'transaction' });
              }
            }
          }
        }
      });
    });

    return map;
  }, [transactions]);

  // Build lookup map for latest ownership transfer per asset
  const latestTransferMap = useMemo(() => {
    const map = new Map<string, AssetOwnershipTransfer>();
    transfers.forEach(t => {
      if (!t.asset_id) return;
      const existing = map.get(t.asset_id);
      const tTime = t.transferred_at ? new Date(t.transferred_at).getTime() : 0;
      const existTime = existing?.transferred_at ? new Date(existing.transferred_at).getTime() : 0;
      if (!existing || tTime > existTime) {
        map.set(t.asset_id, t);
      }
    });
    return map;
  }, [transfers]);

  // Build entity lookup map
  const entityMap = useMemo(() => {
    const map = new Map<string, InvestorEntity>();
    entities.forEach(e => map.set(e.id, e));
    return map;
  }, [entities]);

  // Process all mortgaged assets
  const mortgagedItems = useMemo(() => {
    const now = Date.now();

    // 1. Filter assets with mortgage_status = 'mortgaged' and apply warehouse scope
    const rawMortgaged = assets.filter(a => {
      if (a.mortgage_status !== 'mortgaged') return false;
      if (managedWarehouseIds && managedWarehouseIds.length > 0) {
        if (!a.warehouse_id || !managedWarehouseIds.includes(a.warehouse_id)) {
          return false;
        }
      }
      return true;
    });

    const items: MortgagedAssetItem[] = rawMortgaged.map(asset => {
      // Determine mortgage start date
      const txMortgage = mortgageApprovalDateMap.get(asset.id);
      let mortgageStartDate: Date;
      let mortgageSource: 'transaction' | 'asset_updated' | 'asset_created';

      if (txMortgage) {
        mortgageStartDate = txMortgage.date;
        mortgageSource = 'transaction';
      } else if (asset.updated_at) {
        mortgageStartDate = new Date(asset.updated_at);
        mortgageSource = 'asset_updated';
      } else if (asset.created_at) {
        mortgageStartDate = new Date(asset.created_at);
        mortgageSource = 'asset_created';
      } else {
        mortgageStartDate = new Date();
        mortgageSource = 'asset_created';
      }

      // Calculate days in mortgage
      const diffMs = Math.max(0, now - mortgageStartDate.getTime());
      const mortgageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // Determine owner entity
      const currentEntity = asset.current_owner_entity_id 
        ? entityMap.get(asset.current_owner_entity_id) || asset.current_owner_entity || null
        : null;

      // Determine latest transfer
      const latestTransfer = latestTransferMap.get(asset.id) || null;

      let lastTransferDateStr = '-';
      if (latestTransfer?.transferred_at) {
        lastTransferDateStr = new Date(latestTransfer.transferred_at).toLocaleDateString('vi-VN');
      }

      return {
        asset,
        mortgageStartDate,
        mortgageStartDateStr: mortgageStartDate.toLocaleDateString('vi-VN'),
        mortgageDays,
        mortgageSource,
        currentEntity,
        latestTransfer,
        lastTransferDateStr
      };
    });

    return items;
  }, [assets, managedWarehouseIds, mortgageApprovalDateMap, latestTransferMap, entityMap]);

  // List of unique banks for filter
  const uniqueBanks = useMemo(() => {
    const banks = new Set<string>();
    mortgagedItems.forEach(item => {
      if (item.asset.mortgage_bank) {
        banks.add(item.asset.mortgage_bank.trim());
      }
    });
    return Array.from(banks).sort();
  }, [mortgagedItems]);

  // Filtered & Sorted items
  const filteredAndSortedItems = useMemo(() => {
    let list = mortgagedItems.filter(item => {
      const { asset, currentEntity } = item;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const certMatch = asset.certificate_no?.toLowerCase().includes(term);
        const plotMatch = formatPlotCode(asset.legal_lot_code).toLowerCase().includes(term);
        const ownerMatch = (asset.current_owner_entity?.name || asset.investor_entities?.name)?.toLowerCase().includes(term);
        const entityMatch = currentEntity?.name?.toLowerCase().includes(term) || currentEntity?.company_code?.toLowerCase().includes(term);
        const bankMatch = asset.mortgage_bank?.toLowerCase().includes(term);
        const borrowerMatch = asset.mortgage_unit?.toLowerCase().includes(term);
        const projectMatch = asset.projects?.name?.toLowerCase().includes(term);
        
        if (!certMatch && !plotMatch && !ownerMatch && !entityMatch && !bankMatch && !borrowerMatch && !projectMatch) {
          return false;
        }
      }

      // Bank filter
      if (selectedBank && asset.mortgage_bank !== selectedBank) {
        return false;
      }

      // Project filter
      if (selectedProjectId && asset.project_id !== selectedProjectId) {
        return false;
      }

      // Warehouse filter
      if (selectedWarehouseId && asset.warehouse_id !== selectedWarehouseId) {
        return false;
      }

      // Duration filter
      if (selectedDurationFilter === 'gt_365' && item.mortgageDays < 365) return false;
      if (selectedDurationFilter === 'gt_180' && item.mortgageDays < 180) return false;
      if (selectedDurationFilter === 'gt_90' && item.mortgageDays < 90) return false;
      if (selectedDurationFilter === 'lt_90' && item.mortgageDays >= 90) return false;

      return true;
    });

    // Sorting: default is longest mortgaged first (mortgageDays desc)
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'duration') {
        // Longer duration means larger mortgageDays
        cmp = a.mortgageDays - b.mortgageDays;
      } else if (sortField === 'valuation') {
        const valA = a.asset.mortgage_valuation || 0;
        const valB = b.asset.mortgage_valuation || 0;
        cmp = valA - valB;
      } else if (sortField === 'certificate_no') {
        cmp = (a.asset.certificate_no || '').localeCompare(b.asset.certificate_no || '');
      } else if (sortField === 'last_transfer') {
        const timeA = a.latestTransfer?.transferred_at ? new Date(a.latestTransfer.transferred_at).getTime() : 0;
        const timeB = b.latestTransfer?.transferred_at ? new Date(b.latestTransfer.transferred_at).getTime() : 0;
        cmp = timeA - timeB;
      }

      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    mortgagedItems, 
    searchTerm, 
    selectedBank, 
    selectedProjectId, 
    selectedWarehouseId, 
    selectedDurationFilter, 
    sortField, 
    sortAsc
  ]);

  // Statistics
  const totalValuation = useMemo(() => {
    return mortgagedItems.reduce((acc, item) => acc + (item.asset.mortgage_valuation || 0), 0);
  }, [mortgagedItems]);

  const longestMortgagedItem = useMemo(() => {
    if (mortgagedItems.length === 0) return null;
    return [...mortgagedItems].sort((a, b) => b.mortgageDays - a.mortgageDays)[0];
  }, [mortgagedItems]);

  const unlinkedEntityCount = useMemo(() => {
    return mortgagedItems.filter(item => !item.currentEntity).length;
  }, [mortgagedItems]);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedAssetIds.length === filteredAndSortedItems.length) {
      setSelectedAssetIds([]);
    } else {
      setSelectedAssetIds(filteredAndSortedItems.map(i => i.asset.id));
    }
  };

  const handleToggleSelect = (assetId: string) => {
    if (selectedAssetIds.includes(assetId)) {
      setSelectedAssetIds(selectedAssetIds.filter(id => id !== assetId));
    } else {
      setSelectedAssetIds([...selectedAssetIds, assetId]);
    }
  };

  const openSingleTransfer = (asset: Asset) => {
    setTransferTargetAssets([asset]);
    setTransferModalOpen(true);
  };

  const openBulkTransfer = () => {
    const targets = assets.filter(a => selectedAssetIds.includes(a.id));
    if (targets.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 GCN để chuyển nhượng');
      return;
    }
    setTransferTargetAssets(targets);
    setTransferModalOpen(true);
  };

  const handleTransferSuccess = () => {
    setSelectedAssetIds([]);
    loadAuxiliaryData();
    onRefreshData();
  };

  // Export Mortgaged Review Excel
  const exportMortgagedExcel = () => {
    try {
      const headerTitle = `DANH SÁCH RÀ SOÁT GCN ĐANG THẾ CHẤP & LỊCH SỬ CHỦ SỞ HỮU`;
      const wsData: any[][] = [];

      wsData.push(['TẬP ĐOÀN SUN GROUP / TẬP ĐOÀN VMT', '', '', '', headerTitle]);
      wsData.push(['Ngày trích xuất:', new Date().toLocaleString('vi-VN'), '', 'Tổng số GCN thế chấp:', filteredAndSortedItems.length]);
      wsData.push([]);

      // Header row
      wsData.push([
        'STT',
        'Số GCN (Số sổ)',
        'Mã lô đất (Mã Lô Pháp Lý)',
        'Dự án',
        'Diện tích (m²)',
        'Ngân hàng thế chấp',
        'Đơn vị vay',
        'Giá trị định giá (VNĐ)',
        'Tỷ lệ đảm bảo (%)',
        'Ngày bắt đầu thế chấp',
        'Thời gian đã thế chấp (Ngày)',
        'Pháp nhân sở hữu hiện tại',
        'Mã pháp nhân',
        'Phân loại (CĐT/NĐT)',
        'Lần cuối cập nhật chủ sở hữu',
        'Bên chuyển nhượng gần nhất',
        'Người thực hiện gần nhất',
        'Kho quản lý',
        'Ghi chú'
      ]);

      // Data rows
      filteredAndSortedItems.forEach((item, idx) => {
        const { asset, mortgageDays, mortgageStartDateStr, currentEntity, latestTransfer, lastTransferDateStr } = item;
        const plotCode = formatPlotCode(asset.legal_lot_code);
        const fromEntityName = latestTransfer?.from_entity?.name || (latestTransfer?.from_entity_id ? `Pháp nhân #${latestTransfer.from_entity_id.slice(-6)}` : '-');

        wsData.push([
          idx + 1,
          asset.certificate_no,
          plotCode,
          asset.projects?.name || '-',
          asset.area || 0,
          asset.mortgage_bank || 'Chưa cập nhật',
          asset.mortgage_unit || 'Chưa cập nhật',
          asset.mortgage_valuation || 0,
          asset.collateral_ratio ? `${asset.collateral_ratio}%` : '-',
          mortgageStartDateStr,
          mortgageDays,
          currentEntity?.name || asset.current_owner_entity?.name || 'Chưa gán pháp nhân',
          currentEntity?.company_code || '-',
          asset.current_owner_role === 'cdt' ? 'Chủ đầu tư (CĐT)' : asset.current_owner_role === 'ndt' ? 'Nhà đầu tư (NĐT)' : 'Chưa gán',
          lastTransferDateStr,
          fromEntityName,
          latestTransfer?.performer?.full_name || latestTransfer?.performer?.email || '-',
          asset.warehouses?.name || '-',
          asset.notes || ''
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 16 },
        { wch: 25 },
        { wch: 14 },
        { wch: 30 },
        { wch: 22 },
        { wch: 20 },
        { wch: 14 },
        { wch: 18 },
        { wch: 18 },
        { wch: 32 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 28 },
        { wch: 22 },
        { wch: 20 },
        { wch: 25 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rà Soát Thế Chấp & CSH');
      XLSX.writeFile(wb, `Ra-Soat-The-Chap-GCN-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Xuất file Excel rà soát thế chấp thành công!');
    } catch (err: any) {
      console.error('Lỗi xuất Excel rà soát:', err);
      toast.error('Lỗi khi xuất file Excel');
    }
  };

  const formatDaysToHuman = (days: number) => {
    if (days < 30) return `${days} ngày`;
    const months = Math.floor(days / 30.41);
    const remainingDays = Math.floor(days % 30.41);
    if (days < 365) {
      return remainingDays > 0 ? `${months} tháng ${remainingDays} ngày` : `${months} tháng`;
    }
    const years = Math.floor(days / 365.25);
    const remMonths = Math.floor((days % 365.25) / 30.41);
    return remMonths > 0 ? `${years} năm ${remMonths} tháng` : `${years} năm`;
  };

  return (
    <div className="space-y-6">
      {/* SECTION BANNER */}
      <div className="bg-gradient-to-r from-red-900 via-rose-900 to-indigo-950 rounded-2xl p-6 text-white shadow-md border border-red-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/20">
              <ShieldAlert className="w-8 h-8 text-rose-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-red-800/80 text-rose-200 px-2.5 py-0.5 rounded-full border border-red-700">
                  Dành riêng cho Admin & Quản lý kho
                </span>
                <span className="text-xs text-rose-200">• Rà soát định kỳ</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
                RÀ SOÁT GCN ĐANG THẾ CHẤP & LỊCH SỬ CHUYỂN NHƯỢNG
              </h2>
              <p className="text-xs text-rose-100/90 mt-1 max-w-2xl">
                Tự động tổng hợp danh sách GCN đang thế chấp ngân hàng, sắp xếp theo thời gian thế chấp lâu nhất trước.
                Hỗ trợ Admin / Quản lý kho cập nhật nhanh pháp nhân sở hữu CĐT/NĐT ngay tại đây.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportMortgagedExcel}
              disabled={filteredAndSortedItems.length === 0}
              className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-xl bg-white text-rose-950 hover:bg-rose-50 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-1.5 text-rose-800" /> Xuất Excel Rà Soát
            </button>
            <button
              onClick={() => {
                loadAuxiliaryData();
                onRefreshData();
              }}
              title="Làm mới dữ liệu"
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-100">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Tổng GCN đang thế chấp</div>
            <div className="text-xl font-bold text-red-700">
              {mortgagedItems.length} <span className="text-xs font-normal text-gray-500">sổ</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Tổng định giá thế chấp</div>
            <div className="text-lg font-bold text-emerald-800">
              {totalValuation ? (totalValuation / 1e9).toFixed(1) + ' tỷ VNĐ' : '0 VNĐ'}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Thế chấp lâu nhất</div>
            <div className="text-sm font-bold text-amber-900 leading-tight">
              {longestMortgagedItem ? (
                <>
                  <span>{formatDaysToHuman(longestMortgagedItem.mortgageDays)}</span>
                  <div className="text-[11px] font-normal text-gray-500 truncate max-w-[170px]">
                    {longestMortgagedItem.asset.certificate_no}
                  </div>
                </>
              ) : '-'}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Chưa gán pháp nhân CĐT/NĐT</div>
            <div className="text-xl font-bold text-indigo-900">
              {unlinkedEntityCount} <span className="text-xs font-normal text-gray-500">sổ</span>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS & BATCH ACTIONS */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search box */}
          <div className="md:col-span-2 relative">
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Tìm kiếm nhanh</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Số GCN, mã lô, ngân hàng, đơn vị vay, CĐT..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>

          {/* Filter by Bank */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Ngân hàng thế chấp</label>
            <select
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-red-500"
            >
              <option value="">-- Tất cả ngân hàng ({uniqueBanks.length}) --</option>
              {uniqueBanks.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Filter by Project */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Dự án</label>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-red-500"
            >
              <option value="">-- Tất cả dự án --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Filter by Duration */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Thời gian thế chấp</label>
            <select
              value={selectedDurationFilter}
              onChange={e => setSelectedDurationFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-red-500 font-medium"
            >
              <option value="all">Tất cả thời hạn</option>
              <option value="gt_365">Trên 1 năm (&gt; 365 ngày)</option>
              <option value="gt_180">Trên 6 tháng (&gt; 180 ngày)</option>
              <option value="gt_90">Trên 3 tháng (&gt; 90 ngày)</option>
              <option value="lt_90">Dưới 3 tháng (&lt; 90 ngày)</option>
            </select>
          </div>
        </div>

        {/* Toolbar with Bulk Action and Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 cursor-pointer"
            >
              {selectedAssetIds.length > 0 && selectedAssetIds.length === filteredAndSortedItems.length ? (
                <CheckSquare className="w-4 h-4 text-red-600" />
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
              <span>Chọn tất cả ({filteredAndSortedItems.length})</span>
            </button>

            {selectedAssetIds.length > 0 && (
              <button
                onClick={openBulkTransfer}
                className="inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-700 text-white hover:bg-blue-800 shadow-xs transition-all cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
                Chuyển nhượng hàng loạt ({selectedAssetIds.length} GCN)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="text-gray-500">Sắp xếp:</span>
            <button
              onClick={() => {
                if (sortField === 'duration') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortField('duration');
                  setSortAsc(false); // longest first
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                sortField === 'duration' 
                  ? 'bg-red-50 text-red-800 border-red-300 font-bold' 
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Thời gian thế chấp {sortField === 'duration' && (sortAsc ? '↑' : '↓ (Lâu nhất)')}
            </button>

            <button
              onClick={() => {
                if (sortField === 'valuation') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortField('valuation');
                  setSortAsc(false); // highest first
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                sortField === 'valuation' 
                  ? 'bg-red-50 text-red-800 border-red-300 font-bold' 
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Giá trị định giá {sortField === 'valuation' && (sortAsc ? '↑' : '↓')}
            </button>

            <button
              onClick={() => {
                if (sortField === 'last_transfer') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortField('last_transfer');
                  setSortAsc(false); // newest transfer first
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                sortField === 'last_transfer' 
                  ? 'bg-red-50 text-red-800 border-red-300 font-bold' 
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Ngày cập nhật CSH {sortField === 'last_transfer' && (sortAsc ? '↑' : '↓')}
            </button>
          </div>
        </div>
      </div>

      {/* MORTGAGED ASSETS TABLE */}
      <div className="bg-white rounded-xl border border-gray-300 shadow-md overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="min-w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-gray-800 font-bold sticky top-0 z-20 border-b border-gray-300 shadow-2xs">
              <tr>
                <th className="p-3 w-10 text-center border-r border-gray-200">
                  <input
                    type="checkbox"
                    checked={selectedAssetIds.length > 0 && selectedAssetIds.length === filteredAndSortedItems.length}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                </th>
                <th className="p-3 w-12 text-center border-r border-gray-200">STT</th>
                <th className="p-3 min-w-[160px] border-r border-gray-200">Số GCN / Mã Lô</th>
                <th className="p-3 min-w-[180px] border-r border-gray-200">Dự án & Phân khu</th>
                <th className="p-3 min-w-[200px] border-r border-gray-200">Thông tin Ngân hàng Thế chấp</th>
                <th className="p-3 min-w-[140px] text-right border-r border-gray-200">Giá trị Định giá</th>
                <th className="p-3 min-w-[170px] border-r border-gray-200 bg-red-50/70 text-red-950 font-black">
                  Thời gian Thế chấp (Lâu nhất)
                </th>
                <th className="p-3 min-w-[220px] border-r border-gray-200 bg-blue-50/70 text-blue-950">
                  Pháp nhân sở hữu hiện tại (CĐT/NĐT)
                </th>
                <th className="p-3 min-w-[180px] border-r border-gray-200">Lần cuối cập nhật CSH</th>
                <th className="p-3 w-32 text-center sticky right-0 bg-slate-100 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  Thao tác
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-red-600 mx-auto mb-2" />
                    <span>Đang tổng hợp dữ liệu thế chấp và lịch sử sở hữu...</span>
                  </td>
                </tr>
              ) : filteredAndSortedItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-gray-400">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-gray-600">Không có GCN thế chấp nào phù hợp tiêu chí</p>
                    <p className="text-[11px] text-gray-400 mt-1">Hãy thử thay đổi điều kiện lọc hoặc từ khóa tìm kiếm.</p>
                  </td>
                </tr>
              ) : (
                filteredAndSortedItems.map((item, idx) => {
                  const { asset, mortgageDays, mortgageStartDateStr, currentEntity, latestTransfer, lastTransferDateStr } = item;
                  const isSelected = selectedAssetIds.includes(asset.id);
                  const plotCode = formatPlotCode(asset.legal_lot_code);

                  // Severity badge for mortgage duration
                  let durationColor = 'bg-gray-100 text-gray-800 border-gray-300';
                  if (mortgageDays > 365) {
                    durationColor = 'bg-red-100 text-red-900 border-red-300 font-bold';
                  } else if (mortgageDays > 180) {
                    durationColor = 'bg-orange-100 text-orange-900 border-orange-300 font-semibold';
                  } else if (mortgageDays > 90) {
                    durationColor = 'bg-amber-100 text-amber-900 border-amber-300';
                  }

                  return (
                    <tr 
                      key={asset.id} 
                      className={`hover:bg-red-50/30 transition-colors ${isSelected ? 'bg-red-50/50' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(asset.id)}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                      </td>

                      {/* STT */}
                      <td className="p-3 text-center font-bold text-gray-600 border-r border-gray-200 bg-gray-50/50">
                        {idx + 1}
                      </td>

                      {/* Số GCN / Mã Lô */}
                      <td className="p-3 border-r border-gray-200">
                        <div className="font-bold text-[#1E3A8A] font-mono text-xs">{asset.certificate_no}</div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="font-semibold text-gray-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px] border border-gray-200">
                            {plotCode}
                          </span>
                        </div>
                      </td>

                      {/* Dự án & Phân khu */}
                      <td className="p-3 border-r border-gray-200">
                        <div className="font-semibold text-gray-900 leading-snug">{asset.projects?.name || '-'}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Thửa: {asset.land_lot_no || '-'}
                        </div>
                      </td>

                      {/* Ngân hàng thế chấp */}
                      <td className="p-3 border-r border-gray-200">
                        <div className="font-semibold text-red-900 leading-tight">
                          {asset.mortgage_bank || <span className="text-gray-400 italic">Chưa cập nhật NH</span>}
                        </div>
                        <div className="text-[11px] text-gray-600 mt-1">
                          Đơn vị vay: <strong className="text-gray-800">{asset.mortgage_unit || '-'}</strong>
                        </div>
                      </td>

                      {/* Giá trị định giá */}
                      <td className="p-3 text-right font-bold text-gray-900 border-r border-gray-200">
                        {asset.mortgage_valuation ? (
                          <span className="text-emerald-800 font-mono">
                            {asset.mortgage_valuation.toLocaleString('vi-VN')} đ
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                        {asset.collateral_ratio && (
                          <div className="text-[10px] text-gray-500 font-normal mt-0.5">
                            TLĐB: {asset.collateral_ratio}%
                          </div>
                        )}
                      </td>

                      {/* Thời gian thế chấp (Lâu nhất) */}
                      <td className="p-3 border-r border-gray-200 bg-red-50/30">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${durationColor}`}>
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDaysToHuman(mortgageDays)}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          Từ ngày: <strong className="text-gray-700">{mortgageStartDateStr}</strong>
                        </div>
                      </td>

                      {/* Pháp nhân sở hữu hiện tại (CĐT/NĐT) */}
                      <td className="p-3 border-r border-gray-200 bg-blue-50/20">
                        {currentEntity ? (
                          <div>
                            <div className="font-bold text-blue-950 leading-tight flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{currentEntity.name}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              {currentEntity.company_code && (
                                <span className="font-mono text-[10px] bg-white text-blue-800 px-1.5 py-0.2 rounded border border-blue-200">
                                  {currentEntity.company_code}
                                </span>
                              )}
                              {asset.current_owner_role === 'cdt' ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  CĐT
                                </span>
                              ) : asset.current_owner_role === 'ndt' ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  NĐT
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-gray-700 font-medium">{currentEntity?.name || asset.current_owner_entity?.name || 'Chưa gán pháp nhân'}</div>
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block mt-0.5">
                              Chưa liên kết CĐT/NĐT
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Lần cuối cập nhật CSH */}
                      <td className="p-3 border-r border-gray-200">
                        {latestTransfer ? (
                          <div>
                            <div className="font-semibold text-gray-800 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              <span>{lastTransferDateStr}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[170px]" title={latestTransfer.note || ''}>
                              {latestTransfer.note ? `Lý do: ${latestTransfer.note}` : `Chuyển sang: ${latestTransfer.to_role === 'cdt' ? 'CĐT' : 'NĐT'}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Chưa từng chuyển nhượng</span>
                        )}
                      </td>

                      {/* Action Button: Chuyển nhượng */}
                      <td className="p-3 text-center sticky right-0 bg-white shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                        <button
                          onClick={() => openSingleTransfer(asset)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-blue-900 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                          title="Cập nhật nhanh chủ sở hữu pháp nhân CĐT/NĐT"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />
                          Chuyển nhượng
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="p-3.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
          <div>
            Hiển thị <strong>{filteredAndSortedItems.length}</strong> / <strong>{mortgagedItems.length}</strong> GCN đang thế chấp
            {selectedAssetIds.length > 0 && (
              <span className="ml-2 font-bold text-red-700">({selectedAssetIds.length} GCN đang được chọn)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400">|</span>
            <span className="text-[11px] text-gray-500">
              Cơ chế sắp xếp tự động ưu tiên các tài sản có ngày bắt đầu thế chấp cũ nhất để cảnh báo thời hạn.
            </span>
          </div>
        </div>
      </div>

      {/* ASSET TRANSFER MODAL REUSED */}
      <AssetTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onSuccess={handleTransferSuccess}
        assets={transferTargetAssets}
        currentUser={currentUser}
      />
    </div>
  );
};