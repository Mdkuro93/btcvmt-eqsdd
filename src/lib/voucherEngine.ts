import { Warehouse } from '../types';

export type VoucherType = 'PN' | 'PX';

/**
 * Maps transactionType to PN (PHIẾU NHẬP) or PX (PHIẾU XUẤT)
 * PHIẾU NHẬP (PN): Thêm mới GCN, Trả sổ mượn, Giải chấp nhập kho, Sổ con nhập kho sau tách
 * PHIẾU XUẤT (PX): Mượn/Xuất sổ, Thế chấp ngân hàng, Tách sổ (xuất sổ gốc), Xuất bán
 */
export function getVoucherTypeFromTransaction(txType: string): VoucherType {
  switch (txType) {
    case 'checkout':
    case 'mortgage':
    case 'sale_update':
    case 'split_parent':
    case 'sell':
      return 'PX';
    case 'checkin':
    case 'unmortgage':
    case 'create_asset':
    case 'split_child':
    case 'import':
    default:
      if (['checkout', 'mortgage', 'sale_update', 'split_parent', 'sell'].includes(txType)) {
        return 'PX';
      }
      return 'PN';
  }
}

/**
 * Determine Region Code (VMB, VMT, VMN)
 */
export function getRegionCode(warehouse?: Warehouse | null, regionName?: string): string {
  if (warehouse?.region_code) return warehouse.region_code.toUpperCase();
  const name = (regionName || warehouse?.regions?.name || '').toLowerCase();
  if (name.includes('bắc') || name.includes('hà nội')) return 'VMB';
  if (name.includes('nam') || name.includes('hồ chí minh') || name.includes('bình dương') || name.includes('đồng nai')) return 'VMN';
  return 'VMT'; // Miền Trung default
}

/**
 * Determine 3-digit Warehouse Code (e.g. "001", "002")
 */
export function getWarehouseCode(warehouse?: Warehouse | null, defaultIdx: number = 1): string {
  if (warehouse?.code) {
    return String(warehouse.code).padStart(3, '0');
  }
  if (!warehouse) return '001';
  const numStr = warehouse.id.replace(/\D/g, '');
  const parsed = parseInt(numStr, 10);
  const val = !isNaN(parsed) && parsed > 0 ? parsed : defaultIdx;
  return String(val).padStart(3, '0');
}

const COUNTER_STORAGE_KEY = 'btcvmt_voucher_counters';

function getCounters(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COUNTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCounters(counters: Record<string, number>) {
  try {
    localStorage.setItem(COUNTER_STORAGE_KEY, JSON.stringify(counters));
  } catch (err) {
    console.warn('Voucher counter save error:', err);
  }
}

/**
 * Auto-generate official voucher code and increment sequence number
 */
export function generateNextVoucherCode(
  warehouse: Warehouse | null | undefined,
  txType: string,
  date: Date = new Date()
): { voucherCode: string; voucherType: VoucherType; seq: number } {
  const vType = getVoucherTypeFromTransaction(txType);
  const year = date.getFullYear();
  const regionCode = getRegionCode(warehouse);
  const whCode = getWarehouseCode(warehouse);
  const whIdKey = warehouse?.id || 'wh_default';

  const counterKey = `${whIdKey}_${vType}_${year}`;
  const counters = getCounters();
  const currentSeq = counters[counterKey] || 0;
  const nextSeq = currentSeq + 1;

  counters[counterKey] = nextSeq;
  saveCounters(counters);

  const seqStr = String(nextSeq).padStart(4, '0');
  const voucherCode = `${regionCode}-${whCode}-${vType}-${seqStr}/${year}`;

  return { voucherCode, voucherType: vType, seq: nextSeq };
}

/**
 * Preview voucher code without incrementing counter
 */
export function previewVoucherCode(
  warehouse: Warehouse | null | undefined,
  txType: string,
  date: Date = new Date()
): string {
  const vType = getVoucherTypeFromTransaction(txType);
  const year = date.getFullYear();
  const regionCode = getRegionCode(warehouse);
  const whCode = getWarehouseCode(warehouse);
  const whIdKey = warehouse?.id || 'wh_default';

  const counterKey = `${whIdKey}_${vType}_${year}`;
  const counters = getCounters();
  const currentSeq = counters[counterKey] || 0;
  const nextSeq = currentSeq + 1;

  const seqStr = String(nextSeq).padStart(4, '0');
  return `${regionCode}-${whCode}-${vType}-${seqStr}/${year}`;
}
