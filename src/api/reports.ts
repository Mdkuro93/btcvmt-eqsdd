import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT } from '../lib/supabase';
import { Asset } from '../types';
import { mockStore } from '../lib/mockStore';
import { computeReportSummary } from '../lib/reportEngine';
import { fetchAssets } from './assets';

export interface ReportStatistics {
  total_count: number;
  total_area: number;
  mortgaged_count: number;
  total_mortgage_valuation: number;
  in_stock_count: number;
  total_accessible_assets: number;
  total_accessible_mortgaged: number;
  by_warehouse: Array<{
    warehouse_id: string;
    warehouse_name: string;
    total_count: number;
    total_area: number;
    mortgaged_count: number;
    total_mortgage_valuation: number;
    in_stock_count: number;
  }>;
  by_project: Array<{
    project_id: string;
    project_name: string;
    total_count: number;
    total_area: number;
    mortgaged_count: number;
    total_mortgage_valuation: number;
  }>;
  by_mortgage_bank: Array<{
    mortgage_bank: string;
    mortgaged_count: number;
    total_valuation: number;
    total_collateral_value: number;
  }>;
}

export interface ReportFilterParams {
  selectedRegion?: string;
  warehouseId?: string;
  projectId?: string;
  mortgageStatus?: string;
  searchTerm?: string;
  allowedWarehouseIds?: string[];
}

/**
 * Fetch high-performance aggregated report statistics from PostgreSQL RPC get_report_statistics
 */
export async function fetchReportStatistics(filters: ReportFilterParams): Promise<ReportStatistics> {
  // Chỉ sử dụng mockStore khi đang ở chế độ demo/offline (chưa cấu hình Supabase)
  if (!isSupabaseConfigured) {
    const allAssets = mockStore.getAssets();
    const { stats } = computeReportSummary(allAssets, {
      selectedRegion: filters.selectedRegion || 'Tất cả vùng',
      selectedProjectId: filters.projectId || '',
      selectedMortgageStatus: filters.mortgageStatus || '',
      searchTerm: filters.searchTerm || '',
      warehouseId: filters.warehouseId || '',
      allowedWarehouseIds: filters.allowedWarehouseIds
    });

    const mortgagedAll = allAssets.filter(a => a.mortgage_status === 'mortgaged').length;

    return {
      total_count: stats.totalCount,
      total_area: stats.totalArea,
      mortgaged_count: stats.mortgagedCount,
      total_mortgage_valuation: stats.totalMortgageValuation,
      in_stock_count: stats.inStockCount,
      total_accessible_assets: allAssets.length,
      total_accessible_mortgaged: mortgagedAll,
      by_warehouse: [],
      by_project: [],
      by_mortgage_bank: []
    };
  }

  // Khi đã cấu hình Supabase, gọi RPC và ném lỗi rõ ràng nếu có sự cố (không fallback sang mockStore)
  const { data, error } = await withTimeout(
    supabase.rpc('get_report_statistics', {
      p_region_name: filters.selectedRegion && filters.selectedRegion !== 'Tất cả vùng' ? filters.selectedRegion : null,
      p_warehouse_id: filters.warehouseId ? filters.warehouseId : null,
      p_project_id: filters.projectId ? filters.projectId : null,
      p_mortgage_status: filters.mortgageStatus ? filters.mortgageStatus : null,
      p_search_term: filters.searchTerm ? filters.searchTerm.trim() : null
    }),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    console.error('Lỗi khi gọi RPC get_report_statistics:', error);
    throw new Error(`Không thể tải số liệu báo cáo từ cơ sở dữ liệu: ${error.message || 'Lỗi RPC'}. Vui lòng thử lại.`);
  }

  if (!data) {
    throw new Error('Không nhận được dữ liệu phản hồi từ RPC báo cáo.');
  }

  return {
    total_count: Number(data.total_count) || 0,
    total_area: Number(data.total_area) || 0,
    mortgaged_count: Number(data.mortgaged_count) || 0,
    total_mortgage_valuation: Number(data.total_mortgage_valuation) || 0,
    in_stock_count: Number(data.in_stock_count) || 0,
    total_accessible_assets: Number(data.total_accessible_assets) || 0,
    total_accessible_mortgaged: Number(data.total_accessible_mortgaged) || 0,
    by_warehouse: Array.isArray(data.by_warehouse) ? data.by_warehouse : [],
    by_project: Array.isArray(data.by_project) ? data.by_project : [],
    by_mortgage_bank: Array.isArray(data.by_mortgage_bank) ? data.by_mortgage_bank : []
  };
}

export type ReportProgressCallback = (loaded: number, total: number) => void;

/**
 * Fetch full detailed assets matching report filters on demand (e.g. for Excel Export)
 * Thực hiện:
 * (a) Tải theo từng trang (1.000 dòng/trang) cho đến hết, gọi callback tiến trình và đối chiếu số dòng tải về với totalCount;
 *     nếu số dòng nhận được lệch với totalCount từ DB thì ném lỗi, tuyệt đối không trả về dữ liệu thiếu.
 * (b) Chuyển toàn bộ lọc theo vùng (selectedRegion) và allowedWarehouseIds sang điều kiện truy vấn phía server trong fetchAssets.
 */
export async function fetchReportDetailedAssets(
  filters: ReportFilterParams,
  onProgress?: ReportProgressCallback
): Promise<Asset[]> {
  const PAGE_SIZE = 1000;

  // Chuyển toàn bộ điều kiện lọc sang điều kiện truy vấn phía server
  const serverFilters = {
    search: filters.searchTerm,
    projectId: filters.projectId,
    mortgageStatus: filters.mortgageStatus,
    warehouseId: filters.warehouseId,
    selectedRegion: filters.selectedRegion,
    allowedWarehouseIds: filters.allowedWarehouseIds,
  };

  // Trang đầu tiên: lấy dữ liệu và totalCount chính xác từ server
  const firstResult = await fetchAssets(serverFilters, 1, PAGE_SIZE);
  const totalCount = Number(firstResult.totalCount) || 0;
  const allAssets: Asset[] = [...(firstResult.data || [])];

  if (onProgress) {
    onProgress(allAssets.length, totalCount);
  }

  // Tải các trang tiếp theo nếu tổng số lượng lớn hơn 1.000
  if (totalCount > PAGE_SIZE) {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    for (let page = 2; page <= totalPages; page++) {
      const pageResult = await fetchAssets(serverFilters, page, PAGE_SIZE);
      const pageRows = pageResult.data || [];
      allAssets.push(...pageRows);

      if (onProgress) {
        onProgress(allAssets.length, totalCount);
      }
    }
  }

  // Kiểm tra không có id nào xuất hiện 2 lần (dùng Set)
  const seenIds = new Set<string>();
  for (const asset of allAssets) {
    if (seenIds.has(asset.id)) {
      throw new Error(
        `Dữ liệu tải về bị trùng dòng (id: ${asset.id}, mã: ${asset.certificate_no || 'Chưa rõ'}). Đã hủy thao tác để đảm bảo không xuất báo cáo sai lệch!`
      );
    }
    seenIds.add(asset.id);
  }

  // Đối chiếu số dòng nhận được với totalCount từ DB: nếu lệch thì báo lỗi, KHÔNG xuất file thiếu
  if (allAssets.length !== totalCount) {
    throw new Error(
      `Dữ liệu tải về không đầy đủ: Nhận được ${allAssets.length} / ${totalCount} tài sản từ hệ thống. Đã hủy thao tác để đảm bảo không xuất báo cáo thiếu dữ liệu!`
    );
  }

  return allAssets;
}
