import { Warehouse } from '../types';
import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT } from './supabase';
import { mockStore } from './mockStore';

export type VoucherType = 'PN' | 'PX';

/**
 * Maps transactionType to PN (PHIẾU NHẬP) or PX (PHIẾU XUẤT)
 * PHIẾU NHẬP (PN): Thêm mới GCN, Trả sổ mượn, Giải chấp nhập kho, Sổ con nhập kho sau tách
 * PHIẾU XUẤT (PX): Mượn/Xuất sổ, Thế chấp ngân hàng, Tách sổ (xuất sổ gốc), Xuất bán
 */
export function getVoucherTypeFromTransaction(txType: string, reason?: string): VoucherType {
  if (txType === 'checkout') return 'PX';
  if (txType === 'checkin') return 'PN';
  
  // fallback for older code if any
  if (['mortgage', 'sale_update', 'split_parent', 'sell'].includes(txType)) {
    return 'PX';
  }
  return 'PN';
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

/**
 * Auto-generate official voucher code based on real data in Supabase / mockStore
 * Format: [REGION]-[WH_CODE]-[VOUCHER_TYPE]-[0001]/[YEAR]
 * Example: VMT-001-PN-0001/2026, VMT-001-PX-0001/2026
 */
export async function generateNextVoucherCode(
  warehouse: Warehouse | null | undefined,
  txType: string,
  reason?: string,
  existingVoucherCodes?: string[],
  date: Date = new Date()
): Promise<{ voucherCode: string; voucherType: VoucherType; seq: number }> {
  const vType = getVoucherTypeFromTransaction(txType, reason);
  const year = date.getFullYear();
  const regionCode = getRegionCode(warehouse);
  const whCode = getWarehouseCode(warehouse);
  const prefix = `${regionCode}-${whCode}-${vType}-`;
  const yearSuffix = `/${year}`;

  let codes: string[] = [];

  if (existingVoucherCodes) {
    codes = existingVoucherCodes;
  } else if (isSupabaseConfigured) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('transaction_items')
          .select('voucher_code')
          .ilike('voucher_code', `${prefix}%`),
        DEFAULT_READ_TIMEOUT
      );
      if (error) {
        console.error('Lỗi khi truy vấn số phiếu từ Supabase:', error);
        throw new Error(`Không thể xác định số phiếu tiếp theo từ cơ sở dữ liệu: ${error.message || 'Lỗi truy vấn'}. Vui lòng thử lại.`);
      }
      if (data) {
        codes = data.map((r: any) => r.voucher_code).filter(Boolean);
      }
    } catch (err: any) {
      console.error('Lỗi khi lấy mã chứng từ từ cơ sở dữ liệu:', err);
      if (err.message && err.message.includes('Không thể xác định số phiếu tiếp theo')) {
        throw err;
      }
      throw new Error(`Không thể xác định số phiếu tiếp theo, vui lòng thử lại (${err.message || 'Lỗi kết nối'}).`);
    }
  } else {
    // Chỉ dùng mockStore khi isSupabaseConfigured === false (chế độ demo/offline rõ ràng)
    const txs = mockStore.getTransactions();
    codes = txs
      .flatMap((t: any) => (t.items || []).map((i: any) => i.voucher_code))
      .filter(Boolean);
  }

  let maxSeq = 0;

  codes.forEach(code => {
    if (!code) return;
    const trimmed = String(code).trim().toUpperCase();
    if (trimmed.startsWith(prefix) && trimmed.endsWith(yearSuffix)) {
      const numPart = trimmed.slice(prefix.length, trimmed.length - yearSuffix.length);
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  const seqStr = String(nextSeq).padStart(4, '0');
  const voucherCode = `${prefix}${seqStr}/${year}`;

  return { voucherCode, voucherType: vType, seq: nextSeq };
}

/**
 * Preview voucher code without incrementing counter
 */
export function previewVoucherCode(
  warehouse: Warehouse | null | undefined,
  txType: string,
  reason?: string,
  existingVoucherCodes?: string[],
  date: Date = new Date()
): string {
  const vType = getVoucherTypeFromTransaction(txType, reason);
  const year = date.getFullYear();
  const regionCode = getRegionCode(warehouse);
  const whCode = getWarehouseCode(warehouse);
  const prefix = `${regionCode}-${whCode}-${vType}-`;
  const yearSuffix = `/${year}`;

  const codes =
    existingVoucherCodes ||
    mockStore
      .getTransactions()
      .flatMap((t: any) => (t.items || []).map((i: any) => i.voucher_code))
      .filter(Boolean);

  let maxSeq = 0;
  codes.forEach(code => {
    if (!code) return;
    const trimmed = String(code).trim().toUpperCase();
    if (trimmed.startsWith(prefix) && trimmed.endsWith(yearSuffix)) {
      const numPart = trimmed.slice(prefix.length, trimmed.length - yearSuffix.length);
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  const seqStr = String(nextSeq).padStart(4, '0');
  return `${prefix}${seqStr}/${year}`;
}
