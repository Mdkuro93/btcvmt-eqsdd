import fs from 'fs';

let content = fs.readFileSync('src/api/assets.ts', 'utf8');

// fetchAssets return type
content = content.replace(
  /Promise<\{ data: Asset\[\], totalCount: number, totalPages: number \}>/,
  "Promise<{ data: Asset[], totalCount: number, totalPages: number, source?: string, error?: string }>"
);
content = content.replace(
  /return \{ data, totalCount, totalPages: Math\.ceil\(totalCount \/ pageSize\) \};/g,
  "return { data, totalCount, totalPages: Math.ceil(totalCount / pageSize), source: isSupabaseConfigured ? 'supabase' : 'mock' };"
);
content = content.replace(
  /data: data as any,/,
  "data: data as any,\n    source: 'supabase',"
);

// fetchDashboardAssetStats
content = content.replace(
  /export async function fetchDashboardAssetStats\(\)[\s\S]*?(?=$|^export)/m,
  `export async function fetchDashboardAssetStats(): Promise<{
  total: number;
  totalArea: number;
  activeProjectsCount: number;
  inStock: number;
  checkedOut: number;
  mortgaged: number;
  sold: number;
}> {
  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    return {
      total: assets.length,
      totalArea: assets.reduce((sum, a) => sum + (a.area || 0), 0),
      activeProjectsCount: new Set(assets.map(a => a.project_id)).size,
      inStock: assets.filter(a => a.custody_status === 'in_stock').length,
      checkedOut: assets.filter(a => a.custody_status === 'checked_out').length,
      mortgaged: assets.filter(a => a.mortgage_status === 'mortgaged').length,
      sold: assets.filter(a => a.sale_status === 'sold').length,
    };
  }
  
  const [totalRes, inStockRes, checkedOutRes, mortgagedRes, soldRes] = await Promise.all([
    supabase.from('assets').select('id, area', { count: 'exact' }),
    supabase.from('assets').select('id', { count: 'exact', head: true }).eq('custody_status', 'in_stock'),
    supabase.from('assets').select('id', { count: 'exact', head: true }).eq('custody_status', 'checked_out'),
    supabase.from('assets').select('id', { count: 'exact', head: true }).eq('mortgage_status', 'mortgaged'),
    supabase.from('assets').select('id', { count: 'exact', head: true }).eq('sale_status', 'sold')
  ]);
  
  const total = totalRes.count || 0;
  const totalArea = (totalRes.data || []).reduce((sum, a) => sum + (a.area || 0), 0);

  return {
    total,
    totalArea,
    activeProjectsCount: 0, // Simplified for now
    inStock: inStockRes.count || 0,
    checkedOut: checkedOutRes.count || 0,
    mortgaged: mortgagedRes.count || 0,
    sold: soldRes.count || 0
  };
}

`
);

fs.writeFileSync('src/api/assets.ts', content);
