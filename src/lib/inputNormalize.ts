import * as XLSX from 'xlsx';

/**
 * Chuẩn hóa chuỗi số:
 * Hỗ trợ 1.234,5 / 1 234,5 / 1234,5 / 1,234.5 -> '1234.5'
 * Ô trống giữ nguyên rỗng. Giá trị không phải số: giữ nguyên chuỗi gốc cho server báo lỗi.
 * Với cột tiền tệ VNĐ (isVndCurrency): chuỗi chỉ có 1 dấu chấm hoặc 1 dấu phẩy và đúng 3 chữ số sau dấu,
 * phần trước ≤ 3 chữ số (ví dụ 2.500, 2,500) là dấu nhóm nghìn -> 2500.
 */
export function normalizeNumberInput(value: unknown, isVndCurrency: boolean = false): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (isNaN(value)) return '';
    return String(value);
  }
  const str = String(value).trim();
  if (!str) return '';

  // Nếu chứa ký tự chữ cái hoặc ký hiệu khác chữ số và dấu phân cách -> giữ nguyên cho server báo lỗi
  if (!/^[+-]?[\d\s.,\u00A0]+$/.test(str)) {
    return str;
  }

  const cleanStr = str.replace(/[\s\u00A0]/g, '');

  // Xử lý đặc thù cho tiền tệ VNĐ (mortgage_valuation, collateral_value):
  // Chuỗi chỉ có 1 dấu chấm hoặc 1 dấu phẩy và đúng 3 chữ số sau dấu, phần trước ≤ 3 chữ số
  if (isVndCurrency) {
    if (/^[+-]?\d{1,3}[.,]\d{3}$/.test(cleanStr)) {
      return cleanStr.replace(/[.,]/g, '');
    }
  }

  const lastComma = cleanStr.lastIndexOf(',');
  const lastDot = cleanStr.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // 1.234,5 -> bỏ chấm, phẩy thành chấm
      return cleanStr.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.5 -> bỏ phẩy
      return cleanStr.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    const commaCount = (cleanStr.match(/,/g) || []).length;
    if (commaCount === 1) {
      // 1234,5 -> 1234.5
      return cleanStr.replace(',', '.');
    } else {
      // 1,234,567 -> 1234567
      return cleanStr.replace(/,/g, '');
    }
  } else if (lastDot > -1) {
    const dotCount = (cleanStr.match(/\./g) || []).length;
    if (dotCount > 1) {
      // 1.234.567 -> 1234567
      return cleanStr.replace(/\./g, '');
    }
    return cleanStr;
  }

  return cleanStr;
}

/**
 * Chuẩn hóa ngày:
 * Ô Excel kiểu ngày (Date hoặc serial number) hoặc chuỗi dd/mm/yyyy, d/m/yyyy, dd-mm-yyyy, yyyy-mm-dd -> YYYY-MM-DD
 * Ngày không hợp lệ: giữ nguyên chuỗi gốc cho server báo lỗi.
 */
export function normalizeDateInput(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof value === 'number' && value > 1000 && value < 100000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, '0');
        const d = String(parsed.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch {
      // Fallback
    }
  }

  const str = String(value).trim();
  if (!str) return '';

  // Đã là định dạng yyyy-mm-dd
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Định dạng dd/mm/yyyy hoặc d/m/yyyy hoặc dd-mm-yyyy hoặc dd.mm.yyyy
  const dmyMatch = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  return str;
}
