export interface ScanLinkValidationResult {
  ok: boolean;
  url?: string;
  error?: string;
  isExternal?: boolean;
}

const ALLOWED_EXTERNAL_DOMAINS = ['sharepoint.com', '1drv.ms', 'onedrive.live.com'];
const RELATIVE_STORAGE_PATH_REGEX = /^[a-zA-Z0-9_./-]+$/;
const MAX_URL_LENGTH = 2000;

/**
 * Kiểm tra tính hợp lệ của đường dẫn bản scan GCN:
 * 1. Trim khoảng trắng đầu/cuối.
 * 2. Chuỗi rỗng -> Hợp lệ (trả url: '').
 * 3. Độ dài tối đa 2000 ký tự.
 * 4. Nếu là link web ngoài: bắt buộc bắt đầu bằng https://, hostname kết thúc bằng sharepoint.com, 1drv.ms hoặc onedrive.live.com.
 * 5. Đường dẫn Storage tương đối cũ (chỉ gồm chữ, số, _ . / -) vẫn hợp lệ.
 */
export function validateScanLink(input?: string | null): ScanLinkValidationResult {
  if (input === undefined || input === null) {
    return { ok: true, url: '' };
  }

  const trimmed = input.trim();

  // Rỗng thì hợp lệ (trả url rỗng)
  if (!trimmed) {
    return { ok: true, url: '' };
  }

  // Tối đa 2000 ký tự
  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      error: `Độ dài link bản scan vượt quá giới hạn cho phép (tối đa ${MAX_URL_LENGTH} ký tự).`,
    };
  }

  // Kiểm tra link ngoài HTTPS
  if (trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') {
        return {
          ok: false,
          error: 'Link bản scan bắt buộc phải sử dụng giao thức an toàn HTTPS (https://).',
        };
      }

      const hostname = parsed.hostname.toLowerCase();
      const isAllowedHost = ALLOWED_EXTERNAL_DOMAINS.some(
        domain => hostname === domain || hostname.endsWith('.' + domain)
      );

      if (!isAllowedHost) {
        return {
          ok: false,
          error:
            'Chỉ chấp nhận link bản scan từ Microsoft SharePoint (*.sharepoint.com) hoặc OneDrive (*.1drv.ms, *.onedrive.live.com).',
        };
      }

      return {
        ok: true,
        url: trimmed,
        isExternal: true,
      };
    } catch {
      return {
        ok: false,
        error: 'Định dạng URL link bản scan không hợp lệ.',
      };
    }
  }

  // Nếu người dùng nhập http:// (không có S)
  if (trimmed.startsWith('http://')) {
    return {
      ok: false,
      error: 'Link bản scan bắt buộc phải dùng giao thức an toàn HTTPS (https://), không chấp nhận HTTP thường.',
    };
  }

  // Chặn tuyệt đối javascript: data: vbscript:
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return {
      ok: false,
      error: 'Đường dẫn bản scan chứa giao thức không an toàn.',
    };
  }

  // Đường dẫn Storage tương đối cũ (chỉ gồm chữ, số, _ . / -)
  if (!trimmed.includes(':') && !trimmed.includes('//') && RELATIVE_STORAGE_PATH_REGEX.test(trimmed)) {
    return {
      ok: true,
      url: trimmed,
      isExternal: false,
    };
  }

  return {
    ok: false,
    error:
      'Đường dẫn bản scan không hợp lệ. Vui lòng nhập link HTTPS từ SharePoint (*.sharepoint.com), OneDrive (*.1drv.ms, *.onedrive.live.com) hoặc đường dẫn Storage hợp lệ.',
  };
}

/**
 * Kiểm tra xem URL có phải là link ngoài SharePoint hoặc OneDrive hay không
 */
export function isExternalScanLink(url?: string | null): boolean {
  if (!url) return false;
  const res = validateScanLink(url);
  return Boolean(res.ok && res.isExternal);
}
