const fs = require('fs');
let code = fs.readFileSync('src/components/CreateAssetModal.tsx', 'utf8');

// 1. Add states
code = code.replace(
  /const \[mortgageReleaseDate, setMortgageReleaseDate\] = useState\(''\);/,
  `const [mortgageReleaseDate, setMortgageReleaseDate] = useState('');
  const [hasSecondBank, setHasSecondBank] = useState(false);
  const [mortgageBank2, setMortgageBank2] = useState('');
  const [mortgageUnit2, setMortgageUnit2] = useState('');
  const [collateralRatio, setCollateralRatio] = useState('');
  const [collateralValue, setCollateralValue] = useState('');
  const [notes, setNotes] = useState('');

  const handleValuationChange = (e) => {
    const val = e.target.value;
    setMortgageValuation(val);
    if (val && collateralRatio) {
      setCollateralValue((Number(val) * Number(collateralRatio) / 100).toString());
    }
  };

  const handleRatioChange = (e) => {
    const val = e.target.value;
    setCollateralRatio(val);
    if (mortgageValuation && val) {
      setCollateralValue((Number(mortgageValuation) * Number(val) / 100).toString());
    }
  };`
);

// 2. Update onSubmit
code = code.replace(
  /mortgage_unit: isMortgaged \? mortgageUnit : null,/,
  `mortgage_unit: isMortgaged ? mortgageUnit : null,
        mortgage_bank_2: isMortgaged && hasSecondBank ? mortgageBank2 : null,
        mortgage_unit_2: isMortgaged && hasSecondBank ? mortgageUnit2 : null,`
);

code = code.replace(
  /mortgage_valuation: isMortgaged && mortgageValuation \? Number\(mortgageValuation\) : null,/,
  `mortgage_valuation: isMortgaged && mortgageValuation ? Number(mortgageValuation) : null,
        collateral_ratio: isMortgaged && collateralRatio ? Number(collateralRatio) : null,
        collateral_value: isMortgaged && collateralValue ? Number(collateralValue) : null,`
);

code = code.replace(
  /mortgage_expected_release_date: isMortgaged \? mortgageReleaseDate : null,/,
  `mortgage_expected_release_date: isMortgaged ? mortgageReleaseDate : null,
        notes: notes || null,`
);

// 3. Reset states
code = code.replace(
  /setMortgageReleaseDate\(''\);/,
  `setMortgageReleaseDate('');
      setHasSecondBank(false);
      setMortgageBank2('');
      setMortgageUnit2('');
      setCollateralRatio('');
      setCollateralValue('');
      setNotes('');`
);

// 4. Mortgage UI Changes
code = code.replace(
  /onChange=\{e => setMortgageValuation\(e\.target\.value\)\}/,
  `onChange={handleValuationChange}`
);

const mortgageExtraFields = `
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                    <input type="number" min="0" max="100" step="0.01" value={collateralRatio} onChange={handleRatioChange} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="VD: 70" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Giá trị đảm bảo (VNĐ)</label>
                    <input type="number" value={collateralValue} onChange={e => setCollateralValue(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="Giá trị đảm bảo" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 font-medium">
                    <input type="checkbox" checked={hasSecondBank} onChange={e => setHasSecondBank(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    Có ngân hàng đồng thế chấp thứ 2
                  </label>
                </div>

                {hasSecondBank && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 bg-red-50 rounded-md border border-red-100">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ngân hàng thế chấp 2</label>
                      <input type="text" value={mortgageBank2} onChange={e => setMortgageBank2(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-red-500 focus:ring-red-500 bg-white" placeholder="VD: Agribank..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Đơn vị vay 2</label>
                      <input type="text" value={mortgageUnit2} onChange={e => setMortgageUnit2(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-red-500 focus:ring-red-500 bg-white" placeholder="VD: Công ty TNHH..." />
                    </div>
                  </div>
                )}
`;

code = code.replace(
  /<\/div>\n\n\s*\{!isMortgaged/s,
  mortgageExtraFields + "\n\n              {!isMortgaged"
);

// 5. Notes UI
const notesUI = `
          {/* SECTION 4: GHI CHÚ */}
          <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 space-y-3">
            <h4 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">Ghi chú thêm</h4>
            <div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-white" placeholder="Nhập ghi chú tự do..." />
            </div>
          </div>
`;

code = code.replace(
  /<\/div>\n\s*<\/div>\n\s*<div className="flex justify-end gap-3 pt-2">/s,
  `</div>\n          </div>\n${notesUI}\n          <div className="flex justify-end gap-3 pt-2">`
);

fs.writeFileSync('src/components/CreateAssetModal.tsx', code);
