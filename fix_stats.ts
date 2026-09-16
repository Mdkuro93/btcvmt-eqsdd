import fs from 'fs';
let content = fs.readFileSync('src/api/assets.ts', 'utf8');

// Find the first export async function fetchDashboardAssetStats() and cut everything after it until the end of the file
const idx = content.indexOf('export async function fetchDashboardAssetStats()');
if (idx !== -1) {
  content = content.substring(0, idx);
}

content += `
export async function fetchDashboardAssetStats(): Promise<{
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
    activeProjectsCount: 0,
    inStock: inStockRes.count || 0,
    checkedOut: checkedOutRes.count || 0,
    mortgaged: mortgagedRes.count || 0,
    sold: soldRes.count || 0
  };
}
`;

fs.writeFileSync('src/api/assets.ts', content);
