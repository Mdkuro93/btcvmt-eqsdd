import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';
import { Asset } from '../types';
import {
  ParsedLookupToken,
  removeAccents,
  cleanGcnCode,
  cleanBlockLot,
  cleanProjectName,
  expandProjectAliases,
} from '../utils/normalize';

export interface SmartLookupResultItem {
  token: ParsedLookupToken;
  matched: boolean;
  asset?: Asset;
  matchField?: string; // 'certificate_no' | 'asset_code' | 'legal_lot_code' | 'business_plot_code' | 'project_name' | 'land_lot_no'
  matchDetail?: string;
}

export interface SmartLookupSummary {
  totalRequested: number;
  foundCount: number;
  notFoundCount: number;
  inStockCount: number;
  mortgagedCount: number;
  checkedOutCount: number;
  soldCount: number;
  results: SmartLookupResultItem[];
  foundItems: SmartLookupResultItem[];
  notFoundItems: SmartLookupResultItem[];
}

/**
 * Tra cứu thông minh hàng loạt qua Supabase với 1 request duy nhất hoặc tối ưu hóa truy vấn
 * Hỗ trợ nhận diện Tên dự án đa trường (Tên pháp lý, Tên kinh doanh) và ánh xạ từ đồng nghĩa
 */
export async function executeSmartBulkLookup(
  tokens: ParsedLookupToken[],
  projectId?: string
): Promise<SmartLookupSummary> {
  if (tokens.length === 0) {
    return {
      totalRequested: 0,
      foundCount: 0,
      notFoundCount: 0,
      inStockCount: 0,
      mortgagedCount: 0,
      checkedOutCount: 0,
      soldCount: 0,
      results: [],
      foundItems: [],
      notFoundItems: [],
    };
  }

  // Phân loại tokens theo kiểu dữ liệu tra cứu
  const gcnTokens = tokens.filter(t => t.type === 'gcn');
  const blockLotTokens = tokens.filter(t => t.type === 'block_lot');
  const projectTokens = tokens.filter(t => t.type === 'project');
  const generalTokens = tokens.filter(t => t.type === 'general');

  // Danh sách mã GCN / Mã định danh cần truy vấn chính xác
  const gcnCodes = Array.from(new Set([
    ...gcnTokens.map(t => t.cleaned),
    ...gcnTokens.map(t => t.original.trim().toUpperCase()),
    ...generalTokens.map(t => t.cleaned),
    ...generalTokens.map(t => t.original.trim().toUpperCase()),
  ].filter(Boolean)));

  // Danh sách mã Block/Lô cần truy vấn chính xác
  const blockLotCodes = Array.from(new Set([
    ...blockLotTokens.map(t => t.cleaned),
    ...blockLotTokens.map(t => t.original.trim().toUpperCase()),
  ].filter(Boolean)));

  // Thu thập từ khóa dự án chỉ khi có token loại project
  const projectKeywords: string[] = [];
  for (const t of projectTokens) {
    if (t.projectKeywords && t.projectKeywords.length > 0) {
      projectKeywords.push(...t.projectKeywords);
    } else {
      projectKeywords.push(...expandProjectAliases(t.original));
    }
  }
  const uniqueProjectKeywords = Array.from(new Set(projectKeywords.filter(k => k.length >= 2)));

  let candidateAssets: Asset[] = [];

  try {
    if (!isSupabaseConfigured) {
      // Chỉ dùng mockStore khi chưa cấu hình Supabase
      const all = mockStore.getAssets();
      const txs = mockStore.getTransactions();
      const receiptMap: Record<string, string> = {};
      txs.forEach((t: any) => {
        (t.items || []).forEach((i: any) => {
          const vCode = i.voucher_code || i.details?.voucher_code || i.details?.import_receipt_number;
          if (vCode && (i.type === 'checkin' || vCode.includes('PN'))) {
            if (i.asset_id) receiptMap[i.asset_id] = vCode;
            if (i.confirmed_asset_id) receiptMap[i.confirmed_asset_id] = vCode;
          }
        });
      });

      candidateAssets = all.map(a => ({
        ...a,
        import_receipt_number: receiptMap[a.id] || (a as any).import_receipt_number || (a.id === 'asset-07' ? 'PN-2026/001' : (a.warehouse_id ? `PNK-${a.created_at?.slice(0, 4) || '2026'}/05-012` : null)),
      }));
    } else {
      // Truy vấn dữ liệu từ Supabase với điều kiện khớp chính xác tuyệt đối (Exact Match)
      let query = supabase
        .from('assets')
        .select(`
          id, asset_code, collateral_type, certificate_no, certificate_group,
          legal_lot_code, area, project_id, warehouse_id,
          custody_status, lifecycle_status, sale_status,
          mortgage_status, mortgage_bank, mortgage_unit, mortgage_valuation, collateral_value,
          business_project_name, business_plot_code, map_sheet_no, land_lot_no,
          current_owner_role, current_owner_entity_id,
          expected_return_date, borrow_purpose, current_holder_dept, notes,
          created_at, updated_at,
          projects:projects(id, name),
          warehouses:warehouses(id, name, code, is_central),
          current_owner_entity:investor_entities!assets_current_owner_entity_id_fkey(id, name, company_code)
        `)
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const orClauses: string[] = [];

      // 1. Khớp chính xác tuyệt đối theo certificate_no hoặc asset_code
      if (gcnCodes.length > 0) {
        const formattedGcns = gcnCodes.map(v => `"${v}"`).join(',');
        orClauses.push(`certificate_no.in.(${formattedGcns})`);
        orClauses.push(`asset_code.in.(${formattedGcns})`);
      }

      // 2. Khớp chính xác theo legal_lot_code hoặc business_plot_code
      if (blockLotCodes.length > 0) {
        const formattedBlocks = blockLotCodes.map(v => `"${v}"`).join(',');
        orClauses.push(`legal_lot_code.in.(${formattedBlocks})`);
        orClauses.push(`business_plot_code.in.(${formattedBlocks})`);
      }

      // 3. Khớp theo Tên dự án (chỉ khi có token dự án rõ ràng)
      if (uniqueProjectKeywords.length > 0) {
        for (const kw of uniqueProjectKeywords) {
          orClauses.push(`business_project_name.ilike.%${kw}%`);
        }
      }

      if (orClauses.length > 0) {
        query = query.or(orClauses.join(','));
      }

      const { data, error } = await withTimeout(
        query.limit(2000),
        DEFAULT_READ_TIMEOUT
      );

      if (error) {
        console.error('Lỗi khi tra cứu danh sách GCN từ Supabase:', error);
        throw new Error(`Không thể tra cứu dữ liệu: ${error.message || 'Lỗi cơ sở dữ liệu'}.`);
      }

      const loadedAssets = (data || []) as unknown as Asset[];

      // Tận dụng dữ liệu có sẵn: Truy vấn số phiếu nhập kho từ transaction_items & activity_logs
      const foundAssetIds = loadedAssets.map(a => a.id).filter(Boolean);
      const receiptMap: Record<string, string> = {};

      if (foundAssetIds.length > 0) {
        try {
          const { data: tiData } = await withTimeout(
            supabase
              .from('transaction_items')
              .select('asset_id, confirmed_asset_id, voucher_code, type, status, details, decided_at')
              .or(`asset_id.in.(${foundAssetIds.map(id => `"${id}"`).join(',')}),confirmed_asset_id.in.(${foundAssetIds.map(id => `"${id}"`).join(',')})`),
            DEFAULT_READ_TIMEOUT
          );

          if (tiData && tiData.length > 0) {
            for (const item of tiData) {
              const vCode = item.voucher_code || item.details?.voucher_code || item.details?.import_receipt_number || item.details?.voucherCode;
              if (vCode) {
                if (item.asset_id && !receiptMap[item.asset_id]) {
                  receiptMap[item.asset_id] = vCode;
                }
                if (item.confirmed_asset_id && !receiptMap[item.confirmed_asset_id]) {
                  receiptMap[item.confirmed_asset_id] = vCode;
                }
              }
            }
          }

          // Kiểm tra thêm từ activity_logs nếu còn tài sản chưa tìm thấy mã phiếu
          const missingIds = foundAssetIds.filter(id => !receiptMap[id]);
          if (missingIds.length > 0) {
            const { data: actData } = await withTimeout(
              supabase
                .from('activity_logs')
                .select('asset_id, document_no, action_type')
                .in('asset_id', missingIds)
                .in('action_type', ['Nhập sổ', 'Khai báo GCN', 'Nhập kho', 'Tạo tài sản']),
              DEFAULT_READ_TIMEOUT
            );
            if (actData) {
              for (const act of actData) {
                if (act.asset_id && act.document_no && !receiptMap[act.asset_id]) {
                  receiptMap[act.asset_id] = act.document_no;
                }
              }
            }
          }
        } catch (voucherErr) {
          console.warn('Lỗi khi tra cứu mã chứng từ nhập kho:', voucherErr);
        }
      }

      candidateAssets = loadedAssets.map(asset => ({
        ...asset,
        import_receipt_number: receiptMap[asset.id] || (asset as any).import_receipt_number || null,
      }));
    }
  } catch (err: any) {
    console.error('Lỗi trong executeSmartBulkLookup:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }

  // Khớp chính xác và chuẩn hóa kết quả cho từng token (Record Mapper)
  const results: SmartLookupResultItem[] = [];

  for (const token of tokens) {
    let matched: Asset | undefined;
    let matchField = 'certificate_no';
    let matchDetail = '';

    if (token.type === 'gcn' || token.type === 'general') {
      const inputClean = token.cleaned?.trim().toUpperCase();
      const inputOriginalClean = cleanGcnCode(token.original);

      matched = candidateAssets.find(record => {
        const recordCert = cleanGcnCode(record.certificate_no || '');
        const recordAssetCode = cleanGcnCode(record.asset_code || '');

        return (
          (recordCert && (recordCert === inputClean || recordCert === inputOriginalClean)) ||
          (recordAssetCode && (recordAssetCode === inputClean || recordAssetCode === inputOriginalClean))
        );
      });

      if (matched) {
        const matchedCertClean = cleanGcnCode(matched.certificate_no || '');
        if (matchedCertClean === inputClean || matchedCertClean === inputOriginalClean) {
          matchField = 'certificate_no';
          matchDetail = `Số GCN: ${matched.certificate_no}`;
        } else {
          matchField = 'asset_code';
          matchDetail = `Mã TSĐB: ${matched.asset_code}`;
        }
      }
    } else if (token.type === 'block_lot') {
      const inputBlock = token.cleaned;

      matched = candidateAssets.find(record => {
        const recordLegalLot = cleanBlockLot(record.legal_lot_code || '');
        const recordBizPlot = cleanBlockLot(record.business_plot_code || '');

        return (
          (recordLegalLot && recordLegalLot === inputBlock) ||
          (recordBizPlot && recordBizPlot === inputBlock)
        );
      });

      if (matched) {
        if (cleanBlockLot(matched.legal_lot_code || '') === inputBlock) {
          matchField = 'legal_lot_code';
          matchDetail = `Mã Lô PL: ${matched.legal_lot_code}`;
        } else {
          matchField = 'business_plot_code';
          matchDetail = `Mã Lô KD: ${matched.business_plot_code}`;
        }
      }
    } else if (token.type === 'project') {
      const keywords = token.projectKeywords || expandProjectAliases(token.original);

      matched = candidateAssets.find(record => {
        const legalProjNameClean = removeAccents(record.projects?.name || '').toLowerCase();
        const commProjNameClean = removeAccents(record.business_project_name || '').toLowerCase();

        return keywords.some(pkw => 
          pkw && (legalProjNameClean.includes(pkw) || commProjNameClean.includes(pkw))
        );
      });

      if (matched) {
        matchField = 'project_name';
        matchDetail = `Khớp Dự Án: ${matched.projects?.name || matched.business_project_name}`;
      }
    }

    if (matched) {
      results.push({
        token,
        matched: true,
        asset: matched,
        matchField,
        matchDetail,
      });
    } else {
      results.push({
        token,
        matched: false,
      });
    }
  }

  const foundItems = results.filter(r => r.matched && r.asset);
  const notFoundItems = results.filter(r => !r.matched);

  const inStockCount = foundItems.filter(r => r.asset?.custody_status === 'in_stock').length;
  const mortgagedCount = foundItems.filter(r => r.asset?.mortgage_status === 'mortgaged').length;
  const checkedOutCount = foundItems.filter(r => r.asset?.custody_status === 'checked_out').length;
  const soldCount = foundItems.filter(r => r.asset?.sale_status === 'sold').length;

  return {
    totalRequested: tokens.length,
    foundCount: foundItems.length,
    notFoundCount: notFoundItems.length,
    inStockCount,
    mortgagedCount,
    checkedOutCount,
    soldCount,
    results,
    foundItems,
    notFoundItems,
  };
}

/**
 * Sinh nội dung tin nhắn phản hồi Teams / Zalo định dạng sẵn
 * Tự động phân loại và gom nhóm theo Số Phiếu Nhập Kho để Thủ kho tiện tra cứu bìa hồ sơ vật lý
 */
export function generateTeamsZaloReplyText(summary: SmartLookupSummary): string {
  const { totalRequested, foundCount, notFoundCount, foundItems, notFoundItems } = summary;
  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let reply = `Chào anh/chị, em gửi kết quả tra cứu tình trạng ${totalRequested} GCN/Lô đất:\n\n`;

  if (foundCount > 0) {
    // Gom nhóm các GCN theo Số Phiếu Nhập Kho
    const groupedByReceipt: Record<string, SmartLookupResultItem[]> = {};
    const withoutReceipt: SmartLookupResultItem[] = [];

    foundItems.forEach(item => {
      const receipt = item.asset?.import_receipt_number?.trim();
      if (receipt) {
        if (!groupedByReceipt[receipt]) {
          groupedByReceipt[receipt] = [];
        }
        groupedByReceipt[receipt].push(item);
      } else {
        withoutReceipt.push(item);
      }
    });

    const receiptGroups = Object.entries(groupedByReceipt);

    if (receiptGroups.length > 0) {
      receiptGroups.forEach(([receiptNo, items]) => {
        reply += `📦 PHIẾU NHẬP KHO: [${receiptNo}]\n`;
        items.forEach(item => {
          const a = item.asset!;
          const legalName = a.projects?.name || 'Chưa gán DA';
          const commName = a.business_project_name || '';
          const projDisplay = commName && commName !== legalName ? `${legalName} - ${commName}` : legalName;
          const lotInfo = a.legal_lot_code ? ` - Lô: ${a.legal_lot_code}` : (a.business_plot_code ? ` - Lô KD: ${a.business_plot_code}` : '');
          const whName = a.warehouses?.name ? ` [${a.warehouses.name}]` : '';

          let statusDesc = 'Trong kho';
          if (a.custody_status === 'checked_out') {
            statusDesc = `Đang xuất kho${a.borrow_purpose ? ` (${a.borrow_purpose})` : ''}`;
          } else if (a.custody_status === 'in_transit') {
            statusDesc = 'Đang luân chuyển';
          }
          if (a.mortgage_status === 'mortgaged') {
            statusDesc += ` [Thế chấp ${a.mortgage_bank || 'NH'}]`;
          }

          reply += `   - ${a.certificate_no} (${projDisplay}${lotInfo})${whName} - ${statusDesc}\n`;
        });
        reply += '\n';
      });
    }

    if (withoutReceipt.length > 0) {
      if (receiptGroups.length > 0) {
        reply += `📄 CÁC GCN KHÁC (Chưa ghi nhận mã phiếu nhập):\n`;
      } else {
        reply += `✅ TÌM THẤY TRONG HỆ THỐNG (${withoutReceipt.length}/${totalRequested} sổ):\n`;
      }
      withoutReceipt.forEach(item => {
        const a = item.asset!;
        const legalName = a.projects?.name || 'Chưa gán DA';
        const commName = a.business_project_name || '';
        const projDisplay = commName && commName !== legalName ? `${legalName} - ${commName}` : legalName;
        const lotInfo = a.legal_lot_code ? ` - Lô: ${a.legal_lot_code}` : (a.business_plot_code ? ` - Lô KD: ${a.business_plot_code}` : '');
        const whName = a.warehouses?.name ? ` [${a.warehouses.name}]` : '';
        reply += `   - ${a.certificate_no} (${projDisplay}${lotInfo})${whName}\n`;
      });
      reply += '\n';
    }
  }

  if (notFoundCount > 0) {
    reply += `⚠️ KHÔNG CÓ TRÊN HỆ THỐNG (${notFoundCount} mã):\n`;
    notFoundItems.forEach(item => {
      reply += `   - ${item.token.original}\n`;
    });
    reply += '\n';
  }

  reply += `⏰ Thời gian tra cứu: ${dateFormatted}\n`;
  reply += `Hệ thống Quản lý Giấy chứng nhận quyền sử dụng đất - BTC VMT`;

  return reply;
}
