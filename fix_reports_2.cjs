const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

// Replace leftover land_use variables
code = code.replace(/asset\.land_use_purpose \|\| 'Đất ở tại đô thị'/g, "asset.usage_purpose || '-'");
code = code.replace(/asset\.land_use_purpose \|\| 'Đất ở tại đô thị \\(ODT\\)'/g, "asset.usage_purpose || '-'");
code = code.replace(/asset\.land_use_term \|\| 'Lâu dài'/g, "asset.usage_term || '-'");

fs.writeFileSync('src/pages/Reports.tsx', code);
