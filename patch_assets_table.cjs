const fs = require('fs');
let code = fs.readFileSync('src/pages/Assets.tsx', 'utf8');

// Also add import for deleteAsset and Trash2
code = code.replace(
  /import \{ fetchAssets, fetchProjects, createAsset, fetchWarehouses \} from '\.\.\/api\/assets';/,
  `import { fetchAssets, fetchProjects, createAsset, fetchWarehouses, deleteAsset } from '../api/assets';`
);

code = code.replace(
  /import \{ Plus, Search, FileText, AlertTriangle, AlertCircle, History, Package, Share2, MoreVertical, Loader2 \} from 'lucide-react';/,
  `import { Plus, Search, FileText, AlertTriangle, AlertCircle, History, Package, Share2, MoreVertical, Loader2, Trash2 } from 'lucide-react';`
);

// Add delete function
const deleteFunc = `
  const handleDeleteAsset = async (id: string, certificateNo: string) => {
    if (window.confirm(\`Bạn có chắc chắn muốn xoá vĩnh viễn GCN \${certificateNo}?\`)) {
      try {
        await deleteAsset(id);
        toast.success(\`Đã xoá GCN \${certificateNo}\`);
        loadAssets();
      } catch (error) {
        toast.error('Lỗi khi xoá GCN');
        console.error(error);
      }
    }
  };
`;
code = code.replace(/const handleSelectAll = \(e: React\.ChangeEvent<HTMLInputElement>\) => \{/, deleteFunc + '\n  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {');

// Replace table header
const oldThead = `            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={assets.length > 0 && selectedAssetIds.size === assets.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số GCN & CSH
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thửa đất & Địa chỉ
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dự án / Phân khu
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Diện tích
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kho & Vị trí
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>`;

const newThead = `            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={assets.length > 0 && selectedAssetIds.size === assets.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pháp lý GCN
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thông tin chung
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thế chấp
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lưu kho & Trạng thái
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Thao tác
                </th>
              </tr>
            </thead>`;

code = code.replace(oldThead, newThead);

// Replace table body
const oldTbody = `                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailAsset(asset)}
                          className="text-left font-bold text-[#1E3A8A] hover:underline text-sm block"
                        >
                          {asset.certificate_no}
                        </button>
                        <div className="text-xs text-gray-500">{asset.owner_name || 'Chưa cập nhật CSH'}</div>
                        {asset.scan_file_url && (
                          <a
                            href={asset.scan_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-[10px] text-blue-600 hover:underline mt-0.5"
                          >
                            <FileText className="w-3 h-3 mr-0.5" /> File scan GCN
                          </a>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-gray-800">
                          Thửa #{asset.land_lot_no || '-'}, Tờ #{asset.map_sheet_no || '-'}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate max-w-[200px]" title={asset.address_detail || ''}>
                          {asset.province ? \`\${asset.district || ''}, \${asset.province}\` : (asset.address_detail || '-')}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs text-gray-900 font-medium">{asset.projects?.name || '-'}</div>
                        <div className="text-xs text-gray-500">{asset.subdivision || '-'}</div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-900 font-semibold">
                        {asset.area ? \`\${asset.area.toLocaleString('vi-VN')} m²\` : '-'}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs font-medium text-gray-900">{asset.warehouses?.name || <span className="text-gray-400 italic">Chưa gán</span>}</div>
                        {asset.custody_status === 'checked_out' && (
                          <div className="mt-1">
                            <span className="text-[11px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium block w-max">
                              Tại: {asset.current_holder_dept || 'Bên mượn'}
                            </span>
                            {overdue && (
                              <span className="text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 mt-1">
                                <AlertTriangle className="w-3 h-3 text-red-600" /> Quá hạn trả ({asset.expected_return_date})
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadges
                          custody_status={asset.custody_status}
                          lifecycle_status={asset.lifecycle_status}
                          sale_status={asset.sale_status}
                          mortgage_status={asset.mortgage_status}
                        />
                        {asset.mortgage_status === 'mortgaged' && asset.mortgage_bank && (
                          <div className="text-[10px] text-amber-800 font-semibold mt-1">
                            NH: {asset.mortgage_bank}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setDetailAsset(asset)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-md transition-colors"
                        >
                          Chi tiết
                        </button>
                      </td>`;

const newTbody = `                      <td className="px-4 py-3">
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
                      </td>

                      <td className="px-4 py-3">
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
                      </td>

                      <td className="px-4 py-3">
                        {asset.mortgage_status === 'mortgaged' ? (
                          <div className="space-y-1">
                            <span className="text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">Đã thế chấp</span>
                            <div className="text-[11px] text-gray-600 mt-1">
                              NH 1: <span className="font-semibold text-red-800">{asset.mortgage_bank || '-'}</span>
                            </div>
                            {asset.mortgage_bank_2 && (
                              <div className="text-[11px] text-gray-600">
                                NH 2: <span className="font-semibold text-red-800">{asset.mortgage_bank_2}</span>
                              </div>
                            )}
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              Tỷ lệ: <span className="font-medium text-gray-800">{asset.collateral_ratio ? \`\${asset.collateral_ratio}%\` : '-'}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Chưa thế chấp</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-900 mb-1">
                          {asset.warehouses?.name || <span className="text-gray-400 italic">Chưa gán kho</span>}
                        </div>
                        <StatusBadges
                          custody_status={asset.custody_status}
                          lifecycle_status={asset.lifecycle_status}
                          sale_status={asset.sale_status}
                          mortgage_status="none"
                        />
                        {asset.custody_status === 'checked_out' && (
                          <div className="mt-1">
                            <span className="text-[11px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium block w-max">
                              Tại: {asset.current_holder_dept || 'Bên mượn'}
                            </span>
                            {overdue && (
                              <span className="text-[10px] text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 mt-1">
                                <AlertTriangle className="w-3 h-3 text-red-600" /> Quá hạn trả ({asset.expected_return_date ? new Date(asset.expected_return_date).toLocaleDateString('vi-VN') : ''})
                              </span>
                            )}
                          </div>
                        )}
                        {asset.notes && (
                          <div className="mt-1.5 text-[11px] text-gray-500 italic line-clamp-2" title={asset.notes}>
                            Ghi chú: {asset.notes}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center space-y-2">
                        <button
                          onClick={() => setDetailAsset(asset)}
                          className="w-full text-blue-600 hover:text-blue-900 font-medium text-xs bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-md transition-colors block text-center"
                        >
                          Chi tiết
                        </button>
                        {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
                          <button
                            onClick={() => handleDeleteAsset(asset.id, asset.certificate_no)}
                            className="w-full text-red-600 hover:text-red-900 font-medium text-xs bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-md transition-colors block text-center flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Xóa
                          </button>
                        )}
                      </td>`;

code = code.replace(oldTbody, newTbody);
fs.writeFileSync('src/pages/Assets.tsx', code);
