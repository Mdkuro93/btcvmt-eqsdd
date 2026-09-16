import fs from 'fs';
let content = fs.readFileSync('src/components/DeclareNewAssetModal.tsx', 'utf8');

// I will add Province, District, Ward below area
const newFields = `            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tỉnh / Thành phố</label>
                <input type="text" value={province} onChange={e => setProvince(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ví dụ: Đà Nẵng, QNM" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Quận / Huyện</label>
                <input type="text" value={district} onChange={e => setDistrict(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Xã / Phường</label>
                <input type="text" value={ward} onChange={e => setWard(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>`;

content = content.replace(
  "            <div>\n              <label className=\"block text-xs font-semibold text-gray-700 mb-1\">Ghi chú thêm</label>",
  newFields + "\n\n            <div>\n              <label className=\"block text-xs font-semibold text-gray-700 mb-1\">Ghi chú thêm</label>"
);

fs.writeFileSync('src/components/DeclareNewAssetModal.tsx', content, 'utf8');
