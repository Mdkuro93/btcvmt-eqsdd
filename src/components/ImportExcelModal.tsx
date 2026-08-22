import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, Download, Table, RefreshCw, Sparkles, HelpCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { downloadExcelTemplate } from '../lib/excelHelper';
import { importExcelAndUpdateAssets } from '../api/assets';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: { id: string; email?: string; full_name?: string } | null;
}

export const ImportExcelModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, currentUser }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [importMode, setImportMode] = useState<'update_or_create' | 'update_only' | 'create_only'>('update_or_create');
  const [resultSummary, setResultSummary] = useState<{ updatedCount: number; createdCount: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setResultSummary(null);
      parseExcel(selectedFile);
    }
  };

  const parseExcel = async (fileToParse: File) => {
    try {
      setLoading(true);
      const data = await fileToParse.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json(sheet) as any[];

      if (!jsonRows || jsonRows.length === 0) {
        setError('File Excel không có dữ liệu hoặc định dạng rỗng.');
        setRawRows([]);
        return;
      }

      setRawRows(jsonRows);
    } catch (err: any) {
      setError('Lỗi khi đọc file Excel: ' + err.message);
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (rawRows.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await importExcelAndUpdateAssets(rawRows, currentUser, importMode);
      setResultSummary(result);
      if (result.errors.length === 0) {
        toast.success(`Nhập Excel thành công: ${result.updatedCount} cập nhật, ${result.createdCount} tạo mới!`);
      } else {
        toast.error(`Hoàn tất với ${result.errors.length} cảnh báo.`);
      }
      onSuccess();
    } catch (err: any) {
      setError('Lỗi khi lưu dữ liệu: ' + (err.message || 'Không xác định'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setRawRows([]);
    setError(null);
    setResultSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-900 to-indigo-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="text-base font-bold">Nhập Dữ Liệu & Cập Nhật Hàng Loạt Từ Excel</h3>
              <p className="text-xs text-blue-200">
                Hỗ trợ cập nhật Tên Dự Án Kinh Doanh, Mã Lô Kinh Doanh, Phân khu, Diện tích & Lưu vết Lịch sử
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Template Download Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-blue-900">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Chưa có file chuẩn mẫu? Tải file mẫu có sẵn cấu trúc cột <strong>Tên DA Kinh Doanh</strong> và <strong>Mã Lô Kinh Doanh</strong>.</span>
            </div>
            <button
              type="button"
              onClick={downloadExcelTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors shadow-xs shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Tải File Excel Mẫu
            </button>
          </div>

          {/* Upload Area or File Selected View */}
          {!file ? (
            <div
              className="flex flex-col items-center justify-center w-full h-48 border-2 border-blue-200 border-dashed rounded-2xl cursor-pointer bg-slate-50/50 hover:bg-blue-50/40 hover:border-blue-400 transition-all group"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 mb-3 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Nhấn để chọn file Excel hoặc kéo thả vào đây
                </p>
                <p className="text-xs text-slate-500 mt-1">Định dạng hỗ trợ: .xlsx, .xls</p>
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
            <div className="space-y-4">
              {/* File Info Bar */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{file.name}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Dung lượng: {(file.size / 1024).toFixed(1)} KB | Đã đọc được:{' '}
                      <strong className="text-blue-700">{rawRows.length} dòng dữ liệu</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                >
                  Đổi file khác
                </button>
              </div>

              {/* Mode Selection */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
                <label className="block text-xs font-bold text-slate-800">Chọn chế độ xử lý dữ liệu:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer text-xs transition-all ${
                    importMode === 'update_or_create' ? 'bg-blue-50/80 border-blue-400 text-blue-900 font-semibold' : 'bg-white border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'update_or_create'}
                      onChange={() => setImportMode('update_or_create')}
                      className="mt-0.5"
                    />
                    <div>
                      <div>Cập nhật & Thêm mới</div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">Khớp theo ID/Số GCN để cập nhật, nếu chưa có sẽ tạo mới</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer text-xs transition-all ${
                    importMode === 'update_only' ? 'bg-blue-50/80 border-blue-400 text-blue-900 font-semibold' : 'bg-white border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'update_only'}
                      onChange={() => setImportMode('update_only')}
                      className="mt-0.5"
                    />
                    <div>
                      <div>Chỉ Cập Nhật</div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">Chỉ ghi đè thuộc tính cho các GCN đã tồn tại trong hệ thống</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer text-xs transition-all ${
                    importMode === 'create_only' ? 'bg-blue-50/80 border-blue-400 text-blue-900 font-semibold' : 'bg-white border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'create_only'}
                      onChange={() => setImportMode('create_only')}
                      className="mt-0.5"
                    />
                    <div>
                      <div>Chỉ Thêm Mới</div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">Bỏ qua các GCN đã tồn tại, chỉ tạo bản ghi mới</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Data Preview */}
              {rawRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-blue-600" />
                      Xem trước dữ liệu ({Math.min(5, rawRows.length)} / {rawRows.length} dòng):
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Tất cả thay đổi sẽ ghi lại vào bảng <strong>audit_logs</strong>
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-48">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="py-2 px-3 whitespace-nowrap">#</th>
                          <th className="py-2 px-3 whitespace-nowrap">Số GCN QSDĐ</th>
                          <th className="py-2 px-3 whitespace-nowrap">Tên Dự Án Pháp Lý</th>
                          <th className="py-2 px-3 whitespace-nowrap text-emerald-800 bg-emerald-50">Tên DA Kinh Doanh</th>
                          <th className="py-2 px-3 whitespace-nowrap">Phân Khu</th>
                          <th className="py-2 px-3 whitespace-nowrap">Số Lô Pháp Lý</th>
                          <th className="py-2 px-3 whitespace-nowrap text-indigo-800 bg-indigo-50">Mã Lô Kinh Doanh</th>
                          <th className="py-2 px-3 whitespace-nowrap">Diện Tích (m²)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rawRows.slice(0, 5).map((row, idx) => {
                          const cert = row['Số GCN QSDĐ'] || row['Số GCN'] || row.certificate_no || row['Số CN QSDĐ'] || '—';
                          const proj = row['Dự Án (Pháp lý)'] || row['Dự Án'] || row.project_name || '—';
                          const bizProj = row['Tên Dự Án Kinh Doanh'] || row['Tên dự án kinh doanh'] || row.business_project_name || '—';
                          const subdiv = row['Phân Khu'] || row['Phân khu'] || row.subdivision || '—';
                          const lot = row['Số Lô / Thửa (Mã Lô Pháp Lý)'] || row['Số Lô'] || row['Số thửa/lô'] || row.lot_no || '—';
                          const bizPlot = row['Mã Lô Kinh Doanh'] || row['Mã lô kinh doanh'] || row.business_plot_code || '—';
                          const area = row['Diện Tích (m²)'] || row['Diện tích (m2)'] || row.area || '—';

                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 text-slate-600">{idx + 1}</td>
                              <td className="py-2 px-3 font-mono font-medium text-blue-900">{cert}</td>
                              <td className="py-2 px-3 text-slate-700">{proj}</td>
                              <td className="py-2 px-3 font-semibold text-emerald-700 bg-emerald-50/50">{bizProj}</td>
                              <td className="py-2 px-3 text-slate-700">{subdiv}</td>
                              <td className="py-2 px-3 text-slate-700">{lot}</td>
                              <td className="py-2 px-3 font-mono font-bold text-indigo-700 bg-indigo-50/50">{bizPlot}</td>
                              <td className="py-2 px-3 text-slate-700">{area}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Result Summary Box */}
              {resultSummary && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Kết quả xử lý file:
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-emerald-800">
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                      Đã cập nhật thông tin: <strong className="text-base text-emerald-700">{resultSummary.updatedCount}</strong> GCN
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                      Đã tạo mới bản ghi: <strong className="text-base text-blue-700">{resultSummary.createdCount}</strong> GCN
                    </div>
                  </div>
                  {resultSummary.errors.length > 0 && (
                    <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                      <strong>Cảnh báo ({resultSummary.errors.length}):</strong>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                        {resultSummary.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500">
            Hỗ trợ đối soát và kiểm tra trùng lặp tự động
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
            >
              {resultSummary ? 'Đóng' : 'Hủy bỏ'}
            </button>

            {file && !resultSummary && (
              <button
                type="button"
                onClick={handleImport}
                disabled={loading || rawRows.length === 0}
                className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang xử lý {rawRows.length} dòng...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 mr-1.5" />
                    Bắt đầu Nhập {rawRows.length} Dòng
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
