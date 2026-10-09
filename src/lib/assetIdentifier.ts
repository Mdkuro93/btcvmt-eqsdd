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

/**
 * Danh mục chi tiết Loại tài sản (Property Types)
 */
export const PROPERTY_TYPES = [
  'Đất nền',
  'Đất nền phân lô',
  'Biệt thự',
  'Biệt thự đơn lập',
  'Biệt thự song lập',
  'Biệt thự tứ lập',
  'Biệt thự nghỉ dưỡng / Villa',
  'Nhà phố / Liền kề',
  'Shophouse / Nhà phố thương mại',
  'Căn hộ chung cư',
  'Căn hộ Penthouse / Duplex',
  'Condotel / Căn hộ du lịch',
  'Officetel / Căn hộ văn phòng',
  'Dinh thự / Biệt phủ',
  'Đất thương mại dịch vụ (TMDV)',
  'Đất cơ sở sản xuất phi nông nghiệp (SKC)',
  'Đất trồng cây lâu năm / Nông nghiệp',
  'Nhà xưởng / Kho bãi KCN',
  'Tòa nhà văn phòng',
  'Khách sạn / Resort',
  'Cổ phần / Phần vốn góp',
  'Tài sản khác',
] as const;

export const REGION_CODES = [
  { code: 'VMB', name: 'Vùng Miền Bắc' },
  { code: 'VMT', name: 'Vùng Miền Trung' },
  { code: 'VMN', name: 'Vùng Miền Nam' },
];

/**
 * Danh mục mã 63 Tỉnh / Thành phố Việt Nam (Quy chuẩn 3 ký tự)
 */
export const PROVINCE_CODES: Array<{ name: string; code: string }> = [
  { name: 'An Giang', code: 'AGG' },
  { name: 'Bà Rịa - Vũng Tàu', code: 'VTU' },
  { name: 'Bắc Giang', code: 'BGG' },
  { name: 'Bắc Kạn', code: 'BKN' },
  { name: 'Bạc Liêu', code: 'BLU' },
  { name: 'Bắc Ninh', code: 'BNH' },
  { name: 'Bến Tre', code: 'BTE' },
  { name: 'Bình Định', code: 'BDH' },
  { name: 'Bình Dương', code: 'BDG' },
  { name: 'Bình Phước', code: 'BPC' },
  { name: 'Bình Thuận', code: 'BTN' },
  { name: 'Cà Mau', code: 'CMU' },
  { name: 'Cần Thơ', code: 'CTO' },
  { name: 'Cao Bằng', code: 'CBG' },
  { name: 'Đà Nẵng', code: 'DNG' },
  { name: 'Đắk Lắk', code: 'DLK' },
  { name: 'Đắk Nông', code: 'DKN' },
  { name: 'Điện Biên', code: 'DBN' },
  { name: 'Đồng Nai', code: 'DNI' },
  { name: 'Đồng Tháp', code: 'DTP' },
  { name: 'Gia Lai', code: 'GLA' },
  { name: 'Hà Giang', code: 'HGG' },
  { name: 'Hà Nam', code: 'HNM' },
  { name: 'Hà Nội', code: 'HAN' },
  { name: 'Hà Tĩnh', code: 'HTN' },
  { name: 'Hải Dương', code: 'HDG' },
  { name: 'Hải Phòng', code: 'HPG' },
  { name: 'Hậu Giang', code: 'HAG' },
  { name: 'Hòa Bình', code: 'HBH' },
  { name: 'Hưng Yên', code: 'HYN' },
  { name: 'Khánh Hòa', code: 'KHA' },
  { name: 'Kiên Giang', code: 'KGG' },
  { name: 'Kon Tum', code: 'KTM' },
  { name: 'Lai Châu', code: 'LCH' },
  { name: 'Lạng Sơn', code: 'LSN' },
  { name: 'Lào Cai', code: 'LCA' },
  { name: 'Lâm Đồng', code: 'LDD' },
  { name: 'Long An', code: 'LAN' },
  { name: 'Nam Định', code: 'NDH' },
  { name: 'Nghệ An', code: 'NAN' },
  { name: 'Ninh Bình', code: 'NBH' },
  { name: 'Ninh Thuận', code: 'NTH' },
  { name: 'Phú Thọ', code: 'PTO' },
  { name: 'Phú Yên', code: 'PYN' },
  { name: 'Quảng Bình', code: 'QBH' },
  { name: 'Quảng Nam', code: 'QNM' },
  { name: 'Quảng Ngãi', code: 'QNG' },
  { name: 'Quảng Ninh', code: 'QNH' },
  { name: 'Quảng Trị', code: 'QTR' },
  { name: 'Sóc Trăng', code: 'STG' },
  { name: 'Sơn La', code: 'SLA' },
  { name: 'Tây Ninh', code: 'TNH' },
  { name: 'Thái Bình', code: 'TBH' },
  { name: 'Thái Nguyên', code: 'TNN' },
  { name: 'Thanh Hóa', code: 'THA' },
  { name: 'Thừa Thiên Huế', code: 'HUE' },
  { name: 'Tiền Giang', code: 'TGG' },
  { name: 'TP. Hồ Chí Minh', code: 'HCM' },
  { name: 'Trà Vinh', code: 'TVH' },
  { name: 'Tuyên Quang', code: 'TQG' },
  { name: 'Vĩnh Long', code: 'VLG' },
  { name: 'Vĩnh Phúc', code: 'VPC' },
  { name: 'Yên Bái', code: 'YBI' },
];

/**
 * Trích xuất / tra cứu mã tỉnh 3 ký tự từ tên hoặc mã tỉnh đã nhập
 */
export function getProvinceCode(provinceNameOrCode?: string | null): string {
  if (!provinceNameOrCode) return '';
  const clean = provinceNameOrCode.trim();
  
  // Kiểm tra nếu đã truyền trực tiếp mã tỉnh 3 ký tự (ví dụ DNG, QTR, QNG, HCM, HAN)
  const byCode = PROVINCE_CODES.find(p => p.code.toUpperCase() === clean.toUpperCase());
  if (byCode) return byCode.code;

  // Chuẩn hóa chuỗi tìm kiếm theo tên
  const normInput = clean.toLowerCase().replace(/^(tp\.?|thành phố|tỉnh)\s+/i, '').trim();
  const byName = PROVINCE_CODES.find(p => {
    const normName = p.name.toLowerCase().replace(/^(tp\.?|thành phố|tỉnh)\s+/i, '').trim();
    return (
      normName === normInput ||
      p.name.toLowerCase() === clean.toLowerCase() ||
      normInput.includes(normName) ||
      normName.includes(normInput)
    );
  });

  if (byName) return byName.code;
  
  // Nếu là chuỗi 3 ký tự chữ
  if (clean.length === 3 && /^[A-Za-z]+$/.test(clean)) {
    return clean.toUpperCase();
  }

  return ''; // Không có mã tỉnh mặc định; trả chuỗi rỗng khi không nhận diện được
}

/**
 * Lấy mã vùng (regions.code) của Dự án.
 * Chỉ đọc project.areas.regions.code. Thiếu mã thì trả về null. Không đoán từ tên, không mặc định VMT.
 */
export function resolveRegionCode(
  projectId?: string | null,
  projects: Project[] = []
): string | null {
  if (!projectId || projects.length === 0) return null;
  const project = projects.find(p => p.id === projectId);
  if (project?.areas?.regions?.code) {
    const c = project.areas.regions.code.trim().toUpperCase();
    if (/^[A-Z0-9]{2,8}$/.test(c)) return c;
  }
  return null;
}

export interface ResolvedAssetCodePrefix {
  prefix: string;
  regionCode: string;
  provinceCode: string;
  collateralType: string;
  source: 'project' | 'none';
  isValid: boolean;
  error?: string;
}

/**
 * Nội suy toàn diện tiền tố Mã Tài Sản từ Dự án -> Địa bàn -> Vùng miền:
 * Format tiền tố: [MÃ_VÙNG]_[MÃ_ĐỊA_BÀN]_[LOẠI_TS]_
 * Mã vùng = regions.code của vùng chứa địa bàn của DỰ ÁN; mã tỉnh = areas.province_code.
 * Thiếu một trong hai thì isValid:false với thông báo đúng chữ:
 * Vùng "X" chưa có mã vùng: cấu hình tại Danh mục > Vùng
 * Địa bàn "Y" chưa có mã tỉnh: cấu hình tại Danh mục > Địa bàn
 * KHÔNG fallback sang kho.
 */
export function resolveAssetCodePrefix(options: {
  projectId?: string | null;
  projectName?: string | null;
  projects?: Project[];
  collateralType?: string;
}): ResolvedAssetCodePrefix {
  const {
    projectId,
    projectName,
    projects = [],
    collateralType = 'BDS',
  } = options;

  const cType = (collateralType || 'BDS').trim().toUpperCase();

  // 1. Dò Dự án
  let matchedProject: Project | undefined;
  if (projectId) {
    matchedProject = projects.find(p => p.id === projectId);
  }
  if (!matchedProject && projectName) {
    const cleanPName = projectName.trim().toLowerCase();
    matchedProject = projects.find(p => p.name.trim().toLowerCase() === cleanPName);
  }

  if (!matchedProject) {
    return {
      prefix: '',
      regionCode: '',
      provinceCode: '',
      collateralType: cType,
      source: 'none',
      isValid: false,
      error: 'Chưa chọn Dự án hoặc không tìm thấy thông tin Dự án để nội suy mã vùng và mã tỉnh.',
    };
  }

  const projName = matchedProject.name;
  const area = matchedProject.areas;
  if (!area) {
    return {
      prefix: '',
      regionCode: '',
      provinceCode: '',
      collateralType: cType,
      source: 'none',
      isValid: false,
      error: `Dự án "${projName}" chưa gắn địa bàn: cấu hình tại Danh mục > Dự án.`,
    };
  }

  const areaName = area.name || 'Chưa đặt tên';
  const region = area.regions;
  const regionName = region?.name || 'Chưa gắn vùng';
  const rawRegionCode = region?.code ? String(region.code).trim().toUpperCase() : '';
  const rawProvinceCode = area.province_code ? String(area.province_code).trim().toUpperCase() : '';

  if (!region || !rawRegionCode) {
    return {
      prefix: '',
      regionCode: '',
      provinceCode: '',
      collateralType: cType,
      source: 'none',
      isValid: false,
      error: `Vùng "${regionName}" chưa có mã vùng: cấu hình tại Danh mục > Vùng`,
    };
  }

  if (!rawProvinceCode) {
    return {
      prefix: '',
      regionCode: '',
      provinceCode: '',
      collateralType: cType,
      source: 'none',
      isValid: false,
      error: `Địa bàn "${areaName}" chưa có mã tỉnh: cấu hình tại Danh mục > Địa bàn`,
    };
  }

  if (!/^[A-Z0-9]{2,8}$/.test(rawRegionCode)) {
    return {
      prefix: '',
      regionCode: '',
      provinceCode: '',
      collateralType: cType,
      source: 'none',
      isValid: false,
      error: `Mã vùng "${rawRegionCode}" của vùng "${regionName}" không hợp lệ (2-8 ký tự chữ/số).`,
    };
  }

  if (!/^[A-Z0-9]{2,8}$/.test(rawProvinceCode)) {
    return {
      prefix: '',
      regionCode: '',
      provinceCode: '',
      collateralType: cType,
      source: 'none',
      isValid: false,
      error: `Mã tỉnh "${rawProvinceCode}" của địa bàn "${areaName}" không hợp lệ (2-8 ký tự chữ/số).`,
    };
  }

  const prefix = `${rawRegionCode}_${rawProvinceCode}_${cType}_`;
  return {
    prefix,
    regionCode: rawRegionCode,
    provinceCode: rawProvinceCode,
    collateralType: cType,
    source: 'project',
    isValid: true,
  };
}

/**
 * Generate sequential asset identifier separated per Region, Province and per Collateral Type:
 * Format: [REGION]_[PROVINCE]_[COLLATERAL]_[00000001] (8 digits sequence)
 * Examples:
 * - VMT_DNG_BDS_00000001, VMT_DNG_BDS_00000002...
 * - VMT_QTR_BDS_00000001, VMT_QNG_BDS_00000001...
 * - VMN_HCM_BDS_00000001, VMB_HAN_BDS_00000001...
 * - VMT_DNG_TSCD_00000001...
 */
export function generateNextAssetCode(
  regionCode: string,
  provinceCodeOrName: string,
  collateralType: string = 'BDS',
  existingAssets: Asset[] = []
): string {
  const cleanRegion = (regionCode || '').toUpperCase().trim();
  if (!cleanRegion) {
    throw new Error('Thiếu mã vùng để sinh mã tài sản.');
  }
  if (!provinceCodeOrName || !provinceCodeOrName.trim()) {
    throw new Error('Thiếu mã tỉnh hoặc địa bàn để sinh mã tài sản.');
  }
  const cleanProvince = getProvinceCode(provinceCodeOrName);
  if (!cleanProvince) {
    throw new Error(`Không xác định được mã tỉnh từ "${provinceCodeOrName}".`);
  }
  const cleanType = (collateralType || 'BDS').toUpperCase().trim();
  const prefix = `${cleanRegion}_${cleanProvince}_${cleanType}_`;

  let maxSeq = 0;

  existingAssets.forEach(a => {
    if (a.asset_code) {
      const code = a.asset_code.trim().toUpperCase();
      // Only count assets matching this exact Region, Province and Collateral Type prefix
      if (code.startsWith(prefix)) {
        const numPart = code.slice(prefix.length);
        const parsedNum = parseInt(numPart, 10);
        if (!isNaN(parsedNum) && parsedNum > maxSeq) {
          maxSeq = parsedNum;
        }
      }
    }
  });

  const nextSeq = maxSeq + 1;
  // 8-digit padding: 00000001
  const seqStr = String(nextSeq).padStart(8, '0');
  return `${prefix}${seqStr}`;
}

/**
 * Duplicate verification check:
 * Rule 1: No two active records in the same project can share the same certificate_no (Số GCN)
 * Rule 2: No two active records in the same project can share the same legal_lot_code (Mã Lô Pháp Lý)
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
  const targetLegalLotCode = (assetData.legal_lot_code || '').trim().toLowerCase();
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

  // Check 2: Duplicate legal_lot_code (Mã Lô Pháp Lý) within the same project
  if (targetProjectId && targetLegalLotCode) {
    const dupLot = candidates.find(a => {
      if (a.project_id !== targetProjectId) return false;
      const code = (a.legal_lot_code || '').trim().toLowerCase();
      return code === targetLegalLotCode;
    });

    if (dupLot) {
      return {
        isDuplicate: true,
        reason: `Trùng Mã Lô Pháp Lý: "${assetData.legal_lot_code}" đã được khai báo cho GCN ${dupLot.certificate_no} trong dự án này!`,
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
 * Format Mã Lô Pháp Lý để hiển thị (nay đã là 1 cột duy nhất `legal_lot_code`,
 * hàm này chỉ còn tác dụng chuẩn hóa fallback '-' khi rỗng).
 */
export function formatPlotCode(legalLotCode?: string | null): string {
  return (legalLotCode || '').trim() || '-';
}