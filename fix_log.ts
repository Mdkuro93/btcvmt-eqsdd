import fs from 'fs';
let content = fs.readFileSync('src/api/assets.ts', 'utf8');

content = content.replace(
  /logActivity\(userProfile, 'Cập nhật tài sản', note \|\| `Đã cập nhật thông tin GCN \$\{updated\.certificate_no\}`, updated\);/g,
  "logActivity({\n        assetId: updated.id,\n        actionType: 'Cập nhật tài sản',\n        description: note || `Đã cập nhật thông tin GCN ${updated.certificate_no}`,\n        usedBy: userProfile.id\n      });"
);

content = content.replace(
  /await logActivity\(userProfile, 'Cập nhật tài sản', note \|\| `Đã cập nhật thông tin GCN \$\{data\.certificate_no\}`, data\);/g,
  "await logActivity({\n      assetId: data.id,\n      actionType: 'Cập nhật tài sản',\n      description: note || `Đã cập nhật thông tin GCN ${data.certificate_no}`,\n      usedBy: userProfile.id\n    });"
);

// fix pages/Assets.tsx source state
let assetsPage = fs.readFileSync('src/pages/Assets.tsx', 'utf8');
assetsPage = assetsPage.replace(/setDataSource\(res\.source \|\| \(isSupabaseConfigured \? 'supabase' : 'mock'\)\);/g, "setDataSource((res.source || (isSupabaseConfigured ? 'supabase' : 'mock')) as 'supabase' | 'mock');");
fs.writeFileSync('src/pages/Assets.tsx', assetsPage);

fs.writeFileSync('src/api/assets.ts', content);
