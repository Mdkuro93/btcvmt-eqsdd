const fs = require('fs');
let code = fs.readFileSync('src/components/RequestModal.tsx', 'utf8');

// 1. Add states
code = code.replace(
  /const \[collateralRatio, setCollateralRatio\] = useState\(''\);/,
  `const [collateralRatio, setCollateralRatio] = useState('');
  const [bank2, setBank2] = useState('');
  const [mortgageUnit2, setMortgageUnit2] = useState('');
  const [expectedReleaseDate, setExpectedReleaseDate] = useState('');`
);

// 2. Update onSubmit case 'mortgage'
code = code.replace(
  /details = \{ bank, borrower, valuation: Number\(valuation\), collateralRatio: Number\(collateralRatio\) \};/,
  `details = { 
            bank, 
            mortgage_unit: borrower, 
            bank_2: bank2 || null,
            mortgage_unit_2: mortgageUnit2 || null,
            valuation: Number(valuation), 
            collateral_ratio: Number(collateralRatio),
            expected_release_date: expectedReleaseDate || null 
          };`
);

// 3. Update Mortgage UI fields
const oldMortgageUI = `              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp</label>
                  <input type="text" value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="VD: BIDV" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay</label>
                  <input type="text" value={borrower} onChange={e => setBorrower(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="VD: Ban NV" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                  <input type="number" value={valuation} onChange={e => setValuation(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="100000000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                  <input type="number" step="0.01" value={collateralRatio} onChange={e => setCollateralRatio(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="70" />
                </div>
              </div>`;

const newMortgageUI = `              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 1 *</label>
                  <input type="text" value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="VD: BIDV" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 1 *</label>
                  <input type="text" value={borrower} onChange={e => setBorrower(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="VD: Ban NV" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 2</label>
                  <input type="text" value={bank2} onChange={e => setBank2(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="VD: VCB" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 2</label>
                  <input type="text" value={mortgageUnit2} onChange={e => setMortgageUnit2(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="VD: Công ty XYZ" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                  <input type="number" value={valuation} onChange={e => setValuation(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" required placeholder="100000000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                  <input type="number" step="0.01" value={collateralRatio} onChange={e => setCollateralRatio(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="70" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày dự kiến giải chấp</label>
                  <input type="date" value={expectedReleaseDate} onChange={e => setExpectedReleaseDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
                </div>
              </div>`;

code = code.replace(oldMortgageUI, newMortgageUI);
fs.writeFileSync('src/components/RequestModal.tsx', code);
