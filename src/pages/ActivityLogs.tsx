import React, { useEffect, useState } from 'react';
import { fetchActivityLogs } from '../api/activityLogs';
import { fetchProjects, fetchWarehouses } from '../api/assets';
import { Download, BookText, Filter } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import { VoucherPrintModal } from '../components/VoucherPrintModal';
import { useAuth } from '../contexts/AuthContext';
import { LoadingFallback } from '../components/LoadingFallback';
import { mockStore } from '../lib/mockStore';

export const ActivityLogs: React.FC = () => {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [projectId, setProjectId] = useState('');
  const [actionType, setActionType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  // Print voucher modal state
  const [selectedVoucherLog, setSelectedVoucherLog] = useState<any | null>(null);

  useEffect(() => {
    Promise.all([
      fetchProjects().catch(() => []),
      fetchWarehouses().catch(() => []),
    ]).then(([projs, whs]) => {
      setProjects(projs || []);
      setWarehouses(whs || []);
    });
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookText className="w-6 h-6 text-[#1E3A8A]" /> Sổ cái & Nhật ký biến động kho GCN
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Theo dõi dòng luân chuyển, chứng từ PN/PX và tình trạng lưu trữ sổ đỏ
          </p>
        </div>
        <button
          onClick={exportExcel}
          disabled={logs.length === 0}
          className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4 mr-1.5" /> Xuất Sổ cái Excel
        </button>
      </div>

      <form onSubmit={handleFilter} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Dự án</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full border border-gray-300 rounded-lg text-xs px-2.5 py-2 bg-white">
            <option value="">Tất cả</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Kho lưu trữ</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full border border-gray-300 rounded-lg text-xs px-2.5 py-2 bg-white">
            <option value="">Tất cả kho</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Loại nghiệp vụ</label>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full border border-gray-300 rounded-lg text-xs px-2.5 py-2 bg-white">
            <option value="">Tất cả nghiệp vụ</option>
            <option value="Nhập sổ">Nhập sổ</option>
            <option value="Mượn/Xuất sổ">Mượn/Xuất sổ</option>
            <option value="Thế chấp">Thế chấp</option>
            <option value="Xuất bán">Xuất bán</option>
            <option value="Tách sổ">Tách sổ</option>
            <option value="Cấp đổi GCN">Cấp đổi GCN</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Từ ngày</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border border-gray-300 rounded-lg text-xs px-2.5 py-2 bg-white" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Đến ngày</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border border-gray-300 rounded-lg text-xs px-2.5 py-2 bg-white" />
        </div>
        <button type="submit" className="px-4 py-2 text-xs font-bold rounded-lg bg-[#1E3A8A] text-white hover:bg-blue-800 transition-colors shadow-sm">
          Lọc dữ liệu
        </button>
      </form>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 font-semibold text-gray-700">
              <tr>
                <th className="px-3 py-3 text-left w-12">STT</th>
                <th className="px-3 py-3 text-left">Ngày ghi sổ</th>
                <th className="px-3 py-3 text-left">Loại nghiệp vụ</th>
                <th className="px-3 py-3 text-left">Số chứng từ (Voucher)</th>
                <th className="px-3 py-3 text-left">Diễn giải chi tiết</th>
                <th className="px-3 py-3 text-left">Đối tượng sử dụng</th>
                <th className="px-3 py-3 text-left">Kho lưu trữ</th>
                <th className="px-3 py-3 text-right">In biên bản</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6">
                    <LoadingFallback
                      message="Đang tải nhật ký biến động kho..."
                      onRetry={() => load()}
                      onForceLocal={() => {
                        setLogs(mockStore.getLogs());
                        setLoading(false);
                        toast.success('Đã tải dữ liệu nhật ký cục bộ');
                      }}
                    />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">Chưa có dữ liệu nhật ký.</td></tr>
              ) : (
                logs.map((l, i) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2.5 text-gray-700 font-medium">{l.log_date ? format(new Date(l.log_date), 'dd/MM/yyyy') : ''}</td>
                    <td className="px-3 py-2.5 font-bold text-gray-900">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        l.action_type.includes('Nhập') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        l.action_type.includes('Xuất') ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                        l.action_type.includes('Thế chấp') ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {l.action_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {l.document_no ? (
                        <span className="font-mono font-bold text-[#1E3A8A] bg-blue-50/80 px-2 py-0.5 rounded border border-blue-200">
                          {l.document_no}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-800 max-w-xs">{l.description}</td>
                    <td className="px-3 py-2.5 text-gray-600 font-medium">{l.used_by || '-'}</td>
                    <td className="px-3 py-2.5 text-gray-600 font-medium">
                      {l.warehouse?.name || (l.warehouse_id ? warehouses.find(w => w.id === l.warehouse_id)?.name : 'Chưa xác định')}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {l.document_no && (
                        <button
                          onClick={() => setSelectedVoucherLog(l)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                        >
                          In phiếu
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedVoucherLog && (
        <VoucherPrintModal
          isOpen={true}
          onClose={() => setSelectedVoucherLog(null)}
          item={{
            id: selectedVoucherLog.id,
            type: selectedVoucherLog.action_type.includes('Nhập') ? 'checkin' : 'checkout',
            voucher_code: selectedVoucherLog.document_no,
            decided_at: selectedVoucherLog.log_date,
            notes: selectedVoucherLog.notes,
            asset: {
              certificate_no: selectedVoucherLog.description?.includes('GCN') 
                ? (selectedVoucherLog.description.match(/GCN-[A-Za-z0-9-]+/)?.[0] || selectedVoucherLog.description)
                : 'GCN QSDĐ',
              subdivision: '',
              lot_no: '',
              owner_name: 'Công ty Cổ phần Tập đoàn VMT',
              area: 0,
            },
            details: {
              reason: selectedVoucherLog.description,
              department: selectedVoucherLog.used_by || 'Ban Tài chính (BTC VMT)',
              receiverName: selectedVoucherLog.used_by || 'Người nhận bàn giao',
            },
          }}
          transaction={{
            created_at: selectedVoucherLog.log_date,
            created_by: {
              full_name: selectedVoucherLog.performer?.full_name || profile?.full_name || 'Thủ kho phụ trách',
              email: selectedVoucherLog.performer?.email || profile?.email || '',
            },
          }}
          warehouse={warehouses.find(w => w.id === selectedVoucherLog.warehouse_id)}
        />
      )}
    </div>
  );
};
