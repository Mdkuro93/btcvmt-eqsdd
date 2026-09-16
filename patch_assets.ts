import fs from 'fs';

let content = fs.readFileSync('src/api/assets.ts', 'utf8');

// Replace createRegion, updateRegion
content = content.replace(
  /export async function createRegion\(region: Partial<Region>\): Promise<Region> \{/,
  "export async function createRegion(name: string): Promise<Region> {\n  const region = { name };"
);
content = content.replace(
  /export async function updateRegion\(id: string, updates: Partial<Region>\): Promise<Region> \{/,
  "export async function updateRegion(id: string, name: string): Promise<Region> {\n  const updates = { name };"
);

// Replace createArea, updateArea
content = content.replace(
  /export async function createArea\(area: Partial<Area>\): Promise<Area> \{/,
  "export async function createArea(name: string, region_id: string): Promise<Area> {\n  const area = { name, region_id };"
);
content = content.replace(
  /export async function updateArea\(id: string, updates: Partial<Area>\): Promise<Area> \{/,
  "export async function updateArea(id: string, name: string, region_id: string): Promise<Area> {\n  const updates = { name, region_id };"
);

// bulkUpdateAssets
content = content.replace(
  /export async function bulkUpdateAssets\(ids: string\[\], updates: Partial<Asset>\): Promise<void> \{/,
  "export async function bulkUpdateAssets(ids: string[], updates: Partial<Asset>, currentUser: any, notes: string): Promise<{ count: number }> {\n  if (!ids.length) return { count: 0 };"
);
content = content.replace(
  /mockStore\.saveAssets\(assets\);\n    return;/,
  "mockStore.saveAssets(assets);\n    return { count: ids.length };"
);
content = content.replace(
  /if \(error\) throw new Error\('Lỗi bulkUpdateAssets: ' \+ error\.message\);\n\}/,
  "if (error) throw new Error('Lỗi bulkUpdateAssets: ' + error.message);\n  return { count: ids.length };\n}"
);

// importExcelAndUpdateAssets
content = content.replace(
  /export async function importExcelAndUpdateAssets\(assets: Partial<Asset>\[\]\): Promise<void> \{[\s\S]*?(?=export async function fetchAssetIdentifierCandidates)/,
  `export async function importExcelAndUpdateAssets(assets: Partial<Asset>[], currentUser: any, importMode: string, recordHistory: boolean): Promise<{ updatedCount: number, createdCount: number, errors: string[] }> {
  if (!isSupabaseConfigured) {
    let storeAssets = mockStore.getAssets();
    let updatedCount = 0;
    let createdCount = 0;
    const newAssets: Asset[] = [];
    assets.forEach(a => {
      if (a.id) {
        storeAssets = storeAssets.map(sa => sa.id === a.id ? { ...sa, ...a, updated_at: new Date().toISOString() } as Asset : sa);
        updatedCount++;
      } else {
        newAssets.push({ ...a, id: 'asset-imp-' + Date.now() + Math.random(), created_at: new Date().toISOString() } as Asset);
        createdCount++;
      }
    });
    mockStore.saveAssets([...storeAssets, ...newAssets]);
    return { updatedCount, createdCount, errors: [] };
  }
  const { data, error } = await withTimeout(supabase.from('assets').upsert(assets).select(), DEFAULT_WRITE_TIMEOUT);
  if (error) throw new Error('Lỗi importExcelAndUpdateAssets: ' + error.message);
  return { updatedCount: assets.filter(a => a.id).length, createdCount: assets.filter(a => !a.id).length, errors: [] };
}

`
);

// requestExtension has 4 arguments: assetId, days, reason, profile. It was exported as:
// export async function requestExtension(assetId: string, days: number, reason: string, profile: any)
// Oh, wait, the error for requestExtension was TS2554: Expected 1 arguments, but got 4.
// Wait, requestExtension IS exported with 4 arguments in src/api/assets.ts! Let me double check what TS says about it.

fs.writeFileSync('src/api/assets.ts', content);
