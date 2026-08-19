const fs = require('fs');
let code = fs.readFileSync('src/api/assets.ts', 'utf8');

if (!code.includes('createMultipleAssets')) {
  code += `
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
`;
  fs.writeFileSync('src/api/assets.ts', code);
}
