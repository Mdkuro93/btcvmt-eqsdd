import React, { useState, useEffect } from 'react';
import { Warehouse, Region } from '../../types';
import { fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, fetchRegions } from '../../api/assets';
import { mockStore } from '../../lib/mockStore';
import { Warehouse as WarehouseIcon, Plus, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../ConfirmModal';
import { LoadingFallback } from '../LoadingFallback';

export const AdminWarehouses: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newWarehouseCode, setNewWarehouseCode] = useState('');
  const [newWarehouseRegionCode, setNewWarehouseRegionCode] = useState('VMN');
  const [newWarehouseRegionId, setNewWarehouseRegionId] = useState('');
  const [newWarehouseIsCentral, setNewWarehouseIsCentral] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<{
    id: string;
    name: string;
    code?: string;
    region_code?: string;
    region_id?: string | null;
    is_central?: boolean;
  } | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [w, r] = await Promise.all([
        fetchWarehouses().catch(() => mockStore.getWarehouses()),
        fetchRegions().catch(() => mockStore.getRegions()),
      ]);
      setWarehouses(w || []);
      setRegions(r || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu kho lưu trữ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) {
      toast.error('Vui lòng nhập tên kho');
      return;
    }
    try {
      await createWarehouse({
        name: newWarehouseName.trim(),
        code: newWarehouseCode.trim() || undefined,
        region_code: newWarehouseRegionCode || 'VMN',
        region_id: newWarehouseRegionId || null,
        is_central: newWarehouseIsCentral,
      });
      toast.success('Thêm kho thành công');
      setNewWarehouseName('');
      setNewWarehouseCode('');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể thêm kho'));
    }
  };

  const handleUpdateWarehouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWarehouse || !editingWarehouse.name.trim()) return;
    try {
      await updateWarehouse(editingWarehouse.id, {
        name: editingWarehouse.name.trim(),
        code: editingWarehouse.code?.trim() || undefined,
        region_code: editingWarehouse.region_code || 'VMN',
        region_id: editingWarehouse.region_id || null,
        is_central: editingWarehouse.is_central,
      });
      toast.success('Cập nhật kho thành công');
      setEditingWarehouse(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi: ' + (err.message || 'Không thể cập nhật kho'));
    }
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteWarehouse(deleteTarget.id);
      toast.success(`Đã xóa "${deleteTarget.name}"`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <LoadingFallback
        message="Đang tải danh sách kho lưu trữ..."
        onRetry={loadData}
        onForceLocal={() => {
          setWarehouses(mockStore.getWarehouses());
          setRegions(mockStore.getRegions());
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Form thêm mới kho */}
      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
        <h3 className="text-xs font-bold uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Thêm Kho lưu trữ chứng từ mới
        </h3>
        <form onSubmit={handleAddWarehouse} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tên kho *</label>
              <input
                type="text"
                value={newWarehouseName}
                onChange={(e) => setNewWarehouseName(e.target.value)}
                placeholder="VD: Kho Dự Án Bình Dương..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Mã STT Kho (3 số)</label>
              <input
                type="text"
                maxLength={3}
                value={newWarehouseCode}
                onChange={(e) => setNewWarehouseCode(e.target.value)}
                placeholder="001, 002..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Vùng</label>
              <select
                value={newWarehouseRegionCode}
                onChange={(e) => setNewWarehouseRegionCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="VMN">VMN (Miền Nam)</option>
                <option value="VMT">VMT (Miền Trung)</option>
                <option value="VMB">VMB (Miền Bắc)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-4">
              <select
                value={newWarehouseRegionId}
                onChange={(e) => setNewWarehouseRegionId(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
              >
                <option value="">-- Liên kết Vùng --</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={newWarehouseIsCentral}
                  onChange={(e) => setNewWarehouseIsCentral(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Kho Tổng Trung Tâm</span>
              </label>
            </div>

            <button 
              type="submit" 
              className="px-4 py-2 bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Thêm kho
            </button>
          </div>
        </form>
      </div>

      {/* Danh sách kho */}
      <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        {warehouses.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">Chưa có kho nào.</div>
        ) : (
          warehouses.map((w) => {
            const rCode = w.region_code || (w.regions?.name?.includes('Bắc') ? 'VMB' : w.regions?.name?.includes('Nam') ? 'VMN' : 'VMT');
            const wCode = w.code || '001';
            return (
              <div key={w.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs">
                    <WarehouseIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{w.name}</span>
                      <span className="font-mono text-xs px-2 py-0.5 bg-blue-50 text-[#1E3A8A] border border-blue-200 rounded">
                        {rCode}-{wCode}
                      </span>
                      {w.is_central && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">Kho Tổng</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Mã Vùng: <span className="font-semibold text-gray-700">{rCode}</span> · STT Kho: <span className="font-semibold text-gray-700">{wCode}</span> {w.regions?.name ? `· Vùng: ${w.regions.name}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingWarehouse({
                      id: w.id,
                      name: w.name,
                      code: w.code,
                      region_code: w.region_code,
                      region_id: w.region_id,
                      is_central: w.is_central,
                    })}
                    className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                    title="Sửa kho"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDeleteTarget({ id: w.id, name: w.name })} 
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Xóa kho"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: Edit Warehouse */}
      {editingWarehouse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E3A8A]" /> Chỉnh sửa Kho lưu trữ
              </h3>
              <button onClick={() => setEditingWarehouse(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateWarehouseSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Kho *</label>
                <input
                  type="text"
                  value={editingWarehouse.name}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mã STT Kho</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={editingWarehouse.code || ''}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Mã Vùng</label>
                  <select
                    value={editingWarehouse.region_code || 'VMN'}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, region_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="VMN">VMN (Miền Nam)</option>
                    <option value="VMT">VMT (Miền Trung)</option>
                    <option value="VMB">VMB (Miền Bắc)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Vùng trực thuộc</label>
                <select
                  value={editingWarehouse.region_id || ''}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, region_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Không liên kết --</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={!!editingWarehouse.is_central}
                  onChange={(e) => setEditingWarehouse({ ...editingWarehouse, is_central: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Kho Tổng Trung Tâm</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWarehouse(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 cursor-pointer"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmExecuteDelete}
        title="Xác nhận xóa Kho"
        message={`Bạn có chắc chắn muốn xóa kho "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />
    </div>
  );
};
