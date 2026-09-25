import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';

export interface QuickAssetSearchResult {
  id: string;
  asset_code?: string | null;
  certificate_no: string;
  business_project_name?: string | null;
  business_plot_code?: string | null;
  legal_lot_code?: string | null;
  custody_status?: string | null;
  is_in_warehouse?: boolean | null;
  project_name?: string | null;
  warehouse_name?: string | null;
}

/**
 * Tra cứu nhanh GCN / Hồ sơ phục vụ Global Search Modal (Ctrl + K)
 * Tìm theo Mã GCN (asset_code), Số phát hành GCN (certificate_no), Số thửa/lô (legal_lot_code), Tên dự án
 * Giới hạn 5-10 kết quả để phản hồi siêu tốc.
 */
export async function quickSearchAssets(keyword: string, limit = 8): Promise<QuickAssetSearchResult[]> {
  const clean = keyword.trim();
  if (!clean) return [];

  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    const q = clean.toLowerCase();
    const filtered = assets.filter(a => {
      const certNo = (a.certificate_no || '').toLowerCase();
      const code = (a.asset_code || '').toLowerCase();
      const lot = (a.legal_lot_code || '').toLowerCase();
      const proj = (a.projects?.name || a.business_project_name || '').toLowerCase();
      const plot = (a.business_plot_code || '').toLowerCase();
      return certNo.includes(q) || code.includes(q) || lot.includes(q) || proj.includes(q) || plot.includes(q);
    });

    return filtered.slice(0, limit).map(a => ({
      id: a.id,
      asset_code: a.asset_code,
      certificate_no: a.certificate_no,
      business_project_name: a.business_project_name || a.projects?.name,
      business_plot_code: a.business_plot_code,
      legal_lot_code: a.legal_lot_code,
      custody_status: a.custody_status,
      is_in_warehouse: a.is_in_warehouse,
      project_name: a.projects?.name,
      warehouse_name: a.warehouses?.name,
    }));
  }

  // Truy vấn Supabase với OR điều kiện
  const s = clean;
  const { data, error } = await withTimeout(
    supabase
      .from('assets')
      .select(`
        id,
        asset_code,
        certificate_no,
        legal_lot_code,
        business_plot_code,
        business_project_name,
        custody_status,
        is_in_warehouse,
        projects(name),
        warehouses(name)
      `)
      .or(`certificate_no.ilike.%${s}%,asset_code.ilike.%${s}%,legal_lot_code.ilike.%${s}%,business_project_name.ilike.%${s}%,business_plot_code.ilike.%${s}%`)
      .order('created_at', { ascending: false })
      .limit(limit),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    throw new Error('Không thể tìm kiếm GCN: ' + error.message);
  }

  return (data || []).map((a: any) => ({
    id: a.id,
    asset_code: a.asset_code,
    certificate_no: a.certificate_no,
    legal_lot_code: a.legal_lot_code,
    business_plot_code: a.business_plot_code,
    business_project_name: a.business_project_name || a.projects?.name,
    custody_status: a.custody_status,
    is_in_warehouse: a.is_in_warehouse,
    project_name: a.projects?.name,
    warehouse_name: a.warehouses?.name,
  }));
}
