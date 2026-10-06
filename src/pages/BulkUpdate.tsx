import React, { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Layers } from 'lucide-react';
import {
  BulkUpdateMode,
  BulkRowResult,
  BulkProjectItem,
  runInChunks,
  bulkCorrectAssets,
  createReissueRequestsBulk,
} from '../api/bulkUpdate';
import { BulkUpdateStepper } from '../components/bulk-update/BulkUpdateStepper';
import { ModeSelectionStep } from '../components/bulk-update/ModeSelectionStep';
import { TemplateDownloadStep } from '../components/bulk-update/TemplateDownloadStep';
import { FileUploadStep } from '../components/bulk-update/FileUploadStep';
import { PreviewStep } from '../components/bulk-update/PreviewStep';
import { ConfirmStep } from '../components/bulk-update/ConfirmStep';
import { ExecutionStep } from '../components/bulk-update/ExecutionStep';

export const BulkUpdate: React.FC = () => {
  // Stepper state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxAccessibleStep, setMaxAccessibleStep] = useState<number>(1);

  // Dữ liệu nghiệp vụ
  const [selectedMode, setSelectedMode] = useState<BulkUpdateMode>('info');
  const [projects, setProjects] = useState<BulkProjectItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [recognizedColumns, setRecognizedColumns] = useState<string[]>([]);
  const [unrecognizedColumns, setUnrecognizedColumns] = useState<string[]>([]);
  const [missingRequiredColumns, setMissingRequiredColumns] = useState<string[]>([]);

  // Xem trước
  const [previewResults, setPreviewResults] = useState<BulkRowResult[]>([]);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [previewProgress, setPreviewProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  // Xác nhận & Lý do
  const [reason, setReason] = useState<string>('');

  // Thực thi
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [executedResults, setExecutedResults] = useState<BulkRowResult[]>([]);
  const [abortedInfo, setAbortedInfo] = useState<{ abortedAt: number; abortMessage: string } | null>(null);
  const [hasUncertainRows, setHasUncertainRows] = useState<boolean>(false);

  const stepperItems = [
    { id: 1, title: '1. Chọn loại' },
    { id: 2, title: '2. Tải mẫu' },
    { id: 3, title: '3. Tải file' },
    { id: 4, title: '4. Xem trước' },
    { id: 5, title: '5. Xác nhận' },
    { id: 6, title: '6. Áp dụng' },
  ];

  // Chuyển bước với cập nhật mốc truy cập cao nhất
  const goToStep = (stepId: number) => {
    setCurrentStep(stepId);
    if (stepId > maxAccessibleStep) {
      setMaxAccessibleStep(stepId);
    }
  };

  // Chọn chế độ
  const handleSelectMode = (mode: BulkUpdateMode) => {
    if (mode !== selectedMode) {
      setSelectedMode(mode);
      // Reset file và kết quả khi đổi chế độ
      setFile(null);
      setParsedRows([]);
      setRecognizedColumns([]);
      setUnrecognizedColumns([]);
      setMissingRequiredColumns([]);
      setPreviewResults([]);
      setExecutedResults([]);
      setAbortedInfo(null);
      setHasUncertainRows(false);
      setMaxAccessibleStep(2);
    }
  };

  // Sau khi tải và phân tích file
  const handleFileProcessed = (
    f: File | null,
    rows: Record<string, any>[],
    recognized: string[],
    unrecognized: string[],
    missing: string[]
  ) => {
    setFile(f);
    setParsedRows(rows);
    setRecognizedColumns(recognized);
    setUnrecognizedColumns(unrecognized);
    setMissingRequiredColumns(missing);
    // Reset kết quả xem trước
    setPreviewResults([]);
    setExecutedResults([]);
    setAbortedInfo(null);
    setHasUncertainRows(false);

    if (f && rows.length > 0 && missing.length === 0) {
      setMaxAccessibleStep(3);
    } else {
      setMaxAccessibleStep(3);
    }
  };

  // Chạy xem trước (gọi RPC với apply = false)
  const handleStartPreview = async () => {
    if (!parsedRows || parsedRows.length === 0) {
      toast.error('Chưa có dữ liệu để xem trước.');
      return;
    }

    goToStep(4);
    setIsPreviewing(true);
    setPreviewProgress({ current: 0, total: parsedRows.length });

    try {
      const res = await runInChunks(
        parsedRows,
        500,
        async (chunk) => {
          if (selectedMode === 'reissue') {
            return await createReissueRequestsBulk(chunk, null, false);
          } else {
            return await bulkCorrectAssets(selectedMode, chunk, null, false);
          }
        },
        (current, total) => {
          setPreviewProgress({ current, total });
        },
        false // isApply = false
      );

      setPreviewResults(res.results);

      if (res.abortedAt && res.abortMessage) {
        toast.error(`Quá trình kiểm tra bị dừng sau dòng ${res.abortedAt - 1}: ${res.abortMessage}`);
      }

      const validCount = res.results.filter((r) => r.status === 'ok').length;
      if (validCount > 0) {
        setMaxAccessibleStep(5);
        toast.success(`Xem trước hoàn tất: ${validCount.toLocaleString('vi-VN')} dòng hợp lệ.`);
      } else {
        toast.error('Không có dòng nào hợp lệ để có thể áp dụng.');
      }
    } catch (err: any) {
      console.error('Lỗi khi xem trước dữ liệu:', err);
      toast.error(err.message || 'Lỗi kiểm tra dữ liệu qua máy chủ.');
    } finally {
      setIsPreviewing(false);
    }
  };

  // Chạy áp dụng (gọi RPC với apply = true và p_reason)
  const handleStartApply = async () => {
    if (isApplying) return; // Khóa chống bấm đúp
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      toast.error('Vui lòng nhập lý do thực hiện tối thiểu 10 ký tự.');
      return;
    }

    // Lọc lấy các dòng có trạng thái hợp lệ ('ok') từ bước xem trước
    const validPreviewItems = previewResults.filter((r) => r.status === 'ok');
    const validOriginalRowMap = new Map<number, number>(); // applyIndex -> originalRowNumber
    const rowsToApply: Record<string, any>[] = [];

    validPreviewItems.forEach((item, index) => {
      const origIndex = item.row - 1;
      if (parsedRows[origIndex]) {
        rowsToApply.push(parsedRows[origIndex]);
        validOriginalRowMap.set(index, item.row);
      }
    });

    if (rowsToApply.length === 0) {
      toast.error('Không có dòng hợp lệ nào để áp dụng.');
      return;
    }

    goToStep(6);
    setIsApplying(true);
    setApplyProgress({ current: 0, total: rowsToApply.length });
    setAbortedInfo(null);
    setHasUncertainRows(false);

    try {
      const res = await runInChunks(
        rowsToApply,
        500,
        async (chunk) => {
          if (selectedMode === 'reissue') {
            return await createReissueRequestsBulk(chunk, trimmedReason, true);
          } else {
            return await bulkCorrectAssets(selectedMode, chunk, trimmedReason, true);
          }
        },
        (current, total) => {
          setApplyProgress({ current, total });
        },
        true // isApply = true
      );

      // Cảnh báo nếu số dòng trả về không khớp số dòng gửi lên (C.7)
      if (res.results.length !== rowsToApply.length) {
        toast.error('Cảnh báo: Kết quả trả về không khớp số dòng đã gửi lên.');
      }

      if (res.abortedAt && res.abortMessage) {
        setAbortedInfo({ abortedAt: res.abortedAt, abortMessage: res.abortMessage });
      }
      if (res.hasUncertainRows) {
        setHasUncertainRows(true);
      }

      // Hiệu chỉnh lại r_row theo đúng số thứ tự dòng gốc trong file và giữ đúng tên dự án theo file
      const mappedResults = res.results.map((r, i) => {
        const origRow = validOriginalRowMap.get(i) ?? r.row;
        const origData = parsedRows[origRow - 1];
        return {
          ...r,
          row: origRow,
          projectName: r.projectName || origData?.project_name || null,
        };
      });

      setExecutedResults(mappedResults);

      const successCount = mappedResults.filter(
        (r) => r.status === 'applied' || r.status === 'created' || r.status === 'ok'
      ).length;

      if (successCount > 0) {
        toast.success(`Đã áp dụng thành công ${successCount.toLocaleString('vi-VN')} dòng.`);
      } else {
        toast.error('Không có dòng nào được áp dụng thành công.');
      }
    } catch (err: any) {
      console.error('Lỗi khi áp dụng dữ liệu:', err);
      toast.error(err.message || 'Lỗi máy chủ khi áp dụng dữ liệu.');
    } finally {
      setIsApplying(false);
    }
  };

  // Reset về đợt mới
  const handleReset = () => {
    setSelectedMode('info');
    setFile(null);
    setParsedRows([]);
    setRecognizedColumns([]);
    setUnrecognizedColumns([]);
    setMissingRequiredColumns([]);
    setPreviewResults([]);
    setExecutedResults([]);
    setAbortedInfo(null);
    setHasUncertainRows(false);
    setReason('');
    setCurrentStep(1);
    setMaxAccessibleStep(1);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Toaster position="top-right" />

      {/* Header trang */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 text-[#1E3A8A] rounded-xl shadow-sm">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Cập nhật hàng loạt GCN
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Sửa sai thông tin, thế chấp, đổi chủ, sửa số GCN hoặc lập hồ sơ cấp đổi hàng loạt theo lô
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stepper Navigation */}
      <BulkUpdateStepper
        currentStep={currentStep}
        steps={stepperItems}
        onSelectStep={goToStep}
        maxAccessibleStep={maxAccessibleStep}
      />

      {/* Nội dung các bước */}
      {currentStep === 1 && (
        <ModeSelectionStep
          selectedMode={selectedMode}
          onSelectMode={handleSelectMode}
          onNext={() => goToStep(2)}
        />
      )}

      {currentStep === 2 && (
        <TemplateDownloadStep
          selectedMode={selectedMode}
          onPrev={() => goToStep(1)}
          onNext={() => goToStep(3)}
          onProjectsLoaded={setProjects}
        />
      )}

      {currentStep === 3 && (
        <FileUploadStep
          selectedMode={selectedMode}
          file={file}
          parsedRows={parsedRows}
          recognizedColumns={recognizedColumns}
          unrecognizedColumns={unrecognizedColumns}
          missingRequiredColumns={missingRequiredColumns}
          onFileProcessed={handleFileProcessed}
          onPrev={() => goToStep(2)}
          onNext={handleStartPreview}
        />
      )}

      {currentStep === 4 && (
        <PreviewStep
          selectedMode={selectedMode}
          sourceFileName={file?.name || 'du_lieu.xlsx'}
          results={previewResults}
          isPreviewing={isPreviewing}
          previewProgress={previewProgress}
          onPrev={() => goToStep(3)}
          onNext={() => goToStep(5)}
        />
      )}

      {currentStep === 5 && (
        <ConfirmStep
          selectedMode={selectedMode}
          sourceFileName={file?.name || 'du_lieu.xlsx'}
          results={previewResults}
          reason={reason}
          onChangeReason={setReason}
          onPrev={() => goToStep(4)}
          onNext={handleStartApply}
        />
      )}

      {currentStep === 6 && (
        <ExecutionStep
          selectedMode={selectedMode}
          sourceFileName={file?.name || 'du_lieu.xlsx'}
          isApplying={isApplying}
          applyProgress={applyProgress}
          executedResults={executedResults}
          abortedInfo={abortedInfo}
          hasUncertainRows={hasUncertainRows}
          onReset={handleReset}
        />
      )}
    </div>
  );
};

export default BulkUpdate;
