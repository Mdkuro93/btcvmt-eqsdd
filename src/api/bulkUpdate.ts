import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_WRITE_TIMEOUT, DEFAULT_READ_TIMEOUT } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { normalizeNumberInput, normalizeDateInput } from '../lib/inputNormalize';

export { normalizeNumberInput, normalizeDateInput };

export type BulkUpdateMode = 'create' | 'info' | 'mortgage' | 'owner' | 'certificate' | 'reissue';

export interface BulkProjectItem {
  id: string;
  name: string;
  code: string | null;
  areaName: string | null;
  assetCount: number;
}

export interface BulkCorrectResultItem {
  r_row: number;
  r_asset_code: string | null;
  r_result: 'ok' | 'applied' | 'unchanged' | 'error';
  r_message: string;
  r_changes: Record<string, [any, any]> | null;
}

export interface BulkReissueResultItem {
  r_row: number;
  r_old_asset_code: string | null;
  r_result: 'ok' | 'created' | 'error';
  r_message: string;
  r_request_id: string | null;
}

export interface BulkImportResultItem {
  r_row: number;
  r_certificate_no: string | null;
  r_result: 'ok' | 'created' | 'error';
  r_message: string;
  r_asset_id: string | null;
  r_asset_code: string | null;
  r_voucher: string | null;
}

export interface BulkRowResult {
  row: number;
  assetCode: string;
  certificateNo?: string;
  projectName?: string | null;
  status: 'ok' | 'unchanged' | 'error' | 'applied' | 'created';
  message: string;
  changes?: Record<string, [any, any]> | null;
  requestId?: string | null;
  assetId?: string | null;
  voucherCode?: string | null;
}

export interface RunInChunksResult {
  results: BulkRowResult[];
  abortedAt?: number;
  abortMessage?: string;
  hasUncertainRows?: boolean;
}

// Timeout dành cho xử lý theo lô (tối đa 500 dòng/lô có thể mất 15-30 giây)
const BULK_RPC_TIMEOUT = DEFAULT_WRITE_TIMEOUT * 4; // ~32 giây

/**
 * Chuẩn hóa 1 dòng dữ liệu theo chế độ:
 * - Chuỗi: trim; nếu rỗng -> xóa khỏi object
 * - Số / Ngày: gọi hàm chuẩn hóa
 * - Bỏ qua các trường không xác định
 */
export function sanitizeRowData(
  rawRow: Record<string, any>,
  numberFields: string[],
  dateFields: string[],
  vndCurrencyFields: string[] = ['mortgage_valuation', 'collateral_value']
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, val] of Object.entries(rawRow)) {
    if (val === null || val === undefined) continue;

    if (numberFields.includes(key)) {
      const isVnd = vndCurrencyFields.includes(key);
      const numStr = normalizeNumberInput(val, isVnd);
      if (numStr !== '') {
        result[key] = numStr;
      }
    } else if (dateFields.includes(key)) {
      const dateStr = normalizeDateInput(val);
      if (dateStr !== '') {
        result[key] = dateStr;
      }
    } else {
      const strVal = String(val).trim();
      if (strVal !== '') {
        result[key] = strVal;
      }
    }
  }

  return result;
}

/**
 * Kiểm tra xem lỗi có phải lỗi phiên / quyền / thiếu tham số bắt buộc không (42501, 28000, 22023)
 */
function isSessionLevelError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  if (code === '42501' || code === '28000' || code === '22023') return true;
  const msg = String(err.message || '').toLowerCase();
  if (
    msg.includes('đăng nhập') ||
    msg.includes('không có quyền') ||
    msg.includes('tối thiểu 10 ký tự') ||
    msg.includes('lý do')
  ) {
    return true;
  }
  return false;
}

/**
 * Chạy hàm xử lý theo từng lô (chunk) 500 dòng tuần tự:
 * - Hiệu chỉnh r_row thành số thứ tự dòng toàn cục
 * - Không throw khi dừng giữa chừng: trả về { results, abortedAt, abortMessage, hasUncertainRows }
 * - Nếu lỗi cấp phiên (42501, 28000, 22023): giữ nguyên kết quả các lô đã xong,
 *   gắn lỗi 'CHƯA xử lý: <lý do>' cho các dòng còn lại và dừng ngay.
 * - Nếu lỗi mạng/timeout khi apply=true: gắn thông báo "Không xác định..." để cảnh báo người dùng.
 */
export async function runInChunks<T>(
  rows: T[],
  size: number = 500,
  fn: (chunk: T[], chunkIndex: number, startIndex: number) => Promise<BulkRowResult[]>,
  onProgress?: (completed: number, total: number) => void,
  isApply: boolean = false
): Promise<RunInChunksResult> {
  const total = rows.length;
  const results: BulkRowResult[] = [];
  let abortedAt: number | undefined;
  let abortMessage: string | undefined;
  let hasUncertainRows = false;

  for (let i = 0; i < total; i += size) {
    const chunk = rows.slice(i, i + size);
    const chunkIndex = Math.floor(i / size);
    const startIndex = i + 1; // 1-indexed

    try {
      const chunkResults = await fn(chunk, chunkIndex, startIndex);

      // Hiệu chỉnh r_row thành số thứ tự dòng toàn cục và gán projectName từ file
      const adjusted = chunkResults.map((r, idx) => {
        const item: any = chunk[idx];
        return {
          ...r,
          row: startIndex + idx,
          projectName: r.projectName ?? (item?.project_name ? String(item.project_name).trim() : null),
        };
      });
      results.push(...adjusted);
    } catch (error: any) {
      if (isSessionLevelError(error)) {
        // Lỗi cấp phiên: dừng ngay, các lô trước giữ nguyên, các dòng còn lại đánh dấu 'CHƯA xử lý'
        abortedAt = startIndex;
        abortMessage = error.message || 'Lỗi phiên làm việc hoặc quyền truy cập.';

        for (let remIdx = i; remIdx < total; remIdx++) {
          const item: any = rows[remIdx];
          const code = item?.asset_code || item?.old_asset_code || '-';
          results.push({
            row: remIdx + 1,
            assetCode: String(code),
            projectName: item?.project_name ? String(item.project_name).trim() : null,
            status: 'error',
            message: `CHƯA xử lý: ${abortMessage}`,
          });
        }
        break; // Dừng các lô tiếp theo
      }

      console.error(`Lỗi thực thi lô ${chunkIndex + 1}:`, error);

      if (isApply) {
        // Hết thời gian chờ / mất mạng khi áp dụng: máy chủ có thể đã ghi xong
        hasUncertainRows = true;
        const uncertainMsg =
          'Không xác định: máy chủ chưa phản hồi, thay đổi có thể đã được áp dụng. Hãy chạy lại Xem trước với cùng file để kiểm tra (dòng đã áp dụng sẽ hiện "Không có thay đổi"/"đã có hồ sơ chờ duyệt"), đừng áp dụng lại ngay.';

        for (let idx = 0; idx < chunk.length; idx++) {
          const item: any = chunk[idx];
          const code = item?.asset_code || item?.old_asset_code || '-';
          results.push({
            row: startIndex + idx,
            assetCode: String(code),
            projectName: item?.project_name ? String(item.project_name).trim() : null,
            status: 'error',
            message: uncertainMsg,
          });
        }
      } else {
        // Lỗi lô khi xem trước: gắn lỗi cho từng dòng của lô này và tiếp tục các lô sau
        for (let idx = 0; idx < chunk.length; idx++) {
          const item: any = chunk[idx];
          const code = item?.asset_code || item?.old_asset_code || '-';
          results.push({
            row: startIndex + idx,
            assetCode: String(code),
            projectName: item?.project_name ? String(item.project_name).trim() : null,
            status: 'error',
            message: error.message || 'Lỗi mạng hoặc máy chủ không phản hồi',
          });
        }
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + size, total), total);
    }
  }

  return { results, abortedAt, abortMessage, hasUncertainRows };
}

/**
 * Gọi RPC bulk_correct_assets
 */
export async function bulkCorrectAssets(
  mode: BulkUpdateMode,
  rows: any[],
  reason?: string | null,
  apply: boolean = false
): Promise<BulkRowResult[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa được cấu hình. Vui lòng kiểm tra biến môi trường.');
  }

  const { data, error } = await withTimeout(
    supabase.rpc('bulk_correct_assets', {
      p_mode: mode,
      p_rows: rows,
      p_reason: reason || null,
      p_apply: apply,
    }),
    BULK_RPC_TIMEOUT,
    'Hết thời gian chờ phản hồi từ máy chủ khi xử lý lô cập nhật.'
  );

  if (error) {
    throw error;
  }

  const items = (data || []) as BulkCorrectResultItem[];
  return items.map((it) => ({
    row: it.r_row,
    assetCode: it.r_asset_code || '-',
    status: it.r_result,
    message: it.r_message,
    changes: it.r_changes,
  }));
}

/**
 * Gọi RPC create_reissue_requests_bulk
 */
export async function createReissueRequestsBulk(
  rows: any[],
  reason?: string | null,
  apply: boolean = false
): Promise<BulkRowResult[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa được cấu hình. Vui lòng kiểm tra biến môi trường.');
  }

  const { data, error } = await withTimeout(
    supabase.rpc('create_reissue_requests_bulk', {
      p_rows: rows,
      p_reason: reason || null,
      p_apply: apply,
    }),
    BULK_RPC_TIMEOUT,
    'Hết thời gian chờ phản hồi từ máy chủ khi tạo hồ sơ cấp đổi.'
  );

  if (error) {
    throw error;
  }

  const items = (data || []) as BulkReissueResultItem[];
  return items.map((it) => ({
    row: it.r_row,
    assetCode: it.r_old_asset_code || '-',
    status: it.r_result,
    message: it.r_message,
    requestId: it.r_request_id,
  }));
}

/**
 * Gọi RPC import_assets_bulk (chế độ Thêm mới GCN hàng loạt)
 */
export async function importAssetsBulk(
  rows: any[],
  reason?: string | null,
  apply: boolean = false,
  batchId?: string | null
): Promise<BulkRowResult[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa được cấu hình. Vui lòng kiểm tra biến môi trường.');
  }

  const { data, error } = await withTimeout(
    supabase.rpc('import_assets_bulk', {
      p_rows: rows,
      p_reason: reason || null,
      p_apply: apply,
      p_batch_id: batchId || null,
    }),
    BULK_RPC_TIMEOUT,
    'Hết thời gian chờ phản hồi từ máy chủ khi nhập GCN hàng loạt.'
  );

  if (error) {
    throw error;
  }

  const items = (data || []) as BulkImportResultItem[];
  return items.map((it) => ({
    row: it.r_row,
    assetCode: it.r_asset_code || '-',
    certificateNo: it.r_certificate_no || undefined,
    status: it.r_result,
    message: it.r_message,
    assetId: it.r_asset_id,
    voucherCode: it.r_voucher,
  }));
}

/**
 * Gọi RPC list_bulk_update_projects để lấy danh mục dự án theo phạm vi quyền hạn thời gian thực
 */
export async function listBulkUpdateProjects(): Promise<BulkProjectItem[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa được cấu hình. Vui lòng kiểm tra biến môi trường.');
  }

  const { data, error } = await withTimeout(
    supabase.rpc('list_bulk_update_projects'),
    DEFAULT_READ_TIMEOUT,
    'Hết thời gian chờ phản hồi từ máy chủ khi tải danh mục dự án.'
  );

  if (error) {
    throw new Error('Lỗi tải danh mục dự án: ' + error.message);
  }

  return ((data || []) as any[]).map((row) => ({
    id: row.r_project_id,
    name: row.r_name,
    code: row.r_code || null,
    areaName: row.r_area_name || null,
    assetCount: Number(row.r_asset_count || 0),
  }));
}
