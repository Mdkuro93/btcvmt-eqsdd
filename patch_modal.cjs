const fs = require('fs');
let code = fs.readFileSync('src/components/CreateAssetModal.tsx', 'utf8');

// Replace landUsePurpose and landUseTerm states with usagePurpose and usageTerm
code = code.replace(/const \[landUsePurpose, setLandUsePurpose\] = useState\('Đất ở tại đô thị \(ODT\)'\);/g, "const [usagePurpose, setUsagePurpose] = useState('Đất ở tại đô thị (ODT)');\n  const [assetType, setAssetType] = useState('Đất nền');\n  const [registryNo, setRegistryNo] = useState('');\n  const [registryDate, setRegistryDate] = useState('');\n  const [managingUnit, setManagingUnit] = useState('');");

code = code.replace(/const \[landUseTerm, setLandUseTerm\] = useState\('Lâu dài'\);/g, "const [usageTerm, setUsageTerm] = useState('Lâu dài');");

// In onSubmit, replace land_use_purpose and land_use_term
code = code.replace(/land_use_purpose: landUsePurpose \|\| null,/g, "usage_purpose: usagePurpose || null,\n        asset_type: assetType || null,\n        registry_no: registryNo || null,\n        registry_date: registryDate || null,\n        managing_unit: managingUnit || null,");

code = code.replace(/land_use_term: landUseTerm \|\| null,/g, "usage_term: usageTerm || null,");

// Update JSX bindings
code = code.replace(/value=\{landUsePurpose\}/g, "value={usagePurpose}");
code = code.replace(/onChange=\{e => setLandUsePurpose\(e\.target\.value\)\}/g, "onChange={e => setUsagePurpose(e.target.value)}");

code = code.replace(/value=\{landUseTerm\}/g, "value={usageTerm}");
code = code.replace(/onChange=\{e => setLandUseTerm\(e\.target\.value\)\}/g, "onChange={e => setUsageTerm(e.target.value)}");

// Add new JSX fields in Section 2 (Pháp lý)
const extraFields = `
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Loại tài sản</label>
                <select value={assetType} onChange={e => setAssetType(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white">
                  <option value="Đất nền">Đất nền</option>
                  <option value="Biệt thự">Biệt thự</option>
                  <option value="Shophouse">Shophouse</option>
                  <option value="Căn hộ">Căn hộ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số vào sổ cấp GCN</label>
                <input type="text" value={registryNo} onChange={e => setRegistryNo(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="VD: CH 01234" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ngày vào sổ</label>
                <input type="date" value={registryDate} onChange={e => setRegistryDate(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Đơn vị quản lý sổ (Cơ quan cấp)</label>
                <input type="text" value={managingUnit} onChange={e => setManagingUnit(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="Sở TNMT TP.HCM" />
              </div>
`;

// Insert the extraFields after mapSheetNo block
code = code.replace(/(<label className="block text-xs font-medium text-gray-700 mb-1">Số tờ bản đồ<\/label>[\s\S]*?<\/div>)/, "$1" + extraFields);

fs.writeFileSync('src/components/CreateAssetModal.tsx', code);
