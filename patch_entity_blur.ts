import fs from 'fs';
let content = fs.readFileSync('src/components/DeclareNewAssetModal.tsx', 'utf8');

content = content.replace(
  "                    onFocus={() => setShowEntityDropdown(true)}",
  "                    onFocus={() => setShowEntityDropdown(true)}\n                    onBlur={() => setTimeout(() => setShowEntityDropdown(false), 200)}"
);

content = content.replace(
  "                      onFocus={() => setShowDropdown(true)}",
  "                      onFocus={() => setShowDropdown(true)}\n                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}"
);

fs.writeFileSync('src/components/DeclareNewAssetModal.tsx', content, 'utf8');
