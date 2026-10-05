import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT } from '../lib/supabase';
import { ProjectReportRow, ProjectReportStats } from '../types';
import { isHighRiseAsset } from '../constants/assetTypes';

export type { ProjectReportStats };

export interface ProjectReportFilter {
  projectId?: string;
  region?: string;
  warehouseId?: string;
  mortgageStatus?: string;
  searchTerm?: string;
  allowedWarehouseIds?: string[];
}

// Trạng thái pháp lý suy ra từ cột thật của DB (status / invalidation_type).
// Ghi chú: bảng assets không có cột dữ liệu tên "legal status" riêng.
const legalLabel = (a: any): string => {
  if (!a) return 'Đang hiệu lực';
  if (a.invalidation_type === 'FULL' || a.status === 'REVOKED') return 'Đã vô hiệu';
  if (a.invalidation_type === 'PARTIAL') return 'Vô hiệu một phần';
  if (a.status === 'PENDING') return 'Chờ xử lý';
  if (a.status === 'DISPOSED') return 'Đã thanh lý';
  return 'Đang hiệu lực';
};
const isInvalidated = (a: any): boolean =>
  Boolean(a) && (a.invalidation_type === 'FULL' || a.status === 'REVOKED');

const CDT_UNKNOWN = 'Chưa xác định CĐT';

/**
 * Tra cứu và tổng hợp danh sách Lô quy hoạch & Tài sản thuộc dự án
 * phục vụ Báo cáo Tổng quan / Theo dõi theo Dự án (BẢNG KÊ CHI TIẾT THÔNG TIN BẤT ĐỘNG SẢN)
 * Xử lý chính xác 4 trường hợp liên kết giữa Sổ Lớn, Lô Quy Hoạch và Sổ Nhỏ.
 */
export async function fetchProjectReportData(
  filter: ProjectReportFilter
): Promise<{ rows: ProjectReportRow[]; stats: ProjectReportStats }> {
  const p_project_id = filter.projectId;
  const p_warehouse_id = filter.warehouseId;

  // 1. SỬA CHẮC CHẮN LOGIC ĐỌC BỘ LỌC (FILTER SANITIZATION)
  const isValidProject = Boolean(
    p_project_id &&
    p_project_id.trim() !== '' &&
    p_project_id !== 'all' &&
    p_project_id !== '-- Tất cả dự án --' &&
    p_project_id !== 'undefined'
  );
  const isValidWarehouse = Boolean(
    p_warehouse_id &&
    p_warehouse_id.trim() !== '' &&
    p_warehouse_id !== 'all' &&
    p_warehouse_id !== '-- Tất cả các kho --' &&
    p_warehouse_id !== 'undefined'
  );

  // 2. BỔ SUNG LOG VÀ CẢNH BÁO LỖI CHI TIẾT (DEBUG LOGS)
  console.log("[ProjectReport] Inputs:", { p_project_id, p_warehouse_id, isValidProject, isValidWarehouse });

  if (!isSupabaseConfigured) {
    console.log("[ProjectReport] Supabase not configured");
    return {
      rows: [],
      stats: {
        totalLots: 0,
        totalArea: 0,
        cdtCount: 0,
        cdtArea: 0,
        investorCount: 0,
        investorArea: 0,
        unsplitCount: 0,
        unsplitArea: 0,
        unissuedCount: 0,
        unissuedArea: 0,
        soldCount: 0,
        soldArea: 0,
      },
    };
  }

  // 3. TÁCH TRUY VẤN ĐƠN GIẢN (TRÁNH LỖI NGHẼN/CONFLICT RELATION POSTGREST)
  // Truy vấn 1: Lấy danh sách planned_land_lots & assets
  // Truy vấn 2: Lấy danh sách projects, investor_entities, areas, regions, warehouses rồi map trong RAM

  // a) Query planned_land_lots (không join lồng nhau để tránh lỗi schema cache / relationship ambiguity)
  const lotsQuery = supabase
    .from('planned_land_lots')
    .select('id, project_id, parent_master_asset_id, asset_code, asset_type, legal_lot_code, land_lot_no, map_sheet_no, business_project_name, business_plot_code, planned_area, status, resulting_asset_id, notes')
    .limit(10000);

  // b) Query assets (lấy các trường cần thiết phục vụ báo cáo)
  let assetsQuery = supabase
    .from('assets')
    .select('id, asset_code, certificate_no, legal_lot_code, area, asset_type, certificate_group, parent_asset_id, mortgage_status, mortgage_bank, mortgage_unit, status, invalidation_type, sale_status, custody_status, managing_unit, notes, project_id, warehouse_id, land_lot_no, map_sheet_no, business_plot_code, business_project_name, current_owner_entity_id, current_owner_role')
    .limit(10000);

  // Áp dụng bộ lọc cơ sở ở mức DB query nếu hợp lệ
  if (isValidProject) {
    assetsQuery = assetsQuery.eq('project_id', p_project_id!);
  }
  if (isValidWarehouse) {
    assetsQuery = assetsQuery.eq('warehouse_id', p_warehouse_id!);
  }
  if (filter.allowedWarehouseIds && filter.allowedWarehouseIds.length > 0) {
    assetsQuery = assetsQuery.in('warehouse_id', filter.allowedWarehouseIds);
  }

  // c) Query danh mục bổ trợ độc lập
  const projectsQuery = supabase.from('projects').select('id, name, default_owner_entity_id, area_id');
  const areasQuery = supabase.from('areas').select('id, name, region_id');
  const regionsQuery = supabase.from('regions').select('id, name');
  const entitiesQuery = supabase.from('investor_entities').select('id, name, company_code');
  const warehousesQuery = supabase.from('warehouses').select('id, name, code, region_id, region_code');

  const [lotsRes, assetsRes, projectsRes, areasRes, regionsRes, entitiesRes, warehousesRes] = await Promise.all([
    withTimeout(lotsQuery, DEFAULT_READ_TIMEOUT),
    withTimeout(assetsQuery, DEFAULT_READ_TIMEOUT),
    withTimeout(projectsQuery, DEFAULT_READ_TIMEOUT),
    withTimeout(areasQuery, DEFAULT_READ_TIMEOUT),
    withTimeout(regionsQuery, DEFAULT_READ_TIMEOUT),
    withTimeout(entitiesQuery, DEFAULT_READ_TIMEOUT),
    withTimeout(warehousesQuery, DEFAULT_READ_TIMEOUT),
  ]);

  if (assetsRes.error) console.error("[ProjectReport] Assets Query Error:", assetsRes.error);
  console.log("[ProjectReport] Assets fetched count:", assetsRes.data?.length || 0);

  if (lotsRes.error) console.error("[ProjectReport] Planned Lots Query Error:", lotsRes.error);
  console.log("[ProjectReport] Lots fetched count:", lotsRes.data?.length || 0);

  if (projectsRes.error) console.error("[ProjectReport] Projects Query Error:", projectsRes.error);
  if (entitiesRes.error) console.error("[ProjectReport] Entities Query Error:", entitiesRes.error);

  if (assetsRes.error) {
    throw new Error('Lỗi tải danh sách tài sản dự án: ' + assetsRes.error.message);
  }
  if (lotsRes.error) {
    throw new Error('Lỗi tải lô quy hoạch (kiểm tra đã chạy migration 0048/0050/0051 chưa): ' + lotsRes.error.message);
  }

  const allLots = (lotsRes.data || []) as any[];
  const allAssetsRaw = (assetsRes.data || []) as any[];
  const allAssets = allAssetsRaw.filter(a => !isInvalidated(a));
  const projects = (projectsRes.data || []) as any[];
  const areas = (areasRes.data || []) as any[];
  const regions = (regionsRes.data || []) as any[];
  const entities = (entitiesRes.data || []) as any[];
  const warehouses = (warehousesRes.data || []) as any[];

  // XÂY DỰNG CÁC MAP TRA CỨU NHANH TRONG BỘ NHỚ (O(1) LOOKUP)
  const regionMap = new Map<string, string>();
  regions.forEach(r => {
    if (r.id) regionMap.set(r.id, r.name);
  });

  const areaMap = new Map<string, { id: string; name: string; region_id?: string; regionName?: string }>();
  areas.forEach(a => {
    if (a.id) {
      const regName = a.region_id ? regionMap.get(a.region_id) || '' : '';
      areaMap.set(a.id, { id: a.id, name: a.name, region_id: a.region_id, regionName: regName });
    }
  });

  const projectMap = new Map<string, { id: string; name: string; default_owner_entity_id?: string | null; area_id?: string; regionName?: string }>();
  projects.forEach(p => {
    if (p.id) {
      const area = p.area_id ? areaMap.get(p.area_id) : undefined;
      projectMap.set(p.id, {
        id: p.id,
        name: p.name,
        default_owner_entity_id: p.default_owner_entity_id,
        area_id: p.area_id,
        regionName: area?.regionName || ''
      });
    }
  });

  const entityMap = new Map<string, { id: string; name: string; company_code?: string | null }>();
  entities.forEach(e => {
    if (e.id) entityMap.set(e.id, e);
  });

  const warehouseMap = new Map<string, { id: string; name: string; code?: string | null; region_id?: string | null; region_code?: string | null }>();
  warehouses.forEach(w => {
    if (w.id) warehouseMap.set(w.id, w);
  });

  const assetMap = new Map<string, any>();
  allAssetsRaw.forEach(a => {
    if (a.id) assetMap.set(a.id, a);
  });

  // ÁP DỤNG BỘ LỌC CHO PLANNED_LAND_LOTS & ASSETS:
  // 1. Khi lọc theo Dự án (project_id):
  //    Lấy các lô có planned_land_lots.project_id = selected_project_id
  //    HOẶC parent_asset.project_id = selected_project_id
  //    HOẶC child_asset.project_id = selected_project_id
  let filteredLots = allLots;
  if (isValidProject) {
    filteredLots = filteredLots.filter(l => {
      const parentMaster = l.parent_master_asset_id ? assetMap.get(l.parent_master_asset_id) : null;
      const resAsset = l.resulting_asset_id ? assetMap.get(l.resulting_asset_id) : null;
      const pid = l.project_id;
      const parentPid = parentMaster?.project_id;
      const childPid = resAsset?.project_id;
      return pid === p_project_id || parentPid === p_project_id || childPid === p_project_id;
    });
  }

  // 2. Khi lọc theo Kho (warehouse_id):
  //    - Nếu chọn "Tất cả các kho" (rỗng/all): KHÔNG ĐƯỢC loại bỏ các lô có warehouse_id IS NULL (các lô chưa cấp sổ R/S).
  //    - Chỉ áp dụng điều kiện warehouse_id = selected_warehouse_id khi người dùng chọn 1 kho cụ thể.
  if (isValidWarehouse) {
    filteredLots = filteredLots.filter(l => {
      const parentMaster = l.parent_master_asset_id ? assetMap.get(l.parent_master_asset_id) : null;
      const resAsset = l.resulting_asset_id ? assetMap.get(l.resulting_asset_id) : null;
      const wId = resAsset?.warehouse_id || parentMaster?.warehouse_id;
      return wId === p_warehouse_id;
    });
  }

  // 3. Phân quyền theo kho phụ trách (allowedWarehouseIds):
  //    Nếu có kho thì phải thuộc danh sách kho được phân công; nếu chưa có kho (chưa cấp sổ) vẫn giữ nguyên.
  if (filter.allowedWarehouseIds && filter.allowedWarehouseIds.length > 0) {
    filteredLots = filteredLots.filter(l => {
      const parentMaster = l.parent_master_asset_id ? assetMap.get(l.parent_master_asset_id) : null;
      const resAsset = l.resulting_asset_id ? assetMap.get(l.resulting_asset_id) : null;
      const wId = resAsset?.warehouse_id || parentMaster?.warehouse_id;
      if (wId) {
        return filter.allowedWarehouseIds!.includes(wId);
      }
      return true;
    });
  }

  // 4. Lọc theo vùng (region)
  if (filter.region && filter.region !== 'Tất cả vùng') {
    const reg = filter.region.replace('Vùng ', '').trim().toLowerCase();
    filteredLots = filteredLots.filter(l => {
      const parentMaster = l.parent_master_asset_id ? assetMap.get(l.parent_master_asset_id) : null;
      const resAsset = l.resulting_asset_id ? assetMap.get(l.resulting_asset_id) : null;
      const projId = l.project_id || parentMaster?.project_id || resAsset?.project_id;
      const proj = projId ? projectMap.get(projId) : null;
      const rName = proj?.regionName || '';
      return rName.toLowerCase().includes(reg);
    });
  }

  // 5. Lọc theo trạng thái thế chấp (mortgageStatus)
  if (filter.mortgageStatus && filter.mortgageStatus.trim() !== '') {
    const isMortgagedReq = filter.mortgageStatus === 'mortgaged';
    filteredLots = filteredLots.filter(l => {
      const parentMaster = l.parent_master_asset_id ? assetMap.get(l.parent_master_asset_id) : null;
      const resAsset = l.resulting_asset_id ? assetMap.get(l.resulting_asset_id) : null;
      const mStatus = resAsset?.mortgage_status || parentMaster?.mortgage_status || 'none';
      if (isMortgagedReq) return mStatus === 'mortgaged';
      return mStatus !== 'mortgaged';
    });
  }

  // Lọc filteredAssets theo vùng nếu có
  let filteredAssets = allAssets;
  if (filter.region && filter.region !== 'Tất cả vùng') {
    const reg = filter.region.replace('Vùng ', '').trim().toLowerCase();
    filteredAssets = filteredAssets.filter(a => {
      const proj = a.project_id ? projectMap.get(a.project_id) : null;
      const rName = proj?.regionName || '';
      return rName.toLowerCase().includes(reg);
    });
  }

  // Tập hợp các resulting_asset_id và parent_master_asset_id đã có trong planned_land_lots
  const mappedResultingAssetIds = new Set<string>();
  const masterAssetIdsWithLots = new Set<string>();

  filteredLots.forEach(l => {
    if (l.resulting_asset_id) mappedResultingAssetIds.add(l.resulting_asset_id);
    if (l.parent_master_asset_id) masterAssetIdsWithLots.add(l.parent_master_asset_id);
  });

  const rows: ProjectReportRow[] = [];

  // =========================================================================
  // XỬ LÝ 4 TRƯỜNG HỢP HIỂN THỊ DỮ LIỆU BÁO CÁO DỰ ÁN (A -> AD)
  // =========================================================================

  // DUYỆT TỪNG LÔ TRONG PLANNED_LAND_LOTS (TRƯỜNG HỢP 1, 2, 3)
  filteredLots.forEach((lot) => {
    let resAsset = lot.resulting_asset_id ? assetMap.get(lot.resulting_asset_id) : null;
    // Sổ lớn gốc: ưu tiên khóa của lô; nếu lô đã tách thì lấy từ parent_asset_id của sổ con
    const masterId = lot.parent_master_asset_id || resAsset?.parent_asset_id || null;
    const parentMaster = masterId ? assetMap.get(masterId) : null;

    // Tự động liên kết tài sản con nếu chưa gán resulting_asset_id nhưng có GCN trùng legal_lot_code
    if (!resAsset && lot.legal_lot_code) {
      const lotCode = lot.legal_lot_code.trim().toLowerCase();
      const lotProjId = lot.project_id || parentMaster?.project_id;
      const matched = allAssets.find(a => 
        a.legal_lot_code && a.legal_lot_code.trim().toLowerCase() === lotCode &&
        (a.project_id === lotProjId || (lot.parent_master_asset_id && a.parent_asset_id === lot.parent_master_asset_id))
      );
      if (matched) {
        resAsset = matched;
        mappedResultingAssetIds.add(matched.id);
      }
    }

    const hasSmallCert = Boolean(resAsset && resAsset.certificate_no);
    const inMasterUnsplit = Boolean(lot.parent_master_asset_id && !resAsset);
    const unissued = Boolean(!lot.parent_master_asset_id && !resAsset);

    // Xác định chủ sở hữu
    const ownerEntityId = resAsset?.current_owner_entity_id;
    const ownerEntity = ownerEntityId ? entityMap.get(ownerEntityId) : null;
    const isSold = resAsset?.sale_status === 'sold';

    // Xác định dự án và Chủ đầu tư pháp lý (COALESCE planned_land_lots.project_id, parent_asset.project_id, child_asset.project_id)
    const effectiveProjectId = lot.project_id || parentMaster?.project_id || resAsset?.project_id;
    const effectiveProject = effectiveProjectId ? projectMap.get(effectiveProjectId) : null;
    const defaultOwnerId = effectiveProject?.default_owner_entity_id;
    const projectDefaultCdt = defaultOwnerId ? entityMap.get(defaultOwnerId)?.name : null;

    // Phân biệt CĐT vs NĐT: Dựa vào current_owner_role ('ndt' | 'cdt') hoặc nếu entity khác CĐT mặc định
    const isInvestor = resAsset?.current_owner_role === 'ndt' || (!resAsset?.current_owner_role && Boolean(ownerEntityId && defaultOwnerId && ownerEntityId !== defaultOwnerId));
    const lotCdtName = (ownerEntity && resAsset?.current_owner_role === 'cdt')
      ? ownerEntity.name
      : (projectDefaultCdt || CDT_UNKNOWN);

    let col_i_small_cert_no = '';
    let col_j_master_cert_no = '';
    let col_k_cdt_name = '';
    let col_k_cdt_count = 0;
    let col_l_cdt_area = 0;
    let col_m_investor_name = '';
    let col_n_investor_count = 0;
    let col_o_investor_area = 0;
    let col_p_unsplit_count = 0;
    let col_q_unsplit_area = 0;
    let col_r_unissued_count = 0;
    let col_s_unissued_area = 0;
    let col_t_sold_count = 0;
    let col_u_sold_area = 0;

    const plannedArea = Number(lot.planned_area) || 0;
    const effectiveArea = Number(resAsset?.area) || plannedArea;

    if (inMasterUnsplit) {
      // -----------------------------------------------------------------------
      // TRƯỜNG HỢP 1: Lô thuộc Sổ lớn chưa tách (Cột P/Q)
      // Điều kiện: parent_master_asset_id IS NOT NULL VÀ resulting_asset_id IS NULL
      // -----------------------------------------------------------------------
      col_j_master_cert_no = parentMaster?.certificate_no || '';
      col_p_unsplit_count = 1;
      col_q_unsplit_area = plannedArea;
      col_k_cdt_name = lotCdtName;
    } else if (unissued) {
      // -----------------------------------------------------------------------
      // TRƯỜNG HỢP 2: Lô chưa có bất kỳ Sổ nào (Cột R/S)
      // Điều kiện: parent_master_asset_id IS NULL VÀ resulting_asset_id IS NULL
      // -----------------------------------------------------------------------
      col_r_unissued_count = 1;
      col_s_unissued_area = plannedArea;
      col_k_cdt_name = lotCdtName;
    } else if (hasSmallCert) {
      // -----------------------------------------------------------------------
      // TRƯỜNG HỢP 3: Lô đã có Sổ nhỏ / Tách sổ / Cấp thẳng (Tồn CĐT / NĐT / Đã bán)
      // Điều kiện: resulting_asset_id IS NOT NULL (hoặc khớp legal_lot_code)
      // -----------------------------------------------------------------------
      col_i_small_cert_no = resAsset.certificate_no || '';
      col_j_master_cert_no = parentMaster?.certificate_no || '';

      if (isSold) {
        col_t_sold_count = 1;
        col_u_sold_area = effectiveArea;
      } else if (isInvestor) {
        col_m_investor_name = ownerEntity?.name || 'Nhà đầu tư';
        col_n_investor_count = 1;
        col_o_investor_area = effectiveArea;
      } else {
        // Tồn CĐT
        col_k_cdt_name = lotCdtName;
        col_k_cdt_count = 1;
        col_l_cdt_area = effectiveArea;
      }
    }

    // Trạng thái TSĐB & quản lý
    let legalStatus = 'Đang hiệu lực';
    if (resAsset) {
      legalStatus = legalLabel(resAsset);
    } else if (unissued) {
      legalStatus = 'Chưa cấp GCN';
    } else if (inMasterUnsplit) {
      legalStatus = 'Nằm trong sổ lớn';
    }

    let businessStatus = 'Chưa sẵn sàng';
    if (isSold) businessStatus = 'Đã bán';
    else if (resAsset?.sale_status === 'ready_for_sale') businessStatus = 'Sẵn sàng bán';
    else if (resAsset?.sale_status === 'held') businessStatus = 'Tạm giữ';

    let custodyStatus = 'Chưa nhập kho';
    if (resAsset?.custody_status === 'in_stock') custodyStatus = 'Trong kho BTC';
    else if (resAsset?.custody_status === 'checked_out') custodyStatus = 'Đang xuất mượn';
    else if (resAsset?.mortgage_status === 'mortgaged') custodyStatus = `Thế chấp (${resAsset.mortgage_bank || 'NH'})`;
    else if (inMasterUnsplit) custodyStatus = 'Theo sổ lớn';

    rows.push({
      // Ưu tiên mã hệ thống thật của tài sản đã cấp (VMT_DNG_...); nếu lô chưa có sổ thì dùng mã hệ thống
      // của chính lô quy hoạch (PLO-..., do DB tự sinh khi tạo/import lô). Chuỗi LOT-... chỉ là phương án dự
      // phòng cho các lô cũ tạo trước khi có cột asset_code (cần chạy backfill, xem ghi chú cuối file).
      col_a_system_id: resAsset?.asset_code || lot.asset_code || (lot.legal_lot_code ? `LOT-${lot.legal_lot_code}` : `LOT-${lot.id ? lot.id.slice(0, 8) : '000'}`),
      col_c_project_name: effectiveProject?.name || lot.business_project_name || '-',
      col_d_asset_type: resAsset?.asset_type || lot.asset_type || parentMaster?.asset_type || 'Đất nền',
      col_e_cert_group: hasSmallCert ? 'Sổ nhỏ' : (inMasterUnsplit ? 'Sổ lớn' : 'Chưa cấp'),
      col_f_lot_code: lot.legal_lot_code || '-',
      col_g_area: plannedArea || effectiveArea,
      col_i_small_cert_no,
      col_j_master_cert_no,
      col_k_cdt_name,
      col_k_cdt_count,
      col_l_cdt_area,
      col_m_investor_name,
      col_n_investor_count,
      col_o_investor_area,
      col_p_unsplit_count,
      col_q_unsplit_area,
      col_r_unissued_count,
      col_s_unissued_area,
      col_t_sold_count,
      col_u_sold_area,
      col_z_legal_status: legalStatus,
      col_aa_business_status: businessStatus,
      col_ab_custody_status: custodyStatus,
      col_ac_managing_unit: resAsset?.managing_unit || parentMaster?.managing_unit || 'Ban Tài Chính VMT',
      col_ad_notes: lot.notes || resAsset?.notes || parentMaster?.notes || '',
    });
  });

  // ---------------------------------------------------------------------------
  // TRƯỜNG HỢP 4: Tài sản Sổ GCN độc lập trong bảng assets (Chưa gắn Lô quy hoạch)
  // Điều kiện: Các tài sản trong assets chưa tìm thấy Lô quy hoạch tương ứng
  // ---------------------------------------------------------------------------
  filteredAssets.forEach((asset) => {
    // Nếu tài sản này đã được ánh xạ vào planned_land_lots (là resulting_asset), bỏ qua để không trùng
    if (mappedResultingAssetIds.has(asset.id)) return;

    // Nếu là sổ lớn và ĐÃ có các lô con trong planned_land_lots, bỏ qua vì các lô con đã lên từng dòng ở Trường hợp 1 hoặc 3
    const isMasterBook = asset.certificate_group === 'so_lon';
    if (isMasterBook && masterAssetIdsWithLots.has(asset.id)) return;

    const ownerEntityId = asset.current_owner_entity_id;
    const ownerEntity = ownerEntityId ? entityMap.get(ownerEntityId) : null;
    const isSold = asset.sale_status === 'sold';

    const project = asset.project_id ? projectMap.get(asset.project_id) : null;
    const defaultOwnerId = project?.default_owner_entity_id;
    const projectDefaultCdt = defaultOwnerId ? entityMap.get(defaultOwnerId)?.name : null;

    // Phân biệt CĐT vs NĐT
    const isInvestor = asset.current_owner_role === 'ndt' || (!asset.current_owner_role && Boolean(ownerEntityId && defaultOwnerId && ownerEntityId !== defaultOwnerId));
    const assetCdtName = (ownerEntity && asset.current_owner_role === 'cdt')
      ? ownerEntity.name
      : (projectDefaultCdt || CDT_UNKNOWN);

    let col_i_small_cert_no = '';
    let col_j_master_cert_no = '';
    let col_k_cdt_name = '';
    let col_k_cdt_count = 0;
    let col_l_cdt_area = 0;
    let col_m_investor_name = '';
    let col_n_investor_count = 0;
    let col_o_investor_area = 0;
    let col_p_unsplit_count = 0;
    let col_q_unsplit_area = 0;
    let col_r_unissued_count = 0;
    let col_s_unissued_area = 0;
    let col_t_sold_count = 0;
    let col_u_sold_area = 0;

    const assetArea = Number(asset.area) || 0;

    if (isMasterBook) {
      // 4a. Sổ lớn độc lập trong assets nhưng chưa lập bảng lô quy hoạch con -> hiển thị ở Cột P/Q (chưa tách)
      col_j_master_cert_no = asset.certificate_no || '';
      col_p_unsplit_count = 1;
      col_q_unsplit_area = assetArea;
      col_k_cdt_name = assetCdtName;
    } else {
      // 4b. Sổ nhỏ / GCN lẻ độc lập đã cấp -> hiển thị ở Cột I và nhóm tương ứng (CĐT / NĐT / Đã bán)
      col_i_small_cert_no = asset.certificate_no || '';
      if (isSold) {
        col_t_sold_count = 1;
        col_u_sold_area = assetArea;
      } else if (isInvestor) {
        col_m_investor_name = ownerEntity?.name || 'Nhà đầu tư';
        col_n_investor_count = 1;
        col_o_investor_area = assetArea;
      } else {
        col_k_cdt_name = assetCdtName;
        col_k_cdt_count = 1;
        col_l_cdt_area = assetArea;
      }
    }

    let legalStatus = legalLabel(asset);
    if (isMasterBook && legalStatus === 'Đang hiệu lực') legalStatus = 'Sổ lớn chưa tách';

    let businessStatus = 'Chưa sẵn sàng';
    if (isSold) businessStatus = 'Đã bán';
    else if (asset.sale_status === 'ready_for_sale') businessStatus = 'Sẵn sàng bán';

    let custodyStatus = 'Lưu kho an toàn';
    if (asset.custody_status === 'checked_out') custodyStatus = 'Đang xuất mượn';
    else if (asset.mortgage_status === 'mortgaged') custodyStatus = `Thế chấp (${asset.mortgage_bank || 'NH'})`;

    const lotCodeDisplay = asset.legal_lot_code || asset.land_lot_no || asset.business_plot_code || (isMasterBook ? 'Sổ mẹ chưa lập lô' : 'GCN độc lập');

    rows.push({
      col_a_system_id: asset.asset_code || `AST-${asset.certificate_no}`,
      col_c_project_name: project?.name || asset.business_project_name || '-',
      col_d_asset_type: asset.asset_type || 'Đất nền',
      col_e_cert_group: isMasterBook ? 'Sổ lớn' : 'Sổ nhỏ',
      col_f_lot_code: lotCodeDisplay,
      col_g_area: assetArea,
      col_i_small_cert_no,
      col_j_master_cert_no,
      col_k_cdt_name,
      col_k_cdt_count,
      col_l_cdt_area,
      col_m_investor_name,
      col_n_investor_count,
      col_o_investor_area,
      col_p_unsplit_count,
      col_q_unsplit_area,
      col_r_unissued_count,
      col_s_unissued_area,
      col_t_sold_count,
      col_u_sold_area,
      col_z_legal_status: legalStatus,
      col_aa_business_status: businessStatus,
      col_ab_custody_status: custodyStatus,
      col_ac_managing_unit: asset.managing_unit || 'Ban Tài Chính VMT',
      col_ad_notes: asset.notes || '',
    });
  });

  // Tìm kiếm từ khóa nếu có
  let resultRows = rows;
  if (filter.searchTerm && filter.searchTerm.trim() !== '') {
    const term = filter.searchTerm.trim().toLowerCase();
    resultRows = resultRows.filter(r => 
      r.col_a_system_id.toLowerCase().includes(term) ||
      r.col_c_project_name.toLowerCase().includes(term) ||
      r.col_f_lot_code.toLowerCase().includes(term) ||
      r.col_i_small_cert_no.toLowerCase().includes(term) ||
      r.col_j_master_cert_no.toLowerCase().includes(term) ||
      r.col_k_cdt_name.toLowerCase().includes(term) ||
      r.col_m_investor_name.toLowerCase().includes(term)
    );
  }

  // Tính toán số liệu thống kê (KPI Summary) - Phân tách Diện tích Đất vs Diện tích Thông thủy
  const stats: ProjectReportStats = {
    totalLots: resultRows.length,
    // Chỉ tính tổng SUM(area) của các tài sản KHÔNG THUỘC HIGH_RISE_ASSET_TYPES (Bảo toàn số liệu diện tích đất chuẩn)
    totalArea: resultRows.filter(r => !isHighRiseAsset(r.col_d_asset_type)).reduce((sum, r) => sum + (Number(r.col_g_area) || 0), 0),
    // Tổng diện tích thông thủy (Căn hộ / Sàn 3D)
    totalHighRiseArea: resultRows.filter(r => isHighRiseAsset(r.col_d_asset_type)).reduce((sum, r) => sum + (Number(r.col_g_area) || 0), 0),
    cdtCount: resultRows.reduce((sum, r) => sum + r.col_k_cdt_count, 0),
    cdtArea: resultRows.reduce((sum, r) => sum + r.col_l_cdt_area, 0),
    investorCount: resultRows.reduce((sum, r) => sum + r.col_n_investor_count, 0),
    investorArea: resultRows.reduce((sum, r) => sum + r.col_o_investor_area, 0),
    unsplitCount: resultRows.reduce((sum, r) => sum + r.col_p_unsplit_count, 0),
    unsplitArea: resultRows.reduce((sum, r) => sum + r.col_q_unsplit_area, 0),
    unissuedCount: resultRows.reduce((sum, r) => sum + r.col_r_unissued_count, 0),
    unissuedArea: resultRows.reduce((sum, r) => sum + r.col_s_unissued_area, 0),
    soldCount: resultRows.reduce((sum, r) => sum + r.col_t_sold_count, 0),
    soldArea: resultRows.reduce((sum, r) => sum + r.col_u_sold_area, 0),
  };

  console.log("[ProjectReport] Final output rows count:", resultRows.length, "Stats:", stats);

  return { rows: resultRows, stats };
}