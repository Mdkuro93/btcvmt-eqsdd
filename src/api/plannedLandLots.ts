import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import {
  PlannedLandLot,
  PlannedLandLotImportRow,
  PlannedLandLotImportResult,
} from '../types';

const SELECT_COLUMNS = `
  id, project_id, parent_master_asset_id, legal_lot_code, land_lot_no, map_sheet_no,
  business_project_name, business_plot_code, planned_area, status, resulting_asset_id,
  notes, created_by, created_at, updated_at,
  parent_master_asset:assets!parent_master_asset_id(id, certificate_no, asset_code),
  resulting_asset:assets!resulting_asset_id(id, certificate_no, asset_code)
`;

function ensureConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối Supabase.');
  }
}

/** Toàn bộ lô quy hoạch của một dự án (dùng cho tab "Lô quy hoạch chưa cấp sổ" trong trang Dự án). */
export async function fetchPlannedLandLotsByProject(projectId: string): Promise<PlannedLandLot[]> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase.from('planned_land_lots').select(SELECT_COLUMNS).eq('project_id', projectId).order('created_at', { ascending: false }),
    DEFAULT_READ_TIMEOUT
  );
  if (error) throw new Error('Không tải được danh sách lô quy hoạch: ' + error.message);
  return (data || []) as unknown as PlannedLandLot[];
}

/** Các lô CHƯA cấp GCN thuộc một sổ lớn cụ thể — dùng cho ô chọn khi Tách sổ. */
export async function fetchOpenPlannedLandLotsByParentAsset(parentAssetId: string): Promise<PlannedLandLot[]> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase
      .from('planned_land_lots')
      .select(SELECT_COLUMNS)
      .eq('parent_master_asset_id', parentAssetId)
      .eq('status', 'chưa cấp GCN')
      .order('legal_lot_code'),
    DEFAULT_READ_TIMEOUT
  );
  if (error) throw new Error('Không tải được danh sách lô quy hoạch của sổ gốc: ' + error.message);
  return (data || []) as unknown as PlannedLandLot[];
}

/** Số lô chưa cấp GCN trên toàn hệ thống — dùng cho dòng đếm ở Dashboard. */
export async function fetchOpenPlannedLandLotsCount(): Promise<number> {
  ensureConfigured();
  const { count, error } = await withTimeout(
    supabase.from('planned_land_lots').select('id', { count: 'exact', head: true }).eq('status', 'chưa cấp GCN'),
    DEFAULT_READ_TIMEOUT
  );
  if (error) throw new Error('Không tải được số lô quy hoạch: ' + error.message);
  return count || 0;
}

export interface CreatePlannedLandLotInput {
  parent_master_asset_id: string;
  legal_lot_code: string;
  land_lot_no?: string | null;
  map_sheet_no?: string | null;
  planned_area: number;
  business_project_name?: string | null;
  business_plot_code?: string | null;
  notes?: string | null;
}

/** Thêm 1 lô quy hoạch (nhập tay). project_id do trigger DB tự gắn từ sổ lớn gốc. */
export async function createPlannedLandLot(input: CreatePlannedLandLotInput): Promise<PlannedLandLot> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase.from('planned_land_lots').insert(input).select(SELECT_COLUMNS).single(),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Không thêm được lô quy hoạch: ' + error.message);
  return data as unknown as PlannedLandLot;
}

export interface UpdatePlannedLandLotInput {
  legal_lot_code?: string;
  land_lot_no?: string | null;
  map_sheet_no?: string | null;
  planned_area?: number;
  business_project_name?: string | null;
  business_plot_code?: string | null;
  notes?: string | null;
}

/**
 * Sửa 1 lô quy hoạch. Lưu ý: nếu lô đã "đã cấp GCN", DB chỉ cho sửa
 * business_project_name / business_plot_code / notes (trigger chặn phần còn lại).
 */
export async function updatePlannedLandLot(id: string, input: UpdatePlannedLandLotInput): Promise<PlannedLandLot> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase.from('planned_land_lots').update(input).eq('id', id).select(SELECT_COLUMNS).single(),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Không cập nhật được lô quy hoạch: ' + error.message);
  return data as unknown as PlannedLandLot;
}

/** Xóa 1 lô quy hoạch. DB chỉ cho xóa khi lô còn "chưa cấp GCN" (RLS chặn lô đã cấp). */
export async function deletePlannedLandLot(id: string): Promise<void> {
  ensureConfigured();
  const { error } = await withTimeout(supabase.from('planned_land_lots').delete().eq('id', id), DEFAULT_WRITE_TIMEOUT);
  if (error) {
    throw new Error(
      'Không xóa được lô quy hoạch: ' + error.message +
      ' (lô đã cấp GCN không thể xóa để giữ lịch sử).'
    );
  }
}

/**
 * Nhập hàng loạt lô quy hoạch từ Excel qua RPC nguyên tử (import_planned_land_lots).
 * dryRun=true chỉ kiểm tra, không ghi dữ liệu — dùng để xem trước lỗi/cảnh báo trước khi nhập thật.
 */
export async function importPlannedLandLots(
  parentAssetId: string,
  rows: PlannedLandLotImportRow[],
  dryRun: boolean
): Promise<PlannedLandLotImportResult> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase.rpc('import_planned_land_lots', {
      p_parent_asset_id: parentAssetId,
      p_rows: rows,
      p_dry_run: dryRun,
    }),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Nhập Excel lô quy hoạch thất bại: ' + error.message);
  return data as PlannedLandLotImportResult;
}