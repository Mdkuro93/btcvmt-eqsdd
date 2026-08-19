const fs = require('fs');
let code = fs.readFileSync('src/components/RequestModal.tsx', 'utf8');

const oldMortgageUI = `          {type === 'mortgage' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
                <input required type="text" value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay</label>
                <input required type="text" value={borrower} onChange={e => setBorrower(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                <input required type="number" min="0" value={valuation} onChange={e => setValuation(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                <input required type="number" min="0" max="100" step="0.1" value={collateralRatio} onChange={e => setCollateralRatio(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </div>
          )}`;

const newMortgageUI = `          {type === 'mortgage' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 1 *</label>
                <input required type="text" value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 1 *</label>
                <input required type="text" value={borrower} onChange={e => setBorrower(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng thế chấp 2</label>
                <input type="text" value={bank2} onChange={e => setBank2(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị vay 2</label>
                <input type="text" value={mortgageUnit2} onChange={e => setMortgageUnit2(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giá trị định giá (VNĐ)</label>
                <input required type="number" min="0" value={valuation} onChange={e => setValuation(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ đảm bảo (%)</label>
                <input required type="number" min="0" max="100" step="0.01" value={collateralRatio} onChange={e => setCollateralRatio(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày dự kiến giải chấp</label>
                <input type="date" value={expectedReleaseDate} onChange={e => setExpectedReleaseDate(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </div>
          )}`;

code = code.replace(oldMortgageUI, newMortgageUI);
fs.writeFileSync('src/components/RequestModal.tsx', code);
