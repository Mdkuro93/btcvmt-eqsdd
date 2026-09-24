import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT, isSchemaMissingError } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Asset, Region, Area, Warehouse, Project } from '../types';
import { generateNextAssetCode, resolveRegionCode } from '../lib/assetIdentifier';
import { createAuditLog } from './auditLogs';
import { logActivity } from './activityLogs';
import { fetchInvestorEntities } from './investorEntities';

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
    if (custody) query = query.eq('custody_status', custody);
    
    const lifecycle = filters.lifecycleStatus || filters.lifecycle_status;
    if (lifecycle) query = query.eq('lifecycle_status', lifecycle);
    
    const sale = filters.saleStatus || filters.sale_status;
    if (sale) query = query.eq('sale_status', sale);
    
    const mortgage = filters.mortgageStatus || filters.mortgage_status;
    if (mortgage) query = query.eq('mortgage_status', mortgage);
    
    if (filters.status) {
      query = query.or(`status.eq.${filters.status},status.eq.${filters.status.toUpperCase()},status.eq.${filters.status.toLowerCase()}`);
    }
    
    if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId);
    if (filters.legal_lot_code) query = query.ilike('legal_lot_code', `%${filters.legal_lot_code.trim()}%`);
  }

  // Apply Server-side Sort & Range Pagination
  query = query.order('created_at', { ascending: false }).range(from, to);

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

/**
 * Ultra-lightweight query for checking duplicate records and generating sequential asset codes
 */
export async function fetchAssetIdentifierCandidates(projectId?: string): Promise<Asset[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getAssets();
  }

  let query = supabase.from('assets').select(`
    id, asset_code, collateral_type, certificate_no, project_id,
    legal_lot_code, map_sheet_no, land_lot_no, lifecycle_status,
    custody_status, is_in_warehouse, area, original_area, remaining_area,
    relationship_type, invalidation_type, status,
    business_project_name, business_plot_code,
    warehouse_id, created_at, projects(name), warehouses(name)
  `).order('created_at', { ascending: false }).limit(2000);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await withTimeout(query, DEFAULT_READ_TIMEOUT);
  if (error) throw error;
  return (data || []).map((a: any) => ({
    ...a,
    is_in_warehouse: (a.is_in_warehouse !== undefined && a.is_in_warehouse !== null)
      ? Boolean(a.is_in_warehouse)
      : (a.custody_status === 'in_stock')
  })) as unknown as Asset[];
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
  activeProjectsCount: number;
}> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    const projSet = new Set(assets.map(a => a.project_id || a.business_project_name).filter(Boolean));
    const totalArea = assets.reduce((sum, a) => sum + (Number(a.area) || 0), 0);
    return {
      total: assets.length,
      inStock: assets.filter(a => a.custody_status === 'in_stock').length,
      checkedOut: assets.filter(a => a.custody_status === 'checked_out').length,
      mortgaged: assets.filter(a => a.mortgage_status === 'mortgaged').length,
      sold: assets.filter(a => a.sale_status === 'sold').length,
      totalArea,
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
      supabase.from('assets').select('area, project_id, business_project_name'),
    ]),
    DEFAULT_READ_TIMEOUT
  );

  let totalArea = 0;
  const projSet = new Set<string>();
  if (areaRes.data) {
    for (const r of areaRes.data) {
      if (r.area) totalArea += Number(r.area) || 0;
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
  
  const selectedWh = warehouses.find(w => w.id === assetData.warehouse_id);
  const regionCode = resolveRegionCode(assetData.project_id, projects, selectedWh?.region_code);
  const collateralType = assetData.collateral_type || 'BDS';
  // Ghi chú: (assetData as any).provinceCodeHint chỉ dùng để sinh Mã Tài Sản (asset_code),
  // KHÔNG lưu vào bảng assets (đã bỏ cột province theo Data Dictionary mới).
  const provinceCodeHint = (assetData as any).provinceCodeHint || (assetData as any).province;
  const autoCode = assetData.asset_code || generateNextAssetCode(regionCode, provinceCodeHint, collateralType, current);

  const fullAsset: Asset = {
    id: 'asset-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    asset_code: autoCode,
    collateral_type: collateralType,
    certificate_no: assetData.certificate_no || 'GCN-VMT-' + Math.floor(Math.random() * 1000),
    project_id: assetData.project_id || null,
    certificate_group: assetData.certificate_group || null,
    legal_lot_code: assetData.legal_lot_code || null,
    business_project_name: assetData.business_project_name?.trim() || null,
    business_plot_code: assetData.business_plot_code?.trim() || null,
    area: assetData.area || 0,
    current_owner_entity_id: assetData.current_owner_entity_id || null,
    
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
    parent_asset_id: assetData.parent_asset_id || null,
    
    expected_return_date: assetData.expected_return_date || null,
    borrow_purpose: assetData.borrow_purpose || null,

    custody_status: assetData.custody_status || 'in_stock',
    lifecycle_status: assetData.lifecycle_status || 'active',
    sale_status: assetData.sale_status || 'not_ready',
    mortgage_status: assetData.mortgage_status || 'none',
    warehouse_id: assetData.warehouse_id || null,
    current_holder_dept: assetData.current_holder_dept || null,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    mockStore.saveAssets([fullAsset, ...current]);
    return mockStore.getAssets().find(a => a.id === fullAsset.id)!;
  }

  const { data, error } = await withTimeout(
    supabase
      .from('assets')
      .insert([fullAsset])
      .select()
      .single(),
    DEFAULT_WRITE_TIMEOUT
  );

  if (error) throw error;

  try {
    mockStore.saveAssets([data, ...current]);
  } catch {}

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

  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

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

export async function importExcelAndUpdateAssets(
  rows: any[],
  user?: { id?: string; email?: string; full_name?: string } | null,
  mode: 'update_or_create' | 'update_only' | 'create_only' = 'update_or_create',
  recordHistory: boolean = false
): Promise<{ updatedCount: number; createdCount: number; errors: string[] }> {
  let currentAssets: Asset[] = [];
  if (!isSupabaseConfigured) {
    currentAssets = mockStore.getAssets();
  } else {
    const { data: dbAssets, error: fetchErr } = await withTimeout(
      supabase.from('assets').select('*'),
      DEFAULT_READ_TIMEOUT * 2
    );
    if (fetchErr) {
      console.error('Lỗi khi tải danh sách GCN hiện có để đối chiếu Excel:', fetchErr);
      throw new Error(`Không thể đọc danh sách GCN hiện có từ cơ sở dữ liệu: ${fetchErr.message || 'Lỗi cơ sở dữ liệu'}.`);
    }
    currentAssets = (dbAssets || []) as Asset[];
  }

  const [projects, warehouses, investorEntities] = await Promise.all([
    fetchProjects(),
    fetchWarehouses(),
    fetchInvestorEntities(),
  ]);

  let updatedCount = 0;
  let createdCount = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const matchId = (row.id || row['ID Hệ Thống'] || '').toString().trim();
      const matchAssetCode = (row.asset_code || row['Mã Tài Sản / TSĐB'] || row['Mã Tài Sản'] || '').toString().trim();
      const matchCertNo = (row.certificate_no || row['Số GCN QSDĐ'] || row['Số GCN'] || row['Số sổ'] || '').toString().trim();

      const existing = currentAssets.find((a: any) => 
        (matchId && a.id === matchId) ||
        (matchAssetCode && a.asset_code === matchAssetCode) ||
        (matchCertNo && a.certificate_no?.trim().toLowerCase() === matchCertNo.toLowerCase())
      );

      // Match project
      const projName = row.project_name || row['Dự Án (Pháp lý)'] || row['Dự Án'] || row['Tên Dự Án'];
      const matchedProj = projName ? projects.find((p: any) => p.name.toLowerCase() === projName.toString().trim().toLowerCase()) : null;

      // Match warehouse
      const whName = row.warehouse_name || row['Kho Lưu Giữ'] || row['Kho'];
      const matchedWh = whName ? warehouses.find((w: any) => w.name.toLowerCase() === whName.toString().trim().toLowerCase()) : null;

      const businessProjName = row.business_project_name || row['Tên Dự Án Kinh Doanh'] || row['Tên dự án kinh doanh'];
      const businessPlot = row.business_plot_code || row['Mã Lô Kinh Doanh'] || row['Mã lô kinh doanh'];
      // Mã Lô Pháp Lý: nay là 1 cột duy nhất; vẫn chấp nhận file cũ còn tách Phân Khu/Số Lô -> nối lại bằng "-"
      const maLoPhapLyRaw = row.legal_lot_code || row['Mã lô đất (Mã Lô Pháp Lý)'] || row['Mã Lô Đất (Mã Lô Pháp Lý)'] || row['Mã Lô Pháp Lý'];
      const legacySubdivision = row['Phân Khu'] || row['Phân khu'];
      const legacyLotNo = row['Số Lô / Thửa (Mã Lô Pháp Lý)'] || row['Số Lô'] || row['Mã lô'];
      let legalLotCode: string | undefined = maLoPhapLyRaw !== undefined ? String(maLoPhapLyRaw).trim() : undefined;
      if (!legalLotCode && (legacySubdivision || legacyLotNo)) {
        legalLotCode = [legacySubdivision, legacyLotNo].filter(Boolean).map(v => String(v).trim()).join('-');
      }

      const landLotNo = row.land_lot_no || row['Số Thửa Bản Đồ'] || row['Số Thửa'] || row['Số thửa'];
      const mapSheetNo = row.map_sheet_no || row['Số Tờ Bản Đồ'] || row['Số Tờ'] || row['Số tờ'];
      const rawArea = row.area !== undefined ? row.area : (row['Diện Tích (m²)'] !== undefined ? row['Diện Tích (m²)'] : row['Diện tích (m2)']);
      const area = rawArea !== undefined && rawArea !== '' ? Number(rawArea) : undefined;
      const assetType = row.asset_type || row['Loại Tài Sản'] || row['Loại tài sản'];
      const usagePurpose = row.usage_purpose || row['Mục Đích Sử Dụng'] || row['Mục đích sử dụng'];

      // Ngân hàng thế chấp / Đơn vị vay: cột đơn, nhiều giá trị nối sẵn bằng ";" trong file Excel
      const mortgageBankRaw = row['Ngân Hàng Thế Chấp'] || row['Ngân hàng thế chấp'];
      const mortgageBank: string | undefined = mortgageBankRaw !== undefined && mortgageBankRaw !== '' ? String(mortgageBankRaw).trim() : undefined;

      const mortgageUnitRaw = row['Đơn vị vay'] || row['Đơn Vị Vay'];
      const mortgageUnit: string | undefined = mortgageUnitRaw !== undefined && mortgageUnitRaw !== '' ? String(mortgageUnitRaw).trim() : undefined;

      const registryNo = row['Số vào sổ cấp'] || row['Số vào sổ'];
      const managingUnit = row['Đơn vị quản lý sổ'] || row['Đơn vị quản lý'];
      const notes = row['Ghi chú'] || row['Ghi Chú'];

      const companyCode = (row.company_code || row['Mã công ty sở hữu'] || '').toString().trim().toUpperCase();
      const rawRole = (row.role || row['Phân loại'] || '').toString().trim().toLowerCase();
      const rawTransferDate = row.transfer_date || row['Ngày chuyển nhượng'] || row['Ngày Chuyển Nhượng'];

      let targetEntityId: string | null = null;
      let targetRole: 'cdt' | 'ndt' | null = null;

      if (companyCode) {
        const matchedEntity = investorEntities.find(e => e.company_code === companyCode);
        if (!matchedEntity) {
          errors.push(`Dòng "${matchCertNo || matchId || 'N/A'}": Không tìm thấy mã công ty sở hữu "${companyCode}". Vui lòng tạo pháp nhân trước.`);
          continue; // Skip this row as per requirement "đưa dòng đó vào danh sách cần xử lý thủ công"
        }
        
        if (rawRole === 'ndt' || rawRole === 'nhà đầu tư') {
          targetRole = 'ndt';
        } else if (rawRole === 'cdt' || rawRole === 'chủ đầu tư') {
          targetRole = 'cdt';
        } else {
          errors.push(`Dòng "${matchCertNo || matchId || 'N/A'}": Thiếu hoặc sai Phân loại (phải là CĐT/NĐT) khi đã điền Mã công ty sở hữu.`);
          continue;
        }

        targetEntityId = matchedEntity.id;
      } else if (matchedProj && matchedProj.default_owner_entity_id) {
        targetEntityId = matchedProj.default_owner_entity_id;
        targetRole = 'cdt';
      }

      // Parse transfer date if present
      let transferDateStr = new Date().toISOString();
      if (rawTransferDate) {
        // Simple attempt to parse date, depending on Excel format it could be a number (Excel serial date) or string
        const parsedDate = new Date(rawTransferDate);
        if (!isNaN(parsedDate.getTime())) {
          transferDateStr = parsedDate.toISOString();
        } else if (typeof rawTransferDate === 'number') {
          // Excel serial date (days since 1900-01-01)
          const excelDate = new Date((rawTransferDate - (25567 + 2)) * 86400 * 1000); // adjust for timezone issues later, but simplified for now
          if (!isNaN(excelDate.getTime())) {
            transferDateStr = excelDate.toISOString();
          }
        }
      }

      if (existing && mode !== 'create_only') {
        const updates: Partial<Asset> = {
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        };
        if (businessProjName !== undefined && businessProjName !== '') updates.business_project_name = String(businessProjName).trim();
        if (businessPlot !== undefined && businessPlot !== '') updates.business_plot_code = String(businessPlot).trim();
        if (legalLotCode !== undefined && legalLotCode !== '') updates.legal_lot_code = legalLotCode;
        if (landLotNo !== undefined && landLotNo !== '') updates.land_lot_no = String(landLotNo).trim();
        if (mapSheetNo !== undefined && mapSheetNo !== '') updates.map_sheet_no = String(mapSheetNo).trim();
        if (area !== undefined && !isNaN(area)) updates.area = area;
        if (assetType !== undefined && assetType !== '') updates.asset_type = String(assetType).trim();
        if (usagePurpose !== undefined && usagePurpose !== '') updates.usage_purpose = String(usagePurpose).trim();
        if (mortgageBank !== undefined) updates.mortgage_bank = mortgageBank || null;
        if (mortgageUnit !== undefined) updates.mortgage_unit = mortgageUnit || null;
        if (registryNo !== undefined && registryNo !== '') updates.registry_no = String(registryNo).trim();
        if (managingUnit !== undefined && managingUnit !== '') updates.managing_unit = String(managingUnit).trim();
        if (notes !== undefined && notes !== '') updates.notes = String(notes).trim();
        if (mortgageBank || mortgageUnit) {
          updates.mortgage_status = 'mortgaged';
        }
        if (matchedProj) updates.project_id = matchedProj.id;
        if (matchedWh) updates.warehouse_id = matchedWh.id;

        // Apply ownership
        if (targetEntityId) {
          updates.current_owner_entity_id = targetEntityId;
          updates.current_owner_role = targetRole;
        }

        const { oldDiff, newDiff } = getDifferences(existing, updates);

        if (Object.keys(newDiff).length > 0) {
          if (!isSupabaseConfigured) {
            const current = mockStore.getAssets();
            mockStore.saveAssets(current.map(a => a.id === existing.id ? { ...a, ...updates } : a));
          } else {
            const { error } = await withTimeout(supabase.from('assets').update(updates).eq('id', existing.id), DEFAULT_WRITE_TIMEOUT);
            if (error) throw error;
          }

          // Handle backfill history
          if (recordHistory && updates.current_owner_entity_id && matchedProj && updates.current_owner_entity_id !== matchedProj.default_owner_entity_id) {
             const transferData = {
                asset_id: existing.id,
                from_entity_id: matchedProj.default_owner_entity_id || existing.current_owner_entity_id,
                from_role: 'cdt', // Assuming original role was cdt
                to_entity_id: updates.current_owner_entity_id,
                to_role: updates.current_owner_role,
                transferred_by: null,
                transferred_at: transferDateStr,
                note: 'Dữ liệu lịch sử, nhập bổ sung khi triển khai hệ thống'
             };
             
             if (isSupabaseConfigured) {
                 await supabase.from('asset_ownership_transfers').insert([transferData]);
             } else {
                 mockStore.addAssetOwnershipTransfer({
                     ...transferData,
                     id: 'trf-' + Date.now(),
                     created_at: new Date().toISOString()
                 } as any);
             }
          }

          await createAuditLog({
            record_id: existing.id,
            action: 'IMPORT',
            old_data: oldDiff,
            new_data: newDiff,
            changed_by: user?.id || null,
            changed_by_name: user?.full_name || user?.email || 'Người dùng hệ thống',
            notes: `Cập nhật thông tin từ file Excel (Khớp: ${matchCertNo || existing.certificate_no})`,
          });
          updatedCount++;
        }
      } else if (!existing && mode !== 'update_only') {
        if (!matchCertNo) {
          errors.push(`Bỏ qua dòng thiếu Số GCN QSDĐ`);
          continue;
        }

        const newAssetData: Partial<Asset> = {
          certificate_no: matchCertNo,
          project_id: matchedProj?.id || null,
          warehouse_id: matchedWh?.id || null,
          business_project_name: businessProjName ? String(businessProjName).trim() : null,
          business_plot_code: businessPlot ? String(businessPlot).trim() : null,
          legal_lot_code: legalLotCode ? String(legalLotCode).trim() : null,
          land_lot_no: landLotNo ? String(landLotNo).trim() : null,
          map_sheet_no: mapSheetNo ? String(mapSheetNo).trim() : null,
          area: area && !isNaN(area) ? area : null,
          asset_type: assetType ? String(assetType).trim() : 'Đất nền',
          usage_purpose: usagePurpose ? String(usagePurpose).trim() : null,
          mortgage_bank: mortgageBank || null,
          mortgage_unit: mortgageUnit || null,
          registry_no: registryNo ? String(registryNo).trim() : null,
          managing_unit: managingUnit ? String(managingUnit).trim() : null,
          notes: notes ? String(notes).trim() : null,
          current_owner_entity_id: targetEntityId,
          current_owner_role: targetRole,
          // GCN đã thế chấp: bản gốc thường đang giữ tại ngân hàng, không nằm tại kho công ty
          // -> đánh dấu Đã xuất kho ngay khi nhập liệu ban đầu, thay vì mặc định Trong kho.
          custody_status: (mortgageBank || mortgageUnit) ? 'checked_out' : 'in_stock',
          lifecycle_status: 'active',
          sale_status: 'not_ready',
          mortgage_status: (mortgageBank || mortgageUnit) ? 'mortgaged' : 'none',
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        };

        const created = await createAsset(newAssetData);

        if (recordHistory && created.current_owner_entity_id && matchedProj && created.current_owner_entity_id !== matchedProj.default_owner_entity_id) {
           const transferData = {
              asset_id: created.id,
              from_entity_id: matchedProj.default_owner_entity_id,
              from_role: 'cdt',
              to_entity_id: created.current_owner_entity_id,
              to_role: created.current_owner_role,
              transferred_by: null,
              transferred_at: transferDateStr,
              note: 'Dữ liệu lịch sử, nhập bổ sung khi triển khai hệ thống'
           };
           
           if (isSupabaseConfigured) {
               await supabase.from('asset_ownership_transfers').insert([transferData]);
           } else {
               mockStore.addAssetOwnershipTransfer({
                   ...transferData,
                   id: 'trf-' + Date.now(),
                   created_at: new Date().toISOString()
               } as any);
           }
        }

        await createAuditLog({
          record_id: created.id,
          action: 'CREATE',
          old_data: null,
          new_data: newAssetData,
          changed_by: user?.id || null,
          changed_by_name: user?.full_name || user?.email || 'Người dùng hệ thống',
          notes: 'Khởi tạo mới từ file Excel',
        });
        createdCount++;
      }
    } catch (err: any) {
      errors.push(`Dòng "${row['Số GCN QSDĐ'] || row.id || 'N/A'}": ${err.message}`);
    }
  }

  return { updatedCount, createdCount, errors };
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

export async function importAssets(assetsData: any[]) {
  const current = mockStore.getAssets();
  const [projects, warehouses] = await Promise.all([
    fetchProjects(),
    fetchWarehouses(),
  ]);

  let accumulatedAssets = [...current];
  const newAssets: Asset[] = assetsData.map((a, idx) => {
    const selectedWh = warehouses.find((w: any) => w.id === a.warehouse_id);
    const regionCode = resolveRegionCode(a.project_id, projects, selectedWh?.region_code);
    const colType = a.collateral_type || 'BDS';
    const code = a.asset_code || generateNextAssetCode(regionCode, a.provinceCodeHint || a.province, colType, accumulatedAssets);

    const assetItem: Asset = {
      id: 'asset-' + Date.now() + '-' + idx,
      asset_code: code,
      collateral_type: colType,
      certificate_no: a.certificate_no || `GCN-IMPORT-${idx + 1}`,
      project_id: a.project_id || null,
      legal_lot_code: a.legal_lot_code || null,
      business_project_name: a.business_project_name || null,
      business_plot_code: a.business_plot_code || null,
      area: Number(a.area) || 0,
      asset_type: a.asset_type || 'Đất nền',
      certificate_group: a.certificate_group || null,
      land_lot_no: a.land_lot_no || null,
      map_sheet_no: a.map_sheet_no || null,
      registry_no: a.registry_no || null,
      usage_purpose: a.usage_purpose || null,
      mortgage_bank: a.mortgage_bank || null,
      mortgage_unit: a.mortgage_unit || null,
      mortgage_status: a.mortgage_bank ? 'mortgaged' : 'none',
      custody_status: a.custody_status || 'in_stock',
      lifecycle_status: a.lifecycle_status || 'active',
      sale_status: a.sale_status || 'not_ready',
      warehouse_id: a.warehouse_id || null,
      current_holder_dept: a.current_holder_dept || null,
      current_owner_entity_id: a.current_owner_entity_id || null,
      current_owner_role: a.current_owner_role || null,
      notes: a.notes || null,
      created_at: new Date().toISOString(),
    };

    accumulatedAssets.push(assetItem);
    return assetItem;
  });

  if (!isSupabaseConfigured) {
    mockStore.saveAssets([...newAssets, ...current]);
    return newAssets;
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('assets')
        .insert(newAssets)
        .select(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) {
      console.error('Lỗi khi import danh sách GCN vào Supabase:', error);
      throw new Error(`Không thể nhập danh sách GCN vào cơ sở dữ liệu: ${error.message || 'Lỗi lưu trữ'}.`);
    }

    try {
      mockStore.saveAssets([...(data || []), ...current]);
    } catch {}

    return data || [];
  } catch (err: any) {
    console.error('Lỗi trong hàm importAssets:', err);
    throw new Error(err.message || 'Lỗi khi nhập danh sách GCN vào cơ sở dữ liệu.');
  }
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

export async function createProject(project: { name: string; area_id: string; default_owner_entity_id?: string | null }): Promise<Project> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProjects();
    const newProj: Project = {
      id: 'proj-' + Date.now(),
      name: project.name,
      area_id: project.area_id,
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

export async function updateProject(id: string, updates: { name?: string; area_id?: string; default_owner_entity_id?: string | null }) {
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

export async function createRegion(name: string): Promise<Region> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getRegions();
    const newR: Region = { id: 'reg-' + Date.now(), name };
    mockStore.saveRegions([...current, newR]);
    return newR;
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('regions').insert([{ name }]).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi tạo vùng miền trên Supabase:', error);
      throw new Error(`Không thể tạo vùng miền: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getRegions();
      mockStore.saveRegions([...current, data]);
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm createRegion:', err);
    throw new Error(err.message || 'Không thể tạo vùng miền, vui lòng thử lại.');
  }
}

export async function updateRegion(id: string, name: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.map(r => r.id === id ? { ...r, name } : r));
    return;
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from('regions').update({ name }).eq('id', id).select().single(),
      DEFAULT_WRITE_TIMEOUT
    );
    if (error) {
      console.error('Lỗi khi cập nhật vùng miền trên Supabase:', error);
      throw new Error(`Không thể cập nhật vùng miền: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
    }

    try {
      const current = mockStore.getRegions();
      mockStore.saveRegions(current.map(r => r.id === id ? { ...r, name } : r));
    } catch {}

    return data;
  } catch (err: any) {
    console.error('Lỗi trong hàm updateRegion:', err);
    throw new Error(err.message || 'Không thể cập nhật vùng miền, vui lòng thử lại.');
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
      region_code: warehouse.region_code || 'VMT',
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
    return importAssets(assetsData);
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('assets')
        .insert(assetsData)
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