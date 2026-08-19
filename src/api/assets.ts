import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Asset, Region, Area, Warehouse, Project } from '../types';
import { generateNextAssetCode, resolveRegionCode } from '../lib/assetIdentifier';

export async function fetchAssets(filters?: any, page = 1, pageSize = 25): Promise<{ data: Asset[], totalCount: number }> {
  if (!isSupabaseConfigured) {
    const allFiltered = mockStore.getAssets(filters);
    const totalCount = allFiltered.length;
    const startIndex = (page - 1) * pageSize;
    const data = allFiltered.slice(startIndex, startIndex + pageSize);
    return { data, totalCount };
  }
  try {
    let query = supabase.from('assets').select(`
      *,
      projects(name, areas(name, region_id, regions(name))),
      warehouses(name, is_central, regions(name))
    `);

    if (filters) {
      if (filters.search) {
        query = query.or(`certificate_no.ilike.%${filters.search}%,subdivision.ilike.%${filters.search}%,owner_name.ilike.%${filters.search}%`);
      }
      if (filters.projectId) query = query.eq('project_id', filters.projectId);
      if (filters.custodyStatus) query = query.eq('custody_status', filters.custodyStatus);
      if (filters.lifecycleStatus) query = query.eq('lifecycle_status', filters.lifecycleStatus);
      if (filters.saleStatus) query = query.eq('sale_status', filters.saleStatus);
      if (filters.mortgageStatus) query = query.eq('mortgage_status', filters.mortgageStatus);
      if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId);
      if (filters.subdivision) query = query.ilike('subdivision', `%${filters.subdivision}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    const resultData = data || [];
    return { data: resultData, totalCount: resultData.length };
  } catch (err) {
    console.warn('Supabase fetchAssets error, using mockStore:', err);
    const allFiltered = mockStore.getAssets(filters);
    const totalCount = allFiltered.length;
    const startIndex = (page - 1) * pageSize;
    const data = allFiltered.slice(startIndex, startIndex + pageSize);
    return { data, totalCount };
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

export async function updateAsset(id: string, updates: Partial<Asset>): Promise<Asset> {
  if (!isSupabaseConfigured) {
    const current = mockStore.getAssets();
    const updatedList = current.map(a => (a.id === id ? { ...a, ...updates } : a));
    mockStore.saveAssets(updatedList);
    return mockStore.getAssets().find(a => a.id === id)!;
  }
  try {
    const { data, error } = await supabase
      .from('assets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase updateAsset error, updating in mockStore:', err);
    const current = mockStore.getAssets();
    const updatedList = current.map(a => (a.id === id ? { ...a, ...updates } : a));
    mockStore.saveAssets(updatedList);
    return mockStore.getAssets().find(a => a.id === id)!;
  }
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
  if (!isSupabaseConfigured) {
    const current = mockStore.getAssets();
    const newAssets: Asset[] = assetsData.map((a, idx) => ({
      id: 'asset-' + Date.now() + '-' + idx,
      certificate_no: a.certificate_no || `GCN-IMPORT-${idx + 1}`,
      project_id: a.project_id || null,
      subdivision: a.subdivision || null,
      area: Number(a.area) || 0,
      owner_name: a.owner_name || 'Công ty Cổ phần Đầu tư VMT',
      custody_status: a.custody_status || 'in_stock',
      lifecycle_status: a.lifecycle_status || 'active',
      sale_status: a.sale_status || 'not_ready',
      mortgage_status: a.mortgage_status || 'none',
      warehouse_id: a.warehouse_id || null,
      current_holder_dept: a.current_holder_dept || null,
      created_at: new Date().toISOString(),
    }));
    mockStore.saveAssets([...newAssets, ...current]);
    return newAssets;
  }
  try {
    const { data, error } = await supabase
      .from('assets')
      .insert(assetsData)
      .select();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase importAssets error, saving to mockStore:', err);
    const current = mockStore.getAssets();
    const newAssets: Asset[] = assetsData.map((a, idx) => ({
      id: 'asset-' + Date.now() + '-' + idx,
      certificate_no: a.certificate_no || `GCN-IMPORT-${idx + 1}`,
      project_id: a.project_id || null,
      subdivision: a.subdivision || null,
      area: Number(a.area) || 0,
      owner_name: a.owner_name || 'Công ty Cổ phần Đầu tư VMT',
      custody_status: a.custody_status || 'in_stock',
      lifecycle_status: a.lifecycle_status || 'active',
      sale_status: a.sale_status || 'not_ready',
      mortgage_status: a.mortgage_status || 'none',
      warehouse_id: a.warehouse_id || null,
      current_holder_dept: a.current_holder_dept || null,
      created_at: new Date().toISOString(),
    }));
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
