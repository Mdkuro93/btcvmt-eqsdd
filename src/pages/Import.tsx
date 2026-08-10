import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, X } from 'lucide-react';
import { fetchProjects, importAssets } from '../api/assets';
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
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Expected headers: "Số GCN", "Tên dự án", "Phân khu", "Diện tích", "Chủ sở hữu"
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        // Map and validate
        const mappedData = rawData.map((row: any, index: number) => {
          const certificate_no = row['Số GCN']?.toString().trim();
          const projectName = row['Tên dự án']?.toString().trim();
          const subdivision = row['Phân khu']?.toString().trim() || null;
          const area = row['Diện tích'] ? parseFloat(row['Diện tích']) : null;
          const owner_name = row['Chủ sở hữu']?.toString().trim() || null;

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

          return {
            _originalRow: index + 2, // Excel rows are 1-indexed, and header is 1
            certificate_no,
            project_id,
            projectName, // Keep for display
            subdivision,
            area,
            owner_name,
            custody_status: 'in_stock',
            lifecycle_status: 'active',
            sale_status: 'not_ready',
            mortgage_status: 'none',
            hasError,
            errorMessage
          };
        });

        setParsedData(mappedData);
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
    const validData = parsedData.filter(d => !d.hasError);
    if (validData.length === 0) {
      toast.error('Không có dữ liệu hợp lệ để import');
      return;
    }

    setIsImporting(true);
    try {
      // Remove display-only fields before sending to DB
      const dbData = validData.map(d => {
        const { _originalRow, projectName, hasError, errorMessage, ...rest } = d;
        return rest;
      });

      await importAssets(dbData);
      toast.success(`Đã import thành công ${dbData.length} GCN!`);
      clearData();
    } catch (error: any) {
      console.error(error);
      toast.error('Lỗi khi import dữ liệu: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = parsedData.filter(d => !d.hasError).length;
  const invalidCount = parsedData.filter(d => d.hasError).length;

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Import dữ liệu GCN (Excel)</h1>
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
            <p className="font-semibold mb-2">Định dạng file yêu cầu (có hàng tiêu đề):</p>
            <ul className="list-disc list-inside">
              <li><strong>Số GCN</strong> (Bắt buộc)</li>
              <li><strong>Tên dự án</strong> (Nếu có, phải khớp đúng tên dự án trên hệ thống)</li>
              <li><strong>Phân khu</strong></li>
              <li><strong>Diện tích</strong> (Số)</li>
              <li><strong>Chủ sở hữu</strong></li>
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
                  Tổng số dòng dữ liệu: {parsedData.length} | Hợp lệ: <span className="text-green-600 font-semibold">{validCount}</span> | Lỗi: <span className="text-red-600 font-semibold">{invalidCount}</span>
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phân khu</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Diện tích</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chủ sở hữu</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parsedData.map((row, idx) => (
                    <tr key={idx} className={row.hasError ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {row.hasError ? (
                          <div className="flex items-center text-red-600" title={row.errorMessage}>
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            <span className="text-xs">{row.errorMessage}</span>
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.subdivision || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.area || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.owner_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end">
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
