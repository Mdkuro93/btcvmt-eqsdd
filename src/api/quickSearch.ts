import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';

export interface QuickAssetSearchResult {
  id: string;
  asset_code?: string | null;
  certificate_no: string;
  business_project_name?: string | null;
  business_plot_code?: string | null;
  legal_lot_code?: string | null;
  custody_status?: string | null;
  is_in_warehouse?: boolean | null;
  project_name?: string | null;
  warehouse_name?: string | null;
  import_receipt_number?: string | null;
  matched_former_code?: string | null;
  former_code_label?: string | null;
}

/**
 * Tra cứu nhanh GCN / Hồ sơ phục vụ Modal Tìm Kiếm Nhanh / Command Palette (Ctrl + K)
 * Tìm kiếm đa trường (Multi-field Fuzzy Search) từ 1 ký tự:
 * - Mã GCN (certificate_no / so_gcn)
 * - Mã Tài sản đảm bảo (asset_code / ma_tsdb - e.g. VMT_DNG_BDS_00000001)
 * - Tên Dự án (business_project_name / project_name / ten_du_an - e.g. Test - 1)
 * - Mã Block / Mã Lô (legal_lot_code / business_plot_code / ma_lo - e.g. Lô PL: 1, Lô KD: 1)
 * - Số Phiếu Nhập Kho (import_receipt_number / voucher_code - e.g. PNK-2026/05-012)
 */
export async function quickSearchAssets(keyword: string, limit = 10): Promise<QuickAssetSearchResult[]> {
  const clean = keyword.trim();
  if (!clean) return [];

  const searchKey = clean.toLowerCase();

  if (!isSupabaseConfigured) {
    const assets = mockStore.getAssets();
    const txs = mockStore.getTransactions();
    const receiptMap: Record<string, string> = {};
    
    txs.forEach((t: any) => {
      (t.items || []).forEach((i: any) => {
        const vCode = i.voucher_code || i.details?.voucher_code || i.details?.import_receipt_number;
        if (vCode && (i.type === 'checkin' || String(vCode).includes('PN'))) {
          if (i.asset_id) receiptMap[i.asset_id] = vCode;
          if (i.confirmed_asset_id) receiptMap[i.confirmed_asset_id] = vCode;
        }
      });
    });

    const filtered = assets.filter(item => {
      const soGcn = ((item as any).certificate_no || (item as any).so_gcn || '').toLowerCase();
      const maTsdb = ((item as any).asset_code || (item as any).ma_tsdb || '').toLowerCase();
      const tenDuAn = ((item as any).projects?.name || (item as any).business_project_name || (item as any).ten_du_an || '').toLowerCase();
      const maLo = ((item as any).legal_lot_code || (item as any).business_plot_code || (item as any).ma_lo || (item as any).block_code || (item as any).lot_code || '').toLowerCase();
      const importReceipt = (receiptMap[item.id] || (item as any).import_receipt_number || '').toLowerCase();

      return soGcn.includes(searchKey) ||
             maTsdb.includes(searchKey) ||
             tenDuAn.includes(searchKey) ||
             maLo.includes(searchKey) ||
             importReceipt.includes(searchKey);
    });

    let matchedByFormer = false;
    let targetList = filtered;
    if (filtered.length === 0) {
      const normalizedQuery = clean.toUpperCase();
      const formerMatches = assets.filter(item => {
        const codes = (item as any).former_asset_codes || [];
        return Array.isArray(codes) && codes.some(c => String(c).toUpperCase() === normalizedQuery);
      });
      if (formerMatches.length > 0) {
        matchedByFormer = true;
        targetList = formerMatches;
      }
    }

    return targetList.slice(0, limit).map(a => {
      const currentCode = a.asset_code || (a as any).ma_tsdb;
      return {
        id: a.id,
        asset_code: currentCode,
        certificate_no: a.certificate_no || (a as any).so_gcn,
        business_project_name: a.business_project_name || a.projects?.name || (a as any).ten_du_an,
        business_plot_code: a.business_plot_code,
        legal_lot_code: a.legal_lot_code || (a as any).ma_lo,
        custody_status: a.custody_status,
        is_in_warehouse: a.is_in_warehouse,
        project_name: a.projects?.name || (a as any).ten_du_an,
        warehouse_name: a.warehouses?.name,
        import_receipt_number: receiptMap[a.id] || (a as any).import_receipt_number || null,
        matched_former_code: matchedByFormer ? clean.toUpperCase() : null,
        former_code_label: matchedByFormer ? `Mã cũ: ${clean.toUpperCase()} → mã hiện tại ${currentCode || '(Chưa có mã)'}` : null,
      };
    });
  }

  // 1. Tìm các giao dịch nhập kho chứa số phiếu khớp từ khóa nếu có
  let receiptAssetIds: string[] = [];
  const receiptNumberMap: Record<string, string> = {};

  try {
    const { data: tiData } = await withTimeout(
      supabase
        .from('transaction_items')
        .select('asset_id, confirmed_asset_id, voucher_code')
        .ilike('voucher_code', `%${clean}%`)
        .limit(limit),
      DEFAULT_READ_TIMEOUT
    );

    if (tiData && tiData.length > 0) {
      for (const item of tiData) {
        if (item.voucher_code) {
          if (item.asset_id) {
            receiptAssetIds.push(item.asset_id);
            receiptNumberMap[item.asset_id] = item.voucher_code;
          }
          if (item.confirmed_asset_id) {
            receiptAssetIds.push(item.confirmed_asset_id);
            receiptNumberMap[item.confirmed_asset_id] = item.voucher_code;
          }
        }
      }
    }
  } catch {
    // Không gián đoạn nếu transaction_items tạm thời không phản hồi
  }

  // 2. Truy vấn Supabase với OR quét ilike trên toàn bộ các cột liên quan
  const orConditions = [
    `certificate_no.ilike.%${clean}%`,
    `asset_code.ilike.%${clean}%`,
    `legal_lot_code.ilike.%${clean}%`,
    `business_plot_code.ilike.%${clean}%`,
    `business_project_name.ilike.%${clean}%`
  ];

  if (receiptAssetIds.length > 0) {
    const uniqueIds = Array.from(new Set(receiptAssetIds));
    orConditions.push(`id.in.(${uniqueIds.map(id => `"${id}"`).join(',')})`);
  }

  const { data, error } = await withTimeout(
    supabase
      .from('assets')
      .select(`
        id,
        asset_code,
        certificate_no,
        legal_lot_code,
        business_plot_code,
        business_project_name,
        custody_status,
        is_in_warehouse,
        projects(name),
        warehouses(name)
      `)
      .or(orConditions.join(','))
      .order('created_at', { ascending: false })
      .limit(limit),
    DEFAULT_READ_TIMEOUT
  );

  if (error) {
    throw new Error('Không thể tìm kiếm GCN: ' + error.message);
  }

  let rawAssets = data || [];
  let isMatchedByFormer = false;

  // Nếu không có kết quả khớp trực tiếp, thử thêm truy vấn khớp chính xác trong assets.former_asset_codes
  if (rawAssets.length === 0) {
    const normalizedCode = clean.toUpperCase();
    const { data: formerData, error: formerError } = await withTimeout(
      supabase
        .from('assets')
        .select(`
          id,
          asset_code,
          certificate_no,
          legal_lot_code,
          business_plot_code,
          business_project_name,
          custody_status,
          is_in_warehouse,
          projects(name),
          warehouses(name)
        `)
        .contains('former_asset_codes', [normalizedCode])
        .order('created_at', { ascending: false })
        .limit(limit),
      DEFAULT_READ_TIMEOUT
    );

    if (formerError) {
      throw new Error('Không thể tìm kiếm GCN theo mã cũ: ' + formerError.message);
    }

    if (formerData && formerData.length > 0) {
      rawAssets = formerData;
      isMatchedByFormer = true;
    }
  }

  const foundIds = rawAssets.map((a: any) => a.id).filter(Boolean);

  // 3. Tra cứu bổ sung số phiếu nhập kho cho các tài sản tìm thấy
  if (foundIds.length > 0) {
    const missingReceiptIds = foundIds.filter((id: string) => !receiptNumberMap[id]);
    if (missingReceiptIds.length > 0) {
      try {
        const { data: tiItems } = await withTimeout(
          supabase
            .from('transaction_items')
            .select('asset_id, confirmed_asset_id, voucher_code')
            .or(`asset_id.in.(${missingReceiptIds.map((id: string) => `"${id}"`).join(',')}),confirmed_asset_id.in.(${missingReceiptIds.map((id: string) => `"${id}"`).join(',')})`)
            .limit(limit * 2),
          DEFAULT_READ_TIMEOUT
        );

        if (tiItems) {
          for (const item of tiItems) {
            if (item.voucher_code) {
              if (item.asset_id && !receiptNumberMap[item.asset_id]) {
                receiptNumberMap[item.asset_id] = item.voucher_code;
              }
              if (item.confirmed_asset_id && !receiptNumberMap[item.confirmed_asset_id]) {
                receiptNumberMap[item.confirmed_asset_id] = item.voucher_code;
              }
            }
          }
        }
      } catch {
        // Tiếp tục hiển thị kết quả nếu query phụ thất bại
      }
    }
  }

  return rawAssets.map((a: any) => ({
    id: a.id,
    asset_code: a.asset_code,
    certificate_no: a.certificate_no,
    legal_lot_code: a.legal_lot_code,
    business_plot_code: a.business_plot_code,
    business_project_name: a.business_project_name || a.projects?.name,
    custody_status: a.custody_status,
    is_in_warehouse: a.is_in_warehouse,
    project_name: a.projects?.name,
    warehouse_name: a.warehouses?.name,
    import_receipt_number: receiptNumberMap[a.id] || null,
    matched_former_code: isMatchedByFormer ? clean.toUpperCase() : null,
    former_code_label: isMatchedByFormer ? `Mã cũ: ${clean.toUpperCase()} → mã hiện tại ${a.asset_code || '(Chưa có mã)'}` : null,
  }));
}
