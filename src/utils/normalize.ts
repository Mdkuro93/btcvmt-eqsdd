/**
 * Utility functions for normalizing, cleaning, and parsing search queries & clipboard text
 * Supports smart extraction from Teams, Zalo, Excel, and free-form text.
 */

/**
 * Chuyển tiếng Việt có dấu thành không dấu
 * Ví dụ: "Đà Nẵng Downtown" -> "Da Nang Downtown"
 */
export function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (char) => (char === 'đ' ? 'd' : 'D'))
    .trim();
}

/**
 * Chuẩn hóa mã Giấy chứng nhận (GCN)
 * Xóa toàn bộ khoảng trắng thừa, dấu câu không hợp lệ và chuyển thành chữ HOA.
 * Ví dụ: "  dn 426171   " -> "DN426171"
 *        "CG-123456" -> "CG123456"
 */
export function cleanGcnCode(code: string): string {
  if (!code) return '';
  // Xóa khoảng trắng và chuyển chữ hoa
  const cleaned = code.replace(/\s+/g, '').toUpperCase();
  // Xóa các ký tự phân tách thừa ở đầu/cuối
  return cleaned.replace(/^[:;,.-\s]+|[:;,.-\s]+$/g, '');
}

/**
 * Chuẩn hóa Mã Lô / Block / Thửa đất
 * Bỏ dấu tiếng Việt, thay dấu chấm, khoảng trắng, chữ 'lô', 'thửa', 'lo', 'thua', 'block' thành dấu gạch ngang '-'
 * Ví dụ: "B3-4.16" -> "B3-4-16"
 *        "B3-4 lô 16" -> "B3-4-16"
 *        "Phân khu A Block 02 thửa 15" -> "PHAN-KHU-A-02-15"
 */
export function cleanBlockLot(str: string): string {
  if (!str) return '';
  let result = removeAccents(str);

  // Xóa diện tích nếu còn sót (VD: 373 m2, 313.1 m2)
  result = result.replace(/\d+([,\.]\d+)?\s*(m2|m²|ha)\b/gi, '');

  // Thay thế các từ khóa phổ biến thành dấu gạch ngang
  result = result
    .replace(/\b(lo|thua|block|can|tang|khu|phan\s*khu)\b/gi, '-')
    .replace(/[._,:\s/|\\]+/g, '-') // Thay thế dấu chấm, khoảng trắng, slash bằng '-'
    .replace(/-+/g, '-') // Gom nhiều dấu '-' liên tiếp thành 1
    .replace(/^-+|-+$/g, '') // Bỏ '-' ở đầu và cuối
    .toUpperCase();

  return result;
}

/**
 * Bảng ánh xạ tên viết tắt, tên thương mại và bí danh đồng nghĩa của các dự án (Project Alias Mapping)
 */
export const PROJECT_ALIASES: Record<string, string[]> = {
  'dcc': ['hoa quy', 'sunneva', 'sunneva island'],
  'sunneva': ['hoa quy', 'dcc', 'sunneva island'],
  'sunneva island': ['hoa quy', 'dcc', 'sunneva'],
  'hoa quy': ['dcc', 'sunneva', 'sunneva island'],
  'nam hoa xuan': ['hoa xuan', 'nhx', 'con dau'],
  'nhx': ['nam hoa xuan', 'hoa xuan', 'con dau'],
  'hoa xuan': ['nam hoa xuan', 'nhx', 'con dau'],
  'con dau': ['hoa xuan', 'nam hoa xuan', 'nhx'],
  'spana': ['ba na', 'ba na hills', 'bnh'],
  'cora': ['ba na', 'ba na hills', 'bnh'],
  'ba na': ['ba na hills', 'bnh', 'spana', 'cora'],
  'ba na hills': ['ba na', 'bnh', 'spana', 'cora'],
  'bnh': ['ba na', 'ba na hills', 'spana', 'cora'],
  'dt': ['da nang downtown', 'downtown'],
  'downtown': ['da nang downtown', 'dt'],
  'da nang downtown': ['downtown', 'dt'],
  'olalani': ['riverflow', 'olalani riverside'],
  'riverflow': ['olalani', 'olalani riverside'],
};

/**
 * Bóc tách và lọc từ rác trong tên Dự án
 */
export function cleanProjectName(str: string): string[] {
  if (!str) return [];

  const raw = str.trim();
  const keywords: string[] = [];

  // 1. Tách các cụm bên trong ngoặc đơn / ngoặc vuông
  const bracketMatches = raw.match(/\(([^)]+)\)|\[([^\]]+)\]/g);
  if (bracketMatches) {
    for (const match of bracketMatches) {
      const inside = match.replace(/[()\[\]]/g, '').trim();
      if (inside) {
        keywords.push(inside);
      }
    }
  }

  // 2. Lấy phần bên ngoài ngoặc
  const outside = raw.replace(/\(([^)]+)\)|\[([^\]]+)\]/g, ' ').trim();
  if (outside) {
    keywords.push(outside);
  }

  // 3. Chuẩn hóa từng keyword
  const cleanList: string[] = [];
  const noiseRegex = /\b(du\s*an\s*kd|du\s*an\s*pl|du\s*an|d\/a|da|khu\s*do\s*thi|kdt|kdc|khu\s*dan\s*cu|phan\s*khu|khu|k\.?)\b/gi;

  for (const kw of keywords) {
    let cleaned = removeAccents(kw).toLowerCase();
    cleaned = cleaned.replace(/\d+([,\.]\d+)?\s*(m2|m²|ha)\b/gi, ' ');
    cleaned = cleaned.replace(noiseRegex, ' ');
    cleaned = cleaned.replace(/[^a-z0-9\s-]/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (cleaned.length >= 2) {
      cleanList.push(cleaned);
    }
  }

  return Array.from(new Set(cleanList));
}

/**
 * Mở rộng danh sách từ khóa dự án dựa trên bảng ánh xạ đồng nghĩa (PROJECT_ALIASES)
 */
export function expandProjectAliases(inputStr: string): string[] {
  const baseCleaned = cleanProjectName(inputStr);
  const expanded = new Set<string>(baseCleaned);

  for (const kw of baseCleaned) {
    if (PROJECT_ALIASES[kw]) {
      for (const alias of PROJECT_ALIASES[kw]) {
        expanded.add(alias);
      }
    }

    for (const [aliasKey, aliasList] of Object.entries(PROJECT_ALIASES)) {
      if (kw === aliasKey || kw.includes(aliasKey) || aliasKey.includes(kw)) {
        expanded.add(aliasKey);
        for (const a of aliasList) {
          expanded.add(a);
        }
      }
    }
  }

  return Array.from(expanded);
}

export interface ParsedLookupToken {
  original: string;
  cleaned: string;
  type: 'gcn' | 'block_lot' | 'project' | 'general';
  projectKeywords?: string[];
}

/**
 * Bóc tách và chuẩn hóa thông minh từ clipboard hoặc văn bản nhập tự do (Teams, Zalo, Excel)
 * Thuật toán quét mã theo dòng nghiêm ngặt (Row-by-Row Strict Parser):
 * 
 * 1. Tách văn bản thành từng dòng riêng biệt (lines).
 * 2. Với mỗi dòng:
 *    - ƯU TIÊN 1: Tìm Mã GCN dạng chữ-số (ví dụ DN426171, CG123456, VMT_...).
 *      Nếu dòng đó ĐÃ CÓ mã GCN -> Chỉ trích xuất mã GCN này và BỎ QUA hoàn toàn phần còn lại
 *      (không quét Block/Lô, tên dự án hay diện tích m2 trên dòng đó).
 *    - ƯU TIÊN 2: Chỉ khi dòng đó KHÔNG CÓ mã GCN nào, mới tiến hành quét tìm mã Block/Lô hoặc Tên dự án.
 * 3. Lọc trùng lặp nghiêm ngặt (Deduplication) qua Set để đảm bảo 100% không có mã nào bị nhân đôi.
 */
export function parseClipboardText(rawText: string): ParsedLookupToken[] {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const gcnPattern = /\b([A-Za-z]{2}\s*[-._]?\s*\d{5,8}|VMT[_\-A-Za-z0-9]+)\b/gi;
  const tokens: ParsedLookupToken[] = [];
  const seenGcn = new Set<string>();
  const seenOther = new Set<string>();

  for (const line of lines) {
    // ƯU TIÊN 1: Tìm Mã GCN trên từng dòng
    const gcnMatches = line.match(gcnPattern);
    if (gcnMatches && gcnMatches.length > 0) {
      for (const rawGcn of gcnMatches) {
        const cleaned = cleanGcnCode(rawGcn);
        if (cleaned && cleaned.length >= 6 && !seenGcn.has(cleaned)) {
          seenGcn.add(cleaned);
          tokens.push({
            original: rawGcn.trim(),
            cleaned,
            type: 'gcn',
          });
        }
      }
      // Dòng này ĐÃ CÓ mã GCN -> BỎ QUA hoàn toàn phần còn lại của dòng (không quét Block/Lô hay m2)
      continue;
    }

    // ƯU TIÊN 2: Chỉ khi dòng này KHÔNG CÓ mã GCN, mới làm sạch nhiễu và quét tìm Block/Lô hoặc Dự án
    const cleanedLine = line
      .replace(/^(\d+[\.\/\)-]\s*|[•\-\*]\s*)/, '') // bỏ stt đầu dòng
      .replace(/\d+([,\.]\d+)?\s*(m2|m²|ha)\b/gi, ' ') // Xóa diện tích m2
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // Xóa cụm trong ngoặc
      .trim();

    if (!cleanedLine) continue;

    const segments = cleanedLine
      .split(/[\t,;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const seg of segments) {
      // Bỏ qua câu từ chat thông thường
      if (/^(nhờ|nho|gui|em|anh|chi|check|kiem\s*tra|danh\s*sach|ds|list|status|gcn|so\s*do|stt|dien\s*tich|du\s*an)\b/i.test(seg) && seg.length > 20) {
        continue;
      }

      // Kiểm tra xem có phải mã Lô / Block hay không (ví dụ: "B3-4.16", "B3-4 lô 16", "LK02-15")
      const isBlockLotPattern = /[A-Za-z0-9]+[-._\s]+[A-Za-z0-9]+/i.test(seg);
      const isInvalidBlock = /^\d+[-_]?(m2|m2)$/i.test(cleanBlockLot(seg));

      if (isBlockLotPattern && !isInvalidBlock && seg.length >= 2 && seg.length <= 30) {
        const cleaned = cleanBlockLot(seg);
        if (cleaned && cleaned.length >= 2 && !seenOther.has(cleaned)) {
          seenOther.add(cleaned);
          tokens.push({
            original: seg,
            cleaned,
            type: 'block_lot',
          });
        }
      } else {
        // Kiểm tra Tên Dự án & Alias
        const rawUnaccent = removeAccents(seg).toLowerCase();
        const isProjectName = Boolean(PROJECT_ALIASES[rawUnaccent]) ||
          /^(dự\s*án|du\s*an|da|kđt|kdt|khu\s*đô\s*thị|khu\s*do\s*thi)\b/i.test(seg);

        if (isProjectName) {
          const projKeywords = expandProjectAliases(seg);
          const cleaned = projKeywords[0] ? projKeywords[0].toUpperCase() : removeAccents(seg).toUpperCase();
          if (cleaned && !seenOther.has(cleaned)) {
            seenOther.add(cleaned);
            tokens.push({
              original: seg,
              cleaned,
              type: 'project',
              projectKeywords: projKeywords,
            });
          }
        } else {
          const cleaned = removeAccents(seg).toUpperCase();
          if (cleaned && cleaned.length >= 2 && !seenOther.has(cleaned)) {
            seenOther.add(cleaned);
            tokens.push({
              original: seg,
              cleaned,
              type: 'general',
            });
          }
        }
      }
    }
  }

  return tokens;
}

export const parseAndNormalize = parseClipboardText;
