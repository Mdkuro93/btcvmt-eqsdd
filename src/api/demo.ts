import { supabase } from '../lib/supabase';
import { mockStore } from '../lib/mockStore';

export async function generateDemoData() {
  try {
    // Attempt Supabase seeding
    const { data: region, error: rErr } = await supabase
      .from('regions')
      .upsert({ name: 'Miền Nam' }, { onConflict: 'name' })
      .select()
      .single();

    if (rErr) throw rErr;

    const { data: area, error: aErr } = await supabase
      .from('areas')
      .upsert({ name: 'TP. Hồ Chí Minh', region_id: region.id }, { onConflict: 'name' })
      .select()
      .single();

    if (aErr) throw aErr;

    const { data: warehouse, error: wErr } = await supabase
      .from('warehouses')
      .upsert({ name: 'Kho Trung Tâm BTC', region_id: region.id, is_central: true }, { onConflict: 'name' })
      .select()
      .single();

    if (wErr) throw wErr;

    const { data: project, error: pErr } = await supabase
      .from('projects')
      .upsert({ name: 'Dự án Khu Đô Thị VMT Central', area_id: area.id }, { onConflict: 'name' })
      .select()
      .single();

    if (pErr) throw pErr;

    const demoAssets = [
      {
        certificate_number: 'GCN-VMT-001',
        issue_date: '2022-05-15',
        land_lot_number: '102',
        map_sheet_number: '12',
        address: 'Số 150 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP.HCM',
        area_sqm: 450.5,
        usage_purpose: 'residential',
        owner_name: 'Công ty Cổ phần Đầu tư VMT',
        custody_status: 'in_stock',
        mortgage_status: 'unmortgaged',
        sale_status: 'unsold',
        project_id: project.id,
        custody_warehouse_id: warehouse.id,
      },
      {
        certificate_number: 'GCN-VMT-002',
        issue_date: '2023-01-20',
        land_lot_number: '205',
        map_sheet_number: '08',
        address: 'Đại lộ Bình Dương, P. Lái Thiêu, TP. Thuận An, Bình Dương',
        area_sqm: 1200.0,
        usage_purpose: 'commercial',
        owner_name: 'Công ty Cổ phần Đầu tư VMT',
        custody_status: 'checked_out',
        mortgage_status: 'mortgaged',
        mortgage_bank: 'Ngân hàng Vietcombank - CN Tân Định',
        sale_status: 'unsold',
        project_id: project.id,
        custody_warehouse_id: warehouse.id,
      },
    ];

    await supabase.from('assets').upsert(demoAssets, { onConflict: 'certificate_number' });
  } catch (err) {
    console.warn('Supabase generateDemoData failed, resetting mockStore demo data:', err);
    mockStore.resetDemoData();
  }
}
