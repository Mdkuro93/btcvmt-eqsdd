import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Asset } from '../types';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (assetData: Partial<Asset>) => Promise<void>;
  projects: any[];
  warehouses: any[];
}

export const CreateAssetModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, projects, warehouses }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [certificateNo, setCertificateNo] = useState('');
  const [projectId, setProjectId] = useState('');
  const [subdivision, setSubdivision] = useState('');
  const [area, setArea] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateNo || !profile) return;

    setLoading(true);
    try {
      await onSubmit({
        certificate_no: certificateNo,
        project_id: projectId || null,
        subdivision: subdivision || null,
        area: area ? Number(area) : null,
        owner_name: ownerName || null,
        warehouse_id: warehouseId || null,
        custody_status: 'in_stock',
        lifecycle_status: 'active',
        sale_status: 'not_ready',
        mortgage_status: 'none'
      });
      toast.success('Khai báo GCN thành công!');
      onClose();
      setCertificateNo('');
      setProjectId('');
      setSubdivision('');
      setArea('');
      setOwnerName('');
      setWarehouseId('');
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-lg bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            Khai báo GCN QSDĐ mới
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số GCN <span className="text-red-500">*</span></label>
            <input required type="text" value={certificateNo} onChange={e => setCertificateNo(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="VD: CQ 123456" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dự án</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="">-- Chọn dự án --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phân khu</label>
              <input type="text" value={subdivision} onChange={e => setSubdivision(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="VD: Khu A" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Diện tích (m²)</label>
              <input type="number" step="0.01" min="0" value={area} onChange={e => setArea(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="VD: 100.5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên chủ sở hữu</label>
              <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Tên CSH" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kho quản lý (đang giữ sổ)</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
              <option value="">-- Chọn kho --</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.is_central ? ' (Kho trung tâm)' : ''}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !certificateNo}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] border border-transparent rounded-md hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1E3A8A] disabled:opacity-50"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Đang lưu...' : 'Khai báo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
