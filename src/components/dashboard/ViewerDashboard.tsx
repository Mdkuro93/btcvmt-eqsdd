import React, { useState, useMemo } from 'react';
import { Search, Building, ShieldCheck, ArrowRight, FileText, CheckCircle2, MapPin, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Asset, Project, Warehouse } from '../../types';
import { DonutChart } from './DonutChart';
import { AssetDetailModal } from './AssetDetailModal';

interface ViewerDashboardProps {
  assets: Asset[];
  projects: Project[];
  warehouses: Warehouse[];
  role: string;
}

export const ViewerDashboard: React.FC<ViewerDashboardProps> = ({
  assets,
  projects,
  warehouses,
  role,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
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

  const totalAssets = assets.length;
  const inStockAssets = useMemo(() => assets.filter((a) => a.custody_status === 'in_stock'), [assets]);
  const mortgagedAssets = useMemo(() => assets.filter((a) => a.mortgage_status === 'mortgaged'), [assets]);
  const checkedOutAssets = useMemo(() => assets.filter((a) => a.custody_status === 'checked_out'), [assets]);

  // Quick lookup filter
  const filteredAssets = useMemo(() => {
    let list = assets;
    if (selectedProjectId !== 'all') {
      list = list.filter((a) => a.project_id === selectedProjectId);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (a) =>
          (a.certificate_no && a.certificate_no.toLowerCase().includes(q)) ||
          (a.asset_code && a.asset_code.toLowerCase().includes(q)) ||
          (a.land_lot_no && a.land_lot_no.toLowerCase().includes(q)) ||
          (a.map_sheet_no && a.map_sheet_no.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 10); // Display top 10 previews
  }, [assets, selectedProjectId, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Banner Tra Cứu Dành Cho Nhóm Khách & Nhân Viên Tra Cứu */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Phân Hệ Tra Cứu Trực Tuyến ({role === 'viewer' ? 'Khách tra cứu' : 'Nhân viên truy vấn'})</span>
          </div>
          <h2 className="text-lg font-bold text-white">Tra Cứu Hồ Sơ &amp; Tình Trạng Giấy Chứng Nhận</h2>
          <p className="text-xs text-blue-200 max-w-2xl leading-relaxed">
            Hệ thống cung cấp giao diện tra cứu nhanh thông tin số sổ, phân khu, kho lưu trữ và trạng thái thế chấp ngân hàng theo quyền hạn được phê duyệt.
          </p>
        </div>
        <Link
          to="/lookup"
          className="whitespace-nowrap px-5 py-2.5 bg-white hover:bg-blue-50 text-[#1E3A8A] font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 shrink-0"
        >
          <Search className="w-4 h-4" />
          <span>Mở Cổng Tra Cứu Chuyên Sâu</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Biểu Đồ Trạng Thái Quỹ Đất */}
      <DonutChart
        title="Tổng Quan Cơ Cấu Hồ Sơ Quỹ Đất (Toàn Hệ Thống)"
        subtitle="Dữ liệu trạng thái thực tế phục vụ tra cứu và kiểm tra chéo"
        total={totalAssets}
        unit="GCN"
        segments={[
          {
            label: 'Trong kho (Lưu trữ an toàn)',
            count: inStockAssets.length,
            color: '#10B981',
            hoverColor: '#059669',
            bgBadge: 'bg-emerald-50',
            borderBadge: 'border-emerald-200',
            textBadge: 'text-emerald-700',
          },
          {
            label: 'Đang thế chấp Ngân hàng',
            count: mortgagedAssets.length,
            color: '#F97316',
            hoverColor: '#EA580C',
            bgBadge: 'bg-orange-50',
            borderBadge: 'border-orange-200',
            textBadge: 'text-orange-700',
          },
          {
            label: 'Đang mượn ngoài / luân chuyển',
            count: checkedOutAssets.length,
            color: '#3B82F6',
            hoverColor: '#2563EB',
            bgBadge: 'bg-blue-50',
            borderBadge: 'border-blue-200',
            textBadge: 'text-blue-700',
          },
        ]}
        onSegmentClick={(seg) => {
          if (seg.label.includes('Trong kho')) {
            setModalState({
              isOpen: true,
              title: 'Danh sách GCN đang lưu kho',
              subtitle: `Tổng cộng ${inStockAssets.length} GCN`,
              assets: inStockAssets,
            });
          } else if (seg.label.includes('thế chấp')) {
            setModalState({
              isOpen: true,
              title: 'Danh sách GCN đang thế chấp',
              subtitle: `Tổng cộng ${mortgagedAssets.length} GCN`,
              assets: mortgagedAssets,
            });
          } else {
            setModalState({
              isOpen: true,
              title: 'Danh sách GCN đang mượn ngoài',
              subtitle: `Tổng cộng ${checkedOutAssets.length} GCN`,
              assets: checkedOutAssets,
            });
          }
        }}
      />

      {/* Tra cứu nhanh tại chỗ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Xem Nhanh Danh Sách Giấy Chứng Nhận</h3>
              <p className="text-xs text-slate-500">Tìm kiếm theo Số GCN, Mã TSĐB, Số tờ, Số thửa</p>
            </div>
          </div>
          <Link
            to="/lookup"
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1"
          >
            <span>Trang tra cứu đầy đủ</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Search controls */}
        <div className="p-4 bg-white border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Nhập Số GCN hoặc Mã TSĐB..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="all">Tất cả dự án ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Results table */}
        <div className="overflow-x-auto">
          {filteredAssets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Không tìm thấy Giấy chứng nhận nào khớp với bộ lọc.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Số GCN / Mã TSĐB</th>
                  <th className="py-3 px-3">Dự Án</th>
                  <th className="py-3 px-3">Thửa / Tờ Bản Đồ</th>
                  <th className="py-3 px-3 text-center">Trạng Thái Kho</th>
                  <th className="py-3 px-3 text-center">Thế Chấp</th>
                  <th className="py-3 px-3 text-center">Chi Tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{asset.certificate_no}</div>
                      <div className="font-mono text-[10px] text-slate-400">{asset.asset_code}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {asset.projects?.name || asset.business_project_name || '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      Thửa: {asset.land_lot_no || '—'} / Tờ: {asset.map_sheet_no || '—'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          asset.custody_status === 'in_stock'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {asset.custody_status === 'in_stock' ? 'Trong kho' : 'Đang mượn'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {asset.mortgage_status === 'mortgaged' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          {asset.mortgage_bank || 'Đang thế chấp'}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() =>
                          setModalState({
                            isOpen: true,
                            title: `Chi tiết GCN: ${asset.certificate_no}`,
                            subtitle: `Mã TSĐB: ${asset.asset_code}`,
                            assets: [asset],
                          })
                        }
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors inline-flex"
                        title="Xem chi tiết GCN"
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

      {/* Modal chi tiết GCN */}
      <AssetDetailModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
        title={modalState.title}
        subtitle={modalState.subtitle}
        assets={modalState.assets}
      />
    </div>
  );
};
