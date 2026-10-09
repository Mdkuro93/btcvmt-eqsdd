import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Asset, Region, Area, Warehouse, Project, AssetCodeHistoryEntry, ReassignAssetCodeResult } from '../types';
import { generateNextAssetCode, resolveRegionCode, checkAssetDuplicate, resolveAssetCodePrefix } from '../lib/assetIdentifier';
import { createAuditLog } from './auditLogs';
import { logActivity } from './activityLogs';
import { fetchInvestorEntities } from './investorEntities';
import { isHighRiseAsset } from '../constants/assetTypes';
import { validateScanLink } from '../lib/scanLink';

function getDifferences(oldData: Record<string, any>, newData: Record<string, any>): { oldDiff: Record<string, any>; newDiff: Record<string, any> } {
  const oldDiff: Record<string, any> = {};
  const newDiff: Record<string, any> = {};

  for (const key of Object.keys(newData)) {
    if (key === 'projects' || key === 'warehouses' || key === 'updater' || key === 'updated_at' || key === 'updated_by' || key === 'created_at') continue;
    const oldVal = oldData[key] !== undefined ? oldData[key] : null;
    const newVal = newData[key] !== undefined ? newData[key] : null;
    if (oldVal !== newVal) {
      oldDiff[key] = oldVal;
      newDiff[key] = newVal;
    }
  }
  return { oldDiff, newDiff };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

export function sanitizeUuid(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '') return null;
  return isUuid(trimmed) ? trimmed : null;
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function fetchAssets(filters?: any, page = 1, pageSize = 25): Promise<{ data: Asset[], totalCount: number, source?: 'supabase' | 'mock', error?: any }> {
  if (!isSupabaseConfigured) {
    const allFiltered = mockStore.getAssets(filters);
    const totalCount = allFiltered.length;
    const startIndex = (page - 1) * pageSize;
    const data = allFiltered.slice(startIndex, startIndex + pageSize);
    return { data, totalCount, source: 'mock' };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Optimized select - Only fetch needed relational attributes
  let query = supabase.from('assets').select(`
    id, asset_code, collateral_type, certificate_no, legal_lot_code, area,
    current_owner_entity_id, current_owner_entity:investor_entities(id, name, company_code),
    map_sheet_no, land_lot_no,
    business_project_name, business_plot_code,
    usage_purpose, custody_status, lifecycle_status, sale_status,
    mortgage_status, mortgage_bank, mortgage_unit,
    mortgage_valuation, collateral_ratio, collateral_value, mortgage_expected_release_date,
    expected_return_date, borrow_purpose, scan_file_url, project_id, warehouse_id,
    current_holder_dept, notes, asset_type, registry_no, registry_date, managing_unit,
    certificate_group, usage_term_type, usage_term_date, parent_asset_id, created_at,
    duplicate_rule, duplicate_ack_reason, duplicate_ack_by, duplicate_ack_at,
    relationship_type, invalidation_type, remaining_area, original_area, is_in_warehouse, status,
    updated_at, updated_by,
    updater:profiles!updated_by(id, full_name, email),
    projects:projects(name, areas(name, region_id, regions(name))),
    warehouses:warehouses(name, code, region_code, is_central, regions(name))
  `, { count: 'exact' });

  if (filters) {
    if (filters.search) {
      const s = filters.search.trim();
      query = query.or(`certificate_no.ilike.%${s}%,asset_code.ilike.%${s}%,legal_lot_code.ilike.%${s}%,business_project_name.ilike.%${s}%,business_plot_code.ilike.%${s}%`);
    }
    if (filters.collateralType) query = query.eq('collateral_type', filters.collateralType);
    if (filters.projectId) query = query.eq('project_id', filters.projectId);
    
    const custody = filters.custodyStatus || filters.custody_status;
    if (custody) {
      if (custody === 'in_stock') {
        query = query.or('custody_status.eq.in_stock,custody_status.is.null');
      } else {
        query = query.eq('custody_status', custody);
      }
    }
    
    const lifecycle = filters.lifecycleStatus || filters.lifecycle_status;
    if (lifecycle) query = query.eq('lifecycle_status', lifecycle);
    
    const sale = filters.saleStatus || filters.sale_status;
    if (sale) query = query.eq('sale_status', sale);
    
    const mortgage = filters.mortgageStatus || filters.mortgage_status;
    if (mortgage) query = query.eq('mortgage_status', mortgage);
    
    if (filters.status) {
      query = query.or(`status.eq.${filters.status},status.eq.${filters.status.toUpperCase()},status.eq.${filters.status.toLowerCase()}`);
    }
    
    const whId = filters.warehouseId || filters.warehouse_id;
    if (whId) query = query.eq('warehouse_id', whId);
    if (filters.legal_lot_code) query = query.ilike('legal_lot_code', `%${filters.legal_lot_code.trim()}%`);

    // Phân quyền kho: allowedWarehouseIds (chạy phía server)
    if (filters.allowedWarehouseIds && Array.isArray(filters.allowedWarehouseIds)) {
      if (filters.allowedWarehouseIds.length === 0) {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      } else if (!whId) {
        query = query.in('warehouse_id', filters.allowedWarehouseIds);
      }
    }

    // Lọc theo vùng: chuyển thành điều kiện truy vấn phía server (warehouse_id / project_id)
    const rawRegion = filters.selectedRegion || filters.region;
    if (rawRegion && rawRegion !== 'Tất cả vùng') {
      const cleanReg = rawRegion.replace('Vùng ', '').trim();
      if (cleanReg) {
        const { data: regRows } = await supabase.from('regions').select('id').ilike('name', `%${cleanReg}%`);
        const regIds = (regRows || []).map(r => r.id);
        if (regIds.length === 0) {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        } else {
          const [{ data: whRows }, { data: areaRows }] = await Promise.all([
            supabase.from('warehouses').select('id').in('region_id', regIds),
            supabase.from('areas').select('id').in('region_id', regIds),
          ]);
          const whIds = (whRows || []).map(w => w.id);
          const areaIds = (areaRows || []).map(a => a.id);
          let projIds: string[] = [];
          if (areaIds.length > 0) {
            const { data: pRows } = await supabase.from('projects').select('id').in('area_id', areaIds);
            projIds = (pRows || []).map(p => p.id);
          }

          if (whIds.length === 0 && projIds.length === 0) {
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
          } else if (whIds.length > 0 && projIds.length === 0) {
            query = query.in('warehouse_id', whIds);
          } else if (whIds.length === 0 && projIds.length > 0) {
            query = query.in('project_id', projIds);
          } else {
            query = query.or(`warehouse_id.in.(${whIds.join(',')}),project_id.in.(${projIds.join(',')})`);
          }
        }
      }
    }
  }

  // Apply Server-side Sort & Range Pagination
  query = query.order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);

  try {
    const { data, count, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
    if (error) {
      throw new Error('Không thể tải danh sách tài sản từ Supabase: ' + error.message);
    }

    return { 
      data: (data || []) as unknown as Asset[], 
      totalCount: count ?? (data?.length || 0),
      source: 'supabase'
    };
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tải danh sách tài sản: ' + String(err));
  }
}

export interface CheckAssetDuplicateParams {
  certificateNo?: string | null;
  projectId?: string | null;
  legalLotCode?: string | null;
  mapSheetNo?: string | null;
  landLotNo?: string | null;
  excludeAssetId?: string | null;
}

export interface CheckAssetDuplicateResult {
  is_duplicate: boolean;
  requires_confirmation?: boolean;
  rule?: string;
  reason?: string;
  same_project?: boolean;
  is_invalidated?: boolean;
}

/**
 * Kiểm tra trùng GCN trên toàn bộ cơ sở dữ liệu qua RPC máy chủ (check_asset_duplicate)
 */
export async function checkAssetDuplicateServer(
  params: CheckAssetDuplicateParams
): Promise<CheckAssetDuplicateResult> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    const dup = checkAssetDuplicate(
      {
        certificate_no: params.certificateNo || '',
        project_id: params.projectId || undefined,
        legal_lot_code: params.legalLotCode || undefined,
        map_sheet_no: params.mapSheetNo || undefined,
        land_lot_no: params.landLotNo || undefined,
      },
      assets,
      params.excludeAssetId || undefined
    );
    return {
      is_duplicate: dup.isDuplicate,
      requires_confirmation: dup.isDuplicate,
      reason: dup.reason
    };
  }

  const { data, error } = await withTimeout(
    supabase.rpc('check_asset_duplicate', {
      p_certificate_no: params.certificateNo ? params.certificateNo.trim() : null,
      p_project_id: params.projectId || null,
      p_legal_lot_code: params.legalLotCode ? params.legalLotCode.trim() : null,
      p_map_sheet_no: params.mapSheetNo ? params.mapSheetNo.trim() : null,
      p_land_lot_no: params.landLotNo ? params.landLotNo.trim() : null,
      p_exclude_asset_id: params.excludeAssetId || null,
    }),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    throw new Error('Lỗi kiểm tra trùng GCN: ' + (error.message || 'Lỗi RPC'));
  }

  return {
    is_duplicate: Boolean(data?.is_duplicate),
    requires_confirmation: Boolean(data?.requires_confirmation),
    rule: data?.rule,
    reason: data?.reason,
    same_project: data?.same_project,
    is_invalidated: data?.is_invalidated
  };
}

/**
 * Xem trước mã tài sản kế tiếp qua RPC máy chủ (peek_next_asset_code, không tăng bộ đếm)
 */
export async function peekNextAssetCode(
  region: string,
  province: string,
  type: string = 'BDS'
): Promise<string> {
  const cleanRegion = (region || '').trim().toUpperCase();
  const cleanProv = (province || '').trim().toUpperCase();
  const cleanType = (type || 'BDS').trim().toUpperCase();

  if (!cleanRegion || !cleanProv) {
    throw new Error('Thiếu mã vùng hoặc mã tỉnh để xem trước mã tài sản.');
  }

  if (!isSupabaseConfigured) {
    return generateNextAssetCode(cleanRegion, cleanProv, cleanType, mockStore.getAssets());
  }

  const { data, error } = await withTimeout(
    supabase.rpc('peek_next_asset_code', {
      p_region: cleanRegion,
      p_province: cleanProv,
      p_type: cleanType,
    }),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    throw new Error('Lỗi xem trước mã tài sản: ' + (error.message || 'Lỗi RPC'));
  }

  return data as string;
}

/**
 * Cấp mã tài sản kế tiếp nguyên tử khi lưu qua RPC máy chủ (allocate_asset_code)
 * Dùng allocateAssetCodeByPrefix làm đường chính; bản 3 tham số không còn giá trị mặc định.
 */
export async function allocateAssetCode(
  regionOrPrefix: string,
  province?: string,
  type?: string
): Promise<string> {
  if (!regionOrPrefix) {
    throw new Error('Thiếu tiền tố hoặc mã vùng để cấp mã tài sản.');
  }

  // Nếu truyền trực tiếp dạng tiền tố hoàn chỉnh (ví dụ: VMB_HAN_BDS_ hoặc VMT_DNG_BDS)
  if (!province && regionOrPrefix.includes('_')) {
    return allocateAssetCodeByPrefix(regionOrPrefix);
  }

  if (!province || !type) {
    throw new Error('Thiếu mã tỉnh hoặc loại tài sản khi cấp mã (không dùng giá trị mặc định).');
  }

  const cleanRegion = regionOrPrefix.trim().toUpperCase();
  const cleanProv = province.trim().toUpperCase();
  const cleanType = type.trim().toUpperCase();
  const prefix = `${cleanRegion}_${cleanProv}_${cleanType}_`;

  return allocateAssetCodeByPrefix(prefix);
}

/**
 * Cấp mã tài sản từ chuỗi tiền tố động [MÃ_VÙNG]_[MÃ_ĐỊA_BÀN]_[LOẠI_TS]_
 * qua RPC allocate_asset_code(p_prefix)
 */
export async function allocateAssetCodeByPrefix(prefix: string): Promise<string> {
  let cleanPrefix = prefix.trim().toUpperCase();
  if (!cleanPrefix.endsWith('_')) {
    cleanPrefix = cleanPrefix + '_';
  }

  if (!isSupabaseConfigured) {
    const parts = cleanPrefix.replace(/_$/, '').split('_');
    const r = parts[0];
    const p = parts[1];
    const t = parts[2] || 'BDS';
    if (!r || !p) {
      throw new Error(`Tiền tố mã không hợp lệ "${prefix}": Thiếu mã vùng hoặc mã tỉnh/địa bàn.`);
    }
    return generateNextAssetCode(r, p, t, mockStore.getAssets());
  }

  const { data, error } = await withTimeout(
    supabase.rpc('allocate_asset_code', {
      p_prefix: cleanPrefix,
    }),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    if (isSchemaMissingError(error) || error.code === 'PGRST202') {
      throw new Error(
        `Cơ sở dữ liệu Supabase chưa có hàm 'allocate_asset_code(p_prefix)' (Mã lỗi: ${error.code || 'PGRST202'}). ` +
        `Vui lòng thực thi migration 'supabase/migrations/0095_region_code_config_fix_allocate_and_import.sql' trên Supabase SQL Editor.`
      );
    }
    throw new Error('Lỗi cấp mã tài sản theo tiền tố: ' + (error.message || 'Lỗi RPC'));
  }

  return data as string;
}

/**
 * Fetch asset lineage: Parent certificate and any child certificates created from it
 */
export async function fetchAssetLineage(assetId: string): Promise<{ parent: Asset | null; children: Asset[] }> {
  if (!isSupabaseConfigured) {
    return { parent: null, children: [] };
  }

  // 1. Fetch the target asset to know its parent_asset_id
  const { data: currentAsset, error: currErr } = await withTimeout(
    supabase.from('assets').select('id, parent_asset_id').eq('id', assetId).single(),
    DEFAULT_READ_TIMEOUT
  );
  if (currErr && currErr.code !== 'PGRST116') {
    console.error('Error fetching asset for lineage:', currErr);
  }

  let parent: Asset | null = null;
  if (currentAsset?.parent_asset_id) {
    const { data: parentData, error: parentErr } = await withTimeout(
      supabase.from('assets').select(`
        id, asset_code, certificate_no, area, original_area, remaining_area,
        invalidation_type, relationship_type, custody_status, is_in_warehouse,
        status, lifecycle_status, warehouse_id, warehouses(name), projects(name)
      `).eq('id', currentAsset.parent_asset_id).single(),
      DEFAULT_READ_TIMEOUT
    );
    if (!parentErr && parentData) {
      parent = parentData as unknown as Asset;
    }
  }

  // 2. Fetch all child assets where parent_asset_id = assetId
  const { data: childrenData, error: childErr } = await withTimeout(
    supabase.from('assets').select(`
      id, asset_code, certificate_no, area, original_area, remaining_area,
      invalidation_type, relationship_type, custody_status, is_in_warehouse,
      status, lifecycle_status, warehouse_id, created_at, warehouses(name), projects(name)
    `).eq('parent_asset_id', assetId).order('created_at', { ascending: true }),
    DEFAULT_READ_TIMEOUT
  );

  return {
    parent,
    children: (childErr || !childrenData) ? [] : (childrenData as unknown as Asset[])
  };
}

/**
 * Fetch detailed assets for multi-dimensional Dashboard role analytics
 */
export async function fetchDashboardDetailedAssets(): Promise<Asset[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getAssets();
  }

  const { data, error } = await withTimeout(
    supabase
      .from('assets')
      .select(`
        id, asset_code, collateral_type, certificate_no, legal_lot_code, area,
        project_id, warehouse_id, custody_status, lifecycle_status, sale_status,
        mortgage_status, mortgage_bank, mortgage_unit, mortgage_valuation, collateral_value,
        current_holder_dept, expected_return_date, borrow_purpose,
        business_project_name, business_plot_code,
        projects:projects(id, name),
        warehouses:warehouses(id, name, code, is_central)
      `)
      .order('created_at', { ascending: false })
      .limit(3000),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    throw new Error('Không thể tải dữ liệu chi tiết tài sản cho Dashboard: ' + error.message);
  }

  return (data || []) as unknown as Asset[];
}

/**
 * Lightweight Dashboard stats aggregator
 */
export async function fetchDashboardAssetStats(): Promise<{
  total: number;
  inStock: number;
  checkedOut: number;
  mortgaged: number;
  sold: number;
  totalArea: number;
  totalHighRiseArea: number;
  activeProjectsCount: number;
}> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    const projSet = new Set(assets.map(a => a.project_id || a.business_project_name).filter(Boolean));
    const totalArea = assets.filter(a => !isHighRiseAsset(a.asset_type)).reduce((sum, a) => sum + (Number(a.area) || 0), 0);
    const totalHighRiseArea = assets.filter(a => isHighRiseAsset(a.asset_type)).reduce((sum, a) => sum + (Number(a.area) || 0), 0);
    return {
      total: assets.length,
      inStock: assets.filter(a => a.custody_status === 'in_stock').length,
      checkedOut: assets.filter(a => a.custody_status === 'checked_out').length,
      mortgaged: assets.filter(a => a.mortgage_status === 'mortgaged').length,
      sold: assets.filter(a => a.sale_status === 'sold').length,
      totalArea,
      totalHighRiseArea,
      activeProjectsCount: projSet.size || 1,
    };
  }

  // Perform fast count queries & lightweight area aggregation in parallel with read timeout
  const [totalRes, inStockRes, checkedOutRes, mortgagedRes, soldRes, areaRes] = await withTimeout(
    Promise.all([
      supabase.from('assets').select('*', { count: 'exact', head: true }),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('custody_status', 'in_stock'),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('custody_status', 'checked_out'),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('mortgage_status', 'mortgaged'),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('sale_status', 'sold'),
      supabase.from('assets').select('area, project_id, business_project_name, asset_type'),
    ]),
    DEFAULT_READ_TIMEOUT
  );

  let totalArea = 0;
  let totalHighRiseArea = 0;
  const projSet = new Set<string>();
  if (areaRes.data) {
    for (const r of areaRes.data) {
      const areaVal = Number(r.area) || 0;
      if (isHighRiseAsset(r.asset_type)) {
        totalHighRiseArea += areaVal;
      } else {
        totalArea += areaVal;
      }
      if (r.project_id) projSet.add(r.project_id);
      else if (r.business_project_name) projSet.add(r.business_project_name);
    }
  }

  return {
    total: totalRes.count || 0,
    inStock: inStockRes.count || 0,
    checkedOut: checkedOutRes.count || 0,
    mortgaged: mortgagedRes.count || 0,
    sold: soldRes.count || 0,
    totalArea,
    totalHighRiseArea,
    activeProjectsCount: projSet.size || (areaRes.data && areaRes.data.length > 0 ? 1 : 0),
  };
}

export async function lookupAssets(
  queries: string[],
  projectId?: string,
  page = 1,
  pageSize = 20
): Promise<{ data: any[], totalCount: number }> {
  if (!isSupabaseConfigured) {
    const allAssets = mockStore.getAssets();
    const queryList = queries.filter(q => q.trim().length > 0).map(q => q.trim().toLowerCase());
    
    let filtered = allAssets;
    if (projectId) {
      filtered = filtered.filter(a => a.project_id === projectId);
    }
    
    if (queryList.length > 0) {
      filtered = filtered.filter(a => {
        const certNo = (a.certificate_no || '').toLowerCase();
        const lot = (a.legal_lot_code || '').toLowerCase();
        return queryList.some(q => certNo.includes(q) || lot.includes(q));
      });
    }

    const totalCount = filtered.length;
    const startIndex = (page - 1) * pageSize;
    const data = filtered.slice(startIndex, startIndex + pageSize).map(a => ({
      certificate_no: a.certificate_no,
      project_name: a.projects?.name,
      legal_lot_code: a.legal_lot_code,
      custody_status: a.custody_status,
      lifecycle_status: a.lifecycle_status,
      sale_status: a.sale_status,
      mortgage_status: a.mortgage_status,
    }));
    return { data, totalCount };
  }
  
  const q = queries.filter(q => q.trim().length > 0)[0] || '';
  const { data, error } = await withTimeout(
    supabase.rpc('lookup_asset_status', { p_query: q }),
    DEFAULT_READ_TIMEOUT
  );
  if (error) throw error;
  const resData = data || [];
  return { data: resData, totalCount: resData.length };
}

export async function fetchAssetById(id: string): Promise<Asset | null> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    return assets.find(a => a.id === id) || null;
  }

  const { data, error } = await withTimeout(
    supabase
      .from('assets')
      .select(`
        *,
        projects(name, areas(name, region_id)),
        warehouses(name, is_central)
      `)
      .eq('id', id)
      .single(),
    DEFAULT_READ_TIMEOUT
  );

  if (error) throw error;
  return data;
}

export async function createAsset(assetData: Partial<Asset>): Promise<Asset> {
  const current = mockStore.getAssets();
  const projects = mockStore.getProjects();
  const warehouses = mockStore.getWarehouses();
  
  const regionCode = resolveRegionCode(assetData.project_id, projects);
  const collateralType = assetData.collateral_type || 'BDS';
  // Ghi chú: (assetData as any).provinceCodeHint chỉ dùng để sinh Mã Tài Sản (asset_code),
  // KHÔNG lưu vào bảng assets (đã bỏ cột province theo Data Dictionary mới).
  const provinceCodeHint = (assetData as any).provinceCodeHint || (assetData as any).province;

  let autoCode = assetData.asset_code;
  if (!autoCode) {
    if (isSupabaseConfigured) {
      const resolved = resolveAssetCodePrefix({
        projectId: assetData.project_id,
        projects,
        collateralType,
      });
      if (resolved.isValid) {
        autoCode = await allocateAssetCodeByPrefix(resolved.prefix);
      } else {
        throw new Error(resolved.error || 'Dự án hoặc địa bàn chưa cấu hình mã vùng/mã tỉnh.');
      }
    } else {
      const resolved = resolveAssetCodePrefix({
        projectId: assetData.project_id,
        projects,
        collateralType,
      });
      const reg = resolved.isValid ? resolved.regionCode : regionCode;
      const prov = resolved.isValid ? resolved.provinceCode : (provinceCodeHint || '');
      if (!reg || !prov) {
        throw new Error(resolved.error || 'Thiếu mã vùng hoặc mã tỉnh/địa bàn để sinh mã tài sản.');
      }
      autoCode = generateNextAssetCode(reg, prov, collateralType, current);
    }
  }

  // Chuẩn hóa dữ liệu insert: chuyển các UUID foreign keys rỗng "" hoặc không hợp lệ thành null
  const payloadToInsert: Record<string, any> = {
    asset_code: autoCode,
    collateral_type: collateralType,
    certificate_no: assetData.certificate_no || 'GCN-VMT-' + Math.floor(Math.random() * 1000),
    project_id: sanitizeUuid(assetData.project_id),
    certificate_group: assetData.certificate_group || null,
    legal_lot_code: assetData.legal_lot_code || null,
    business_project_name: assetData.business_project_name?.trim() || null,
    business_plot_code: assetData.business_plot_code?.trim() || null,
    area: assetData.area || 0,
    current_owner_entity_id: sanitizeUuid(assetData.current_owner_entity_id),
    
    map_sheet_no: assetData.map_sheet_no || null,
    land_lot_no: assetData.land_lot_no || null,
    
    usage_purpose: assetData.usage_purpose || null,
    usage_term_type: assetData.usage_term_type || null,
    usage_term_date: assetData.usage_term_date || null,
    
    asset_type: assetData.asset_type || null,
    registry_no: assetData.registry_no || null,
    registry_date: assetData.registry_date || null,
    managing_unit: assetData.managing_unit || null,
    
    mortgage_bank: assetData.mortgage_bank || null,
    mortgage_unit: assetData.mortgage_unit || null,
    mortgage_valuation: assetData.mortgage_valuation || null,
    collateral_ratio: assetData.collateral_ratio || null,
    collateral_value: assetData.collateral_value || null,
    mortgage_expected_release_date: assetData.mortgage_expected_release_date || null,
    
    notes: assetData.notes || null,
    scan_file_url: assetData.scan_file_url || null,
    parent_asset_id: sanitizeUuid(assetData.parent_asset_id),
    
    expected_return_date: assetData.expected_return_date || null,
    borrow_purpose: assetData.borrow_purpose || null,

    custody_status: assetData.custody_status || 'in_stock',
    lifecycle_status: assetData.lifecycle_status || 'active',
    sale_status: assetData.sale_status || 'not_ready',
    mortgage_status: assetData.mortgage_status || 'none',
    warehouse_id: sanitizeUuid(assetData.warehouse_id),
    current_holder_dept: assetData.current_holder_dept || null,
    duplicate_ack_reason: assetData.duplicate_ack_reason ? assetData.duplicate_ack_reason.trim() : null,
  };

  // TUYỆT ĐỐI không gửi trường id lên Supabase khi tạo mới: PostgreSQL/Supabase tự sinh UUID mặc định
  delete payloadToInsert.id;

  if (!isSupabaseConfigured) {
    const fullAsset: Asset = {
      ...(payloadToInsert as any),
      id: generateUuid(),
      created_at: new Date().toISOString(),
    };
    mockStore.saveAssets([fullAsset, ...current]);
    try {
      logActivity({
        assetId: fullAsset.id,
        actionType: 'Nhập sổ (Tạo mới)',
        documentNo: fullAsset.asset_code || fullAsset.certificate_no,
        description: `Khai báo tạo mới GCN: ${fullAsset.certificate_no || ''} (Mã: ${fullAsset.asset_code || ''})`,
        warehouseId: fullAsset.warehouse_id,
        notes: fullAsset.notes || 'Tạo mới trực tiếp trên hệ thống',
      });
    } catch {}
    return mockStore.getAssets().find(a => a.id === fullAsset.id)!;
  }

  const { data, error } = await withTimeout(
    supabase
      .from('assets')
      .insert([payloadToInsert])
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) {
    if (error.message && error.message.includes('DUPLICATE_UNCONFIRMED')) {
      throw new Error('Số GCN đã tồn tại. Vui lòng xác nhận trường hợp trùng kèm lý do.');
    }
    throw error;
  }

  try {
    mockStore.saveAssets([data, ...current]);
  } catch {}

  try {
    await logActivity({
      assetId: data.id,
      actionType: 'Nhập sổ (Tạo mới)',
      documentNo: data.asset_code || data.certificate_no,
      description: `Khai báo tạo mới GCN: ${data.certificate_no || ''} (Mã: ${data.asset_code || ''})`,
      warehouseId: data.warehouse_id,
      notes: data.notes || 'Tạo mới trực tiếp trên hệ thống',
    });
  } catch (logErr) {
    console.warn('Không thể ghi log activity khi tạo GCN:', logErr);
  }

  return data;
}

export async function updateAsset(
  id: string, 
  updates: Partial<Asset>, 
  user?: { id?: string; email?: string; full_name?: string } | null,
  notes?: string
): Promise<Asset> {
  let currentAsset: Partial<Asset> = {};
  if (!isSupabaseConfigured) {
    currentAsset = mockStore.getAssets().find(a => a.id === id) || {};
  } else {
    const { data: dbAsset, error: fetchErr } = await withTimeout(
      supabase.from('assets').select('*').eq('id', id).single(),
      DEFAULT_READ_TIMEOUT
    );
    if (fetchErr) {
      console.error('Lỗi khi tải thông tin GCN để cập nhật:', fetchErr);
      throw new Error(`Không thể tìm thấy hoặc đọc thông tin GCN: ${fetchErr.message || 'Lỗi cơ sở dữ liệu'}.`);
    }
    currentAsset = dbAsset || {};
  }

  const payload: any = {
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  // Loại bỏ trường id nếu có trong updates để tránh lỗi update primary key
  delete payload.id;

  // Chuẩn hóa UUID foreign keys: đổi chuỗi rỗng "" hoặc text không hợp lệ thành null
  if ('project_id' in updates) payload.project_id = sanitizeUuid(updates.project_id);
  if ('warehouse_id' in updates) payload.warehouse_id = sanitizeUuid(updates.warehouse_id);
  if ('parent_asset_id' in updates) payload.parent_asset_id = sanitizeUuid(updates.parent_asset_id);
  if ('current_owner_entity_id' in updates) payload.current_owner_entity_id = sanitizeUuid(updates.current_owner_entity_id);
  if ('duplicate_ack_reason' in updates) payload.duplicate_ack_reason = updates.duplicate_ack_reason ? updates.duplicate_ack_reason.trim() : null;

  const { oldDiff, newDiff } = getDifferences(currentAsset, payload);

  let updatedAsset: Asset;

  if (!isSupabaseConfigured) {
    const current = mockStore.getAssets();
    const updatedList = current.map(a => (a.id === id ? { ...a, ...payload } : a));
    mockStore.saveAssets(updatedList);
    updatedAsset = mockStore.getAssets().find(a => a.id === id)!;
  } else {
    const { data, error } = await withTimeout(
      supabase
        .from('assets')
        .update(payload)
        .eq('id', id)
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      console.error('Lỗi khi cập nhật GCN:', error);
      if (error.message && error.message.includes('DUPLICATE_UNCONFIRMED')) {
        throw new Error('Số GCN đã tồn tại. Vui lòng xác nhận trường hợp trùng kèm lý do.');
      }
      throw new Error(`Không thể cập nhật GCN: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }
    updatedAsset = data;

    try {
      const current = mockStore.getAssets();
      const updatedList = current.map(a => (a.id === id ? { ...a, ...payload } : a));
      mockStore.saveAssets(updatedList);
    } catch {}
  }

  // Create audit log entry
  if (Object.keys(newDiff).length > 0) {
    try {
      await createAuditLog({
        record_id: id,
        action: 'UPDATE',
        old_data: oldDiff,
        new_data: newDiff,
        changed_by: user?.id || null,
        changed_by_name: user?.full_name || user?.email || 'Người dùng hệ thống',
        notes: notes || 'Chỉnh sửa thông tin GCN',
      });
    } catch (e) {
      console.warn('Could not record audit log:', e);
    }
  }

  return updatedAsset;
}

export async function bulkUpdateAssets(
  ids: string[],
  updates: Partial<Asset>,
  user?: { id?: string; email?: string; full_name?: string } | null,
  notes?: string
): Promise<{ count: number }> {
  if (!ids.length) return { count: 0 };

  const payload: any = {
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  delete payload.id;
  if ('project_id' in updates) payload.project_id = sanitizeUuid(updates.project_id);
  if ('warehouse_id' in updates) payload.warehouse_id = sanitizeUuid(updates.warehouse_id);
  if ('parent_asset_id' in updates) payload.parent_asset_id = sanitizeUuid(updates.parent_asset_id);
  if ('current_owner_entity_id' in updates) payload.current_owner_entity_id = sanitizeUuid(updates.current_owner_entity_id);

  // Clean undefined
  Object.keys(payload).forEach(k => {
    if (payload[k] === undefined) delete payload[k];
  });

  let allAssets: Asset[] = [];
  if (!isSupabaseConfigured) {
    allAssets = mockStore.getAssets().filter(a => ids.includes(a.id));
  } else {
    const { data: dbAssets, error: fetchErr } = await withTimeout(
      supabase.from('assets').select('*').in('id', ids),
      DEFAULT_READ_TIMEOUT
    );
    if (fetchErr) {
      console.error('Lỗi khi tải danh sách GCN cập nhật hàng loạt:', fetchErr);
      throw new Error(`Không thể đọc danh sách GCN để cập nhật: ${fetchErr.message || 'Lỗi cơ sở dữ liệu'}.`);
    }
    allAssets = (dbAssets || []) as Asset[];
  }

  if (!isSupabaseConfigured) {
    const current = mockStore.getAssets();
    const updatedList = current.map(a => {
      if (ids.includes(a.id)) {
        return { ...a, ...payload };
      }
      return a;
    });
    mockStore.saveAssets(updatedList);
  } else {
    const { error } = await withTimeout(
      supabase
        .from('assets')
        .update(payload)
        .in('id', ids),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi cập nhật hàng loạt GCN:', error);
      throw new Error(`Không thể cập nhật hàng loạt GCN: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getAssets();
      const updatedList = current.map(a => {
        if (ids.includes(a.id)) {
          return { ...a, ...payload };
        }
        return a;
      });
      mockStore.saveAssets(updatedList);
    } catch {}
  }

  // Record audit logs for each affected asset
  for (const oldA of allAssets) {
    const { oldDiff, newDiff } = getDifferences(oldA, payload);
    if (Object.keys(newDiff).length > 0) {
      try {
        await createAuditLog({
          record_id: oldA.id,
          action: 'BULK_UPDATE',
          old_data: oldDiff,
          new_data: newDiff,
          changed_by: user?.id || null,
          changed_by_name: user?.full_name || user?.email || 'Người dùng hệ thống',
          notes: notes || `Cập nhật hàng loạt (${ids.length} tài sản)`,
        });
      } catch (e) {
        console.warn('Could not record bulk audit log for:', oldA.id, e);
      }
    }
  }

  return { count: ids.length };
}

export async function checkDuplicateAssets(certificateNos: string[]): Promise<string[]> {
  if (!certificateNos.length) return [];
  
  if (!isSupabaseConfigured) {
    const current = mockStore.getAssets();
    const existingSet = new Set(current.map(a => a.certificate_no));
    return certificateNos.filter(no => existingSet.has(no));
  }
  
  const chunkSize = 500;
  const duplicates: string[] = [];
  
  for (let i = 0; i < certificateNos.length; i += chunkSize) {
    const chunk = certificateNos.slice(i, i + chunkSize);
    const { data, error } = await withTimeout(
      supabase
        .from('assets')
        .select('certificate_no')
        .in('certificate_no', chunk),
      DEFAULT_READ_TIMEOUT
    );
      
    if (error) throw error;
    if (data) {
      duplicates.push(...data.map(d => d.certificate_no));
    }
  }
  
  return duplicates;
}

export async function fetchProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getProjects();
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('projects')
        .select('*, areas(name, region_id)')
        .order('name'),
      DEFAULT_READ_TIMEOUT
    );

    if (error) {
      throw new Error('Không thể tải danh sách dự án từ Supabase: ' + error.message);
    }
    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tải danh sách dự án: ' + String(err));
  }
}

export async function createProject(project: { name: string; area_id: string; project_code?: string | null; default_owner_entity_id?: string | null }): Promise<Project> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProjects();
    const newProj: Project = {
      id: 'proj-' + Date.now(),
      name: project.name,
      area_id: project.area_id,
      project_code: project.project_code || null,
      default_owner_entity_id: project.default_owner_entity_id || null,
    };
    mockStore.saveProjects([...current, newProj]);
    return mockStore.getProjects().find(p => p.id === newProj.id)!;
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('projects')
        .insert([project])
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      console.error('Lỗi khi tạo dự án trên Supabase:', error);
      throw new Error(`Không thể tạo dự án: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getProjects();
      mockStore.saveProjects([...current, data]);
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm createProject:', err);
    throw new Error(err.message || 'Không thể tạo dự án, vui lòng thử lại.');
  }
}

export async function updateProject(id: string, updates: { name?: string; area_id?: string; project_code?: string | null; default_owner_entity_id?: string | null }) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProjects();
    mockStore.saveProjects(current.map(p => p.id === id ? { ...p, ...updates } : p));
    return mockStore.getProjects().find(p => p.id === id);
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      console.error('Lỗi khi cập nhật dự án trên Supabase:', error);
      throw new Error(`Không thể cập nhật thông tin dự án: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getProjects();
      mockStore.saveProjects(current.map(p => p.id === id ? { ...p, ...updates } : p));
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm updateProject:', err);
    throw new Error(err.message || 'Không thể cập nhật dự án, vui lòng thử lại.');
  }
}

export async function deleteProject(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProjects();
    mockStore.saveProjects(current.filter(p => p.id !== id));
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase.from('projects').delete().eq('id', id),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi xóa dự án trên Supabase:', error);
      // 23503 = foreign_key_violation: dự án còn dữ liệu con tham chiếu tới (thường là
      // lô quy hoạch pháp lý chưa xóa hết — cố ý chặn theo thiết kế, xem migration 0048/0053).
      if ((error as any).code === '23503') {
        const detail = (error as any).details || '';
        if (detail.includes('planned_land_lots')) {
          throw new Error('Không thể xóa dự án: dự án vẫn còn "Lô quy hoạch pháp lý" chưa xóa hết. Vào mục "Lô quy hoạch" của dự án để xóa hết các lô trước.');
        }
        throw new Error('Không thể xóa dự án: vẫn còn dữ liệu khác đang tham chiếu tới dự án này (' + detail + ').');
      }
      throw new Error(`Không thể xóa dự án: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getProjects();
      mockStore.saveProjects(current.filter(p => p.id !== id));
    } catch {}
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteProject:', err);
    throw new Error(err.message || 'Không thể xóa dự án, vui lòng thử lại.');
  }
}

export async function fetchRegions(): Promise<Region[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getRegions();
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('regions').select('*').order('name'),
      DEFAULT_READ_TIMEOUT
    );
    if (error) {
      throw new Error('Không thể tải danh sách vùng miền từ Supabase: ' + error.message);
    }
    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tải danh sách vùng miền: ' + String(err));
  }
}

export async function createRegion(name: string, code?: string | null): Promise<Region> {
  const cleanName = name.trim();
  const cleanCode = code?.trim().toUpperCase() || null;

  if (cleanCode && !/^[A-Z0-9]{2,8}$/.test(cleanCode)) {
    throw new Error('Mã vùng không hợp lệ (phải từ 2-8 ký tự chữ hoặc số in hoa, ví dụ: VMB, VMT, VMN).');
  }

  if (!isSupabaseConfigured) {
    const current = mockStore.getRegions();
    const newR: Region = { id: 'reg-' + Date.now(), name: cleanName, code: cleanCode };
    mockStore.saveRegions([...current, newR]);
    return newR;
  }
  try {
    const payload: { name: string; code: string | null } = { name: cleanName, code: cleanCode };
    const { data, error } = await withTimeout(
      supabase.from('regions').insert([payload]).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      if (error.code === '23505' || String(error.message).includes('regions_code_key')) {
        throw new Error('Mã vùng đã được vùng khác sử dụng.');
      }
      if (error.code === '23514' || String(error.message).includes('chk_regions_code_format')) {
        throw new Error('Mã vùng không hợp lệ (phải từ 2-8 ký tự chữ hoặc số in hoa, ví dụ: VMB, VMT, VMN).');
      }
      if (
        isSchemaMissingError(error) ||
        error.code === 'PGRST204' ||
        error.message?.includes('code')
      ) {
        throw new Error(
          `Cơ sở dữ liệu Supabase chưa cập nhật cột 'code' cho bảng 'regions' (Mã lỗi: ${error.code || 'PGRST204'}). ` +
          `Vui lòng thực thi migration 'supabase/migrations/0095_region_code_config_fix_allocate_and_import.sql' trên Supabase SQL Editor.`
        );
      }
      throw new Error(`Không thể tạo vùng miền: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getRegions();
      mockStore.saveRegions([...current, data]);
    } catch {}

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tạo vùng miền: ' + String(err));
  }
}

export async function updateRegion(id: string, name: string, code?: string | null) {
  const cleanName = name.trim();
  const cleanCode = code?.trim().toUpperCase() || null;

  if (cleanCode && !/^[A-Z0-9]{2,8}$/.test(cleanCode)) {
    throw new Error('Mã vùng không hợp lệ (phải từ 2-8 ký tự chữ hoặc số in hoa, ví dụ: VMB, VMT, VMN).');
  }

  if (!isSupabaseConfigured) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.map(r => r.id === id ? { ...r, name: cleanName, code: cleanCode } : r));
    return;
  }
  try {
    const payload: { name: string; code: string | null } = { name: cleanName, code: cleanCode };
    const { data, error } = await withTimeout(
      supabase.from('regions').update(payload).eq('id', id).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      if (error.code === '23505' || String(error.message).includes('regions_code_key')) {
        throw new Error('Mã vùng đã được vùng khác sử dụng.');
      }
      if (error.code === '23514' || String(error.message).includes('chk_regions_code_format')) {
        throw new Error('Mã vùng không hợp lệ (phải từ 2-8 ký tự chữ hoặc số in hoa, ví dụ: VMB, VMT, VMN).');
      }
      if (
        isSchemaMissingError(error) ||
        error.code === 'PGRST204' ||
        error.message?.includes('code')
      ) {
        throw new Error(
          `Cơ sở dữ liệu Supabase chưa cập nhật cột 'code' cho bảng 'regions' (Mã lỗi: ${error.code || 'PGRST204'}). ` +
          `Vui lòng thực thi migration 'supabase/migrations/0095_region_code_config_fix_allocate_and_import.sql' trên Supabase SQL Editor.`
        );
      }
      throw new Error(`Không thể cập nhật vùng miền: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getRegions();
      mockStore.saveRegions(current.map(r => r.id === id ? { ...r, name: cleanName, code: cleanCode } : r));
    } catch {}

    return data;
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể cập nhật vùng miền: ' + String(err));
  }
}

export async function deleteRegion(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.filter(r => r.id !== id));
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase.from('regions').delete().eq('id', id),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi xóa vùng miền trên Supabase:', error);
      throw new Error(`Không thể xóa vùng miền: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getRegions();
      mockStore.saveRegions(current.filter(r => r.id !== id));
    } catch {}
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteRegion:', err);
    throw new Error(err.message || 'Không thể xóa vùng miền, vui lòng thử lại.');
  }
}

export async function fetchAreas(): Promise<Area[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getAreas();
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('areas').select('*, regions(name)').order('name'),
      DEFAULT_READ_TIMEOUT
    );
    if (error) {
      throw new Error('Không thể tải danh sách khu vực từ Supabase: ' + error.message);
    }
    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tải danh sách khu vực: ' + String(err));
  }
}

export async function createArea(name: string, region_id: string, province_code?: string | null): Promise<Area> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAreas();
    const newA: Area = { id: 'area-' + Date.now(), name, region_id, province_code };
    mockStore.saveAreas([...current, newA]);
    return mockStore.getAreas().find(a => a.id === newA.id)!;
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('areas').insert([{ name, region_id, province_code }]).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi tạo khu vực trên Supabase:', error);
      throw new Error(`Không thể tạo khu vực: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getAreas();
      mockStore.saveAreas([...current, data]);
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm createArea:', err);
    throw new Error(err.message || 'Không thể tạo khu vực, vui lòng thử lại.');
  }
}

export async function updateArea(id: string, name: string, region_id: string, province_code?: string | null) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAreas();
    mockStore.saveAreas(current.map(a => a.id === id ? { ...a, name, region_id, province_code } : a));
    return;
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('areas').update({ name, region_id, province_code }).eq('id', id).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi cập nhật khu vực trên Supabase:', error);
      throw new Error(`Không thể cập nhật khu vực: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getAreas();
      mockStore.saveAreas(current.map(a => a.id === id ? { ...a, name, region_id } : a));
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm updateArea:', err);
    throw new Error(err.message || 'Không thể cập nhật khu vực, vui lòng thử lại.');
  }
}

export async function deleteArea(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAreas();
    mockStore.saveAreas(current.filter(a => a.id !== id));
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase.from('areas').delete().eq('id', id),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi xóa khu vực trên Supabase:', error);
      throw new Error(`Không thể xóa khu vực: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getAreas();
      mockStore.saveAreas(current.filter(a => a.id !== id));
    } catch {}
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteArea:', err);
    throw new Error(err.message || 'Không thể xóa khu vực, vui lòng thử lại.');
  }
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getWarehouses();
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('warehouses').select('*, regions(name)').order('name'),
      DEFAULT_READ_TIMEOUT
    );
    if (error) {
      throw new Error('Không thể tải danh sách kho từ Supabase: ' + error.message);
    }
    return data || [];
  } catch (err: any) {
    throw err instanceof Error ? err : new Error('Không thể tải danh sách kho: ' + String(err));
  }
}

export async function createWarehouse(warehouse: { name: string; code?: string | null; region_code?: string | null; region_id?: string | null; is_central?: boolean }): Promise<Warehouse> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getWarehouses();
    const newW: Warehouse = {
      id: 'wh-' + Date.now(),
      name: warehouse.name,
      code: warehouse.code || String(current.length + 1).padStart(3, '0'),
      region_code: warehouse.region_code || null,
      region_id: warehouse.region_id || null,
      is_central: warehouse.is_central || false,
    };
    mockStore.saveWarehouses([...current, newW]);
    return mockStore.getWarehouses().find(w => w.id === newW.id)!;
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('warehouses').insert([warehouse]).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi tạo kho lưu trữ trên Supabase:', error);
      throw new Error(`Không thể tạo kho lưu trữ: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getWarehouses();
      mockStore.saveWarehouses([...current, data]);
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm createWarehouse:', err);
    throw new Error(err.message || 'Không thể tạo kho lưu trữ, vui lòng thử lại.');
  }
}

export async function updateWarehouse(id: string, updates: { name?: string; code?: string | null; region_code?: string | null; region_id?: string | null; is_central?: boolean }) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getWarehouses();
    mockStore.saveWarehouses(current.map(w => w.id === id ? { ...w, ...updates } : w));
    return;
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('warehouses').update(updates).eq('id', id).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi cập nhật thông tin kho trên Supabase:', error);
      throw new Error(`Không thể cập nhật kho: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getWarehouses();
      mockStore.saveWarehouses(current.map(w => w.id === id ? { ...w, ...updates } : w));
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm updateWarehouse:', err);
    throw new Error(err.message || 'Không thể cập nhật kho, vui lòng thử lại.');
  }
}

export async function deleteWarehouse(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getWarehouses();
    mockStore.saveWarehouses(current.filter(w => w.id !== id));
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase.from('warehouses').delete().eq('id', id),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi xóa kho trên Supabase:', error);
      if (error.code === '23503' || /foreign key|violates/i.test(error.message || '')) {
        throw new Error('Không thể xóa kho lưu trữ này vì vẫn còn Giấy chứng nhận hoặc chứng từ giao dịch liên kết. Vui lòng điều chuyển hết GCN sang kho khác trước khi xóa.');
      }
      throw new Error(`Không thể xóa kho lưu trữ: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getWarehouses();
      mockStore.saveWarehouses(current.filter(w => w.id !== id));
    } catch {}
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteWarehouse:', err);
    throw new Error(err.message || 'Không thể xóa kho lưu trữ, vui lòng thử lại.');
  }
}

export const deleteAsset = async (id: string): Promise<void> => {
  if (!isSupabaseConfigured) {
    mockStore.deleteAsset(id);
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from('assets')
        .delete()
        .eq('id', id),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      console.error('Supabase deleteAsset returned error:', error);
      if (error.code === '23503' || /foreign key|violates/i.test(error.message || '')) {
        const details = ((error.details || '') + ' ' + (error.message || '')).toLowerCase();
        if (details.includes('transaction_items')) {
          throw new Error(
            'Không thể xóa Giấy chứng nhận này do đã phát sinh lịch sử giao dịch kho (phiếu nhập, xuất, thế chấp hoặc bàn giao). ' +
            'Để bảo toàn tính toàn vẹn chứng từ kế toán và nhật ký kiểm toán, vui lòng chuyển trạng thái GCN sang "Vô hiệu / Thu hồi" thay vì xóa hẳn.'
          );
        }
        if (details.includes('collaterals')) {
          throw new Error(
            'Không thể xóa Giấy chứng nhận này do đang có hồ sơ thế chấp ngân hàng liên kết. ' +
            'Vui lòng giải chấp hoặc chuyển trạng thái GCN sang "Vô hiệu / Thu hồi" thay vì xóa hẳn.'
          );
        }
        throw new Error(
          'Không thể xóa Giấy chứng nhận này do đã phát sinh dữ liệu nghiệp vụ liên kết (giao dịch kho, thế chấp, kiểm kê hoặc lịch sử sở hữu). ' +
          'Để bảo toàn tính toàn vẹn dữ liệu, vui lòng chuyển trạng thái GCN sang "Vô hiệu / Thu hồi" thay vì xóa hẳn.'
        );
      }
      throw new Error(`Không thể xóa GCN khỏi cơ sở dữ liệu: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      mockStore.deleteAsset(id);
    } catch {}
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteAsset:', err);
    throw new Error(err.message || 'Không thể xóa GCN, vui lòng thử lại.');
  }
};

export const deleteMultipleAssets = async (ids: string[]): Promise<void> => {
  if (!ids || ids.length === 0) return;
  if (!isSupabaseConfigured) {
    mockStore.deleteAssets(ids);
    return;
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from('assets')
        .delete()
        .in('id', ids),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      console.error('Supabase deleteMultipleAssets returned error:', error);
      if (error.code === '23503' || /foreign key|violates/i.test(error.message || '')) {
        throw new Error(
          'Không thể xóa một hoặc nhiều Giấy chứng nhận đã chọn do đã phát sinh lịch sử giao dịch kho (phiếu nhập, xuất, thế chấp...) hoặc dữ liệu nghiệp vụ liên kết. ' +
          'Để bảo toàn chứng từ kế toán, vui lòng chuyển trạng thái các GCN này sang "Vô hiệu / Thu hồi" thay vì xóa hẳn.'
        );
      }
      throw new Error(`Không thể xóa các GCN đã chọn từ cơ sở dữ liệu: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      mockStore.deleteAssets(ids);
    } catch {}
  } catch (err: any) {
    console.error('Lỗi trong hàm deleteMultipleAssets:', err);
    throw new Error(err.message || 'Không thể xóa danh sách GCN, vui lòng thử lại.');
  }
};

export async function createMultipleAssets(assetsData: Partial<Asset>[]): Promise<Asset[]> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAssets();
    const newItems = assetsData.map((a, idx) => ({
      ...a,
      id: a.id || generateUuid(),
      certificate_no: a.certificate_no || `GCN-${idx + 1}`,
      created_at: a.created_at || new Date().toISOString(),
    })) as Asset[];
    mockStore.saveAssets([...newItems, ...current]);
    return newItems;
  }
  try {
    const assetsForSupabase = assetsData.map(item => {
      const { id: _id, ...rest } = item;
      return {
        ...rest,
        project_id: sanitizeUuid(rest.project_id),
        warehouse_id: sanitizeUuid(rest.warehouse_id),
        parent_asset_id: sanitizeUuid(rest.parent_asset_id),
        current_owner_entity_id: sanitizeUuid(rest.current_owner_entity_id),
      };
    });

    const { data, error } = await withTimeout(
      supabase
        .from('assets')
        .insert(assetsForSupabase)
        .select(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Supabase createMultipleAssets error:', error);
      throw new Error(`Không thể thêm mới hàng loạt GCN vào cơ sở dữ liệu: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      if (data) {
        const current = mockStore.getAssets();
        mockStore.saveAssets([...data, ...current]);
      }
    } catch {}

    return data || [];
  } catch (err: any) {
    console.error('Lỗi trong hàm createMultipleAssets:', err);
    throw new Error(err.message || 'Không thể tạo hàng loạt GCN, vui lòng thử lại.');
  }
}


export async function requestExtension(assetId: string, additionalDays: number, reason: string, profile: any) {
  if (isSupabaseConfigured) {
    // 1. Fetch current asset to get expected_return_date
    const { data: asset, error: fetchErr } = await supabase
      .from('assets')
      .select('expected_return_date')
      .eq('id', assetId)
      .single();
    if (fetchErr) throw fetchErr;

    // 2. Calculate new date
    const currentDate = asset.expected_return_date ? new Date(asset.expected_return_date) : new Date();
    currentDate.setDate(currentDate.getDate() + additionalDays);
    const newDateStr = currentDate.toISOString().split('T')[0];

    // 3. Update asset
    const { error: updateErr } = await supabase
      .from('assets')
      .update({ expected_return_date: newDateStr })
      .eq('id', assetId);
    if (updateErr) throw updateErr;

    // 4. Log activity
    await logActivity({
      assetId,
      actionType: 'Xin gia hạn GCN',
      description: `Xin gia hạn thêm ${additionalDays} ngày. Lý do: ${reason}. Hạn mới: ${newDateStr}`,
      notes: reason,
      performedBy: profile?.id,
    });
  } else {
    const assets = mockStore.getAssets();
    const asset = assets.find(a => a.id === assetId);
    if (asset) {
      const currentDate = asset.expected_return_date ? new Date(asset.expected_return_date) : new Date();
      currentDate.setDate(currentDate.getDate() + additionalDays);
      asset.expected_return_date = currentDate.toISOString().split('T')[0];
    }
  }
}


export async function fetchOverdueAssets(): Promise<Asset[]> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    const today = new Date();
    today.setHours(0,0,0,0);
    return assets.filter(a => 
      a.custody_status === 'checked_out' && 
      a.expected_return_date && 
      new Date(a.expected_return_date) < today
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const { data, error } = await withTimeout(
    supabase
      .from('assets')
      .select('*, projects(name), warehouses(name)')
      .eq('custody_status', 'checked_out')
      .lt('expected_return_date', todayStr),
    DEFAULT_READ_TIMEOUT
  );

  if (error) throw error;
  return data || [];
}

export interface ReassignAssetCodeParams {
  assetId: string;
  reason: string;
  newProjectId?: string | null;
  newCollateralType?: string | null;
  confirmHistory?: boolean;
  apply?: boolean;
}

/**
 * Tái cấp mã tài sản qua RPC máy chủ `reassign_asset_code` (Migration 0097)
 * - apply=false: xem trước tiền tố mới & kiểm tra lịch sử đã phát sinh
 * - apply=true: cấp mã mới nguyên tử, lưu former_asset_codes, ghi asset_code_history & audit_logs
 */
export async function reassignAssetCode(params: ReassignAssetCodeParams): Promise<ReassignAssetCodeResult> {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối cơ sở dữ liệu Supabase.');
  }

  const { data, error } = await withTimeout(
    supabase.rpc('reassign_asset_code', {
      p_asset_id: params.assetId,
      p_reason: params.reason,
      p_new_project_id: params.newProjectId || null,
      p_new_collateral_type: params.newCollateralType || null,
      p_confirm_history: Boolean(params.confirmHistory),
      p_apply: Boolean(params.apply),
    }),
    params.apply ? DEFAULT_WRITE_TIMEOUT : DEFAULT_READ_TIMEOUT
  );

  if (error) {
    const err: any = new Error(error.message || 'Lỗi khi tái cấp mã tài sản');
    err.code = error.code;
    err.details = error.details;
    err.hint = error.hint;
    throw err;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Máy chủ không trả về kết quả tái cấp mã.');
  }

  return {
    oldCode: row.r_old_code ?? null,
    newPrefix: row.r_new_prefix ?? null,
    newCode: row.r_new_code ?? null,
    hasHistory: Boolean(row.r_has_history),
    history: row.r_history ?? null,
    requiresConfirm: Boolean(row.r_requires_confirm),
    applied: Boolean(row.r_applied),
  };
}

/**
 * Lấy lịch sử các lần tái cấp mã của một tài sản từ bảng `asset_code_history`
 */
export async function fetchAssetCodeHistory(assetId: string): Promise<AssetCodeHistoryEntry[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const { data, error } = await withTimeout(
    supabase
      .from('asset_code_history')
      .select('*')
      .eq('asset_id', assetId)
      .order('changed_at', { ascending: false }),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    console.warn('Không thể tải lịch sử tái cấp mã:', error.message);
    return [];
  }

  return data || [];
}
