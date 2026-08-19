const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const oldTr = `                      {/* THÔNG TIN CHUNG */}
                      <td className="px-3 py-2 font-semibold text-gray-900 border-r border-gray-200">{asset.projects?.name || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.usage_purpose || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {asset.parent_asset_id ? (
                          <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-medium">Sổ con (Tách)</span>
                        ) : asset.lifecycle_status === 'invalidated' ? (
                          <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-medium">Sổ gốc (Đã tách)</span>
                        ) : (
                          <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium">Sổ chính</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.subdivision || '-'}</td>
                      <td className="px-3 py-2 font-mono text-gray-800 border-r border-gray-200">{asset.land_lot_no || asset.subdivision || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200">
                        {asset.map_sheet_no ? \`Tờ \${asset.map_sheet_no} / Thửa \${asset.land_lot_no || '-'}\` : '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-200 text-right">
                        {asset.area ? asset.area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* THÔNG TIN PHÁP LÝ GCN */}
                      <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-200">{asset.owner_name || 'Công ty Cổ phần Đầu tư VMT'}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-800 border-r border-gray-200">{asset.land_lot_no || '-'}</td>
                      <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-200">{asset.map_sheet_no || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200 truncate max-w-[200px]" title={asset.address_detail || ''}>
                        {asset.address_detail || (asset.province ? \`\${asset.district || ''}, \${asset.province}\` : '-')}
                      </td>
                      <td className="px-3 py-2 font-bold text-[#1E3A8A] border-r border-gray-200">{asset.certificate_no}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono border-r border-gray-200">CH-{asset.certificate_no.replace(/\\D/g, '') || String(100 + index)}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200">
                        {asset.created_at ? new Date(asset.created_at).toLocaleDateString('vi-VN') : '15/01/2024'}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 border-r border-gray-200">{asset.warehouses?.name || 'Kho Trung Tâm BTC'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.usage_purpose || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.usage_term || '-'}</td>

                      {/* THÔNG TIN THẾ CHẤP NGÂN HÀNG */}
                      <td className="px-3 py-2 border-r border-gray-200 text-center font-bold">
                        {isMortgaged ? (
                          <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded-full inline-block">Đã thế chấp</span>
                        ) : (
                          <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full inline-block">Chưa thế chấp</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-red-900 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_bank || 'BIDV - CN TP.HCM') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_unit || 'Ban Nguồn Vốn') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_bank_2 || '-') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_unit_2 || '-') : '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-200 text-right">
                        {valuation ? \`\${valuation.toLocaleString('vi-VN')} đ\` : '-'}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-200">
                        {guaranteeRatio ? \`\${guaranteeRatio}%\` : '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-emerald-700 border-r border-gray-200 text-right">
                        {guaranteeVal ? \`\${guaranteeVal.toLocaleString('vi-VN')} đ\` : '-'}
                      </td>

                      {/* GHI CHÚ */}
                      <td className="px-3 py-2 text-gray-600 text-[11px]">
                        {asset.notes && <div className="font-medium text-gray-800 mb-1">{asset.notes}</div>}
                        {asset.custody_status === 'checked_out' ? (
                          <span className="text-amber-700 font-semibold inline-block">Đang mượn tại {asset.current_holder_dept || 'Ban NV'}</span>
                        ) : asset.lifecycle_status === 'invalidated' ? (
                          <span className="text-gray-400 italic inline-block">Sổ gốc đã hủy (sau tách)</span>
                        ) : (
                          <span className="text-emerald-700 inline-block">Lưu kho an toàn</span>
                        )}
                      </td>`;

const newTr = `                      {/* THÔNG TIN CHUNG */}
                      <td className="px-3 py-2 font-semibold text-gray-900 border-r border-gray-200">{asset.projects?.name || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.asset_type || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {asset.certificate_group === 'so_lon' ? (
                          <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-medium">Sổ lớn</span>
                        ) : asset.certificate_group === 'so_nho' ? (
                          <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium">Sổ nhỏ</span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.subdivision || '-'}</td>
                      <td className="px-3 py-2 font-mono text-gray-800 border-r border-gray-200">{asset.lot_no || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200">
                        {(asset.subdivision && asset.lot_no) ? \`\${asset.subdivision}-\${asset.lot_no}\` : '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-200 text-right">
                        {asset.area ? asset.area.toLocaleString('vi-VN') : '-'}
                      </td>

                      {/* THÔNG TIN PHÁP LÝ GCN */}
                      <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-200">{asset.owner_name || '-'}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-800 border-r border-gray-200">{asset.land_lot_no || '-'}</td>
                      <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-200">{asset.map_sheet_no || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200 truncate max-w-[200px]" title={asset.address_detail || ''}>
                        {asset.address_detail || '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-[#1E3A8A] border-r border-gray-200">{asset.certificate_no || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono border-r border-gray-200">{asset.registry_no || '-'}</td>
                      <td className="px-3 py-2 text-gray-600 border-r border-gray-200">
                        {asset.registry_date ? new Date(asset.registry_date).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 border-r border-gray-200">{asset.managing_unit || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{asset.usage_purpose || '-'}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {asset.usage_term_type === 'long_term' ? 'Lâu dài' : (asset.usage_term_type === 'fixed_date' && asset.usage_term_date ? \`Đến ngày \${new Date(asset.usage_term_date).toLocaleDateString('vi-VN')}\` : '-')}
                      </td>

                      {/* THÔNG TIN THẾ CHẤP NGÂN HÀNG */}
                      <td className="px-3 py-2 border-r border-gray-200 text-center font-bold">
                        {isMortgaged ? (
                          <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded-full inline-block">Đã thế chấp</span>
                        ) : (
                          <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full inline-block">Chưa thế chấp</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-red-900 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_bank || '-') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_unit || '-') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_bank_2 || '-') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
                        {isMortgaged ? (asset.mortgage_unit_2 || '-') : '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-200 text-right">
                        {valuation ? \`\${valuation.toLocaleString('vi-VN')} đ\` : '-'}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-200">
                        {guaranteeRatio ? \`\${guaranteeRatio}%\` : '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-emerald-700 border-r border-gray-200 text-right">
                        {guaranteeVal ? \`\${guaranteeVal.toLocaleString('vi-VN')} đ\` : '-'}
                      </td>

                      {/* GHI CHÚ */}
                      <td className="px-3 py-2 text-gray-600 text-[11px]">
                        {notesStr === '-' ? '-' : (
                           <div>
                             {asset.notes && <div className="font-medium text-gray-800 mb-1">{asset.notes}</div>}
                             {asset.custody_status === 'checked_out' && (
                               <span className="text-amber-700 font-semibold inline-block">Đang mượn tại {asset.current_holder_dept || 'Bộ phận'}</span>
                             )}
                             {asset.lifecycle_status === 'invalidated' && (
                               <span className="text-gray-400 italic inline-block">Sổ gốc đã hủy (sau tách)</span>
                             )}
                           </div>
                        )}
                      </td>`;

code = code.replace(oldTr, newTr);
fs.writeFileSync('src/pages/Reports.tsx', code);
