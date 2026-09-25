import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, X } from 'lucide-react';
import { fetchInvestorEntities } from '../api/investorEntities';
import { fetchProjects, importAssets, checkDuplicateAssets } from '../api/assets';
import { useAuth } from '../contexts/AuthContext';
import toast, { Toaster } from 'react-hot-toast';

export const Import: React.FC = () => {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (error) {
      toast.error('Lỗi tải danh sách dự án');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = (file: File) => {
    setFile(file);
    setLoading(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const investorEntities = await fetchInvestorEntities();
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Expected headers: "Số GCN", "Tên dự án", "Phân khu", "Diện tích", "Chủ sở hữu", "Mã công ty sở hữu", "Phân loại"
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        // Map and validate
        const mappedData = rawData.map((row: any, index: number) => {
          const certificate_no = (row['Số GCN QSDĐ'] || row['Số GCN'])?.toString().trim();
          const projectName = (row['Dự Án (Pháp lý)'] || row['Tên dự án'])?.toString().trim();
          
          const legal_lot_code = (row['Mã lô đất (Mã Lô Pháp Lý)'] || row['Mã Lô Pháp Lý'])?.toString().trim() || null;
          
          const area = (row['Diện Tích (m²)'] || row['Diện tích']) ? parseFloat(row['Diện Tích (m²)'] || row['Diện tích']) : null;
          const companyCode = row['Mã công ty sở hữu']?.toString().trim();
          const roleRaw = row['Phân loại']?.toString().trim().toLowerCase();
          
          const business_project_name = row['Tên Dự Án Kinh Doanh']?.toString().trim() || null;
          const business_plot_code = row['Mã Lô Kinh Doanh']?.toString().trim() || null;
          const asset_type = row['Loại Tài Sản']?.toString().trim() || null;
          const certificate_group = row['Nhóm Sổ']?.toString().trim() === 'Sổ con' ? 'so_nho' : 'so_lon';
          const land_lot_no = row['Số Thửa Bản Đồ']?.toString().trim() || null;
          const map_sheet_no = row['Số Tờ Bản Đồ']?.toString().trim() || null;
          const registry_no = row['Số vào sổ cấp']?.toString().trim() || null;
          const usage_purpose = row['Mục Đích Sử Dụng']?.toString().trim() || null;
          
          // Ngân hàng thế chấp / Đơn vị vay: cột đơn, nhiều giá trị nối sẵn bằng ";" trong file Excel
          const mortgage_bank = row['Ngân Hàng Thế Chấp']?.toString().trim() || null;
          const mortgage_unit = row['Đơn vị vay']?.toString().trim() || null;

          // Find project ID
          let project_id = null;
          let hasError = false;
          let errorMessage = '';

          if (!certificate_no) {
            hasError = true;
            errorMessage = 'Thiếu Số GCN';
          }

          if (projectName) {
            const project = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
            if (project) {
              project_id = project.id;
            } else {
              hasError = true;
              errorMessage = `Không tìm thấy dự án: ${projectName}`;
            }
          }

          let current_owner_entity_id = null;
          let current_owner_role = null;

          if (companyCode) {
            const entity = investorEntities.find(e => e.company_code?.toLowerCase() === companyCode.toLowerCase());
            if (entity) {
              current_owner_entity_id = entity.id;
              if (roleRaw === 'cđt' || roleRaw === 'cdt') current_owner_role = 'cdt';
              else if (roleRaw === 'nđt' || roleRaw === 'ndt') current_owner_role = 'ndt';
              else current_owner_role = 'cdt'; // Default to cdt if not specified correctly but entity exists
            } else {
              hasError = true;
              errorMessage = `Không tìm thấy pháp nhân với mã: ${companyCode}`;
            }
          }

          const isMortgaged = (row['Trạng Thái Thế Chấp']?.toString().toLowerCase().includes('thế chấp') && !row['Trạng Thái Thế Chấp']?.toString().toLowerCase().includes('không')) || Boolean(mortgage_bank);

          return {
            _originalRow: index + 2, // Excel rows are 1-indexed, and header is 1
            certificate_no,
            project_id,
            projectName, // Keep for display
            legal_lot_code,
            business_plot_code,
            business_project_name,
            asset_type: asset_type || 'Đất nền',
            certificate_group,
            land_lot_no,
            map_sheet_no,
            registry_no,
            usage_purpose,
            mortgage_bank,
            mortgage_unit,
            area,
            current_owner_entity_id,
            current_owner_role,
            companyCode, // Keep for display
            roleRaw, // Keep for display
            custody_status: 'in_stock',
            lifecycle_status: 'active',
            sale_status: 'not_ready',
            mortgage_status: isMortgaged ? 'mortgaged' : 'none',
            hasError,
            errorMessage,
            isDuplicate: false,
          };
        });

        const certNos = mappedData.map(d => d.certificate_no).filter(Boolean);
        const duplicates = await checkDuplicateAssets(certNos);
        const duplicateSet = new Set(duplicates);

        const finalData = mappedData.map(d => {
          if (!d.hasError && d.certificate_no && duplicateSet.has(d.certificate_no)) {
            return {
              ...d,
              isDuplicate: true
            };
          }
          return d;
        });

        setParsedData(finalData);
      } catch (err) {
        toast.error('Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      toast.error('Lỗi đọc file');
      setLoading(false);
    };
    reader.readAsBinaryString(file);
  };

  const clearData = () => {
    setFile(null);
    setParsedData([]);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    const validData = parsedData.filter(d => !d.hasError && !d.isDuplicate);
    if (validData.length === 0) {
      toast.error('Không có dữ liệu hợp lệ để import');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validData.length });
    let imported = 0;
    try {
      // Remove display-only fields before sending to DB
      const dbData = validData.map(d => {
        const { _originalRow, projectName, companyCode, roleRaw, hasError, errorMessage, isDuplicate, ...rest } = d;
        return rest;
      });

      const batchSize = 500;
      for (let i = 0; i < dbData.length; i += batchSize) {
        const batch = dbData.slice(i, i + batchSize);
        await importAssets(batch);
        imported += batch.length;
        setImportProgress({ current: imported, total: dbData.length });
        
        // Small delay to allow UI to update if on mockStore
        await new Promise(r => setTimeout(r, 50));
      }

      toast.success(`Đã import thành công ${imported} GCN!`);
      clearData();
    } catch (error: any) {
      console.error(error);
      toast.error(`Lỗi lô dữ liệu: ${error.message}. Đã nhập thành công ${imported}/${validData.length} dòng.`);
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = parsedData.filter(d => !d.hasError && !d.isDuplicate).length;
  const invalidCount = parsedData.filter(d => d.hasError).length;
  const duplicateCount = parsedData.filter(d => !d.hasError && d.isDuplicate).length;

  const handleDownloadTemplate = () => {
    const headers = [
      'Số GCN QSDĐ', 'Dự Án (Pháp lý)', 'Tên Dự Án Kinh Doanh', 'Loại Tài Sản', 'Nhóm Sổ',
      'Mã lô đất (Mã Lô Pháp Lý)', 'Mã Lô Kinh Doanh', 'Diện Tích (m²)',
      'Mã công ty sở hữu', 'Phân loại',
      'Số Thửa Bản Đồ', 'Số Tờ Bản Đồ', 'Số vào sổ cấp', 'Mục Đích Sử Dụng',
      'Trạng Thái Thế Chấp', 'Ngân Hàng Thế Chấp', 'Đơn vị vay',
    ];
    const sample = [
      'GCN-VMT-2026-00001', 'KDT Cồn Dầu', 'Cồn Dầu Residences', 'Đất nền', 'Sổ nhỏ',
      'Phân khu A-Lô 12', 'LK02-15', 450.5,
      'VMT', 'CĐT',
      '112', '04', 'CT-2026-001', 'Đất ở tại đô thị (ODT)',
      'Chưa thế chấp', '', '',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Import_GCN');
    XLSX.writeFile(wb, 'Mau_Import_GCN_VMT.xlsx');
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Import dữ liệu GCN (Excel)</h1>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-[#1E3A8A] bg-white hover:bg-gray-50"
        >
          <FileText className="w-4 h-4 mr-2" /> Tải file Excel mẫu
        </button>
      </div>
      
      {!file && (
        <div 
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Kéo thả file Excel vào đây</h3>
          <p className="mt-1 text-sm text-gray-500">hoặc click để chọn file từ máy tính</p>
          <div className="mt-6">
            <input
              type="file"
              id="file-upload"
              accept=".xlsx, .xls, .csv"
              className="sr-only"
              onChange={handleFileChange}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#1E3A8A] shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Chọn file
            </label>
          </div>
          <div className="mt-8 text-xs text-gray-500 text-left bg-gray-50 p-4 rounded-md inline-block">
            <p className="font-semibold mb-2">Định dạng file yêu cầu (có hàng tiêu đề) — bấm "Tải file Excel mẫu" ở trên để có sẵn đúng cột:</p>
            <ul className="list-disc list-inside">
              <li><strong>Số GCN QSDĐ</strong> (Bắt buộc)</li>
              <li><strong>Dự Án (Pháp lý)</strong> (Nếu có, phải khớp đúng tên dự án trên hệ thống)</li>
              <li><strong>Mã lô đất (Mã Lô Pháp Lý)</strong></li>
              <li><strong>Diện Tích (m²)</strong> (Số)</li>
              <li><strong>Mã công ty sở hữu</strong> (mã pháp nhân đã khai báo trong hệ thống) + <strong>Phân loại</strong> (CĐT/NĐT)</li>
            </ul>
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white p-12 text-center rounded-lg border border-gray-200">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Đang đọc file...</p>
        </div>
      )}

      {file && !loading && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200 flex items-center justify-between">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-gray-900">{file.name}</h3>
                <p className="text-xs text-gray-500">
                  Tổng số dòng: {parsedData.length} | Hợp lệ: <span className="text-green-600 font-semibold">{validCount}</span> | Trùng lặp: <span className="text-amber-600 font-semibold">{duplicateCount}</span> | Lỗi: <span className="text-red-600 font-semibold">{invalidCount}</span>
                </p>
              </div>
            </div>
            <button
              onClick={clearData}
              className="text-gray-400 hover:text-red-600 transition-colors p-2"
              title="Hủy file này"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số GCN</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dự án</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã Lô Pháp Lý</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Diện tích</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pháp nhân (mã CT)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parsedData.map((row, idx) => (
                    <tr key={idx} className={row.hasError ? 'bg-red-50' : row.isDuplicate ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {row.hasError ? (
                          <div className="flex items-center text-red-600" title={row.errorMessage}>
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            <span className="text-xs">{row.errorMessage}</span>
                          </div>
                        ) : row.isDuplicate ? (
                          <div className="flex items-center text-amber-600" title="GCN đã tồn tại trên hệ thống, sẽ bị bỏ qua">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            <span className="text-xs">Đã tồn tại</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-green-600">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            <span className="text-xs">Hợp lệ</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.certificate_no || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.projectName || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.legal_lot_code || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.area || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.companyCode || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm font-medium text-blue-700">
                {isImporting ? `Đang nhập lô dữ liệu... ${importProgress.current}/${importProgress.total} dòng` : ''}
              </div>
              <button
                onClick={handleImport}
                disabled={validCount === 0 || isImporting}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isImporting ? 'Đang Import...' : `Xác nhận Import (${validCount} GCN)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;