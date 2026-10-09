import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  X,
  RotateCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import {
  BulkUpdateMode,
  sanitizeRowData,
  BulkProjectItem,
  listBulkUpdateProjects
} from '../../api/bulkUpdate';
import { BULK_MODES_CONFIG } from '../../utils/bulkUpdateExcel';

interface Props {
  selectedMode: BulkUpdateMode;
  file: File | null;
  parsedRows: Record<string, any>[];
  recognizedColumns: string[];
  unrecognizedColumns: string[];
  missingRequiredColumns: string[];
  onFileProcessed: (
    file: File | null,
    rows: Record<string, any>[],
    recognized: string[],
    unrecognized: string[],
    missing: string[]
  ) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Chuẩn hóa tiêu đề cột Excel:
 * Nhận cả 3 dạng:
 * 1. Khóa trần tiếng Anh: asset_code
 * 2. Tên VN kèm khóa trong ngoặc: Mã tài sản (asset_code) hoặc Mã tài sản * (asset_code)
 * 3. Tên tiếng Việt thuần: Mã tài sản hoặc Mã tài sản *
 */
function normalizeHeader(h: string, allowedKeys: Set<string>, labelToKey: Map<string, string>): string {
  const s = String(h ?? '').trim();
  if (allowedKeys.has(s.toLowerCase())) return s.toLowerCase(); // Khóa trần: asset_code
  const m = s.match(/\(([a-z0-9_]+)\)\s*$/i);                   // "Tên VN (asset_code)"
  if (m) return m[1].toLowerCase();
  const k = labelToKey.get(s.replace(/\s*\*\s*$/, '').trim().toLowerCase()); // Chỉ có tên tiếng Việt
  return k ?? s;                                                // Không nhận ra: giữ nguyên để báo "cột không dùng"
}

export const FileUploadStep: React.FC<Props> = ({
  selectedMode,
  file,
  parsedRows,
  recognizedColumns,
  unrecognizedColumns,
  missingRequiredColumns,
  onFileProcessed,
  onPrev,
  onNext,
}) => {
  const config = BULK_MODES_CONFIG[selectedMode];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  // Trạng thái kiểm tra dự án từng dòng (Prompt 12 Mục 1, Prompt 13 Mục A.3)
  const [isCheckingProjects, setIsCheckingProjects] = useState(false);
  const [projectCheckError, setProjectCheckError] = useState<string | null>(null);
  const [emptyProjectRows, setEmptyProjectRows] = useState<number[]>([]);
  const [invalidProjectNames, setInvalidProjectNames] = useState<
    { row: number; input: string; suggestions: string[] }[]
  >([]);

  // Hàm kiểm tra dự án từng dòng trước khi cho xem trước (Prompt 12 Mục 1, Prompt 13 Mục A.3)
  const checkProjectData = async (rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) {
      setEmptyProjectRows([]);
      setInvalidProjectNames([]);
      setProjectCheckError(null);
      setIsCheckingProjects(false);
      return;
    }

    setIsCheckingProjects(true);
    setProjectCheckError(null);

    // 1. Kiểm tra project_name trống (luôn kiểm tra dù danh mục có tải được hay không)
    const emptyRows: number[] = [];
    rows.forEach((row, idx) => {
      const pName = row.project_name !== undefined && row.project_name !== null
        ? String(row.project_name).trim()
        : '';
      if (!pName) {
        emptyRows.push(idx + 1);
      }
    });

    let directory: BulkProjectItem[] | null = null;
    let loadErr: string | null = null;

    try {
      directory = await listBulkUpdateProjects();
    } catch (err: any) {
      loadErr = err.message || 'Không thể tải danh mục dự án từ máy chủ.';
    }

    if (!directory) {
      // Nếu tải danh mục lỗi: bỏ qua so khớp danh mục, hiện cảnh báo vàng; mục 2 (ô trống) VẪN chặn.
      setProjectCheckError(loadErr);
      setEmptyProjectRows(emptyRows);
      setInvalidProjectNames([]);
      setIsCheckingProjects(false);
      return;
    }

    // So khớp chuẩn hóa NFC, trim, gộp khoảng trắng thừa, chữ thường
    const normName = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
    const stripTone = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();

    const projectByName = new Map<string, BulkProjectItem>();

    for (const p of directory) {
      projectByName.set(normName(p.name), p);
    }

    const invalidNames: { row: number; input: string; suggestions: string[] }[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const rawName = row.project_name !== undefined && row.project_name !== null
        ? String(row.project_name).trim()
        : '';

      if (rawName) {
        const matchedProj = projectByName.get(normName(rawName));
        if (!matchedProj) {
          // Tên dự án không có trong danh mục: tìm tối đa 3 gợi ý so không dấu
          const needle = stripTone(rawName);
          const suggestions: string[] = [];
          for (const p of directory!) {
            const haystack = stripTone(p.name);
            if (haystack.includes(needle) || needle.includes(haystack)) {
              suggestions.push(p.name);
              if (suggestions.length >= 3) break;
            }
          }
          invalidNames.push({ row: rowNum, input: rawName, suggestions });
        }
      }
    });

    setEmptyProjectRows(emptyRows);
    setInvalidProjectNames(invalidNames);
    setIsCheckingProjects(false);
  };

  // Tự động kiểm tra nếu quay lại bước 3 với dữ liệu đã có
  useEffect(() => {
    if (file && parsedRows.length > 0 && emptyProjectRows.length === 0 && !isCheckingProjects && !projectCheckError) {
      checkProjectData(parsedRows);
    }
  }, []);

  const validateAndParseFile = (selectedFile: File) => {
    // 1. Kiểm tra định dạng đuôi file
    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Chỉ chấp nhận file định dạng Excel (.xlsx).');
      return;
    }

    // 2. Giới hạn dung lượng tối đa 5 MB
    const maxSizeBytes = 5 * 1024 * 1024;
    if (selectedFile.size > maxSizeBytes) {
      toast.error('Dung lượng file vượt quá giới hạn cho phép (tối đa 5 MB).');
      return;
    }

    setIsParsing(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('File Excel không có sheet dữ liệu nào.');
        }

        const worksheet = workbook.Sheets[firstSheetName];

        // 4. Chuẩn hóa tiêu đề cột & tự động dò dòng tiêu đề (kể cả file có 2 dòng tiêu đề)
        const allowedKeys = new Set([...config.requiredKeys, ...config.optionalKeys].map((k) => k.toLowerCase()));
        const labelToKey = new Map<string, string>();
        for (const g of config.guides) {
          const cleanName = g.name.replace(/\s*\*\s*$/, '').trim().toLowerCase();
          labelToKey.set(cleanName, g.key);
          if (g.key === 'business_project_name') {
            labelToKey.set('tên dự án kinh doanh', g.key);
          }
        }
        // Bổ sung các nhãn tiếng Việt phổ biến
        labelToKey.set('kho', 'warehouse_name');
        labelToKey.set('kho lưu giữ', 'warehouse_name');
        labelToKey.set('kho lưu trữ', 'warehouse_name');
        labelToKey.set('mã lô pháp lý', 'legal_lot_code');
        labelToKey.set('mã lô', 'legal_lot_code');
        labelToKey.set('loại ts', 'asset_type');
        labelToKey.set('mã loại ts', 'collateral_type');
        labelToKey.set('mã cty cđt/nđt', 'company_code');
        labelToKey.set('mã công ty', 'company_code');
        labelToKey.set('mã công ty sở hữu', 'company_code');
        labelToKey.set('phân loại chủ', 'owner_role');
        labelToKey.set('vai trò chủ', 'owner_role');
        labelToKey.set('phân loại', 'owner_role');
        labelToKey.set('số vào sổ', 'registry_no');
        labelToKey.set('số thửa bản đồ', 'land_lot_no');
        labelToKey.set('số tờ bản đồ', 'map_sheet_no');
        labelToKey.set('mục đích', 'usage_purpose');
        labelToKey.set('đơn vị quản lý sổ', 'managing_unit');

        const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
        if (!rawMatrix || rawMatrix.length === 0) {
          toast.error('File Excel không có dòng dữ liệu nào.');
          setIsParsing(false);
          return;
        }

        // Tự dò dòng tiêu đề trong 10 dòng đầu
        let headerRowIdx = 0;
        let maxMatches = 0;
        const scanLimit = Math.min(10, rawMatrix.length);
        for (let r = 0; r < scanLimit; r++) {
          const rowCells = (rawMatrix[r] || []).map((c: any) => String(c ?? '').trim());
          let matches = 0;
          for (const cell of rowCells) {
            const norm = normalizeHeader(cell, allowedKeys, labelToKey);
            if (allowedKeys.has(norm)) {
              matches++;
            }
          }
          if (matches > maxMatches) {
            maxMatches = matches;
            headerRowIdx = r;
          }
        }

        // Đọc raw json từ dòng tiêu đề đã dò thấy
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIdx, defval: null });

        if (!rawJson || rawJson.length === 0) {
          toast.error('File Excel không có dòng dữ liệu nào.');
          setIsParsing(false);
          return;
        }

        // Lọc bỏ các dòng hoàn toàn trống
        const nonEmptyRows = rawJson.filter((row) =>
          Object.values(row).some((val) => val !== null && val !== undefined && String(val).trim() !== '')
        );

        if (nonEmptyRows.length === 0) {
          toast.error('File Excel không có dữ liệu thực tế (các dòng đều trống).');
          setIsParsing(false);
          return;
        }

        // 3. Giới hạn tối đa 5.000 dòng dữ liệu
        if (nonEmptyRows.length > 5000) {
          toast.error(
            `File có ${nonEmptyRows.length.toLocaleString('vi-VN')} dòng dữ liệu, vượt quá giới hạn tối đa 5.000 dòng.`
          );
          setIsParsing(false);
          return;
        }

        const rawHeaders = Object.keys(nonEmptyRows[0] || {}).map((h) => h.trim());
        const headerMapping = new Map<string, string>(); // rawHeader -> normKey
        const normKeyToRawHeaders = new Map<string, string[]>(); // normKey -> list of rawHeaders

        for (const rawH of rawHeaders) {
          const normKey = normalizeHeader(rawH, allowedKeys, labelToKey);
          headerMapping.set(rawH, normKey);
          if (allowedKeys.has(normKey)) {
            const list = normKeyToRawHeaders.get(normKey) || [];
            list.push(rawH);
            normKeyToRawHeaders.set(normKey, list);
          }
        }

        // Kiểm tra nếu hai tiêu đề cùng quy về một khóa -> báo lỗi cột bị lặp
        const duplicateErrors: string[] = [];
        for (const [normKey, rawList] of normKeyToRawHeaders.entries()) {
          if (rawList.length > 1) {
            duplicateErrors.push(`Cột bị lặp: ${normKey} (${rawList.join(', ')})`);
          }
        }

        if (duplicateErrors.length > 0) {
          const errMsg = duplicateErrors.join('; ');
          toast.error(errMsg);
          onFileProcessed(selectedFile, [], [], [], duplicateErrors);
          setIsParsing(false);
          return;
        }

        // Đổi tên khóa của từng dòng sau sheet_to_json sang khóa chuẩn (chỉ giữ các cột được nhận diện hợp lệ)
        const transformedRows = nonEmptyRows.map((row) => {
          const newRow: Record<string, any> = {};
          for (const [rawKey, val] of Object.entries(row)) {
            const normKey = headerMapping.get(rawKey.trim()) || rawKey.trim();
            if (allowedKeys.has(normKey)) {
              newRow[normKey] = val;
            }
          }

          // Chuẩn hóa nhóm sổ cho tiếng Việt
          if (newRow.certificate_group !== undefined && newRow.certificate_group !== null) {
            const g = String(newRow.certificate_group).trim().toLowerCase();
            if (g.includes('lớn') || g.includes('lon') || g.includes('mẹ') || g === 'so_lon') {
              newRow.certificate_group = 'so_lon';
            } else if (g.includes('nhỏ') || g.includes('nho') || g.includes('con') || g === 'so_nho') {
              newRow.certificate_group = 'so_nho';
            }
          }

          // Chuẩn hóa generate_receipt
          if (newRow.generate_receipt !== undefined && newRow.generate_receipt !== null) {
            const gen = String(newRow.generate_receipt).trim().toLowerCase();
            if (['có', 'co', 'yes', 'y', 'true', '1'].includes(gen)) {
              newRow.generate_receipt = 'true';
            } else if (['không', 'khong', 'no', 'n', 'false', '0'].includes(gen)) {
              newRow.generate_receipt = 'false';
            }
          }

          // Chuẩn hóa owner_role
          if (newRow.owner_role !== undefined && newRow.owner_role !== null) {
            const r = String(newRow.owner_role).trim().toLowerCase();
            if (r.includes('chủ đầu tư') || r === 'cdt') {
              newRow.owner_role = 'cdt';
            } else if (r.includes('nhà đầu tư') || r === 'ndt') {
              newRow.owner_role = 'ndt';
            }
          }

          // Chuẩn hóa usage_term_type
          if (newRow.usage_term_type !== undefined && newRow.usage_term_type !== null) {
            const ut = String(newRow.usage_term_type).trim().toLowerCase();
            if (ut.includes('lâu dài') || ut === 'long_term') {
              newRow.usage_term_type = 'long_term';
            } else if (ut.includes('thời hạn') || ut === 'fixed_date') {
              newRow.usage_term_type = 'fixed_date';
            }
          }

          return newRow;
        });

        // Phân loại cột nhận diện / cột không dùng
        const normalizedHeaders = Array.from(new Set(Array.from(headerMapping.values())));
        const recognized = normalizedHeaders.filter((h) => allowedKeys.has(h));
        const unrecognized = normalizedHeaders.filter((h) => !allowedKeys.has(h));

        // Kiểm tra các cột bắt buộc
        const missing: string[] = [];
        for (const reqKey of config.requiredKeys) {
          if (!recognized.includes(reqKey)) {
            missing.push(reqKey);
          }
        }

        // Đối với chế độ 'owner': bắt buộc phải có ít nhất 1 trong 2 cột new_owner_code hoặc new_owner_name
        if (selectedMode === 'owner') {
          const hasOwnerCode = recognized.includes('new_owner_code');
          const hasOwnerName = recognized.includes('new_owner_name');
          if (!hasOwnerCode && !hasOwnerName) {
            missing.push('new_owner_code hoặc new_owner_name');
          }
        }

        // Chuẩn hóa từng dòng dữ liệu theo số / ngày / cắt khoảng trắng
        const sanitized = transformedRows.map((row) =>
          sanitizeRowData(row, config.numberKeys, config.dateKeys)
        );

        onFileProcessed(selectedFile, sanitized, recognized, unrecognized, missing);

        if (missing.length === 0) {
          toast.success(`Đã đọc ${sanitized.length.toLocaleString('vi-VN')} dòng dữ liệu.`);
          // 1. Gọi kiểm tra dự án từng dòng ngay khi đọc xong file (Prompt 12 Mục 1)
          await checkProjectData(sanitized);
        } else {
          toast.error(`Thiếu ${missing.length} cột bắt buộc.`);
        }
      } catch (err: any) {
        console.error('Lỗi phân tích file Excel:', err);
        toast.error(err.message || 'Lỗi đọc file Excel. Vui lòng kiểm tra lại file.');
      } finally {
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
      toast.error('Không thể đọc file. Vui lòng thử lại.');
      setIsParsing(false);
    };

    reader.readAsArrayBuffer(selectedFile);
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
      validateAndParseFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      validateAndParseFile(f);
    }
  };

  const handleClearFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    onFileProcessed(null, [], [], [], []);
    setEmptyProjectRows([]);
    setInvalidProjectNames([]);
    setProjectCheckError(null);
  };

  const hasMissing = missingRequiredColumns.length > 0;
  const hasProjectErrors =
    emptyProjectRows.length > 0 ||
    invalidProjectNames.length > 0;

  const canProceed =
    file &&
    parsedRows.length > 0 &&
    !hasMissing &&
    !isParsing &&
    !isCheckingProjects &&
    !hasProjectErrors;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              Bước 3 / 6
            </span>
            <h2 className="text-base font-bold text-gray-900">
              Tải file dữ liệu Excel: {config.title}
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Chọn hoặc kéo thả file Excel (.xlsx) chứa dữ liệu cần cập nhật. Dung lượng tối đa <b>5 MB</b> và không quá <b>5.000 dòng</b>.
          </p>
        </div>

        {/* Khu vực kéo thả / chọn file */}
        <div className="my-6">
          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
                  {isParsing ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {isParsing ? 'Đang đọc và phân tích file...' : 'Nhấn để chọn file hoặc kéo thả vào đây'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Chỉ nhận file định dạng Excel <b>.xlsx</b> (tối đa 5 MB, 5.000 dòng)
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Dung lượng: {(file.size / 1024).toFixed(1)} KB • Số dòng dữ liệu: {parsedRows.length.toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClearFile}
                className="p-1.5 hover:bg-gray-200 text-gray-500 hover:text-gray-800 rounded-lg transition-colors"
                title="Chọn lại file khác"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Phản hồi nhận diện cột và kiểm tra dự án từng dòng */}
          {file && (
            <div className="mt-4 space-y-3">
              {/* Trạng thái đang kiểm tra dự án */}
              {isCheckingProjects && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center space-x-2.5 text-xs text-blue-900">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />
                  <span>Đang đối chiếu dự án từng dòng với danh mục hệ thống...</span>
                </div>
              )}

              {/* Cảnh báo nếu tải danh mục lỗi */}
              {projectCheckError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-3 text-xs text-amber-900">
                  <div className="flex items-start space-x-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Cảnh báo:</p>
                      <p className="mt-0.5">Không tải được danh mục dự án, hệ thống chỉ đối chiếu ở máy chủ.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => checkProjectData(parsedRows)}
                    disabled={isCheckingProjects}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold flex-shrink-0"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Thử lại</span>
                  </button>
                </div>
              )}

              {/* Lỗi chặn 1: Thiếu tên dự án */}
              {emptyProjectRows.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2.5 text-xs text-rose-900">
                  <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Lỗi chặn: Thiếu tên dự án ở {emptyProjectRows.length} dòng:</p>
                    <p className="mt-1 font-mono text-[11px] text-rose-800">
                      Dòng dữ liệu thứ {emptyProjectRows.slice(0, 20).join(', ')}{emptyProjectRows.length > 20 ? '…' : ''}
                    </p>
                    <p className="mt-1 text-gray-600">Vui lòng điền đầy đủ Tên dự án cho tất cả các dòng.</p>
                  </div>
                </div>
              )}

              {/* Lỗi chặn 2: Tên dự án không có trong danh mục */}
              {invalidProjectNames.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2.5 text-xs text-rose-900">
                  <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Lỗi chặn: Tên dự án không có trong danh mục ({invalidProjectNames.length} dòng):</p>
                    <div className="mt-1.5 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px] text-rose-800">
                      {invalidProjectNames.slice(0, 20).map((item, idx) => (
                        <div key={idx}>
                          • Dòng #{item.row}: "{item.input}"
                          {item.suggestions.length > 0 && (
                            <span className="font-sans text-gray-700 ml-1">
                              (Gợi ý: <b>{item.suggestions.join(', ')}</b>)
                            </span>
                          )}
                        </div>
                      ))}
                      {invalidProjectNames.length > 20 && <div>... và {invalidProjectNames.length - 20} dòng khác</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* Nút tải lại danh mục và kiểm tra lại nếu có lỗi */}
              {(hasProjectErrors || projectCheckError) && !isCheckingProjects && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => checkProjectData(parsedRows)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Tải lại danh mục và kiểm tra lại</span>
                  </button>
                </div>
              )}

              {/* Cảnh báo thiếu cột bắt buộc */}
              {hasMissing && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2.5">
                  <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900 leading-relaxed">
                    <p className="font-bold">Thiếu hoặc lỗi cột bắt buộc:</p>
                    <p className="mt-0.5 font-mono font-medium text-rose-800">
                      {missingRequiredColumns.join('; ')}
                    </p>
                    <p className="mt-1 text-gray-600">
                      Vui lòng bổ sung đúng tên cột vào dòng 1 của file Excel rồi tải lại file.
                    </p>
                  </div>
                </div>
              )}

              {/* Cột không dùng */}
              {unrecognizedColumns.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold">Cột không dùng (sẽ được bỏ qua):</p>
                    <p className="mt-0.5 font-mono text-amber-800">
                      {unrecognizedColumns.join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Cột nhận diện hợp lệ */}
              {recognizedColumns.length > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-900 leading-relaxed">
                    <p className="font-bold">Cột hợp lệ được nhận diện ({recognizedColumns.length}):</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {recognizedColumns.map((col) => (
                        <span
                          key={col}
                          className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-mono text-[11px] rounded"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nút điều hướng */}
        <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại: Tải mẫu</span>
          </button>

          <button
            type="button"
            disabled={!canProceed}
            onClick={onNext}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center space-x-2 transition-colors ${
              canProceed
                ? 'bg-[#1E3A8A] hover:bg-blue-800 text-white cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span>
              {isCheckingProjects
                ? 'Đang kiểm tra...'
                : hasProjectErrors
                ? 'Vui lòng sửa lỗi dự án'
                : `Bắt đầu xem trước (${parsedRows.length.toLocaleString('vi-VN')} dòng)`}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
