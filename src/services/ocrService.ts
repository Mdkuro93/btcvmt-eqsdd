import Tesseract from 'tesseract.js';

export interface OcrProgressCallback {
  (progress: number, statusText: string): void;
}

/**
 * Trích xuất toàn bộ văn bản từ File/Blob ảnh hoặc Data URL sử dụng Tesseract.js (hỗ trợ Tiếng Việt & Tiếng Anh)
 */
export async function extractTextFromImage(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<string> {
  try {
    const result = await Tesseract.recognize(
      imageSource,
      'vie+eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            const pct = Math.round(m.progress * 100);
            onProgress?.(pct, `Đang đọc ký tự từ ảnh... ${pct}%`);
          } else if (m.status === 'loading tesseract core') {
            onProgress?.(10, 'Đang tải bộ xử lý OCR...');
          } else if (m.status === 'loading language traineddata') {
            onProgress?.(30, 'Đang tải từ điển Tiếng Việt...');
          } else if (m.status === 'initializing api') {
            onProgress?.(45, 'Khởi tạo bộ phân tích hình ảnh...');
          } else {
            onProgress?.(15, 'Đang chuẩn bị nhận diện ảnh...');
          }
        },
      }
    );

    const rawText = result.data.text || '';
    return rawText.trim();
  } catch (err: any) {
    console.error('Lỗi nhận diện OCR Tesseract:', err);
    throw new Error(`Không thể nhận diện chữ từ ảnh: ${err.message || 'Lỗi xử lý hình ảnh'}`);
  }
}
