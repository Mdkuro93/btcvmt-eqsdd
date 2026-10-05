import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import {
  PlannedLandLot,
  PlannedLandLotImportRow,
  PlannedLandLotImportResult,
} from '../types';

const SELECT_COLUMNS = `
  id, project_id, parent_master_asset_id, asset_code, asset_type, legal_lot_code, land_lot_no, map_sheet_no,
  business_project_name, business_plot_code, planned_area, status, resulting_asset_id,
  notes, created_by, created_at, updated_at,
  parent_master_asset:assets!parent_master_asset_id(id, certificate_no, asset_code, area, land_lot_no, map_sheet_no),
  resulting_asset:assets!resulting_asset_id(
    id, certificate_no, asset_code, area, mortgage_status, mortgage_bank, mortgage_unit,
    status, invalidation_type, sale_status, custody_status, managing_unit, notes,
    current_owner_entity:investor_entities!current_owner_entity_id(id, name, company_code)
  ),
  projects:projects(id, name, areas(name, regions(name)))
`;

function ensureConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối Supabase.');
  }
}

/** Toàn bộ lô quy hoạch của một dự án (dùng cho tab "Lô quy hoạch" và báo cáo dự án). */
export async function fetchPlannedLandLotsByProject(projectId: string): Promise<PlannedLandLot[]> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase.from('planned_land_lots').select(SELECT_COLUMNS).eq('project_id', projectId).order('created_at', { ascending: false }),
    DEFAULT_READ_TIMEOUT
  );
  if (error) throw new Error('Không tải được danh sách lô quy hoạch: ' + error.message);
  return (data || []).map((lot: any) => ({
    ...lot,
    asset_type: lot.asset_type || 'Đất nền',
  })) as unknown as PlannedLandLot[];
}

/** Lô quy hoạch chưa cấp GCN của Dự án (dùng cho ô chọn khi Khai báo / Cấp thẳng GCN mới). */
export async function fetchOpenPlannedLandLotsByProject(projectId: string): Promise<PlannedLandLot[]> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase
      .from('planned_land_lots')
      .select(SELECT_COLUMNS)
      .eq('project_id', projectId)
      .eq('status', 'chưa cấp GCN')
      .order('legal_lot_code'),
    DEFAULT_READ_TIMEOUT
  );
  if (error) throw new Error('Không tải được danh sách lô quy hoạch của dự án: ' + error.message);
  return (data || []).map((lot: any) => ({
    ...lot,
    asset_type: lot.asset_type || 'Đất nền',
  })) as unknown as PlannedLandLot[];
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
  return (data || []).map((lot: any) => ({
    ...lot,
    asset_type: lot.asset_type || 'Đất nền',
  })) as unknown as PlannedLandLot[];
}

export interface PlannedLotsStageCounts {
  unregistered_count: number; // Q/R: chưa có sổ nào
  in_master_count: number;    // O/P: trong sổ lớn chưa tách
  issued_count: number;       // Đã có sổ riêng
  total_count: number;
}

/** Lấy chỉ số 3 trạng thái lô quy hoạch cho Dashboard và Báo cáo. */
export async function fetchPlannedLotsStageCounts(projectId?: string): Promise<PlannedLotsStageCounts> {
  ensureConfigured();
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_planned_lots_stage_counts', {
        p_project_id: projectId || null
      }),
      DEFAULT_READ_TIMEOUT
    );
    if (!error && data) {
      return data as PlannedLotsStageCounts;
    }
  } catch {
    // Fallback qua truy vấn trực tiếp nếu RPC chưa deploy
  }

  let query = supabase.from('planned_land_lots').select('id, parent_master_asset_id, resulting_asset_id');
  if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) throw new Error('Không tải được số liệu lô quy hoạch: ' + error.message);

  const rows = data || [];
  const unregistered_count = rows.filter(r => !r.parent_master_asset_id && !r.resulting_asset_id).length;
  const in_master_count = rows.filter(r => r.parent_master_asset_id && !r.resulting_asset_id).length;
  const issued_count = rows.filter(r => Boolean(r.resulting_asset_id)).length;

  return {
    unregistered_count,
    in_master_count,
    issued_count,
    total_count: rows.length,
  };
}

/** Số lô chưa cấp GCN trên toàn hệ thống — dùng cho dòng đếm ở Dashboard. */
export async function fetchOpenPlannedLandLotsCount(): Promise<number> {
  const stats = await fetchPlannedLotsStageCounts();
  return (stats.unregistered_count + stats.in_master_count) || 0;
}

export interface CreatePlannedLandLotInput {
  project_id?: string;
  parent_master_asset_id?: string | null;
  asset_code?: string | null;
  asset_type?: string | null;
  legal_lot_code: string;
  land_lot_no?: string | null;
  map_sheet_no?: string | null;
  planned_area: number;
  business_project_name?: string | null;
  business_plot_code?: string | null;
  notes?: string | null;
}

/** Thêm 1 lô quy hoạch (nhập tay). Nếu có parent_master_asset_id, project_id do trigger DB tự gắn từ sổ lớn. */
export async function createPlannedLandLot(input: CreatePlannedLandLotInput): Promise<PlannedLandLot> {
  ensureConfigured();
  const payload = {
    ...input,
    asset_type: input.asset_type || 'Đất nền',
  };
  const { data, error } = await withTimeout(
    supabase.from('planned_land_lots').insert(payload).select(SELECT_COLUMNS).single(),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Không thêm được lô quy hoạch: ' + error.message);
  return {
    ...(data as any),
    asset_type: (data as any)?.asset_type || 'Đất nền',
  } as unknown as PlannedLandLot;
}

export interface UpdatePlannedLandLotInput {
  parent_master_asset_id?: string | null;
  asset_type?: string | null;
  legal_lot_code?: string;
  land_lot_no?: string | null;
  map_sheet_no?: string | null;
  planned_area?: number;
  business_project_name?: string | null;
  business_plot_code?: string | null;
  notes?: string | null;
}

/** Sửa 1 lô quy hoạch. */
export async function updatePlannedLandLot(id: string, input: UpdatePlannedLandLotInput): Promise<PlannedLandLot> {
  ensureConfigured();
  const payload = {
    ...input,
    ...(input.asset_type !== undefined ? { asset_type: input.asset_type || 'Đất nền' } : {}),
  };
  const { data, error } = await withTimeout(
    supabase.from('planned_land_lots').update(payload).eq('id', id).select(SELECT_COLUMNS).single(),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Không cập nhật được lô quy hoạch: ' + error.message);
  return {
    ...(data as any),
    asset_type: (data as any)?.asset_type || 'Đất nền',
  } as unknown as PlannedLandLot;
}

/** Gán các lô quy hoạch chưa có sổ lớn vào một sổ lớn (Giai đoạn 1 -> 2). */
export async function assignPlannedLotsToMasterAsset(parentAssetId: string, lotIds: string[]): Promise<number> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase.rpc('assign_planned_lots_to_master_asset', {
      p_parent_asset_id: parentAssetId,
      p_lot_ids: lotIds,
    }),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Không gán được lô vào sổ lớn: ' + error.message);
  return (data?.assigned_count as number) || 0;
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
 * Nhập hàng loạt lô quy hoạch từ Excel qua RPC nguyên tử (import_planned_land_lots_v2).
 * Truyền ĐÚNG 1 trong 2: target.parentAssetId (nhập vào 1 sổ lớn cụ thể) HOẶC
 * target.projectId (nhập lô độc lập, chưa gắn sổ lớn, thuộc thẳng dự án).
 * dryRun=true chỉ kiểm tra, không ghi dữ liệu — dùng để xem trước lỗi/cảnh báo trước khi nhập thật.
 */
export async function importPlannedLandLots(
  target: { parentAssetId?: string | null; projectId?: string | null },
  rows: PlannedLandLotImportRow[],
  dryRun: boolean
): Promise<PlannedLandLotImportResult> {
  ensureConfigured();
  const { data, error } = await withTimeout(
    supabase.rpc('import_planned_land_lots_v2', {
      p_parent_asset_id: target.parentAssetId || null,
      p_project_id: target.parentAssetId ? null : (target.projectId || null),
      p_rows: rows,
      p_dry_run: dryRun,
    }),
    DEFAULT_WRITE_TIMEOUT
  );
  if (error) throw new Error('Nhập Excel lô quy hoạch thất bại: ' + error.message);
  return data as PlannedLandLotImportResult;
}