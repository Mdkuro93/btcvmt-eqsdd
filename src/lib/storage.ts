import { supabase, isSupabaseConfigured } from './supabase';

export const ASSET_DOCUMENTS_BUCKET = 'asset-documents';
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

export interface UploadResult {
  path: string;
  signedUrl: string;
  fileName: string;
  fileSize: number;
}

/**
 * Chuẩn hóa tên file: loại bỏ dấu tiếng Việt, ký tự đặc biệt, khoảng trắng
 */
export function sanitizeFileName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  const ext = lastDotIndex !== -1 ? fileName.substring(lastDotIndex).toLowerCase() : '';
  const baseName = lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;

  const normalized = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_+/g, '_');

  return `${normalized || 'document'}${ext}`;
}

/**
 * Trích xuất tên file hiển thị thân thiện từ URL hoặc storage path
 */
export function getFriendlyFileName(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  try {
    // Nếu là URL đầy đủ
    const parts = pathOrUrl.split('/');
    const lastPart = parts[parts.length - 1].split('?')[0];
    const decoded = decodeURIComponent(lastPart);
    // Bỏ timestamp nếu có format {timestamp}-{filename}
    const match = decoded.match(/^\d+-(.+)$/);
    return match ? match[1] : decoded;
  } catch {
    return pathOrUrl.split('/').pop() || 'Tài liệu GCN';
  }
}

/**
 * Kiểm tra file có phải là PDF hay không
 */
export function isPdfFile(pathOrUrl: string): boolean {
  if (!pathOrUrl) return false;
  const clean = pathOrUrl.toLowerCase().split('?')[0];
  return clean.endsWith('.pdf') || clean.includes('application/pdf');
}

/**
 * Kiểm tra file có phải là hình ảnh hay không
 */
export function isImageFile(pathOrUrl: string): boolean {
  if (!pathOrUrl) return false;
  const clean = pathOrUrl.toLowerCase().split('?')[0];
  return (
    clean.endsWith('.jpg') ||
    clean.endsWith('.jpeg') ||
    clean.endsWith('.png') ||
    clean.startsWith('data:image/') ||
    clean.includes('image/jpeg') ||
    clean.includes('image/png')
  );
}

/**
 * Tải file lên bucket Supabase Storage `asset-documents` (private)
 * Hỗ trợ fallback offline/mock bằng Base64 Data URL
 */
export async function uploadAssetDocument(
  file: File,
  assetId?: string
): Promise<UploadResult> {
  // 1. Kiểm tra dung lượng file (tối đa 10MB)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Dung lượng file (${sizeInMb}MB) vượt quá giới hạn cho phép (tối đa 10MB).`
    );
  }

  // 2. Kiểm tra định dạng file
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const isValidExt = ALLOWED_EXTENSIONS.includes(ext);
  const isValidMime = ALLOWED_MIME_TYPES.includes(file.type) || !file.type;

  if (!isValidExt && !isValidMime) {
    throw new Error(
      'Định dạng file không hợp lệ. Vui lòng tải lên file PDF, JPG, JPEG hoặc PNG.'
    );
  }

  const cleanName = sanitizeFileName(file.name);
  const folder = assetId ? assetId : `temp-${Math.random().toString(36).substring(2, 9)}`;
  const filePath = `${folder}/${Date.now()}-${cleanName}`;

  // 3. Nếu Supabase được cấu hình, upload lên Supabase Storage
  if (isSupabaseConfigured) {
    try {
      const { error: uploadError } = await supabase.storage
        .from(ASSET_DOCUMENTS_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Lỗi tải file lên máy chủ lưu trữ.');
      }

      // Tạo Signed URL cho private bucket (thời hạn 24 giờ = 86400 giây)
      const { data: signedData, error: signedError } = await supabase.storage
        .from(ASSET_DOCUMENTS_BUCKET)
        .createSignedUrl(filePath, 86400);

      if (signedError || !signedData?.signedUrl) {
        // Fallback: nếu createSignedUrl lỗi nhẹ, trả về filePath để client sinh khi cần
        return {
          path: filePath,
          signedUrl: filePath,
          fileName: file.name,
          fileSize: file.size,
        };
      }

      return {
        path: filePath,
        signedUrl: signedData.signedUrl,
        fileName: file.name,
        fileSize: file.size,
      };
    } catch (err: any) {
      console.error('Supabase Storage upload error:', err);
      throw new Error(err.message || 'Không thể upload file lên Storage Supabase.');
    }
  }

  // 4. Mock / Local fallback: Chuyển sang Base64 data URL để xem trước ngay lập tức
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result as string;
      resolve({
        path: filePath,
        signedUrl: base64Url,
        fileName: file.name,
        fileSize: file.size,
      });
    };
    reader.onerror = () => {
      reject(new Error('Đọc dữ liệu file tại client thất bại.'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Lấy Signed URL xem file từ path hoặc URL đã lưu
 */
export async function getAssetDocumentUrl(
  pathOrUrl?: string | null,
  expiresInSeconds = 86400
): Promise<string> {
  if (!pathOrUrl) return '';

  // Nếu là Data URL hoặc Blob URL hoặc URL đầy đủ bên ngoài
  if (
    pathOrUrl.startsWith('data:') ||
    pathOrUrl.startsWith('blob:') ||
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://')
  ) {
    // Nếu là URL supabase storage nhưng có thể hết hạn, thử trích xuất path để tạo signed URL mới
    if (pathOrUrl.includes(`storage/v1/object/`) && pathOrUrl.includes(ASSET_DOCUMENTS_BUCKET)) {
      const match = pathOrUrl.match(new RegExp(`${ASSET_DOCUMENTS_BUCKET}/([^?]+)`));
      if (match && match[1]) {
        try {
          const cleanPath = decodeURIComponent(match[1]);
          const { data } = await supabase.storage
            .from(ASSET_DOCUMENTS_BUCKET)
            .createSignedUrl(cleanPath, expiresInSeconds);
          if (data?.signedUrl) return data.signedUrl;
        } catch {
          // Bỏ qua và dùng lại url ban đầu
        }
      }
    }
    return pathOrUrl;
  }

  // Nếu là Storage Path tương đối (ví dụ "asset_id/123-scan.pdf")
  if (isSupabaseConfigured) {
    let cleanPath = pathOrUrl.replace(/^asset-documents\//, '');
    try {
      const { data, error } = await supabase.storage
        .from(ASSET_DOCUMENTS_BUCKET)
        .createSignedUrl(cleanPath, expiresInSeconds);

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    } catch (err) {
      console.warn('Không thể lấy signed URL từ Supabase:', err);
    }
  }

  return pathOrUrl;
}
