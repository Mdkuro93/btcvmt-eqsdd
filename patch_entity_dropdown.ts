import fs from 'fs';
let content = fs.readFileSync('src/components/DeclareNewAssetModal.tsx', 'utf8');

content = content.replace(
  "  // Search state for old asset",
  "  // Search state for entity\n  const [searchEntityText, setSearchEntityText] = useState('');\n  const [showEntityDropdown, setShowEntityDropdown] = useState(false);\n\n  // Search state for old asset"
);

content = content.replace(
  "        setCurrentOwnerEntityId(profile.owner_entity_ids[0]);",
  "        setCurrentOwnerEntityId(profile.owner_entity_ids[0]);\n        setSearchEntityText('Pháp nhân NĐT (ID: ' + profile.owner_entity_ids[0] + ')');"
);

content = content.replace(
  "  const filteredAssets = allAssets.filter(a => {",
  "  const filteredEntities = investorEntities.filter(e => {\n    const s = searchEntityText.toLowerCase();\n    return (e.name?.toLowerCase().includes(s) || e.company_code?.toLowerCase().includes(s));\n  }).slice(0, 50);\n\n  const filteredAssets = allAssets.filter(a => {"
);

const oldSelect = `              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Pháp nhân / Chủ sở hữu</label>
                <select
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
                </select>
              </div>`;

const newSelect = `              <div className="relative">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Pháp nhân / Chủ sở hữu</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchEntityText}
                    onChange={(e) => {
                      setSearchEntityText(e.target.value);
                      setShowEntityDropdown(true);
                      if (e.target.value === '') {
                        setCurrentOwnerEntityId('');
                      }
                    }}
                    onFocus={() => setShowEntityDropdown(true)}
                    disabled={isInvestor}
                    placeholder={isInvestor ? 'Đã khoá theo ID NĐT' : 'Nhập tên hoặc mã pháp nhân...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {/* Fake clear button */}
                  {!isInvestor && searchEntityText && (
                     <button type="button" onClick={() => { setSearchEntityText(''); setCurrentOwnerEntityId(''); setShowEntityDropdown(true); }} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                     </button>
                  )}
                </div>
                {!isInvestor && showEntityDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredEntities.length > 0 ? filteredEntities.map(entity => (
                      <button
                        key={entity.id}
                        type="button"
                        onClick={() => {
                          setCurrentOwnerEntityId(entity.id);
                          setSearchEntityText(entity.company_code ? \`[\${entity.company_code}] \${entity.name}\` : entity.name);
                          setShowEntityDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                      >
                        <div className="font-semibold text-gray-800">{entity.name}</div>
                        {entity.company_code && <div className="text-xs text-gray-500">Mã: {entity.company_code}</div>}
                      </button>
                    )) : (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">Không tìm thấy pháp nhân</div>
                    )}
                  </div>
                )}
              </div>`;

content = content.replace(oldSelect, newSelect);

fs.writeFileSync('src/components/DeclareNewAssetModal.tsx', content, 'utf8');
