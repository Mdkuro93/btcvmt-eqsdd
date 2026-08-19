import { Asset, Project, Region } from '../types';

export interface CollateralTypeOption {
  code: string;
  name: string;
  shortName: string;
}

export const COLLATERAL_TYPES: CollateralTypeOption[] = [
  { code: 'BDS', name: 'Bất động sản', shortName: 'BDS' },
  { code: 'TSCD', name: 'Tài sản cố định hữu hình', shortName: 'TSCĐ' },
  { code: 'VONGOP', name: 'Phần vốn góp (Công ty TNHH)', shortName: 'VONGOP' },
  { code: 'COPHAN', name: 'Cổ phần (Công ty cổ phần)', shortName: 'COPHAN' },
  { code: 'CHUNGKHOAN', name: 'Chứng khoán đầu tư (Cổ phiếu và Trái phiếu)', shortName: 'CHUNGKHOAN' },
  { code: 'KYQUY', name: 'Tiền ký quỹ', shortName: 'KYQUY' },
  { code: 'QUYEN_PTDA', name: 'Quyền phát triển dự án', shortName: 'QUYEN_PTDA' },
  { code: 'TS_TUONGLAI', name: 'Tài sản hình thành tương lai', shortName: 'TS_TUONGLAI' },
  { code: 'TS_KHAC', name: 'Khác', shortName: 'TS_KHAC' },
];

export const REGION_CODES = [
  { code: 'VMB', name: 'Vùng Miền Bắc' },
  { code: 'VMT', name: 'Vùng Miền Trung' },
  { code: 'VMN', name: 'Vùng Miền Nam' },
];

/**
 * Deterministically find region code (VMB, VMT, VMN) for a given project or warehouse
 */
export function resolveRegionCode(
  projectId?: string | null,
  projects: Project[] = [],
  warehouseRegionCode?: string | null
): string {
  if (warehouseRegionCode && ['VMB', 'VMT', 'VMN'].includes(warehouseRegionCode)) {
    return warehouseRegionCode;
  }

  if (projectId && projects.length > 0) {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      const regionName = (project.areas?.regions?.name || project.areas?.name || '').toLowerCase();
      if (regionName.includes('bắc') || regionName.includes('hà nội') || regionName.includes('vmb')) {
        return 'VMB';
      }
      if (regionName.includes('trung') || regionName.includes('đà nẵng') || regionName.includes('vmt')) {
        return 'VMT';
      }
      if (regionName.includes('nam') || regionName.includes('hồ chí minh') || regionName.includes('bình dương') || regionName.includes('đồng nai') || regionName.includes('vmn')) {
        return 'VMN';
      }
    }
  }

  return 'VMT'; // Default fallback
}

/**
 * Generate sequential asset identifier: [REGION]_[COLLATERAL]_[00001]
 * Example: VMT_BDS_00001, VMB_COPHAN_00002
 */
export function generateNextAssetCode(
  regionCode: string = 'VMT',
  collateralType: string = 'BDS',
  existingAssets: Asset[] = []
): string {
  const cleanRegion = (regionCode || 'VMT').toUpperCase();
  const cleanType = (collateralType || 'BDS').toUpperCase();
  const prefix = `${cleanRegion}_${cleanType}_`;

  let maxSeq = 0;

  existingAssets.forEach(a => {
    if (a.asset_code) {
      // Check if it matches any pattern like XXX_YYY_12345 or prefix_12345
      const parts = a.asset_code.split('_');
      const numPart = parts[parts.length - 1];
      const parsedNum = parseInt(numPart, 10);
      if (!isNaN(parsedNum) && parsedNum > maxSeq) {
        maxSeq = parsedNum;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  const seqStr = String(nextSeq).padStart(5, '0');
  return `${prefix}${seqStr}`;
}

/**
 * Duplicate verification check:
 * Rule 1: No two active records in the same project can share the same certificate_no (Số GCN)
 * Rule 2: No two active records in the same project can share the same (subdivision + lot_no)
 * Rule 3: No two active records in the same project can share the same (map_sheet_no + land_lot_no)
 */
export function checkAssetDuplicate(
  assetData: Partial<Asset>,
  existingAssets: Asset[],
  currentAssetId?: string,
  projectName?: string
): { isDuplicate: boolean; reason?: string } {
  const targetCertNo = (assetData.certificate_no || '').trim().toLowerCase();
  const targetProjectId = assetData.project_id;
  const targetSubdivision = (assetData.subdivision || '').trim().toLowerCase();
  const targetLotNo = (assetData.lot_no || '').trim().toLowerCase();
  const targetMapSheetNo = (assetData.map_sheet_no || '').trim().toLowerCase();
  const targetLandLotNo = (assetData.land_lot_no || '').trim().toLowerCase();

  // Filter other assets, ignoring the current one if updating
  const candidates = existingAssets.filter(a => {
    if (currentAssetId && a.id === currentAssetId) return false;
    // We only check against active/split assets, but invalid ones from full split can be ignored
    if (a.lifecycle_status === 'invalidated') return false;
    return true;
  });

  // Check 1: Duplicate certificate_no in the same project (or across active inventory)
  if (targetCertNo) {
    const dupCert = candidates.find(a => {
      const matchCert = (a.certificate_no || '').trim().toLowerCase() === targetCertNo;
      if (!matchCert) return false;
      // If same project or global active uniqueness
      if (targetProjectId && a.project_id) {
        return a.project_id === targetProjectId;
      }
      return true;
    });

    if (dupCert) {
      const pName = dupCert.projects?.name || projectName || 'cùng dự án';
      return {
        isDuplicate: true,
        reason: `Trùng số GCN: Số GCN "${assetData.certificate_no}" đã tồn tại trong ${pName} (Mã TS: ${dupCert.asset_code || dupCert.id})!`,
      };
    }
  }

  // Check 2: Duplicate Subdivision (Phân khu) + Lot No (Số Lô / Thửa) within the same project
  if (targetProjectId && targetSubdivision && targetLotNo) {
    const dupLot = candidates.find(a => {
      if (a.project_id !== targetProjectId) return false;
      const sub = (a.subdivision || '').trim().toLowerCase();
      const lot = (a.lot_no || '').trim().toLowerCase();
      return sub === targetSubdivision && lot === targetLotNo;
    });

    if (dupLot) {
      return {
        isDuplicate: true,
        reason: `Trùng Phân khu - Số lô: Phân khu "${assetData.subdivision}" - Lô số "${assetData.lot_no}" đã được khai báo cho GCN ${dupLot.certificate_no} trong dự án này!`,
      };
    }
  }

  // Check 3: Duplicate Map Sheet No (Tờ bản đồ) + Land Lot No (Thửa đất số) within the same project
  if (targetProjectId && targetMapSheetNo && targetLandLotNo) {
    const dupMap = candidates.find(a => {
      if (a.project_id !== targetProjectId) return false;
      const map = (a.map_sheet_no || '').trim().toLowerCase();
      const landLot = (a.land_lot_no || '').trim().toLowerCase();
      return map === targetMapSheetNo && landLot === targetLandLotNo;
    });

    if (dupMap) {
      return {
        isDuplicate: true,
        reason: `Trùng Thửa đất & Tờ bản đồ: Thửa đất số "${assetData.land_lot_no}" - Tờ bản đồ số "${assetData.map_sheet_no}" đã tồn tại trên hệ thống cho GCN ${dupMap.certificate_no}!`,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Format land plot code (Mã lô đất): Phân Khu & "-" & Số thửa/lô
 * Example: 'Khu A-Lô 12', 'Block B-LK 04', 'A-112'
 */
export function formatPlotCode(
  subdivision?: string | null,
  lotNo?: string | null,
  landLotNo?: string | null
): string {
  const lot = (lotNo || landLotNo || '').trim();
  const sub = (subdivision || '').trim();
  if (sub && lot) {
    return `${sub}-${lot}`;
  }
  return sub || lot || '-';
}
