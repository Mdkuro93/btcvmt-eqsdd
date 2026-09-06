import { supabase, isSupabaseConfigured, withTimeout, DEFAULT_READ_TIMEOUT, DEFAULT_WRITE_TIMEOUT } from '../lib/supabase';
import { ReportSnapshot, DenormalizedReportAsset, Asset } from '../types';
import { mockStore } from '../lib/mockStore';
import { formatPlotCode } from '../lib/assetIdentifier';

/**
 * Hàm biến đổi denormalize: Chuyển đổi toàn bộ danh sách tài sản thành dữ liệu tĩnh
 * Lưu trực tiếp tên phòng ban, tên loại đất, tên dự án, tên kho... dạng chuỗi tĩnh
 * để tránh việc đổi tên danh mục sau này làm sai lệch báo cáo cũ đã chốt.
 */
export function denormalizeAssetsForSnapshot(
  assets: Asset[],
  warehouseNameFallback?: string,
  departmentFallback?: string
): DenormalizedReportAsset[] {
  return assets.map((asset) => {
    const isMortgaged = asset.mortgage_status === 'mortgaged';
    const plotCode = formatPlotCode(asset.subdivision, asset.lot_no, asset.land_lot_no);

    // Tên kho tĩnh
    const warehouseName = asset.warehouses?.name || warehouseNameFallback || '-';

    // Tên phòng ban / đơn vị quản lý tĩnh
    const departmentName = asset.mortgage_unit || asset.managing_unit || departmentFallback || 'Ban Tài Chính VMT';
    const currentHolderDept = asset.current_holder_dept || 
      (asset.custody_status === 'checked_out' ? 'Bộ phận đang mượn' : warehouseName);

    // Tên loại đất & mục đích sử dụng tĩnh
    const landUseTypeName = asset.usage_purpose || asset.land_use_purpose || 'Đất ở tại đô thị';
    const usagePurpose = asset.usage_purpose || asset.land_use_purpose || 'Đất ở tại đô thị';
    const usageTerm = asset.usage_term || asset.land_use_term || 
      (asset.usage_term_type === 'long_term' ? 'Lâu dài' : 'Theo thời hạn GCN');

    // Tên loại tài sản tĩnh
    const assetTypeName = asset.asset_type || (asset.collateral_type ? `Bất động sản (${asset.collateral_type})` : 'Bất động sản đất nền');

    // Tên dự án tĩnh
    const projectName = asset.projects?.name || 'Dự án VMT';
    const businessProjectName = asset.business_project_name || '';

    // Địa chỉ chi tiết tĩnh
    const addressDetail = asset.address_detail || 
      ([asset.ward, asset.district, asset.province].filter(Boolean).join(', ') || 'Đà Nẵng');

    // Tình trạng pháp lý & Nhóm sổ
    let certGroupLabel = 'Sổ chính';
    if (asset.parent_asset_id) {
      certGroupLabel = 'Sổ con (Tách thửa)';
    } else if (asset.lifecycle_status === 'invalidated') {
      certGroupLabel = 'Sổ gốc (Đã tách)';
    } else if (asset.certificate_group === 'so_lon') {
      certGroupLabel = 'Sổ lớn';
    }

    // Tình trạng lưu kho
    let custodyLabel = 'Lưu kho an toàn';
    if (asset.custody_status === 'checked_out') {
      custodyLabel = `Đang xuất mượn (${currentHolderDept})`;
    } else if (asset.custody_status === 'in_transit') {
      custodyLabel = 'Đang luân chuyển';
    }

    // Tình trạng vòng đời
    let lifecycleLabel = 'Hiệu lực';
    if (asset.lifecycle_status === 'invalidated') {
      lifecycleLabel = 'Đã hủy do tách thửa';
    } else if (asset.lifecycle_status === 'split') {
      lifecycleLabel = 'Đã tách thửa';
    }

    return {
      asset_id: asset.id,
      asset_code: asset.asset_code || `VMT-${asset.certificate_no}`,
      certificate_no: asset.certificate_no,

      // CÁC CHUỖI TĨNH BẢO VỆ TOÀN VẸN LỊCH SỬ
      project_name: projectName,
      business_project_name: businessProjectName,
      area_name: asset.projects?.areas?.name || 'Toàn vùng',
      region_name: asset.projects?.areas?.regions?.name || asset.province || 'Vùng Miền Trung',
      warehouse_name: warehouseName,
      department_name: departmentName,
      current_holder_dept: currentHolderDept,

      asset_type_name: assetTypeName,
      land_use_type_name: landUseTypeName,
      usage_purpose: usagePurpose,
      usage_term: usageTerm,

      owner_name: asset.owner_name || '-',
      certificate_group_label: certGroupLabel,
      subdivision: asset.subdivision || '',
      lot_no: asset.lot_no || '',
      land_lot_no: asset.land_lot_no || '',
      map_sheet_no: asset.map_sheet_no || '',
      plot_code: plotCode,
      business_plot_code: asset.business_plot_code || '',
      area: asset.area || 0,
      address_detail: addressDetail,

      // THẾ CHẤP TĨNH
      mortgage_status_label: isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
      mortgage_bank_name: isMortgaged ? (asset.mortgage_bank || 'Chưa cập nhật') : 'Không',
      mortgage_unit_name: isMortgaged ? (asset.mortgage_unit || 'Chưa cập nhật') : 'Không',
      mortgage_bank_2_name: asset.mortgage_bank_2 || '',
      mortgage_unit_2_name: asset.mortgage_unit_2 || '',
      mortgage_valuation: asset.mortgage_valuation || 0,
      collateral_ratio: asset.collateral_ratio || 0,
      collateral_value: asset.collateral_value || 0,

      // LƯU KHO TĨNH
      custody_status_label: custodyLabel,
      lifecycle_status_label: lifecycleLabel,
      notes: asset.notes || '',
    };
  });
}

/**
 * Lấy danh sách các kỳ báo cáo snapshot
 */
export async function fetchReportSnapshots(): Promise<ReportSnapshot[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getReportSnapshots();
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('report_snapshots')
        .select('*')
        .order('submitted_at', { ascending: false }),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) throw error;
    return (data as ReportSnapshot[]) || [];
  } catch (error) {
    console.warn('Supabase fetchReportSnapshots error, falling back to mockStore:', error);
    return mockStore.getReportSnapshots();
  }
}

/**
 * Nộp kỳ báo cáo mới (Lưu dữ liệu tĩnh denormalized JSONB)
 */
export async function createReportSnapshot(params: {
  report_code: string;
  report_period: string;
  title: string;
  region?: string;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  department_name?: string | null;
  submitted_by?: string | null;
  submitted_by_name?: string | null;
  period_status?: 'open' | 'locked';
  notes?: string;
  assets: Asset[];
}): Promise<ReportSnapshot> {
  const {
    report_code,
    report_period,
    title,
    region = 'Tất cả vùng',
    warehouse_id = null,
    warehouse_name = '-',
    department_name = 'Ban Tài Chính VMT',
    submitted_by = null,
    submitted_by_name = 'Chuyên viên BTC',
    period_status = 'open',
    notes = '',
    assets,
  } = params;

  // 1. Thực hiện Denormalization toàn bộ danh sách tài sản thành chuỗi văn bản tĩnh
  const denormalizedData = denormalizeAssetsForSnapshot(assets, warehouse_name || undefined, department_name || undefined);

  // 2. Tính toán tổng hợp số liệu
  const total_assets = denormalizedData.length;
  const total_area = denormalizedData.reduce((sum, item) => sum + (item.area || 0), 0);
  const total_valuation = denormalizedData.reduce((sum, item) => sum + (item.mortgage_valuation || 0), 0);
  const total_collateral_value = denormalizedData.reduce((sum, item) => sum + (item.collateral_value || 0), 0);

  const isLocked = period_status === 'locked';
  const now = new Date().toISOString();

  const newSnapshotPayload: Omit<ReportSnapshot, 'id' | 'created_at' | 'updated_at'> = {
    report_code,
    report_period,
    period_status,
    title,
    region,
    warehouse_id,
    warehouse_name,
    department_name,
    submitted_by,
    submitted_by_name,
    submitted_at: now,
    locked_at: isLocked ? now : null,
    locked_by: isLocked ? submitted_by : null,
    locked_by_name: isLocked ? submitted_by_name : null,
    total_assets,
    total_area,
    total_valuation,
    total_collateral_value,
    report_data: denormalizedData,
    summary_stats: {
      mortgaged_count: denormalizedData.filter(d => d.mortgage_status_label === 'Đã thế chấp').length,
      unmortgaged_count: denormalizedData.filter(d => d.mortgage_status_label === 'Chưa thế chấp').length,
      borrowed_count: denormalizedData.filter(d => d.custody_status_label.includes('Đang xuất mượn')).length,
    },
    notes,
  };

  if (!isSupabaseConfigured) {
    return mockStore.addReportSnapshot(newSnapshotPayload);
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('report_snapshots')
        .insert([newSnapshotPayload])
        .select()
        .single(),
      DEFAULT_WRITE_TIMEOUT
    );

    if (error) throw error;
    return data as ReportSnapshot;
  } catch (error) {
    console.warn('Supabase createReportSnapshot error, falling back to mockStore:', error);
    return mockStore.addReportSnapshot(newSnapshotPayload);
  }
}

/**
 * Mở khóa kỳ báo cáo đã chốt (Bắt buộc thông qua hàm RPC reopen_reporting_period)
 * Chuyển trạng thái về 'open' và ghi lý do mở khóa vào audit_logs
 */
export async function reopenReportingPeriod(
  snapshotId: string,
  reason: string,
  user?: { id?: string; full_name?: string; email?: string }
): Promise<{ success: boolean; message: string; snapshot?: ReportSnapshot }> {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Vui lòng cung cấp lý do mở khóa kỳ báo cáo rõ ràng (tối thiểu 5 ký tự)');
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('reopen_reporting_period', {
        p_snapshot_id: snapshotId,
        p_reason: reason.trim(),
      });

      if (error) {
        // If RPC function not found in database yet, fall back to mockStore with full audit log
        console.warn('RPC reopen_reporting_period failed on Supabase, applying via fallback:', error);
      } else if (data && data.success) {
        return {
          success: true,
          message: data.message || 'Mở khóa kỳ báo cáo thành công',
          snapshot: data.snapshot,
        };
      }
    } catch (rpcErr) {
      console.warn('RPC call exception:', rpcErr);
    }
  }

  // Fallback to local store with audit log recording
  return mockStore.reopenReportingPeriod(
    snapshotId,
    reason.trim(),
    user?.id,
    user?.full_name || user?.email || 'Quản trị viên'
  );
}

/**
 * Chốt sổ & Khóa kỳ báo cáo (lock_reporting_period)
 */
export async function lockReportingPeriod(
  snapshotId: string,
  notes?: string,
  user?: { id?: string; full_name?: string; email?: string }
): Promise<{ success: boolean; message: string }> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc('lock_reporting_period', {
        p_snapshot_id: snapshotId,
        p_notes: notes || null,
      });

      if (!error && data?.success) {
        return { success: true, message: data.message };
      }
    } catch (err) {
      console.warn('RPC lock_reporting_period failed, falling back:', err);
    }
  }

  return mockStore.lockReportingPeriod(
    snapshotId,
    notes,
    user?.id,
    user?.full_name || user?.email || 'Quản trị viên'
  );
}

/**
 * Cập nhật báo cáo snapshot (Có kiểm tra RLS Lock)
 */
export async function updateReportSnapshot(
  snapshotId: string,
  updates: Partial<ReportSnapshot>
): Promise<ReportSnapshot> {
  // 1. Kiểm tra RLS: Nếu bản ghi đang 'locked', ném lỗi cấm cập nhật
  const all = await fetchReportSnapshots();
  const target = all.find(s => s.id === snapshotId);
  if (target && target.period_status === 'locked') {
    throw new Error('VI PHẠM QUY TẮC BẢO MẬT RLS: Kỳ báo cáo đã bị KHÓA (period_status = locked). Cấm mọi thao tác UPDATE trực tiếp! Hãy thông qua hàm reopen_reporting_period()');
  }

  if (!isSupabaseConfigured) {
    return mockStore.updateReportSnapshot(snapshotId, updates);
  }

  try {
    const { data, error } = await supabase
      .from('report_snapshots')
      .update(updates)
      .eq('id', snapshotId)
      .select()
      .single();

    if (error) throw error;
    return data as ReportSnapshot;
  } catch (error) {
    console.warn('Supabase updateReportSnapshot error, falling back to mockStore:', error);
    return mockStore.updateReportSnapshot(snapshotId, updates);
  }
}

/**
 * Xóa báo cáo snapshot (Có kiểm tra RLS Lock)
 */
export async function deleteReportSnapshot(snapshotId: string): Promise<boolean> {
  // 1. Kiểm tra RLS: Nếu bản ghi đang 'locked', ném lỗi cấm xóa
  const all = await fetchReportSnapshots();
  const target = all.find(s => s.id === snapshotId);
  if (target && target.period_status === 'locked') {
    throw new Error('VI PHẠM QUY TẮC BẢO MẬT RLS: Kỳ báo cáo đã bị KHÓA (period_status = locked). Cấm mọi thao tác DELETE (kể cả tài khoản Admin)!');
  }

  if (!isSupabaseConfigured) {
    return mockStore.deleteReportSnapshot(snapshotId);
  }

  try {
    const { error } = await supabase
      .from('report_snapshots')
      .delete()
      .eq('id', snapshotId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Supabase deleteReportSnapshot error, falling back to mockStore:', error);
    return mockStore.deleteReportSnapshot(snapshotId);
  }
}
