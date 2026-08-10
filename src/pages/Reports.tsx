import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StatusBadges } from '../components/StatusBadges';
import { Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';

export const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (profile) load();
  }, [profile]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assets')
        .select(`
          certificate_no, subdivision, area, owner_name,
          custody_status, lifecycle_status, sale_status, mortgage_status,
          projects(name, area, regions(name)),
          collaterals(bank, borrower, valuation, guarantee_ratio, status)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      toast.error('Lỗi tải báo cáo');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    const sheetData = rows.map((r) => {
      const activeCollateral = (r.collaterals || []).find((c: any) => c.status === 'active');
      return {
        'Số CN QSDĐ': r.certificate_no,
        'Dự án': r.projects?.name || '',
        'Phân khu': r.subdivision || '',
        'Diện tích': r.area,
        'Chủ sở hữu': r.owner_name || '',
        'Vùng': r.projects?.regions?.name || '',
        'Địa bàn': r.projects?.area || '',
        'Lưu kho': r.custody_status,
        'Vòng đời': r.lifecycle_status,
        'Kinh doanh': r.sale_status,
        'Thế chấp': r.mortgage_status,
        'Ngân hàng': activeCollateral?.bank || '',
        'Giá trị định giá': activeCollateral?.valuation || '',
        'Tỷ lệ đảm bảo (%)': activeCollateral?.guarantee_ratio || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo GCN');
    XLSX.writeFile(wb, `bao-cao-gcn-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Báo cáo chi tiết GCN QSDĐ</h1>
        <button
          onClick={exportExcel}
          disabled={loading || rows.length === 0}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" /> Xuất Excel
        </button>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Số CN QSDĐ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dự án / Phân khu</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diện tích</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giá trị thế chấp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">Không có dữ liệu trong phạm vi của bạn.</td></tr>
              ) : (
                rows.map((r, i) => {
                  const activeCollateral = (r.collaterals || []).find((c: any) => c.status === 'active');
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.certificate_no}</td>
                      <td className="px-4 py-3 text-gray-600">{r.projects?.name} {r.subdivision ? `· ${r.subdivision}` : ''}</td>
                      <td className="px-4 py-3 text-gray-600">{r.area ? `${r.area.toLocaleString('vi-VN')} m²` : '-'}</td>
                      <td className="px-4 py-3">
                        <StatusBadges
                          custody_status={r.custody_status}
                          lifecycle_status={r.lifecycle_status}
                          sale_status={r.sale_status}
                          mortgage_status={r.mortgage_status}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {activeCollateral ? `${activeCollateral.bank} — ${Number(activeCollateral.valuation).toLocaleString('vi-VN')}đ` : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
