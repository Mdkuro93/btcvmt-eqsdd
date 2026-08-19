const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

// For Export logic
const oldExportCalc = `        const isMortgaged = asset.mortgage_status === 'mortgaged';
        const valuation = asset.mortgage_valuation || 0;
        const guaranteeRatio = valuation > 0 ? 70 : 0;
        const guaranteeVal = valuation > 0 ? valuation * (guaranteeRatio / 100) : 0;`;

const newExportCalc = `        const isMortgaged = asset.mortgage_status === 'mortgaged';
        const valuation = asset.mortgage_valuation || 0;
        const guaranteeRatio = asset.collateral_ratio || 0;
        const guaranteeVal = asset.collateral_value || 0;
        
        let notesArr = [];
        if (asset.notes) notesArr.push(asset.notes);
        if (asset.custody_status === 'checked_out') notesArr.push(\`Đang xuất mượn cho \${asset.current_holder_dept || 'Bộ phận'}\`);
        if (asset.lifecycle_status === 'invalidated') notesArr.push('Sổ đã hủy do tách thửa');
        const notesStr = notesArr.length > 0 ? notesArr.join(' - ') : 'Lưu kho an toàn';`;

code = code.replace(oldExportCalc, newExportCalc);

// Replace export row items for mortgage and notes
const oldExportRowMortgage = `          isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
          isMortgaged ? (asset.mortgage_bank || '-') : '-',
          isMortgaged ? (asset.mortgage_unit || '-') : '-',
          '-',
          '-',
          valuation ? valuation : 0,
          guaranteeRatio ? \`\${guaranteeRatio}%\` : '-',
          guaranteeVal ? guaranteeVal : 0,
          // Ghi chú
          asset.custody_status === 'checked_out'
            ? \`Đang xuất mượn cho \${asset.current_holder_dept || 'Bộ phận'}\`
            : (asset.lifecycle_status === 'invalidated' ? 'Sổ đã hủy do tách thửa' : 'Lưu kho an toàn')`;

const newExportRowMortgage = `          isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
          isMortgaged ? (asset.mortgage_bank || '-') : '-',
          isMortgaged ? (asset.mortgage_unit || '-') : '-',
          isMortgaged ? (asset.mortgage_bank_2 || '-') : '-',
          isMortgaged ? (asset.mortgage_unit_2 || '-') : '-',
          valuation ? valuation : 0,
          guaranteeRatio ? \`\${guaranteeRatio}%\` : '-',
          guaranteeVal ? guaranteeVal : 0,
          // Ghi chú
          notesStr`;

code = code.replace(oldExportRowMortgage, newExportRowMortgage);

// For Render logic
const oldRenderCalc = `                  const isMortgaged = asset.mortgage_status === 'mortgaged';
                  const valuation = asset.mortgage_valuation || 0;
                  const guaranteeRatio = valuation > 0 ? 70 : 0;
                  const guaranteeVal = valuation > 0 ? valuation * (guaranteeRatio / 100) : 0;`;

const newRenderCalc = `                  const isMortgaged = asset.mortgage_status === 'mortgaged';
                  const valuation = asset.mortgage_valuation || 0;
                  const guaranteeRatio = asset.collateral_ratio || 0;
                  const guaranteeVal = asset.collateral_value || 0;
                  
                  let notesArr = [];
                  if (asset.notes) notesArr.push(asset.notes);
                  if (asset.custody_status === 'checked_out') notesArr.push(\`Đang xuất mượn cho \${asset.current_holder_dept || 'Bộ phận'}\`);
                  if (asset.lifecycle_status === 'invalidated') notesArr.push('Sổ đã hủy do tách thửa');
                  const notesStr = notesArr.length > 0 ? notesArr.join(' - ') : 'Lưu kho an toàn';`;

code = code.replace(oldRenderCalc, newRenderCalc);

// Render row mortgage columns
const oldRenderCols = `                      <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-200">-</td>
                      <td className="px-3 py-2 text-center text-gray-400 border-r border-gray-200">-</td>
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
                        {asset.custody_status === 'checked_out' ? (
                          <span className="text-amber-700 font-semibold">Đang mượn tại {asset.current_holder_dept || 'Ban NV'}</span>
                        ) : asset.lifecycle_status === 'invalidated' ? (
                          <span className="text-gray-400 italic">Sổ gốc đã hủy (sau tách)</span>
                        ) : (
                          <span className="text-emerald-700">Lưu kho an toàn</span>
                        )}
                      </td>`;

const newRenderCols = `                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">
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

code = code.replace(oldRenderCols, newRenderCols);

fs.writeFileSync('src/pages/Reports.tsx', code);
