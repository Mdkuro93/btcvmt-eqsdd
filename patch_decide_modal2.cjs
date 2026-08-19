const fs = require('fs');
let code = fs.readFileSync('src/components/DecideRequestModal.tsx', 'utf8');

// Mortgage UI
const oldMortgageUI = `            {decisionType === 'approved' && item.type === 'mortgage' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp</label>
                  <input type="text" value={details.bank || ''} onChange={e => setDetails({...details, bank: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>`;

const newMortgageUI = `            {decisionType === 'approved' && item.type === 'mortgage' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 1 *</label>
                  <input type="text" value={details.bank || ''} onChange={e => setDetails({...details, bank: e.target.value})} className="w-full px-3 py-2 border rounded-md" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 1 *</label>
                  <input type="text" value={details.mortgage_unit || ''} onChange={e => setDetails({...details, mortgage_unit: e.target.value})} className="w-full px-3 py-2 border rounded-md" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 2</label>
                  <input type="text" value={details.bank_2 || ''} onChange={e => setDetails({...details, bank_2: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 2</label>
                  <input type="text" value={details.mortgage_unit_2 || ''} onChange={e => setDetails({...details, mortgage_unit_2: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                  <input type="number" value={details.valuation || ''} onChange={e => setDetails({...details, valuation: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                  <input type="number" step="0.01" value={details.collateral_ratio || ''} onChange={e => {
                    const ratio = e.target.value;
                    const val = details.valuation;
                    const autoColVal = (val && ratio) ? (Number(val) * Number(ratio) / 100) : details.collateral_value;
                    setDetails({...details, collateral_ratio: ratio, collateral_value: autoColVal});
                  }} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị đảm bảo (VNĐ)</label>
                  <input type="number" value={details.collateral_value || ''} onChange={e => setDetails({...details, collateral_value: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>`;

// Note: I will replace the block up to the first input. Wait, the old file was already patched in the previous turn with Ngân hàng thế chấp 2, Đơn vị vay 2 etc.! Let's check what's actually there.
