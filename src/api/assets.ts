import { supabase } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Asset, Region, Area, Warehouse, Project } from '../types';

export async function fetchAssets(filters?: any): Promise<Asset[]> {
  try {
    let query = supabase.from('assets').select(`
      *,
      projects(name, areas(name, region_id)),
      warehouses(name, is_central)
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
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchAssets error, using mockStore:', err);
    return mockStore.getAssets(filters);
  }
}

export async function fetchAssetById(id: string): Promise<Asset | null> {
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
  try {
    const { data, error } = await supabase
      .from('assets')
      .insert([assetData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase createAsset error, saving to mockStore:', err);
    const current = mockStore.getAssets();
    const newAsset: Asset = {
      id: 'asset-' + Date.now(),
      certificate_no: assetData.certificate_no || 'GCN-VMT-' + Math.floor(Math.random() * 1000),
      project_id: assetData.project_id || null,
      subdivision: assetData.subdivision || null,
      area: assetData.area || 0,
      owner_name: assetData.owner_name || 'Công ty Cổ phần Đầu tư VMT',
      custody_status: assetData.custody_status || 'in_stock',
      lifecycle_status: assetData.lifecycle_status || 'active',
      sale_status: assetData.sale_status || 'not_ready',
      mortgage_status: assetData.mortgage_status || 'none',
      warehouse_id: assetData.warehouse_id || null,
      current_holder_dept: assetData.current_holder_dept || null,
      created_at: new Date().toISOString(),
    };
    mockStore.saveAssets([newAsset, ...current]);
    return mockStore.getAssets().find(a => a.id === newAsset.id)!;
  }
}

export async function updateAsset(id: string, updates: Partial<Asset>): Promise<Asset> {
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

export async function importAssets(assetsData: any[]) {
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
  try {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getProjects();
    mockStore.saveProjects(current.filter(p => p.id !== id));
  }
}

export async function fetchRegions(): Promise<Region[]> {
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
  try {
    const { error } = await supabase.from('regions').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getRegions();
    mockStore.saveRegions(current.filter(r => r.id !== id));
  }
}

export async function fetchAreas(): Promise<Area[]> {
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
  try {
    const { error } = await supabase.from('areas').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getAreas();
    mockStore.saveAreas(current.filter(a => a.id !== id));
  }
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  try {
    const { data, error } = await supabase.from('warehouses').select('*, regions(name)').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetchWarehouses error, using mockStore:', err);
    return mockStore.getWarehouses();
  }
}

export async function createWarehouse(warehouse: { name: string; region_id?: string | null; is_central?: boolean }): Promise<Warehouse> {
  try {
    const { data, error } = await supabase.from('warehouses').insert([warehouse]).select().single();
    if (error) throw error;
    return data;
  } catch (err) {
    const current = mockStore.getWarehouses();
    const newW: Warehouse = {
      id: 'wh-' + Date.now(),
      name: warehouse.name,
      region_id: warehouse.region_id || null,
      is_central: warehouse.is_central || false,
    };
    mockStore.saveWarehouses([...current, newW]);
    return mockStore.getWarehouses().find(w => w.id === newW.id)!;
  }
}

export async function updateWarehouse(id: string, updates: { name?: string; region_id?: string | null; is_central?: boolean }) {
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
  try {
    const { error } = await supabase.from('warehouses').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    const current = mockStore.getWarehouses();
    mockStore.saveWarehouses(current.filter(w => w.id !== id));
  }
}
