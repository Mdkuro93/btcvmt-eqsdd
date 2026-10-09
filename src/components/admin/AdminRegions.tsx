import React, { useState, useEffect } from 'react';
import { Region, Area } from '../../types';
import { fetchRegions, createRegion, updateRegion, deleteRegion, fetchAreas } from '../../api/assets';
import { Building2, Plus, Edit2, Trash2, X, AlertTriangle, Copy, Check, FileCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../ConfirmModal';
import { LoadingFallback } from '../LoadingFallback';

export const AdminRegions: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionCode, setNewRegionCode] = useState('');
  const [editingRegion, setEditingRegion] = useState<{ id: string; name: string; code: string } | null>(null);

  // Migration modal / notice state
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [hasCodeColumnMissingError, setHasCodeColumnMissingError] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; warning?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([
        fetchRegions(),
        fetchAreas(),
      ]);
      setRegions(r || []);
      setAreas(a || []);
      setHasCodeColumnMissingError(false);
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message || '');
      const code = String(err?.code || '');
      if (code === '42703' || code === 'PGRST204' || msg.includes('42703') || msg.includes('PGRST204')) {
        setHasCodeColumnMissingError(true);
      }
      toast.error('Lỗi tải dữ liệu vùng hoạt động: ' + (err.message || 'Lỗi CSDL'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegionName.trim()) {
      toast.error('Vui lòng nhập tên vùng');
      return;
    }
    const cleanCode = newRegionCode.trim().toUpperCase();
    if (cleanCode && !/^[A-Z0-9]{2,8}$/.test(cleanCode)) {
      toast.error('Mã vùng phải từ 2-8 ký tự in hoa hoặc chữ số (VD: VMB, VMT, VMN)');
      return;
    }
    try {
      await createRegion(newRegionName.trim(), cleanCode || null);
      toast.success('Thêm vùng thành công');
      setNewRegionName('');
      setNewRegionCode('');
      loadData();
    } catch (err: any) {
      const msg = String(err?.message || '');
      const code = String(err?.code || '');
      if (code === '42703' || code === 'PGRST204' || msg.includes('42703') || msg.includes('PGRST204')) {
        setHasCodeColumnMissingError(true);
        setShowMigrationModal(true);
      }
      toast.error(err.message || 'Không thể thêm vùng', { duration: 7000 });
    }
  };

  const handleUpdateRegionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRegion || !editingRegion.name.trim()) return;
    const cleanCode = editingRegion.code.trim().toUpperCase();
    if (cleanCode && !/^[A-Z0-9]{2,8}$/.test(cleanCode)) {
      toast.error('Mã vùng phải từ 2-8 ký tự in hoa hoặc chữ số (VD: VMB, VMT, VMN)');
      return;
    }
    try {
      await updateRegion(editingRegion.id, editingRegion.name.trim(), cleanCode || null);
      toast.success('Cập nhật vùng thành công');
      setEditingRegion(null);
      loadData();
    } catch (err: any) {
      const msg = String(err?.message || '');
      const code = String(err?.code || '');
      if (code === '42703' || code === 'PGRST204' || msg.includes('42703') || msg.includes('PGRST204')) {
        setHasCodeColumnMissingError(true);
        setShowMigrationModal(true);
      }
      toast.error(err.message || 'Không thể cập nhật vùng', { duration: 7000 });
    }
  };

  const isMigrationPending = hasCodeColumnMissingError;

  const migrationSqlQuick = `-- Chạy lệnh này trên Supabase SQL Editor từ file migration 0095:
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.regions ALTER COLUMN code DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.regions'::regclass AND conname = 'regions_code_key') THEN
    ALTER TABLE public.regions ADD CONSTRAINT regions_code_key UNIQUE (code);
  END IF;
END $$;`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(migrationSqlQuick);
    setCopiedSql(true);
    toast.success('Đã sao chép SQL vào clipboard');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteRegion(deleteTarget.id);
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
        message="Đang tải danh sách vùng hoạt động..."
        onRetry={loadData}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Banner thông báo nếu DB chưa có cột code */}
      {isMigrationPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                Cần chạy Migration 0095 để kích hoạt cột "Mã Vùng"
              </p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Các bản ghi vùng hiện tại chưa có trường <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono font-bold text-amber-900">code</code> trên Supabase (lỗi schema cache PGRST204). Để hoàn tất đồng bộ và tự động sinh mã TSĐB theo vùng, vui lòng thực thi migration trên CSDL.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowMigrationModal(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <FileCode className="w-3.5 h-3.5" /> Xem SQL Migration
          </button>
        </div>
      )}

      {/* Form thêm mới */}
      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
        <h3 className="text-xs font-bold uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Thêm Vùng hoạt động mới
        </h3>
        <form onSubmit={handleAddRegion} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newRegionName}
              onChange={(e) => setNewRegionName(e.target.value)}
              placeholder="Tên vùng mới (VD: Miền Tây, Tây Nguyên)..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={newRegionCode}
              onChange={(e) => setNewRegionCode(e.target.value.toUpperCase())}
              placeholder="Mã viết tắt (VD: VMB, VMT)..."
              maxLength={8}
              className="w-full sm:w-60 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-mono uppercase focus:ring-2 focus:ring-blue-500"
            />
            <button 
              type="submit" 
              className="px-4 py-2 bg-[#1E3A8A] text-white rounded-lg text-sm font-semibold hover:bg-blue-800 flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Thêm vùng
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            Mã vùng (viết tắt) không bắt buộc. Đổi mã vùng chỉ ảnh hưởng mã tài sản cấp MỚI, mã cũ giữ nguyên.
          </p>
        </form>
      </div>

      {/* Danh sách Vùng */}
      <div className="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-xs">
        {regions.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">Chưa có vùng nào.</div>
        ) : (
          regions.map((r) => {
            const areaCount = areas.filter(a => a.region_id === r.id).length;
            return (
              <div key={r.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{r.name}</span>
                      {r.code ? (
                        <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-50 text-[#1E3A8A] border border-blue-200">
                          {r.code}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          Chưa cấu hình mã vùng
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Mã tiền tố TSĐB: <code className="font-mono font-bold text-gray-700">{r.code || 'Chưa có'}</code> · {areaCount} địa bàn trực thuộc
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingRegion({ id: r.id, name: r.name, code: r.code || '' })}
                    className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                    title="Sửa vùng"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDeleteTarget({ 
                      id: r.id, 
                      name: r.name,
                      warning: areaCount > 0 ? `Vùng này đang có ${areaCount} địa bàn trực thuộc!` : undefined
                    })} 
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Xóa vùng"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Edit Region */}
      {editingRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#1E3A8A]" /> Chỉnh sửa Vùng
              </h3>
              <button onClick={() => setEditingRegion(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateRegionSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên Vùng *</label>
                <input
                  type="text"
                  value={editingRegion.name}
                  onChange={(e) => setEditingRegion({ ...editingRegion, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Mã Vùng viết tắt (2-8 ký tự in hoa, để trống nếu chưa cấu hình)
                </label>
                <input
                  type="text"
                  value={editingRegion.code}
                  onChange={(e) => setEditingRegion({ ...editingRegion, code: e.target.value.toUpperCase() })}
                  maxLength={8}
                  placeholder="VD: VMB, VMT, VMN..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Đổi mã vùng chỉ ảnh hưởng mã tài sản cấp MỚI, mã cũ giữ nguyên.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRegion(null)}
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
        title="Xác nhận xóa Vùng"
        message={`${deleteTarget?.warning ? deleteTarget.warning + ' ' : ''}Bạn có chắc chắn muốn xóa vùng "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />

      {/* Modal hướng dẫn chạy Migration */}
      {showMigrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-[#1E3A8A]" /> Hướng dẫn chạy Migration 0095
              </h3>
              <button 
                type="button"
                onClick={() => setShowMigrationModal(false)} 
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Do cơ sở dữ liệu Supabase đang thiếu cột <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono font-semibold">code</code> trong bảng <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono font-semibold">regions</code>, vui lòng copy câu lệnh SQL dưới đây và chạy trên <strong>Supabase SQL Editor</strong>:
            </p>

            <div className="relative bg-slate-900 rounded-lg p-3 text-emerald-400 font-mono text-xs overflow-x-auto max-h-56">
              <pre>{migrationSqlQuick}</pre>
            </div>

            <p className="text-[11px] text-gray-500">
              File migration đầy đủ trong source code: <code className="font-mono text-gray-700 bg-gray-100 px-1 py-0.5 rounded">supabase/migrations/0095_region_code_config_fix_allocate_and_import.sql</code>
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowMigrationModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleCopySql}
                className="px-4 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg hover:bg-blue-800 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSql ? 'Đã sao chép' : 'Sao chép SQL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
