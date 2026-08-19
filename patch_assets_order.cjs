const fs = require('fs');
let code = fs.readFileSync('src/pages/Assets.tsx', 'utf8');

// The headers in Assets.tsx are currently:
// 1. Checkbox
// 2. Pháp lý GCN
// 3. Thông tin chung
// 4. Thế chấp
// 5. Lưu kho & Trạng thái
// 6. Thao tác

const oldThead = `                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pháp lý GCN
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thông tin chung
                </th>`;

const newThead = `                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thông tin chung
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pháp lý GCN
                </th>`;

code = code.replace(oldThead, newThead);

// In tbody, we swap the columns:
const oldTbodyColsRegex = /(<td className="px-4 py-3">\s*<button[\s\S]*?<\/button>\s*<div[\s\S]*?<\/div>\s*<div[\s\S]*?<\/div>\s*<div[\s\S]*?<\/div>\s*(?:\{asset\.scan_file_url[\s\S]*?\}[\s\S]*?)?<\/td>)\s*(<td className="px-4 py-3">\s*<div[\s\S]*?<\/div>\s*<div[\s\S]*?<\/div>\s*<div[\s\S]*?<\/div>\s*<div[\s\S]*?<\/div>\s*<\/td>)/;

// Wait, doing this with regex might be risky. Let's do it exactly:
const td1 = `                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailAsset(asset)}
                          className="text-left font-bold text-[#1E3A8A] hover:underline text-sm block"
                        >
                          {asset.certificate_no || '-'}
                        </button>
                        <div className="text-[11px] font-semibold text-gray-700 mt-0.5">
                          CSH: <span className="font-normal text-gray-600">{asset.owner_name || '-'}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Thửa: <span className="font-medium text-gray-800">{asset.land_lot_no || '-'}</span> | Tờ: <span className="font-medium text-gray-800">{asset.map_sheet_no || '-'}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Quản lý: <span className="font-medium text-gray-700">{asset.managing_unit || '-'}</span>
                        </div>
                        {asset.scan_file_url && (
                          <a
                            href={asset.scan_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-[10px] text-blue-600 hover:underline mt-1"
                          >
                            <FileText className="w-3 h-3 mr-0.5" /> File scan GCN
                          </a>
                        )}
                      </td>`;

const td2 = `                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-900 font-medium">{asset.projects?.name || '-'}</div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          Phân khu: <span className="font-medium text-gray-800">{asset.subdivision || '-'}</span> | Lô: <span className="font-medium text-gray-800">{asset.lot_no || '-'}</span>
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          Loại: <span className="font-medium text-gray-800">{asset.asset_type || '-'}</span> | Nhóm: <span className="font-medium text-gray-800">{asset.certificate_group === 'so_lon' ? 'Sổ lớn' : (asset.certificate_group === 'so_nho' ? 'Sổ nhỏ' : '-')}</span>
                        </div>
                        <div className="text-[11px] text-gray-900 font-semibold mt-0.5 text-blue-700">
                          {asset.area ? \`\${asset.area.toLocaleString('vi-VN')} m²\` : '-'}
                        </div>
                      </td>`;

code = code.replace(td1 + '\n\n' + td2, td2 + '\n\n' + td1);
fs.writeFileSync('src/pages/Assets.tsx', code);
