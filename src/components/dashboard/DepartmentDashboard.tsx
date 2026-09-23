import React, { useMemo, useState } from 'react';
import { 
  Building2, 
  FolderGit2, 
  Clock, 
  Calendar, 
  Eye, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  Send,
  FileText,
  Building
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Asset, Project } from '../../types';
import { AssetDetailModal } from './AssetDetailModal';
import { StorageProgressBar } from './StorageProgressBar';

interface DepartmentDashboardProps {
  role: string;
  projectIds?: string[] | null;
  assets: Asset[];
  projects: Project[];
}

export const DepartmentDashboard: React.FC<DepartmentDashboardProps> = ({
  role,
  projectIds,
  assets,
  projects,
}) => {
  // Modal states for inspecting detail assets
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    assets: Asset[];
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    assets: [],
  });

  // Department name mapping
  const departmentName = useMemo(() => {
    switch (role) {
      case 'capital_dept': return 'Ban Nguồn Vốn';
      case 'project_dept': return 'Ban PTDA & Ban Đối Ngoại';
      case 're_dept': return 'Ban Bất Động Sản';
      case 'investor': return 'Nhà Đầu Tư / Đối Tác';
      case 'supervisor': return 'Ban Kiểm Soát & Giám Sát';
      default: return 'Phòng Ban Chuyên Trách';
    }
  }, [role]);

  // Projects assigned to this department
  const assignedProjects = useMemo(() => {
    if (projectIds && projectIds.length > 0) {
      const filtered = projects.filter(p => projectIds.includes(p.id));
      if (filtered.length > 0) return filtered;
    }
    // Fallback: show top projects that have assets
    return projects;
  }, [projects, projectIds]);

  const assignedProjectIdSet = useMemo(() => {
    return new Set(assignedProjects.map(p => p.id));
  }, [assignedProjects]);

  // Statistics for assigned projects
  const assignedProjectStats = useMemo(() => {
    return assignedProjects.map(p => {
      const projectAssets = assets.filter(a => a.project_id === p.id);
      const inStock = projectAssets.filter(a => a.custody_status === 'in_stock').length;
      const checkedOut = projectAssets.filter(a => a.custody_status === 'checked_out').length;
      const mortgaged = projectAssets.filter(a => a.mortgage_status === 'mortgaged').length;
      const total = projectAssets.length;
      const inStockRate = total > 0 ? Math.round((inStock / total) * 100) : 0;

      return {
        project: p,
        total,
        inStock,
        checkedOut,
        mortgaged,
        inStockRate,
        assets: projectAssets,
      };
    }).filter(p => p.total > 0);
  }, [assignedProjects, assets]);

  // Department checked-out assets (GCN phòng ban đang mượn/giữ)
  const deptCheckedOutAssets = useMemo(() => {
    const checkedOut = assets.filter(a => a.custody_status === 'checked_out');
    
    // Filter matching department name if possible
    const deptKeyword = departmentName.toLowerCase();
    const specificDeptAssets = checkedOut.filter(a => {
      if (!a.current_holder_dept) return false;
      const holder = a.current_holder_dept.toLowerCase();
      if (role === 'capital_dept') return holder.includes('vốn') || holder.includes('capital');
      if (role === 'project_dept') return holder.includes('dự án') || holder.includes('project') || holder.includes('ptda') || holder.includes('đối ngoại') || holder.includes('bđn');
      if (role === 're_dept') return holder.includes('bất động sản') || holder.includes('bđs') || holder.includes('kinh doanh');
      return holder.includes(deptKeyword);
    });

    // If specific found, return those; otherwise return all checked-out for visibility
    if (specificDeptAssets.length > 0) return specificDeptAssets;
    return checkedOut;
  }, [assets, departmentName, role]);

  return (
    <div className="space-y-6">
      {/* Banner thông tin phòng ban */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
            <Building className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900">Không Gian Làm Việc: {departmentName}</div>
            <p className="text-slate-500">Quản lý các Giấy chứng nhận thuộc dự án phụ trách và theo dõi tiến độ mượn trả hồ sơ</p>
          </div>
        </div>
        <Link
          to="/assets"
          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-700 font-semibold border border-slate-200 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
        >
          <span>Tạo phiếu mượn mới</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 1. Bảng: Danh Sách GCN Thuộc Dự Án Phụ Trách */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Danh Sách GCN Thuộc Dự Án Phụ Trách</h3>
              <p className="text-xs text-slate-500">Tổng hợp phân bổ và trạng thái lưu kho của các dự án chuyên môn</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
            {assignedProjectStats.length} Dự án
          </span>
        </div>

        <div className="overflow-x-auto">
          {assignedProjectStats.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Chưa có dữ liệu Giấy chứng nhận cho các dự án phụ trách.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Tên Dự Án</th>
                  <th className="py-3 px-3 text-center">Tổng GCN</th>
                  <th className="py-3 px-3 text-center">Trong Kho</th>
                  <th className="py-3 px-3 text-center">Đang Mượn</th>
                  <th className="py-3 px-3 text-center">Đang Thế Chấp</th>
                  <th className="py-3 px-4 min-w-[180px]">Tiến Độ Lưu Kho An Toàn</th>
                  <th className="py-3 px-3 text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {assignedProjectStats.map(stat => (
                  <tr key={stat.project.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{stat.project.name}</span>
                      </div>
                    </td>

                    {/* Tổng GCN */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Dự án: ${stat.project.name}`,
                          subtitle: `Tổng cộng ${stat.total} Giấy chứng nhận`,
                          assets: stat.assets,
                        })}
                        className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors"
                        title="Bấm để xem danh sách"
                      >
                        {stat.total}
                      </button>
                    </td>

                    {/* Trong Kho */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {stat.inStock}
                      </span>
                    </td>

                    {/* Đang Mượn */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
                        {stat.checkedOut}
                      </span>
                    </td>

                    {/* Đang Thế Chấp */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200">
                        {stat.mortgaged}
                      </span>
                    </td>

                    {/* Thanh Tiến Độ */}
                    <td className="py-3 px-4">
                      <StorageProgressBar inStock={stat.inStock} total={stat.total} />
                    </td>

                    {/* Chi tiết */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Dự án: ${stat.project.name}`,
                          subtitle: `Danh sách chi tiết Giấy chứng nhận thuộc dự án`,
                          assets: stat.assets,
                        })}
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors inline-flex"
                        title="Xem chi tiết"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 2. Bảng: GCN Phòng Ban Đang Mượn / Giữ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Giấy Chứng Nhận Đang Mượn & Giữ</h3>
              <p className="text-xs text-slate-500">Theo dõi thời hạn hoàn trả kho và mục đích sử dụng của các sổ đang mượn</p>
            </div>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
            {deptCheckedOutAssets.length} GCN đang giữ ngoài kho
          </span>
        </div>

        <div className="overflow-x-auto">
          {deptCheckedOutAssets.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="font-medium text-slate-700">Phòng ban hiện không giữ Giấy chứng nhận nào ngoài kho.</p>
              <p className="text-slate-400">Tất cả sổ đã được lưu trữ an toàn trong kho bảo mật.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Số GCN & Mã TSĐB</th>
                  <th className="py-3 px-3">Dự Án / Kho Gốc</th>
                  <th className="py-3 px-3">Đơn Vị / Người Giữ</th>
                  <th className="py-3 px-3">Mục Đích Mượn</th>
                  <th className="py-3 px-3">Hạn Hoàn Trả Kho</th>
                  <th className="py-3 px-3 text-center">Trạng Thái Hạn</th>
                  <th className="py-3 px-3 text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {deptCheckedOutAssets.map((asset) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const returnDate = asset.expected_return_date ? new Date(asset.expected_return_date) : null;
                  const isOverdue = returnDate && returnDate < today;
                  const daysRemaining = returnDate ? Math.ceil((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <tr key={asset.id} className="hover:bg-amber-50/30 transition-colors">
                      {/* Số GCN */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{asset.certificate_no}</div>
                        <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                          {asset.asset_code || '-'}
                        </div>
                      </td>

                      {/* Dự án / Kho gốc */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">
                          {asset.projects?.name || asset.business_project_name || 'Chưa gắn dự án'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {asset.warehouses?.name || 'Kho gốc'}
                        </div>
                      </td>

                      {/* Đơn vị giữ */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">
                          {asset.current_holder_dept || departmentName}
                        </div>
                      </td>

                      {/* Mục đích mượn */}
                      <td className="py-3 px-3 text-slate-600 max-w-[200px]">
                        <span className="line-clamp-2" title={asset.borrow_purpose || 'Phục vụ công tác chuyên môn'}>
                          {asset.borrow_purpose || 'Phục vụ công tác chuyên môn'}
                        </span>
                      </td>

                      {/* Hạn hoàn trả */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{asset.expected_return_date || 'Chưa ấn định'}</span>
                        </div>
                      </td>

                      {/* Trạng thái hạn */}
                      <td className="py-3 px-3 text-center">
                        {isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertTriangle className="w-3 h-3" />
                            Quá hạn {Math.abs(daysRemaining || 0)} ngày
                          </span>
                        ) : daysRemaining !== null && daysRemaining <= 3 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Sắp đến hạn ({daysRemaining} ngày)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Còn hạn {daysRemaining ? `(${daysRemaining} ngày)` : ''}
                          </span>
                        )}
                      </td>

                      {/* Chi tiết */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setModalState({
                            isOpen: true,
                            title: `Chi tiết GCN: ${asset.certificate_no}`,
                            subtitle: `Đơn vị đang giữ: ${asset.current_holder_dept || departmentName}`,
                            assets: [asset],
                          })}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors inline-flex"
                          title="Xem chi tiết GCN"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal chi tiết GCN */}
      <AssetDetailModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        title={modalState.title}
        subtitle={modalState.subtitle}
        assets={modalState.assets}
      />
    </div>
  );
};
