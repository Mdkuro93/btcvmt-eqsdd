const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

// Replace land_use_purpose and land_use_term
code = code.replace(/asset\.land_use_purpose \|\| 'Đất ở tại đô thị'/g, "asset.usage_purpose || '-'");
code = code.replace(/asset\.land_use_purpose \|\| 'Đất ở tại đô thị \(ODT\)'/g, "asset.usage_purpose || '-'");
code = code.replace(/asset\.land_use_term \|\| 'Lâu dài'/g, "asset.usage_term || '-'");

// Replace fake created_at
code = code.replace(/asset\.created_at \? new Date\(asset\.created_at\)\.toLocaleDateString\('vi-VN'\) : '15\/01\/2024'/g, "asset.registry_date ? new Date(asset.registry_date).toLocaleDateString('vi-VN') : '-'");

// Replace fake CH prefix
code = code.replace(/CH-\{asset\.certificate_no\.replace\(\/\\D\/g, ''\) \|\| String\(100 \+ index\)\}/g, "{asset.registry_no || '-'}");

// Replace fake owner
code = code.replace(/asset\.owner_name \|\| 'Công ty Cổ phần Đầu tư VMT'/g, "asset.owner_name || '-'");

// Replace fake warehouse
code = code.replace(/asset\.warehouses\?\.name \|\| 'Kho Trung Tâm BTC'/g, "asset.warehouses?.name || '-'");

// Replace fake mortgage bank
code = code.replace(/asset\.mortgage_bank \|\| 'BIDV - CN TP\.HCM'/g, "asset.mortgage_bank || '-'");
code = code.replace(/asset\.mortgage_unit \|\| 'Ban Nguồn Vốn'/g, "asset.mortgage_unit || '-'");

// Also there's a reference to asset_type in the table columns
// The second column in THÔNG TIN CHUNG was Loại tài sản
// Wait, the table cell for Loại tài sản was:
// <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.land_use_purpose || 'Đất ở tại đô thị'}</td>
// Let's replace it properly
code = code.replace(/<td className="px-3 py-2 text-gray-700 border-r border-gray-200">\{asset\.usage_purpose \|\| '-'}<\/td>/, "<td className=\"px-3 py-2 text-gray-700 border-r border-gray-200\">{asset.asset_type || '-'}</td>");

// Wait, the export excel logic needs to be updated too!
// In Reports.tsx, look for the wsData mapping
