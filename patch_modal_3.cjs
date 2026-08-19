const fs = require('fs');
let code = fs.readFileSync('src/components/CreateAssetModal.tsx', 'utf8');

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
  /<div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 shrink-0">/,
  notesUI + "\n          <div className=\"flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 shrink-0\">"
);

fs.writeFileSync('src/components/CreateAssetModal.tsx', code);
