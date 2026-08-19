const fs = require('fs');
let code = fs.readFileSync('src/components/CreateAssetModal.tsx', 'utf8');

// 1. Update states
code = code.replace(
  /const \[usageTerm, setUsageTerm\] = useState\('Lâu dài'\);/,
  `const [certificateGroup, setCertificateGroup] = useState('so_nho');
  const [lotNo, setLotNo] = useState('');
  const [usageTermType, setUsageTermType] = useState('fixed_date');
  const [usageTermDate, setUsageTermDate] = useState('');`
);

// 2. Update onSubmit data
code = code.replace(
  /usage_term: usageTerm \|\| null,/,
  `certificate_group: certificateGroup || null,
        lot_no: lotNo || null,
        usage_term_type: usageTermType || null,
        usage_term_date: usageTermType === 'fixed_date' ? (usageTermDate || null) : null,`
);

// 3. Update state clearing
code = code.replace(
  /setUsageTerm\('Lâu dài'\);/,
  `setCertificateGroup('so_nho');
      setLotNo('');
      setUsageTermType('fixed_date');
      setUsageTermDate('');`
);

// 4. Update UI for Nhóm sổ and Số lô
const htmlToReplaceForLotAndGroup = `
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phân khu / Block</label>
                <input type="text" value={subdivision} onChange={e => setSubdivision(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="VD: B2-8" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Loại tài sản *</label>
                <select value={assetType} onChange={e => setAssetType(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white">
                  <option value="Đất nền">Đất nền</option>
                  <option value="Nhà phố">Nhà phố</option>
                  <option value="Biệt thự">Biệt thự</option>
                  <option value="Căn hộ">Căn hộ</option>
                  <option value="TMDV">Thương mại dịch vụ (TMDV)</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>`;

const newHtmlForLotAndGroup = `
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nhóm sổ *</label>
                <select value={certificateGroup} onChange={e => setCertificateGroup(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white">
                  <option value="so_nho">Sổ nhỏ (thửa/lô hoàn chỉnh)</option>
                  <option value="so_lon">Sổ lớn (sổ nhiều lô chưa tách)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phân khu / Block</label>
                <input type="text" value={subdivision} onChange={e => setSubdivision(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="VD: B2-8" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số lô</label>
                <input type="text" value={lotNo} onChange={e => setLotNo(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="VD: 1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Loại tài sản *</label>
                <select value={assetType} onChange={e => setAssetType(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white">
                  <option value="Đất nền">Đất nền</option>
                  <option value="Nhà phố">Nhà phố</option>
                  <option value="Biệt thự">Biệt thự</option>
                  <option value="Căn hộ">Căn hộ</option>
                  <option value="TMDV">Thương mại dịch vụ (TMDV)</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>`;

code = code.replace(htmlToReplaceForLotAndGroup, newHtmlForLotAndGroup);

// Update Số thửa đất label
code = code.replace(
  /<label className="block text-xs font-medium text-gray-700 mb-1">Số thửa đất<\/label>/,
  `<label className="block text-xs font-medium text-gray-700 mb-1">Số thửa đất (theo GCN)</label>`
);

// Update Đơn vị quản lý sổ placeholder
code = code.replace(
  /placeholder="VD: Sở TNMT TP.HCM"/,
  `placeholder="VD: BTC VMT"`
);

// Update Thời hạn sử dụng
const oldUsageTermUI = `              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Thời hạn sử dụng</label>
                <input type="text" value={usageTerm} onChange={e => setUsageTerm(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="Lâu dài, 50 năm..." />
              </div>`;

const newUsageTermUI = `              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Thời hạn sử dụng</label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" name="usageTermType" value="fixed_date" checked={usageTermType === 'fixed_date'} onChange={() => setUsageTermType('fixed_date')} />
                    Có thời hạn
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" name="usageTermType" value="long_term" checked={usageTermType === 'long_term'} onChange={() => setUsageTermType('long_term')} />
                    Lâu dài
                  </label>
                </div>
                {usageTermType === 'fixed_date' && (
                  <input type="date" value={usageTermDate} onChange={e => setUsageTermDate(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" />
                )}
              </div>`;

code = code.replace(oldUsageTermUI, newUsageTermUI);

// Update Section 3 (Mortgage) wording
code = code.replace(
  /<h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">3. Hồ sơ Thế chấp Ngân hàng \(Nếu có\)<\/h4>/,
  `<h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">3. Hồ sơ Thế chấp Ngân hàng (Nếu có)</h4>`
);
code = code.replace(
  /Đang thế chấp\n\s*<\/label>/,
  `Chỉ dùng khi nhập tồn kho cũ đã có sẵn thế chấp — mọi thay đổi sau này phải qua Phiếu yêu cầu Thế chấp
              </label>`
);

fs.writeFileSync('src/components/CreateAssetModal.tsx', code);
