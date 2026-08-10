import React, { useEffect, useState } from 'react';
import { fetchActivityLogs } from '../api/activityLogs';
import { fetchProjects, fetchWarehouses } from '../api/assets';
import { Loader2, Download, BookText } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';

export const ActivityLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [projectId, setProjectId] = useState('');
  const [actionType, setActionType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
    fetchWarehouses().then(setWarehouses).catch(() => {});
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchActivityLogs({
        projectId: projectId || undefined,
        actionType: actionType || undefined,
        warehouseId: warehouseId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setLogs(data || []);
    } catch (error) {
      toast.error('Lỗi tải nhật ký');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const exportExcel = () => {
    const sheetData = logs.map((l, i) => ({
      STT: i + 1,
      'Ngày cập nhật': l.log_date ? format(new Date(l.log_date), 'dd/MM/yyyy') : '',
      'Loại nghiệp vụ': l.action_type,
      'Số chứng từ': l.document_no || '',
      'Diễn giải': l.description || '',
      'Đối tượng sử dụng sổ': l.used_by || '',
      'Kho': l.warehouse?.name || '',
      'Ghi chú': l.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nhật ký biến động');
    XLSX.writeFile(wb, `nhat-ky-bien-dong-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookText className="w-6 h-6 text-[#1E3A8A]" /> Nhật ký theo dõi biến động sổ đỏ
        </h1>
        <button
          onClick={exportExcel}
          disabled={logs.length === 0}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" /> Xuất Excel
        </button>
      </div>

      <form onSubmit={handleFilter} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Dự án</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full border border-gray-300 rounded-md text-sm px-2 py-1.5">
            <option value="">Tất cả</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Loại nghiệp vụ</label>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full border border-gray-300 rounded-md text-sm px-2 py-1.5">
            <option value="">Tất cả</option>
            <option value="Nhập sổ">Nhập sổ</option>
            <option value="Xuất sổ">Xuất sổ</option>
            <option value="Tách sổ">Tách sổ</option>
            <option value="Thế chấp">Thế chấp</option>
            <option value="Xuất bán">Xuất bán</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Kho quản lý</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full border border-gray-300 rounded-md text-sm px-2 py-1.5">
            <option value="">Tất cả</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border border-gray-300 rounded-md text-sm px-2 py-1.5" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border border-gray-300 rounded-md text-sm px-2 py-1.5" />
        </div>
        <button type="submit" className="px-4 py-1.5 text-sm font-medium rounded-md bg-gray-800 text-white hover:bg-gray-900">
          Lọc
        </button>
      </form>

      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-yellow-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase w-12">STT</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Ngày cập nhật</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Loại nghiệp vụ</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Số chứng từ</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Diễn giải</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Đối tượng sử dụng sổ</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Kho</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">Chưa có dữ liệu nhật ký.</td></tr>
              ) : (
                logs.map((l, i) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-gray-700">{l.log_date ? format(new Date(l.log_date), 'dd/MM/yyyy') : ''}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{l.action_type}</td>
                    <td className="px-3 py-2.5 text-blue-700">{l.document_no}</td>
                    <td className="px-3 py-2.5 text-gray-700">{l.description}</td>
                    <td className="px-3 py-2.5 text-gray-700">{l.used_by}</td>
                    <td className="px-3 py-2.5 text-gray-700">{l.warehouse?.name || '-'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{l.notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
