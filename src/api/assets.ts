import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Asset, Region, Area, Warehouse, Project } from '../types';
import { generateNextAssetCode, resolveRegionCode } from '../lib/assetIdentifier';
import { createAuditLog } from './auditLogs';

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

export async function fetchAssets(filters?: any, page = 1, pageSize = 25): Promise<{ data: Asset[], totalCount: number }> {
  if (!isSupabaseConfigured) {
    const allFiltered = mockStore.getAssets(filters);
    const totalCount = allFiltered.length;
    const startIndex = (page - 1) * pageSize;
    const data = allFiltered.slice(startIndex, startIndex + pageSize);
    return { data, totalCount };
  }
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Optimized select - Only fetch needed relational attributes
    let query = supabase.from('assets').select(`
      id, asset_code, collateral_type, certificate_no, subdivision, lot_no, area,
      owner_name, map_sheet_no, land_lot_no, province, district, ward, address_detail,
      business_project_name, business_plot_code,
      land_use_purpose, land_use_term, custody_status, lifecycle_status, sale_status,
      mortgage_status, mortgage_bank, mortgage_unit, mortgage_bank_2, mortgage_unit_2,
      mortgage_valuation, collateral_ratio, collateral_value, mortgage_expected_release_date,
      expected_return_date, borrow_purpose, scan_file_url, project_id, warehouse_id,
      current_holder_dept, notes, asset_type, registry_no, registry_date, managing_unit,
      certificate_group, usage_term_type, usage_term_date, parent_asset_id, created_at,
      updated_at, updated_by,
      updater:profiles!updated_by(id, full_name, email),
      projects:projects(name, areas(name, region_id, regions(name))),
      warehouses:warehouses(name, code, region_code, is_central, regions(name))
    `, { count: 'exact' });

    if (filters) {
      if (filters.search) {
        const s = filters.search.trim();
        query = query.or(`certificate_no.ilike.%${s}%,asset_code.ilike.%${s}%,subdivision.ilike.%${s}%,lot_no.ilike.%${s}%,owner_name.ilike.%${s}%,business_project_name.ilike.%${s}%,business_plot_code.ilike.%${s}%`);
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
      
      if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId);
      if (filters.subdivision) query = query.ilike('subdivision', `%${filters.subdivision.trim()}%`);
    }

    // Apply Server-side Sort & Range Pagination
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;
    
    return { 
      data: (data || []) as unknown as Asset[], 
      totalCount: count ?? (data?.length || 0) 
    };
  } catch (err) {
    console.warn('Supabase fetchAssets error, using mockStore fallback:', err);
    const allFiltered = mockStore.getAssets(filters);
    const totalCount = allFiltered.length;
    const startIndex = (page - 1) * pageSize;
    const data = allFiltered.slice(startIndex, startIndex + pageSize);
    return { data, totalCount };
  }
}

/**
 * Ultra-lightweight query for checking duplicate records and generating sequential asset codes
 * Avoids downloading heavy relations, files, and addresses (<5KB vs 5MB).
 */
export async function fetchAssetIdentifierCandidates(projectId?: string): Promise<Asset[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getAssets();
  }
  try {
    let query = supabase.from('assets').select(`
      id, asset_code, collateral_type, certificate_no, project_id,
      subdivision, lot_no, map_sheet_no, land_lot_no, lifecycle_status,
      business_project_name, business_plot_code,
      warehouse_id, created_at, projects(name)
    `).order('created_at', { ascending: false }).limit(2000);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as Asset[];
  } catch (err) {
    console.warn('Supabase fetchAssetIdentifierCandidates error, using mockStore:', err);
    return mockStore.getAssets();
  }
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
}> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    return {
      total: assets.length,
      inStock: assets.filter(a => a.custody_status === 'in_stock').length,
      checkedOut: assets.filter(a => a.custody_status === 'checked_out').length,
      mortgaged: assets.filter(a => a.mortgage_status === 'mortgaged').length,
      sold: assets.filter(a => a.sale_status === 'sold').length,
    };
  }
  try {
    // Perform fast count queries in parallel
    const [totalRes, inStockRes, checkedOutRes, mortgagedRes, soldRes] = await Promise.all([
      supabase.from('assets').select('*', { count: 'exact', head: true }),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('custody_status', 'in_stock'),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('custody_status', 'checked_out'),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('mortgage_status', 'mortgaged'),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('sale_status', 'sold'),
    ]);

    return {
      total: totalRes.count || 0,
      inStock: inStockRes.count || 0,
      checkedOut: checkedOutRes.count || 0,
      mortgaged: mortgagedRes.count || 0,
      sold: soldRes.count || 0,
    };
  } catch (err) {
    console.warn('Supabase fetchDashboardAssetStats error, fallback:', err);
    const assets = mockStore.getAssets();
    return {
      total: assets.length,
      inStock: assets.filter(a => a.custody_status === 'in_stock').length,
      checkedOut: assets.filter(a => a.custody_status === 'checked_out').length,
      mortgaged: assets.filter(a => a.mortgage_status === 'mortgaged').length,
      sold: assets.filter(a => a.sale_status === 'sold').length,
    };
  }
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
        const subdiv = (a.subdivision || '').toLowerCase();
        return queryList.some(q => certNo.includes(q) || subdiv.includes(q));
      });
    }

    const totalCount = filtered.length;
    const startIndex = (page - 1) * pageSize;
    const data = filtered.slice(startIndex, startIndex + pageSize).map(a => ({
      certificate_no: a.certificate_no,
      project_name: a.projects?.name,
      subdivision: a.subdivision,
      custody_status: a.custody_status,
      lifecycle_status: a.lifecycle_status,
      sale_status: a.sale_status,
      mortgage_status: a.mortgage_status,
    }));
    return { data, totalCount };
  }
  
  try {
    const q = queries.filter(q => q.trim().length > 0)[0] || '';
    const { data, error } = await supabase.rpc('lookup_asset_status', { p_query: q });
    if (error) throw error;
    const resData = data || [];
    return { data: resData, totalCount: resData.length };
  } catch (err) {
    console.warn('Supabase lookup_asset_status error, using mockStore:', err);
    const allAssets = mockStore.getAssets();
    const queryList = queries.filter(q => q.trim().length > 0).map(q => q.trim().toLowerCase());
    
    let filtered = allAssets;
    if (projectId) {
      filtered = filtered.filter(a => a.project_id === projectId);
    }
    
    if (queryList.length > 0) {
      filtered = filtered.filter(a => {
        const certNo = (a.certificate_no || '').toLowerCase();
        const subdiv = (a.subdivision || '').toLowerCase();
        return queryList.some(q => certNo.includes(q) || subdiv.includes(q));
      });
    }

    const totalCount = filtered.length;
    const startIndex = (page - 1) * pageSize;
    const data = filtered.slice(startIndex, startIndex + pageSize).map(a => ({
      certificate_no: a.certificate_no,
      project_name: a.projects?.name,
      subdivision: a.subdivision,
      custody_status: a.custody_status,
      lifecycle_status: a.lifecycle_status,
      sale_status: a.sale_status,
      mortgage_status: a.mortgage_status,
    }));
    return { data, totalCount };
  }
}

export async function fetchAssetById(id: string): Promise<Asset | null> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    return assets.find(a => a.id === id) || null;
  }
  try {
    const { data, error } = await supabase
      .from('assets')
      .select(`
        *,
        projects(name, areas(name, region_id)),
        warehouses(name, is_central)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase fetchAssetById error, using mockStore:', err);
    const assets = mockStore.getAssets();
    return assets.find(a => a.id === id) || null;
  }
}

export async function createAsset(assetData: Partial<Asset>): Promise<Asset> {
  const current = mockStore.getAssets();
  const projects = mockStore.getProjects();
  const warehouses = mockStore.getWarehouses();
  
  const selectedWh = warehouses.find(w => w.id === assetData.warehouse_id);
  const regionCode = resolveRegionCode(assetData.project_id, projects, selectedWh?.region_code);
  const collateralType = assetData.collateral_type || 'BDS';
  const autoCode = assetData.asset_code || generateNextAssetCode(regionCode, collateralType, current);

  const fullAsset: Asset = {
    id: 'asset-' + Date.now(),
    asset_code: autoCode,
    collateral_type: collateralType,
    certificate_no: assetData.certificate_no || 'GCN-VMT-' + Math.floor(Math.random() * 1000),
    project_id: assetData.project_id || null,
    certificate_group: assetData.certificate_group || null,
    subdivision: assetData.subdivision || null,
    lot_no: assetData.lot_no || null,
    business_project_name: assetData.business_project_name?.trim() || null,
    business_plot_code: assetData.business_plot_code?.trim() || null,
    area: assetData.area || 0,
    owner_name: assetData.owner_name || 'Công ty Cổ phần Đầu tư VMT',
    
    map_sheet_no: assetData.map_sheet_no || null,
    land_lot_no: assetData.land_lot_no || null,
    province: assetData.province || null,
    district: assetData.district || null,
    ward: assetData.ward || null,
    address_detail: assetData.address_detail || null,
    
    usage_purpose: assetData.usage_purpose || null,
    usage_term_type: assetData.usage_term_type || null,
    usage_term_date: assetData.usage_term_date || null,
    
    asset_type: assetData.asset_type || null,
    registry_no: assetData.registry_no || null,
    registry_date: assetData.registry_date || null,
    managing_unit: assetData.managing_unit || null,
    
    mortgage_bank: assetData.mortgage_bank || null,
    mortgage_unit: assetData.mortgage_unit || null,
    mortgage_bank_2: assetData.mortgage_bank_2 || null,
    mortgage_unit_2: assetData.mortgage_unit_2 || null,
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
  try {
    const { data, error } = await supabase
      .from('assets')
      .insert([fullAsset])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase createAsset error, saving to mockStore:', err);
    mockStore.saveAssets([fullAsset, ...current]);
    return mockStore.getAssets().find(a => a.id === fullAsset.id)!;
  }
}

export async function updateAsset(
  id: string, 
  updates: Partial<Asset>, 
  user?: { id?: string; email?: string; full_name?: string } | null,
  notes?: string
): Promise<Asset> {
  const currentAsset = (isSupabaseConfigured 
    ? (await supabase.from('assets').select('*').eq('id', id).single()).data 
    : mockStore.getAssets().find(a => a.id === id)) || {};

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
    try {
      const { data, error } = await supabase
        .from('assets')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      updatedAsset = data;
    } catch (err) {
      console.warn('Supabase updateAsset error, updating in mockStore:', err);
      const current = mockStore.getAssets();
      const updatedList = current.map(a => (a.id === id ? { ...a, ...payload } : a));
      mockStore.saveAssets(updatedList);
      updatedAsset = mockStore.getAssets().find(a => a.id === id)!;
    }
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

  const allAssets = isSupabaseConfigured
    ? (await supabase.from('assets').select('*').in('id', ids)).data || []
    : mockStore.getAssets().filter(a => ids.includes(a.id));

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
    try {
      const { error } = await supabase
        .from('assets')
        .update(payload)
        .in('id', ids);
      if (error) throw error;
    } catch (err) {
      console.warn('Supabase bulkUpdateAssets error, updating in mockStore:', err);
      const current = mockStore.getAssets();
      const updatedList = current.map(a => {
        if (ids.includes(a.id)) {
          return { ...a, ...payload };
        }
        return a;
      });
      mockStore.saveAssets(updatedList);
    }
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
  mode: 'update_or_create' | 'update_only' | 'create_only' = 'update_or_create'
): Promise<{ updatedCount: number; createdCount: number; errors: string[] }> {
  const currentAssets = isSupabaseConfigured 
    ? (await supabase.from('assets').select('*')).data || []
    : mockStore.getAssets();

  const projects = await fetchProjects();
  const warehouses = await fetchWarehouses();

  let updatedCount = 0;
  let createdCount = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const matchId = (row.id || row['ID Hệ Thống'] || '').toString().trim();
      const matchAssetCode = (row.asset_code || row['Mã Tài Sản / TSĐB'] || row['Mã Tài Sản'] || '').toString().trim();
      const matchCertNo = (row.certificate_no || row['Số GCN QSDĐ'] || row['Số GCN'] || row['Số sổ'] || '').toString().trim();

      const existing = currentAssets.find(a => 
        (matchId && a.id === matchId) ||
        (matchAssetCode && a.asset_code === matchAssetCode) ||
        (matchCertNo && a.certificate_no?.trim().toLowerCase() === matchCertNo.toLowerCase())
      );

      // Match project
      const projName = row.project_name || row['Dự Án (Pháp lý)'] || row['Dự Án'] || row['Tên Dự Án'];
      const matchedProj = projName ? projects.find(p => p.name.toLowerCase() === projName.toString().trim().toLowerCase()) : null;

      // Match warehouse
      const whName = row.warehouse_name || row['Kho Lưu Giữ'] || row['Kho'];
      const matchedWh = whName ? warehouses.find(w => w.name.toLowerCase() === whName.toString().trim().toLowerCase()) : null;

      const businessProjName = row.business_project_name || row['Tên Dự Án Kinh Doanh'] || row['Tên dự án kinh doanh'];
      const businessPlot = row.business_plot_code || row['Mã Lô Kinh Doanh'] || row['Mã lô kinh doanh'];
      const subdivision = row.subdivision || row['Phân Khu'] || row['Phân khu'];
      const lotNo = row.lot_no || row['Số Lô / Thửa (Mã Lô Pháp Lý)'] || row['Số Lô'] || row['Mã lô'];
      const landLotNo = row.land_lot_no || row['Số Thửa Bản Đồ'] || row['Số Thửa'] || row['Số thửa'];
      const mapSheetNo = row.map_sheet_no || row['Số Tờ Bản Đồ'] || row['Số Tờ'] || row['Số tờ'];
      const rawArea = row.area !== undefined ? row.area : (row['Diện Tích (m²)'] !== undefined ? row['Diện Tích (m²)'] : row['Diện tích (m2)']);
      const area = rawArea !== undefined && rawArea !== '' ? Number(rawArea) : undefined;
      const ownerName = row.owner_name || row['Chủ Sở Hữu'] || row['Chủ sở hữu'];
      const assetType = row.asset_type || row['Loại Tài Sản'] || row['Loại tài sản'];
      const usagePurpose = row.usage_purpose || row['Mục Đích Sử Dụng'] || row['Mục đích sử dụng'];

      if (existing && mode !== 'create_only') {
        const updates: Partial<Asset> = {
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        };
        if (businessProjName !== undefined && businessProjName !== '') updates.business_project_name = String(businessProjName).trim();
        if (businessPlot !== undefined && businessPlot !== '') updates.business_plot_code = String(businessPlot).trim();
        if (subdivision !== undefined && subdivision !== '') updates.subdivision = String(subdivision).trim();
        if (lotNo !== undefined && lotNo !== '') updates.lot_no = String(lotNo).trim();
        if (landLotNo !== undefined && landLotNo !== '') updates.land_lot_no = String(landLotNo).trim();
        if (mapSheetNo !== undefined && mapSheetNo !== '') updates.map_sheet_no = String(mapSheetNo).trim();
        if (area !== undefined && !isNaN(area)) updates.area = area;
        if (ownerName !== undefined && ownerName !== '') updates.owner_name = String(ownerName).trim();
        if (assetType !== undefined && assetType !== '') updates.asset_type = String(assetType).trim();
        if (usagePurpose !== undefined && usagePurpose !== '') updates.usage_purpose = String(usagePurpose).trim();
        if (matchedProj) updates.project_id = matchedProj.id;
        if (matchedWh) updates.warehouse_id = matchedWh.id;

        const { oldDiff, newDiff } = getDifferences(existing, updates);

        if (Object.keys(newDiff).length > 0) {
          if (!isSupabaseConfigured) {
            const current = mockStore.getAssets();
            mockStore.saveAssets(current.map(a => a.id === existing.id ? { ...a, ...updates } : a));
          } else {
            await supabase.from('assets').update(updates).eq('id', existing.id);
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
          subdivision: subdivision ? String(subdivision).trim() : null,
          lot_no: lotNo ? String(lotNo).trim() : null,
          land_lot_no: landLotNo ? String(landLotNo).trim() : null,
          map_sheet_no: mapSheetNo ? String(mapSheetNo).trim() : null,
          area: area && !isNaN(area) ? area : null,
          owner_name: ownerName ? String(ownerName).trim() : 'Công ty Cổ phần Đầu tư VMT',
          asset_type: assetType ? String(assetType).trim() : 'Đất nền',
          usage_purpose: usagePurpose ? String(usagePurpose).trim() : null,
          custody_status: 'in_stock',
          lifecycle_status: 'active',
          sale_status: 'not_ready',
          mortgage_status: 'none',
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        };

        const created = await createAsset(newAssetData);
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
  
  try {
    const chunkSize = 500;
    const duplicates: string[] = [];
    
    for (let i = 0; i < certificateNos.length; i += chunkSize) {
      const chunk = certificateNos.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('assets')
        .select('certificate_no')
        .in('certificate_no', chunk);
        
      if (error) throw error;
      if (data) {
        duplicates.push(...data.map(d => d.certificate_no));
      }
    }
    
    return duplicates;
  } catch (err) {
    console.warn('Supabase checkDuplicateAssets error, using mockStore:', err);
    const current = mockStore.getAssets();
    const existingSet = new Set(current.map(a => a.certificate_no));
    return certificateNos.filter(no => existingSet.has(no));
  }
}

export async function importAssets(assetsData: any[]) {
  const current = mockStore.getAssets();
  const projects = mockStore.getProjects();
  const warehouses = mockStore.getWarehouses();

  let accumulatedAssets = [...current];
  const newAssets: Asset[] = assetsData.map((a, idx) => {
    const selectedWh = warehouses.find(w => w.id === a.warehouse_id);
    const regionCode = resolveRegionCode(a.project_id, projects, selectedWh?.region_code);
    const colType = a.collateral_type || 'BDS';
    const code = a.asset_code || generateNextAssetCode(regionCode, colType, accumulatedAssets);

    const assetItem: Asset = {
      id: 'asset-' + Date.now() + '-' + idx,
      asset_code: code,
      collateral_type: colType,
      certificate_no: a.certificate_no || `GCN-IMPORT-${idx + 1}`,
      project_id: a.project_id || null,
      subdivision: a.subdivision || null,
      lot_no: a.lot_no || null,
      business_project_name: a.business_project_name || null,
      business_plot_code: a.business_plot_code || null,
      area: Number(a.area) || 0,
      owner_name: a.owner_name || 'Công ty Cổ phần Đầu tư VMT',
      asset_type: a.asset_type || 'Đất nền',
      land_lot_no: a.land_lot_no || null,
      map_sheet_no: a.map_sheet_no || null,
      province: a.province || null,
      district: a.district || null,
      ward: a.ward || null,
      address_detail: a.address_detail || null,
      usage_purpose: a.usage_purpose || null,
      custody_status: a.custody_status || 'in_stock',
      lifecycle_status: a.lifecycle_status || 'active',
      sale_status: a.sale_status || 'not_ready',
      mortgage_status: a.mortgage_status || 'none',
      warehouse_id: a.warehouse_id || null,
      current_holder_dept: a.current_holder_dept || null,
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
    const { data, error } = await supabase
      .from('assets')
      .insert(newAssets)
      .select();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase importAssets error, saving to mockStore:', err);
    mockStore.saveAssets([...newAssets, ...current]);
    return newAssets;
  }
}

export async function fetchProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getProjects();
  }
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*, areas(name, region_id)')
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchProjects error, using mockStore:', err);
    return mockStore.getProjects();
  }
}

export async function createProject(project: { name: string; area_id: string }): Promise<Project> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProjects();
    const newProj: Project = {
      id: 'proj-' + Date.now(),
      name: project.name,
      area_id: project.area_id,
    };
    mockStore.saveProjects([...current, newProj]);
    return mockStore.getProjects().find(p => p.id === newProj.id)!;
  }
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert([project])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase createProject error, saving to mockStore:', err);
    const current = mockStore.getProjects();
    const newProj: Project = {
      id: 'proj-' + Date.now(),
      name: project.name,
      area_id: project.area_id,
    };
    mockStore.saveProjects([...current, newProj]);
    return mockStore.getProjects().find(p => p.id === newProj.id)!;
  }
}

export async function updateProject(id: string, updates: { name?: string; area_id?: string }) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProjects();
    mockStore.saveProjects(current.map(p => p.id === id ? { ...p, ...updates } : p));
    return mockStore.getProjects().find(p => p.id === id);
  }
  try {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    const current = mockStore.getProjects();
    mockStore.saveProjects(current.map(p => p.id === id ? { ...p, ...updates } : p));
    return mockStore.getProjects().find(p => p.id === id);
  }
}

export async function deleteProject(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getProjects();
    mockStore.saveProjects(current.filter(p => p.id !== id));
    return;
  }
  try {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getProjects();
    mockStore.saveProjects(current.filter(p => p.id !== id));
  }
}

export async function fetchRegions(): Promise<Region[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getRegions();
  }
  try {
    const { data, error } = await supabase.from('regions').select('*').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchRegions error, using mockStore:', err);
    return mockStore.getRegions();
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
    const { data, error } = await supabase.from('regions').insert([{ name }]).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    const current = mockStore.getRegions();
    const newR: Region = { id: 'reg-' + Date.now(), name };
    mockStore.saveRegions([...current, newR]);
    return newR;
  }
}

export async function updateRegion(id: string, name: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.map(r => r.id === id ? { ...r, name } : r));
    return;
  }
  try {
    const { data, error } = await supabase.from('regions').update({ name }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.map(r => r.id === id ? { ...r, name } : r));
  }
}

export async function deleteRegion(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.filter(r => r.id !== id));
    return;
  }
  try {
    const { error } = await supabase.from('regions').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.filter(r => r.id !== id));
  }
}

export async function fetchAreas(): Promise<Area[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getAreas();
  }
  try {
    const { data, error } = await supabase.from('areas').select('*, regions(name)').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchAreas error, using mockStore:', err);
    return mockStore.getAreas();
  }
}

export async function createArea(name: string, region_id: string): Promise<Area> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAreas();
    const newA: Area = { id: 'area-' + Date.now(), name, region_id };
    mockStore.saveAreas([...current, newA]);
    return mockStore.getAreas().find(a => a.id === newA.id)!;
  }
  try {
    const { data, error } = await supabase.from('areas').insert([{ name, region_id }]).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    const current = mockStore.getAreas();
    const newA: Area = { id: 'area-' + Date.now(), name, region_id };
    mockStore.saveAreas([...current, newA]);
    return mockStore.getAreas().find(a => a.id === newA.id)!;
  }
}

export async function updateArea(id: string, name: string, region_id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAreas();
    mockStore.saveAreas(current.map(a => a.id === id ? { ...a, name, region_id } : a));
    return;
  }
  try {
    const { data, error } = await supabase.from('areas').update({ name, region_id }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    const current = mockStore.getAreas();
    mockStore.saveAreas(current.map(a => a.id === id ? { ...a, name, region_id } : a));
  }
}

export async function deleteArea(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAreas();
    mockStore.saveAreas(current.filter(a => a.id !== id));
    return;
  }
  try {
    const { error } = await supabase.from('areas').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getAreas();
    mockStore.saveAreas(current.filter(a => a.id !== id));
  }
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getWarehouses();
  }
  try {
    const { data, error } = await supabase.from('warehouses').select('*, regions(name)').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchWarehouses error, using mockStore:', err);
    return mockStore.getWarehouses();
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
    const { data, error } = await supabase.from('warehouses').insert([warehouse]).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
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
}

export async function updateWarehouse(id: string, updates: { name?: string; code?: string | null; region_code?: string | null; region_id?: string | null; is_central?: boolean }) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getWarehouses();
    mockStore.saveWarehouses(current.map(w => w.id === id ? { ...w, ...updates } : w));
    return;
  }
  try {
    const { data, error } = await supabase.from('warehouses').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    const current = mockStore.getWarehouses();
    mockStore.saveWarehouses(current.map(w => w.id === id ? { ...w, ...updates } : w));
  }
}

export async function deleteWarehouse(id: string) {
  if (!isSupabaseConfigured) {
    const current = mockStore.getWarehouses();
    mockStore.saveWarehouses(current.filter(w => w.id !== id));
    return;
  }
  try {
    const { error } = await supabase.from('warehouses').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getWarehouses();
    mockStore.saveWarehouses(current.filter(w => w.id !== id));
  }
}

export const deleteAsset = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Lỗi khi xoá GCN:', error);
    throw error;
  }
};

export const deleteMultipleAssets = async (ids: string[]): Promise<void> => {
  const { error } = await supabase
    .from('assets')
    .delete()
    .in('id', ids);
  if (error) {
    console.error('Lỗi khi xoá nhiều GCN:', error);
    throw error;
  }
};

export async function createMultipleAssets(assetsData: Partial<Asset>[]): Promise<Asset[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured for bulk insert');
  }
  const { data, error } = await supabase
    .from('assets')
    .insert(assetsData)
    .select();
  if (error) {
    console.error('Lỗi khi thêm nhiều GCN:', error);
    throw error;
  }
  return data || [];
}
