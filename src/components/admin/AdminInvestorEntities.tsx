import React, { useState, useEffect, useMemo } from 'react';
import { InvestorEntity } from '../../types';
import { 
  fetchInvestorEntities, 
  createInvestorEntity, 
  updateInvestorEntity, 
  deleteInvestorEntity 
} from '../../api/investorEntities';
import { mockStore } from '../../lib/mockStore';
import { 
  Building, Plus, Edit2, Trash2, Search, X, 
  RotateCcw, CheckCheck, HelpCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ConfirmModal } from '../ConfirmModal';
import { LoadingFallback } from '../LoadingFallback';

export const AdminInvestorEntities: React.FC = () => {
  const [investorEntities, setInvestorEntities] = useState<InvestorEntity[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Modals
  const [investorSearch, setInvestorSearch] = useState('');
  const [isAddInvestorOpen, setIsAddInvestorOpen] = useState(false);
  const [newInvestorName, setNewInvestorName] = useState('');
  const [newInvestorCode, setNewInvestorCode] = useState('');
  const [newInvestorNote, setNewInvestorNote] = useState('');
  const [editingInvestor, setEditingInvestor] = useState<InvestorEntity | null>(null);
  const [editInvestorName, setEditInvestorName] = useState('');
  const [editInvestorCode, setEditInvestorCode] = useState('');
  const [editInvestorNote, setEditInvestorNote] = useState('');
  const [isSavingInvestor, setIsSavingInvestor] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; warning?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const invs = await fetchInvestorEntities().catch(() => mockStore.getInvestorEntities());
      setInvestorEntities(invs || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải dữ liệu pháp nhân CĐT/NĐT');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Chuẩn hóa mã pháp nhân: viết hoa, loại bỏ dấu tiếng Việt, thay khoảng trắng/ký tự đặc biệt bằng dấu gạch dưới
  const normalizeCompanyCode = (text: string): string => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_');
  };

  // Validate mã pháp nhân
  const validateCompanyCode = (code: string, currentId?: string): { valid: boolean; error?: string } => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { valid: true };
    }

    // Format check: Viết hoa không dấu, không khoảng trắng, chỉ gồm A-Z, 0-9 và dấu gạch dưới _
    const formatRegex = /^[A-Z0-9_]+$/;
    if (!formatRegex.test(trimmed)) {
      return {
        valid: false,
        error: 'Mã pháp nhân phải viết hoa, không dấu tiếng Việt và không chứa khoảng trắng (Ví dụ: VMT_GROUP, SUN_LAND, TECH_CAPITAL).'
      };
    }

    // Duplicate check: không trùng mã với các pháp nhân khác
    const isDuplicate = investorEntities.some(
      e => e.id !== currentId && e.company_code && e.company_code.trim().toUpperCase() === trimmed.toUpperCase()
    );
    if (isDuplicate) {
      return {
        valid: false,
        error: `Mã pháp nhân "${trimmed}" đã tồn tại trên hệ thống. Vui lòng đặt mã khác để không bị trùng lặp!`
      };
    }

    return { valid: true };
  };

  // Thêm mới Pháp nhân CĐT/NĐT
  const handleAddInvestorEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvestorName.trim()) {
      toast.error('Vui lòng nhập tên pháp nhân CĐT/NĐT');
      return;
    }

    const val = validateCompanyCode(newInvestorCode);
    if (!val.valid) {
      toast.error(val.error!);
      return;
    }

    setIsSavingInvestor(true);
    try {
      const created = await createInvestorEntity({
        name: newInvestorName.trim(),
        company_code: newInvestorCode.trim() ? newInvestorCode.trim().toUpperCase() : null,
        note: newInvestorNote.trim() || null,
      });
      setInvestorEntities(prev => [...prev, created]);
      toast.success(`Đã thêm mới pháp nhân "${created.name}"`);
      setNewInvestorName('');
      setNewInvestorCode('');
      setNewInvestorNote('');
      setIsAddInvestorOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi thêm mới pháp nhân');
    } finally {
      setIsSavingInvestor(false);
    }
  };

  // Cập nhật Pháp nhân CĐT/NĐT
  const handleUpdateInvestorEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvestor) return;

    if (!editInvestorName.trim()) {
      toast.error('Vui lòng nhập tên pháp nhân');
      return;
    }

    const val = validateCompanyCode(editInvestorCode, editingInvestor.id);
    if (!val.valid) {
      toast.error(val.error!);
      return;
    }

    setIsSavingInvestor(true);
    try {
      const updated = await updateInvestorEntity(editingInvestor.id, {
        name: editInvestorName.trim(),
        company_code: editInvestorCode.trim() ? editInvestorCode.trim().toUpperCase() : null,
        note: editInvestorNote.trim() || null,
      });
      setInvestorEntities(prev => prev.map(item => item.id === editingInvestor.id ? { ...item, ...updated } : item));
      toast.success(`Đã cập nhật pháp nhân "${updated.name}"`);
      setEditingInvestor(null);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi cập nhật pháp nhân');
    } finally {
      setIsSavingInvestor(false);
    }
  };

  // Xóa Pháp nhân
  const confirmExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteInvestorEntity(deleteTarget.id);
      toast.success(`Đã xóa "${deleteTarget.name}"`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.message || 'Thao tác không thành công'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered list
  const filteredInvestorEntities = useMemo(() => {
    return investorEntities.filter(e => {
      if (!investorSearch.trim()) return true;
      const s = investorSearch.toLowerCase();
      const matchName = e.name.toLowerCase().includes(s);
      const matchCode = e.company_code ? e.company_code.toLowerCase().includes(s) : false;
      const matchNote = e.note ? e.note.toLowerCase().includes(s) : false;
      return matchName || matchCode || matchNote;
    });
  }, [investorEntities, investorSearch]);

  if (loading) {
    return (
      <LoadingFallback
        message="Đang tải danh sách pháp nhân CĐT/NĐT..."
        onRetry={loadData}
        onForceLocal={() => {
          setInvestorEntities(mockStore.getInvestorEntities());
          setLoading(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-rose-50/80 p-5 rounded-xl border border-rose-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
            <Building className="w-4 h-4 text-rose-700" />
            Danh mục Pháp nhân Chủ đầu tư / Nhà đầu tư (CĐT & NĐT)
          </h3>
          <p className="text-xs text-rose-800 mt-1 leading-relaxed">
            Quản lý danh sách các thực thể pháp nhân (Doanh nghiệp, Công ty thành viên, Quỹ đầu tư) sở hữu Giấy chứng nhận QSDĐ. 
            Mã pháp nhân được chuẩn hóa viết hoa không dấu để liên kết CĐT mặc định cho Dự án, gán quyền đại diện cho tài khoản NĐT và lưu vết lịch sử chuyển nhượng.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewInvestorName('');
            setNewInvestorCode('');
            setNewInvestorNote('');
            setIsAddInvestorOpen(true);
          }}
          className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Thêm Pháp nhân CĐT/NĐT
        </button>
      </div>

      {/* Toolbar: Search & Count */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo tên pháp nhân, mã doanh nghiệp hoặc ghi chú..."
            value={investorSearch}
            onChange={e => setInvestorSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600 bg-white"
          />
          {investorSearch && (
            <button
              type="button"
              onClick={() => setInvestorSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between sm:justify-end">
          <span className="text-xs text-gray-500 font-medium">
            Hiển thị <span className="font-bold text-gray-800">{filteredInvestorEntities.length}</span> / {investorEntities.length} pháp nhân
          </span>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Làm mới
          </button>
        </div>
      </div>

      {/* Table List */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50/90 text-gray-700 font-semibold border-b border-gray-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3.5 w-12 text-center">STT</th>
                <th className="px-4 py-3.5">Tên Pháp nhân CĐT/NĐT</th>
                <th className="px-4 py-3.5 w-48">Mã Pháp nhân</th>
                <th className="px-4 py-3.5">Ghi chú nghiệp vụ</th>
                <th className="px-4 py-3.5 w-36">Ngày khởi tạo</th>
                <th className="px-4 py-3.5 w-28 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvestorEntities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Building className="w-8 h-8 mx-auto mb-2 text-gray-300 opacity-60" />
                    <p className="font-medium">Chưa có pháp nhân CĐT/NĐT nào</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Nhấn "Thêm Pháp nhân CĐT/NĐT" để tạo mới các thực thể sở hữu GCN
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInvestorEntities.map((ent, idx) => (
                  <tr key={ent.id} className="hover:bg-rose-50/20 transition-colors">
                    <td className="px-4 py-3.5 text-center text-gray-400 font-mono">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-rose-100 text-rose-800 rounded-md">
                          <Building className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-gray-900 text-sm">{ent.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono">
                      {ent.company_code ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          {ent.company_code}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-[11px]">Chưa đặt mã</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 max-w-xs truncate">
                      {ent.note || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                      {ent.created_at ? format(new Date(ent.created_at), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingInvestor(ent);
                            setEditInvestorName(ent.name);
                            setEditInvestorCode(ent.company_code || '');
                            setEditInvestorNote(ent.note || '');
                          }}
                          className="p-1.5 text-gray-500 hover:text-[#1E3A8A] hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Chỉnh sửa pháp nhân"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget({
                              id: ent.id,
                              name: ent.name,
                              warning: 'Lưu ý: Nếu pháp nhân này đang được gán làm CĐT mặc định của Dự án hoặc chủ sở hữu hiện tại của GCN, dữ liệu liên quan có thể bị ảnh hưởng.',
                            });
                          }}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Xóa pháp nhân"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Thêm mới Pháp nhân CĐT/NĐT */}
      {isAddInvestorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Thêm mới Pháp nhân CĐT/NĐT</h3>
                  <p className="text-xs text-gray-500">Đăng ký thực thể sở hữu Giấy chứng nhận quyền sử dụng đất</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddInvestorOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddInvestorEntity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tên pháp nhân đầy đủ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Công ty Cổ phần Tập đoàn VMT, CTCP Đầu tư BĐS Đông Đô..."
                  value={newInvestorName}
                  onChange={e => setNewInvestorName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Mã pháp nhân (Company Code)
                  </label>
                  {newInvestorCode && (
                    <button
                      type="button"
                      onClick={() => setNewInvestorCode(normalizeCompanyCode(newInvestorCode))}
                      className="text-[11px] text-rose-700 hover:text-rose-900 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Chuẩn hóa (Viết hoa &amp; Không dấu)
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Ví dụ: VMT_GROUP, DONGDO_LAND, VINHOMES"
                  value={newInvestorCode}
                  onChange={e => setNewInvestorCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600 bg-gray-50/50"
                />
                <div className="mt-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <p className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    Gợi ý định dạng chuẩn:
                  </p>
                  <p className="text-[11px] text-slate-600 leading-normal">
                    Viết hoa, không dấu tiếng Việt, không khoảng trắng (chỉ dùng ký tự <code className="font-mono font-bold bg-white px-1 py-0.5 rounded border text-rose-800">A-Z, 0-9, _</code>). 
                    Mã này duy nhất trong hệ thống và không được trùng lặp.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú nghiệp vụ / Mã số thuế / Thông tin liên hệ
                </label>
                <textarea
                  rows={3}
                  placeholder="Thông tin thêm về địa chỉ đăng ký kinh doanh, người đại diện, MST..."
                  value={newInvestorNote}
                  onChange={e => setNewInvestorNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-rose-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsAddInvestorOpen(false)}
                  disabled={isSavingInvestor}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingInvestor}
                  className="px-5 py-2 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  {isSavingInvestor ? 'Đang lưu...' : 'Thêm pháp nhân'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Chỉnh sửa Pháp nhân CĐT/NĐT */}
      {editingInvestor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-[#1E3A8A] rounded-lg">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Sửa thông tin Pháp nhân</h3>
                  <p className="text-xs text-gray-500">Cập nhật tên, mã doanh nghiệp và ghi chú nghiệp vụ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvestor(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateInvestorEntity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tên pháp nhân đầy đủ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editInvestorName}
                  onChange={e => setEditInvestorName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Mã pháp nhân (Company Code)
                  </label>
                  {editInvestorCode && (
                    <button
                      type="button"
                      onClick={() => setEditInvestorCode(normalizeCompanyCode(editInvestorCode))}
                      className="text-[11px] text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Chuẩn hóa (Viết hoa &amp; Không dấu)
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={editInvestorCode}
                  onChange={e => setEditInvestorCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] focus:border-[#1E3A8A] bg-gray-50/50"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Gợi ý: Viết hoa, không dấu tiếng Việt, không khoảng trắng (Ví dụ: VINHOMES, VMT_INVEST, SUN_GROUP). Mã không được trùng lặp.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú nghiệp vụ / Mã số thuế / Thông tin liên hệ
                </label>
                <textarea
                  rows={3}
                  value={editInvestorNote}
                  onChange={e => setEditInvestorNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A] focus:border-[#1E3A8A]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditingInvestor(null)}
                  disabled={isSavingInvestor}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingInvestor}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-blue-800 rounded-lg shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  {isSavingInvestor ? 'Đang lưu...' : 'Lưu thay đổi'}
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
        title="Xác nhận xóa Pháp nhân CĐT/NĐT"
        message={`${deleteTarget?.warning ? deleteTarget.warning + ' ' : ''}Bạn có chắc chắn muốn xóa pháp nhân "${deleteTarget?.name}" khỏi cơ sở dữ liệu?`}
        confirmText="Xác nhận xóa"
        confirmVariant="danger"
        loading={isDeleting}
      />
    </div>
  );
};
