import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Asset, CustodyStatus, LifecycleStatus, SaleStatus, MortgageStatus } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImport: (assets: Partial<Asset>[]) => Promise<void>;
  projects: any[];
  warehouses: any[];
}

export const ImportExcelModal: React.FC<Props> = ({ isOpen, onClose, onImport, projects, warehouses }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<Partial<Asset>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
      setParsedData([]);
      parseExcel(e.target.files[0]);
    }
  };

  const parseExcel = async (file: File) => {
    try {
      setLoading(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet) as any[];

      // MAPPING EXCEL COLUMNS TO ASSET MODEL
      // Assuming a generic template for now
      const newAssets: Partial<Asset>[] = jsonData.map(row => {
        // Find project by name exactly
        const project = projects.find(p => p.name === row['Dự án']);
        // Find warehouse by name
        const warehouse = warehouses.find(w => w.name === row['Đơn vị quản lý sổ']);

        return {
          certificate_no: row['Số CN QSDĐ']?.toString() || '',
          project_id: project?.id || null,
          subdivision: row['Phân Khu']?.toString() || null,
          lot_no: row['Số thửa/lô']?.toString() || null,
          asset_type: row['Loại tài sản']?.toString() || 'Đất nền',
          area: parseFloat(row['Diện tích (m2)']) || parseFloat(row['Diện tích (m²)']) || 0,
          owner_name: row['Chủ sở hữu']?.toString() || '',
          land_lot_no: row['Thửa đất số']?.toString() || null,
          map_sheet_no: row['Tờ bản đồ']?.toString() || null,
          warehouse_id: warehouse?.id || null,
          custody_status: 'in_stock' as CustodyStatus,
          lifecycle_status: 'active' as LifecycleStatus,
          sale_status: 'not_ready' as SaleStatus,
          mortgage_status: (row['Tình trạng thế chấp'] === 'Đã thế chấp' ? 'mortgaged' : 'none') as MortgageStatus,
          notes: row['Ghi chú']?.toString() || null,
        };
      }).filter(a => a.certificate_no);

      if (newAssets.length === 0) {
        setError('Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại cấu trúc cột (Số CN QSDĐ, Dự án...).');
      } else {
        setParsedData(newAssets);
      }
    } catch (err: any) {
      setError('Lỗi đọc file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setLoading(true);
    try {
      await onImport(parsedData);
      onClose();
    } catch (err: any) {
      setError('Lỗi khi import vào database: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="relative inline-block w-full max-w-xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-[#1E3A8A]">Nhập Dữ Liệu GCN Hàng Loạt</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500 focus:outline-none">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="mt-2">
            {!file ? (
              <div 
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-10 h-10 mb-3 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Nhấn để tải lên</span> hoặc kéo thả file</p>
                  <p className="text-xs text-gray-500">Excel (.xlsx, .xls)</p>
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-100">
                <div className="flex items-center">
                  <FileSpreadsheet className="w-8 h-8 text-blue-600 mr-3" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-blue-900">{file.name}</h4>
                    <p className="text-xs text-blue-700 mt-1">
                      {loading ? 'Đang phân tích...' : `Đã quét được ${parsedData.length} GCN hợp lệ`}
                    </p>
                  </div>
                  <button 
                    onClick={() => { setFile(null); setParsedData([]); setError(null); }}
                    className="text-xs text-red-600 font-medium hover:text-red-800 bg-red-100 px-2 py-1 rounded"
                  >
                    Xóa file
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 bg-red-50 p-3 rounded-md flex items-start border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            {parsedData.length > 0 && !error && (
              <div className="mt-4 bg-emerald-50 p-3 rounded-md flex items-start border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700">Dữ liệu hợp lệ. Sẵn sàng import <b>{parsedData.length}</b> bản ghi vào hệ thống.</p>
              </div>
            )}
          </div>

          <div className="mt-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={loading || parsedData.length === 0}
              className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] border border-transparent rounded-md shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:w-auto disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang xử lý...
                </>
              ) : (
                <>Import Dữ liệu</>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex justify-center w-full px-4 py-2 mt-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
