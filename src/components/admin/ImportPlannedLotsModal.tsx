import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, UploadCloud, Download, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { Asset, PlannedLandLotImportRow, PlannedLandLotImportResult } from '../../types';
import { importPlannedLandLots } from '../../api/plannedLandLots';

const TEMPLATE_HEADERS = [
  'Mã Lô Pháp Lý',
  'Số thửa',
  'Số tờ bản đồ',
  'Diện tích dự kiến',
  'Mã Lô Kinh Doanh',
  'Tên Dự Án Kinh Doanh',
  'Ghi chú',
] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  parentAsset: Asset;
}

function toImportRow(raw: any): PlannedLandLotImportRow {
  return {
    legal_lot_code: String(raw['Mã Lô Pháp Lý'] ?? '').trim(),
    land_lot_no: raw['Số thửa'] != null ? String(raw['Số thửa']).trim() : undefined,
    map_sheet_no: raw['Số tờ bản đồ'] != null ? String(raw['Số tờ bản đồ']).trim() : undefined,
    planned_area: raw['Diện tích dự kiến'] ?? '',
    business_plot_code: raw['Mã Lô Kinh Doanh'] != null ? String(raw['Mã Lô Kinh Doanh']).trim() : undefined,
    business_project_name: raw['Tên Dự Án Kinh Doanh'] != null ? String(raw['Tên Dự Án Kinh Doanh']).trim() : undefined,
    notes: raw['Ghi chú'] != null ? String(raw['Ghi chú']).trim() : undefined,
  };
}

export const ImportPlannedLotsModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, parentAsset }) => {
  const [rows, setRows] = useState<PlannedLandLotImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<PlannedLandLotImportResult | null>(null);
  const [finalResult, setFinalResult] = useState<PlannedLandLotImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setRows([]);
    setFileName('');
    setPreview(null);
    setFinalResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Mã Lô Pháp Lý': 'LK02-15',
        'Số thửa': '123',
        'Số tờ bản đồ': '5',
        'Diện tích dự kiến': 105.5,
        'Mã Lô Kinh Doanh': 'LK02-15',
        'Tên Dự Án Kinh Doanh': 'Cồn Dầu',
        'Ghi chú': '',
      },
    ], { header: TEMPLATE_HEADERS as unknown as string[] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lô quy hoạch');
    XLSX.writeFile(wb, `Mau_Lo_Quy_Hoach_${parentAsset.certificate_no}.xlsx`);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setPreview(null);
    setFinalResult(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(sheet) as any[];
      if (!jsonRows.length) {
        toast.error('File Excel không có dữ liệu.');
        return;
      }
      if (jsonRows.length > 1000) {
        toast.error('Chỉ hỗ trợ tối đa 1000 dòng mỗi lần nhập.');
        return;
      }
      const parsed = jsonRows.map(toImportRow);
      setRows(parsed);
      setChecking(true);
      const result = await importPlannedLandLots(parentAsset.id, parsed, true);
      setPreview(result);
    } catch (err: any) {
      toast.error('Lỗi khi đọc file Excel: ' + (err.message || 'Không xác định'));
    } finally {
      setChecking(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview?.success || rows.length === 0) return;
    setImporting(true);
    try {
      const result = await importPlannedLandLots(parentAsset.id, rows, false);
      setFinalResult(result);
      if (result.success) {
        toast.success(`Đã nhập ${result.inserted} lô quy hoạch.`);
        onSuccess();
      } else {
        toast.error('Có lỗi phát sinh, chưa nhập dòng nào.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Nhập dữ liệu thất bại.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-gray-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-[#1E3A8A]" /> Import Excel — Lô quy hoạch
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Sổ lớn gốc: <span className="font-semibold">{parentAsset.certificate_no}</span>
              {parentAsset.asset_code ? ` (${parentAsset.asset_code})` : ''}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:bg-gray-100 p-2 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A] hover:underline cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Tải file mẫu Excel
          </button>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-[#1E3A8A] hover:bg-blue-50/30 transition-colors"
          >
            <FileSpreadsheet className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">{fileName || 'Bấm để chọn file Excel (.xlsx)'}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {checking && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Đang kiểm tra dữ liệu...
            </div>
          )}

          {preview && !finalResult && (
            <div className="space-y-2">
              {preview.errors.length > 0 ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 space-y-1 max-h-48 overflow-y-auto">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4" /> {preview.errors.length} lỗi — chưa nhập dòng nào, sửa file rồi tải lại
                  </div>
                  {preview.errors.map((e, i) => (
                    <div key={i} className="text-xs">Dòng {e.row} ({e.field}): {e.message}</div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Hợp lệ: sẵn sàng nhập {preview.would_insert ?? rows.length} lô.
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                  {preview.warnings.map((w, i) => <div key={i}>⚠ {w.message}</div>)}
                </div>
              )}
            </div>
          )}

          {finalResult && (
            <div className={`p-3 rounded-xl text-sm ${finalResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
              {finalResult.success
                ? `Đã nhập thành công ${finalResult.inserted} lô quy hoạch.`
                : `Có lỗi, chưa nhập dòng nào. Vui lòng sửa file và thử lại.`}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
          <button onClick={handleClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">
            Đóng
          </button>
          {preview?.success && !finalResult && (
            <button
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Xác nhận nhập {preview.would_insert ?? rows.length} lô
            </button>
          )}
        </div>
      </div>
    </div>
  );
};