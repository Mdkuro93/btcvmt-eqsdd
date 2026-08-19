const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

code = code.replace(
  /const \[selectedRegion, setSelectedRegion\] = useState<string>\('Vùng Miền Trung'\);/,
  "const [selectedRegion, setSelectedRegion] = useState<string>('Tất cả vùng');"
);

fs.writeFileSync('src/pages/Reports.tsx', code);
