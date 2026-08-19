import { Asset } from '../types';

export interface ReportFilters {
  selectedRegion: string;
  selectedProjectId: string;
  selectedMortgageStatus: string;
  searchTerm: string;
}

export interface ReportSummary {
  filteredAssets: Asset[];
  stats: {
    totalCount: number;
    totalArea: number;
    mortgagedCount: number;
    totalMortgageValuation: number;
    inStockCount: number;
  };
}

export function computeReportSummary(assets: Asset[], filters: ReportFilters): ReportSummary {
  const filteredAssets = assets.filter((asset) => {
    // Filter by Region name matching
    if (filters.selectedRegion && filters.selectedRegion !== 'Tất cả vùng') {
      const regionName = asset.projects?.areas?.regions?.name || (asset.warehouses as any)?.regions?.name || '';
      const searchReg = filters.selectedRegion.replace('Vùng ', '').trim().toLowerCase();
      if (searchReg && regionName && !regionName.toLowerCase().includes(searchReg)) {
        // If specific mismatch
        return false;
      }
    }

    // Filter by project
    if (filters.selectedProjectId && asset.project_id !== filters.selectedProjectId) {
      return false;
    }

    // Filter by mortgage status
    if (filters.selectedMortgageStatus && asset.mortgage_status !== filters.selectedMortgageStatus) {
      return false;
    }

    // Search term
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const matchNo = asset.certificate_no.toLowerCase().includes(term);
      const matchOwner = (asset.owner_name || '').toLowerCase().includes(term);
      const matchProject = (asset.projects?.name || '').toLowerCase().includes(term);
      const matchLot = (asset.land_lot_no || '').toLowerCase().includes(term);
      if (!matchNo && !matchOwner && !matchProject && !matchLot) return false;
    }

    return true;
  });

  const stats = {
    totalCount: filteredAssets.length,
    totalArea: filteredAssets.reduce((sum, a) => sum + (a.area || 0), 0),
    mortgagedCount: filteredAssets.filter(a => a.mortgage_status === 'mortgaged').length,
    totalMortgageValuation: filteredAssets
      .filter(a => a.mortgage_status === 'mortgaged')
      .reduce((sum, a) => sum + (a.mortgage_valuation || 0), 0),
    inStockCount: filteredAssets.filter(a => a.custody_status === 'in_stock').length
  };

  return { filteredAssets, stats };
}
