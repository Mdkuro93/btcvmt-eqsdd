import fs from 'fs';
let content = fs.readFileSync('src/components/DeclareNewAssetModal.tsx', 'utf8');

// Add import
content = content.replace(
  "import { createDeclarationRequest } from '../api/assetDeclarationRequests';",
  "import { createDeclarationRequest } from '../api/assetDeclarationRequests';\nimport { fetchInvestorEntities } from '../api/investorEntities';"
);

// Add state
content = content.replace(
  "  const [allAssets, setAllAssets] = useState<any[]>([]);",
  "  const [allAssets, setAllAssets] = useState<any[]>([]);\n  const [investorEntities, setInvestorEntities] = useState<any[]>([]);"
);

// Update loadData
content = content.replace(
  "      const [p, w, a] = await Promise.all([",
  "      const [p, w, a, e] = await Promise.all(["
);
content = content.replace(
  "        fetchAssetIdentifierCandidates()\n      ]);",
  "        fetchAssetIdentifierCandidates(),\n        fetchInvestorEntities()\n      ]);"
);
content = content.replace(
  "      setAllAssets(a);",
  "      setAllAssets(a);\n      setInvestorEntities(e);"
);

// Update select input
const oldInput = `<input
                  type="text"
                  value={currentOwnerEntityId}
                  onChange={(e) => setCurrentOwnerEntityId(e.target.value)}
                  disabled={isInvestor}
                  placeholder={isInvestor ? 'Đã khoá theo ID NĐT' : 'Nhập ID pháp nhân...'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                />`;
const newInput = `<select
                  value={currentOwnerEntityId}
                  onChange={(e) => setCurrentOwnerEntityId(e.target.value)}
                  disabled={isInvestor}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">-- Chọn pháp nhân --</option>
                  {investorEntities.map(entity => (
                    <option key={entity.id} value={entity.id}>
                      {entity.company_code ? \`[\${entity.company_code}] \` : ''}{entity.name}
                    </option>
                  ))}
                  {isInvestor && currentOwnerEntityId && !investorEntities.find(e => e.id === currentOwnerEntityId) && (
                    <option value={currentOwnerEntityId}>Pháp nhân NĐT (ID: {currentOwnerEntityId})</option>
                  )}
                </select>`;

content = content.replace(oldInput, newInput);

fs.writeFileSync('src/components/DeclareNewAssetModal.tsx', content, 'utf8');
