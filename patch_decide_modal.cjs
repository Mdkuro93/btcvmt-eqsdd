const fs = require('fs');
let code = fs.readFileSync('src/components/DecideRequestModal.tsx', 'utf8');

const oldMortgage = `            {decisionType === 'approved' && item.type === 'mortgage' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp</label>
                  <input type="text" value={details.bank || ''} onChange={e => setDetails({...details, bank: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                  <input type="number" value={details.valuation || ''} onChange={e => setDetails({...details, valuation: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
              </div>
            )}`;

const newMortgage = `            {decisionType === 'approved' && item.type === 'mortgage' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 1</label>
                  <input type="text" value={details.bank || ''} onChange={e => setDetails({...details, bank: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 1</label>
                  <input type="text" value={details.mortgage_unit || ''} onChange={e => setDetails({...details, mortgage_unit: e.target.value})} className="w-full px-3 py-2 border rounded-md" />
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
                </div>
              </div>
            )}`;

code = code.replace(oldMortgage, newMortgage);

// For sale update, we need to add the auto long_term logic. We can do this in the `useEffect` when details changes or in the select onChange.
const oldSale = `            {decisionType === 'approved' && item.type === 'sale_update' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái bán</label>
                  <select value={details.saleStatus || ''} onChange={e => setDetails({...details, saleStatus: e.target.value})} className="w-full px-3 py-2 border rounded-md">
                    <option value="not_ready">Chưa sẵn sàng</option>
                    <option value="ready_for_sale">Sẵn sàng bán</option>
                    <option value="sold">Đã bán</option>
                  </select>
                </div>
              </div>
            )}`;

const newSale = `            {decisionType === 'approved' && item.type === 'sale_update' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái bán</label>
                  <select value={details.saleStatus || ''} onChange={e => {
                    const st = e.target.value;
                    let ut = details.usage_term_type;
                    if (st === 'sold' && asset?.usage_purpose?.toLowerCase().includes('đất ở')) {
                      ut = 'long_term';
                    }
                    setDetails({...details, saleStatus: st, usage_term_type: ut});
                  }} className="w-full px-3 py-2 border rounded-md">
                    <option value="not_ready">Chưa sẵn sàng</option>
                    <option value="ready_for_sale">Sẵn sàng bán</option>
                    <option value="sold">Đã bán</option>
                  </select>
                </div>
                {details.saleStatus === 'sold' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chuyển thời hạn sử dụng thành Lâu dài</label>
                    <div className="flex items-center h-10">
                      <input type="checkbox" checked={details.usage_term_type === 'long_term'} onChange={e => setDetails({...details, usage_term_type: e.target.checked ? 'long_term' : asset?.usage_term_type})} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="ml-2 text-sm text-gray-600">(Áp dụng khi chuyển nhượng đất ở)</span>
                    </div>
                  </div>
                )}
              </div>
            )}`;

code = code.replace(oldSale, newSale);

// Wait, we need to pass `notes` back as part of `details` or something, but onConfirm already takes `notes`. 
// I updated `decide_transaction_item` SQL to read `p_details->>'notes'` to update the asset notes. So we should inject `notes` into details when submitting.
const submitReplace = `      await onConfirm(decisionType, notes, details);`;
const submitNew = `      const finalDetails = { ...details, notes: notes };
      await onConfirm(decisionType, notes, finalDetails);`;

code = code.replace(submitReplace, submitNew);

fs.writeFileSync('src/components/DecideRequestModal.tsx', code);
