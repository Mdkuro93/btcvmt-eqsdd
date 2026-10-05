/**
 * Danh mục phân loại Loại Tài Sản (Asset Types)
 * Phục vụ phân luồng nghiệp vụ Quản lý Diện tích & Tách sổ / Quy hoạch (Hybrid Approach):
 * - Thấp tầng / Đất nền: Cột area là "Diện tích đất" (Trừ lùi khi tách sổ)
 * - Cao tầng / Sàn 3D: Cột area là "Diện tích thông thủy" (KHÔNG trừ lùi diện tích Sổ mẹ)
 */

export const HIGH_RISE_ASSET_TYPES = [
  'Căn hộ chung cư',
  'Condotel / Căn hộ TMDV',
  'Căn hộ khách sạn Condotel',
  'Officetel / Căn hộ văn phòng',
  'Sàn thương mại',
  'Sàn trung tâm thương mại',
  'Shophouse khối đế',
  'Cao tầng Khác',  
] as const;

export const LOW_RISE_ASSET_TYPES = [
  'Đất nền',
  'Biệt thự',
  'Biệt thự đơn lập',
  'Biệt thự song lập',
  'Biệt thự tứ lập',
  'Biệt thự ven sông',
  'Biệt thự đồi hướng biển',
  'Nhà phố / Liền kề',
  'Shophouse / Nhà phố thương mại',
  'Đất thương mại dịch vụ (TMDV)',
  'Bệnh viện',
  'Trường học',
  'Thể thao',
  'Bến tàu',        
  'Đất cơ sở sản xuất phi nông nghiệp (SKC)',
  'Đất trồng cây lâu năm / Nông nghiệp',
  'Nhà xưởng / Kho bãi KCN',
  'Tòa nhà văn phòng',
  'Khách sạn / Resort',
  'Thấp tầng khác',  
] as const;

export const ALL_ASSET_TYPES = [
  ...LOW_RISE_ASSET_TYPES,
  ...HIGH_RISE_ASSET_TYPES,
] as const;

/**
 * Kiểm tra xem loại tài sản có thuộc nhóm Cao tầng / Căn hộ / Sàn 3D hay không
 */
export function isHighRiseAsset(assetType?: string | null): boolean {
  if (!assetType) return false;
  const normalized = assetType.trim().toLowerCase();
  return (
    HIGH_RISE_ASSET_TYPES.some((t) => t.toLowerCase() === normalized) ||
    normalized.includes('căn hộ') ||
    normalized.includes('condotel') ||
    normalized.includes('officetel') ||
    normalized.includes('sàn thương mại') ||
    normalized.includes('khối đế') ||
    normalized.includes('cao tầng') ||
    normalized.includes('penthouse') ||
    normalized.includes('duplex')
  );
}

/**
 * Kiểm tra xem loại tài sản có thuộc nhóm Thấp tầng / Đất nền hay không
 */
export function isLowRiseAsset(assetType?: string | null): boolean {
  return !isHighRiseAsset(assetType);
}

/**
 * Lấy nhãn hiển thị cho ô nhập diện tích theo loại tài sản
 */
export function getAreaLabel(
  assetType?: string | null,
  isPlannedLot: boolean = false
): string {
  const isHigh = isHighRiseAsset(assetType);
  if (isPlannedLot) {
    return isHigh ? 'Diện tích thông thủy dự kiến (m²)' : 'Diện tích đất dự kiến (m²)';
  }
  return isHigh ? 'Diện tích thông thủy (m²)' : 'Diện tích đất (m²)';
}

/**
 * Lấy nhãn phụ (Sub-label) hiển thị dưới giá trị diện tích trên danh sách/bảng
 */
export function getAreaSubLabel(assetType?: string | null): string {
  return isHighRiseAsset(assetType) ? '(Thông thủy)' : '(Đất)';
}
