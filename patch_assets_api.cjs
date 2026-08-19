const fs = require('fs');
let code = fs.readFileSync('src/api/assets.ts', 'utf8');

if (!code.includes('deleteMultipleAssets')) {
  code += `
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
`;
  fs.writeFileSync('src/api/assets.ts', code);
}
