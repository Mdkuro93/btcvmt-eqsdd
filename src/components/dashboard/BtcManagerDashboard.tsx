import React, { useMemo, useState } from 'react';
import { 
  Building2, 
  Landmark, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  Layers, 
  Eye, 
  ShieldAlert, 
  CheckCircle2, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Asset, Project } from '../../types';
import { AssetDetailModal } from './AssetDetailModal';
import { DonutChart, DonutSegment } from './DonutChart';
import { BankBarChart, BankBarItem } from './BankBarChart';
import { StorageProgressBar } from './StorageProgressBar';
import { DepartmentWorkloadMatrix } from './DepartmentWorkloadMatrix';

interface BtcManagerDashboardProps {
  assets: Asset[];
  projects: Project[];
  overdueAssets: Asset[];
  pendingTransactions: any[];
  isReadOnly?: boolean;
}

export const BtcManagerDashboard: React.FC<BtcManagerDashboardProps> = ({
  assets,
  projects,
  overdueAssets,
  pendingTransactions,
  isReadOnly = false,
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

  // Calculate SLA > 24h pending items
  const slaOverdueRequests = useMemo(() => {
    const now = new Date();
    const list: Array<{
      txId: string;
      itemId: string;
      itemType: string;
      assetName?: string;
      createdByName?: string;
      hoursWaiting: number;
      created_at: string;
      code?: string;
    }> = [];

    (pendingTransactions || []).forEach(tx => {
      (tx.items || []).forEach((item: any) => {
        if (item.status === 'pending') {
          const created = new Date(item.created_at || tx.created_at);
          const diffMs = now.getTime() - created.getTime();
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          if (hours > 24) {
            list.push({
              txId: tx.id,
              itemId: item.id,
              itemType: item.type || tx.type,
              assetName: item.asset?.certificate_no || item.asset?.asset_code,
              createdByName: tx.created_by?.full_name || 'Người dùng',
              hoursWaiting: hours,
              created_at: item.created_at || tx.created_at,
              code: tx.code || item.id?.slice(0, 8),
            });
          }
        }
      });
    });

    return list.sort((a, b) => b.hoursWaiting - a.hoursWaiting);
  }, [pendingTransactions]);

  // Project breakdown aggregation
  const projectStats = useMemo(() => {
    const map = new Map<string, {
      projectId: string;
      projectName: string;
      total: number;
      inStock: number;
      mortgaged: number;
      checkedOut: number;
      assets: Asset[];
      inStockAssets: Asset[];
      mortgagedAssets: Asset[];
      checkedOutAssets: Asset[];
    }>();

    // Initialize with known projects
    projects.forEach(p => {
      map.set(p.id, {
        projectId: p.id,
        projectName: p.name,
        total: 0,
        inStock: 0,
        mortgaged: 0,
        checkedOut: 0,
        assets: [],
        inStockAssets: [],
        mortgagedAssets: [],
        checkedOutAssets: [],
      });
    });

    // Populate from actual assets
    assets.forEach(a => {
      const key = a.project_id || a.business_project_name || 'unknown';
      let entry = map.get(key);
      if (!entry) {
        entry = {
          projectId: key,
          projectName: a.projects?.name || a.business_project_name || 'Dự án khác / Chưa phân loại',
          total: 0,
          inStock: 0,
          mortgaged: 0,
          checkedOut: 0,
          assets: [],
          inStockAssets: [],
          mortgagedAssets: [],
          checkedOutAssets: [],
        };
        map.set(key, entry);
      }

      entry.total++;
      entry.assets.push(a);

      if (a.custody_status === 'in_stock') {
        entry.inStock++;
        entry.inStockAssets.push(a);
      } else if (a.custody_status === 'checked_out') {
        entry.checkedOut++;
        entry.checkedOutAssets.push(a);
      }

      if (a.mortgage_status === 'mortgaged') {
        entry.mortgaged++;
        entry.mortgagedAssets.push(a);
      }
    });

    // Filter projects that have assets or belong to system projects
    return Array.from(map.values())
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [assets, projects]);

  // Bank mortgage breakdown aggregation
  const bankStats = useMemo(() => {
    const map = new Map<string, {
      bankName: string;
      count: number;
      totalValue: number;
      assets: Asset[];
    }>();

    const mortgagedList = assets.filter(a => a.mortgage_status === 'mortgaged');

    mortgagedList.forEach(a => {
      const bank = a.mortgage_bank?.trim() || 'Chưa cập nhật ngân hàng';
      let entry = map.get(bank);
      if (!entry) {
        entry = {
          bankName: bank,
          count: 0,
          totalValue: 0,
          assets: [],
        };
        map.set(bank, entry);
      }

      entry.count++;
      entry.totalValue += Number(a.collateral_value || a.mortgage_valuation || 0);
      entry.assets.push(a);
    });

    const totalMortgaged = mortgagedList.length || 1;
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map(item => ({
        ...item,
        percentage: Math.round((item.count / totalMortgaged) * 100),
      }));
  }, [assets]);

  const totalAllAssets = assets.length;
  const totalInStock = assets.filter(a => a.custody_status === 'in_stock').length;
  const totalMortgaged = assets.filter(a => a.mortgage_status === 'mortgaged').length;
  const totalCheckedOut = assets.filter(a => a.custody_status === 'checked_out').length;

  return (
    <div className="space-y-6">
      {/* 1. Widget Cảnh Báo Rủi Ro Trọng Yếu */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cảnh báo GCN mượn quá hạn */}
        <div className={`p-5 rounded-2xl border transition-all ${
          overdueAssets.length > 0 
            ? 'bg-rose-50/70 border-rose-200 text-rose-950 shadow-xs' 
            : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${
                overdueAssets.length > 0 ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
              }`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">GCN Mượn Quá Hạn Trả</h3>
                <p className="text-xs opacity-75">Cảnh báo rủi ro thất thoát & quá hạn mượn hồ sơ</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-black tracking-tight ${
              overdueAssets.length > 0 ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'
            }`}>
              {overdueAssets.length} GCN
            </span>
          </div>

          <div className="mt-4">
            {overdueAssets.length === 0 ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-white/70 py-2.5 px-3 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Tuyệt vời! Không có GCN nào đang bị giữ quá hạn cam kết.</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-white/80 rounded-xl border border-rose-200 divide-y divide-rose-100 overflow-hidden text-xs">
                  {overdueAssets.slice(0, 3).map(asset => {
                    const diffDays = Math.ceil(
                      (new Date().getTime() - new Date(asset.expected_return_date!).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    return (
                      <div 
                        key={asset.id} 
                        className="p-2.5 flex items-center justify-between hover:bg-rose-100/50 cursor-pointer transition-colors"
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Chi tiết GCN quá hạn: ${asset.certificate_no}`,
                          subtitle: `Đơn vị đang giữ: ${asset.current_holder_dept || 'Chưa rõ'}`,
                          assets: [asset],
                        })}
                      >
                        <div>
                          <div className="font-bold text-rose-950 flex items-center gap-1.5">
                            <span>{asset.certificate_no}</span>
                            <span className="font-mono text-[10px] text-slate-500 font-normal">({asset.asset_code})</span>
                          </div>
                          <div className="text-[11px] text-rose-800/80 mt-0.5">
                            {asset.current_holder_dept || 'Chưa rõ bộ phận'} · Dự án: {asset.projects?.name || asset.business_project_name || '-'}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                            Trễ {diffDays} ngày
                          </span>
                          <div className="text-[10px] text-rose-700 mt-0.5">Hạn: {asset.expected_return_date}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setModalState({
                    isOpen: true,
                    title: 'Danh sách toàn bộ GCN mượn quá hạn',
                    subtitle: 'Tổng hợp các Giấy chứng nhận đã quá ngày hẹn hoàn trả kho',
                    assets: overdueAssets,
                  })}
                  className="w-full py-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 bg-white/60 hover:bg-white rounded-lg border border-rose-200 transition-colors flex items-center justify-center gap-1"
                >
                  <span>Xem chi tiết toàn bộ {overdueAssets.length} GCN quá hạn</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Cảnh báo Phiếu nghẽn SLA > 24h */}
        <div className={`p-5 rounded-2xl border transition-all ${
          slaOverdueRequests.length > 0 
            ? 'bg-amber-50/70 border-amber-200 text-amber-950 shadow-xs' 
            : 'bg-blue-50/60 border-blue-200 text-blue-950'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${
                slaOverdueRequests.length > 0 ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
              }`}>
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Phiếu Chờ Nghẽn SLA &gt; 24h</h3>
                <p className="text-xs opacity-75">Yêu cầu mượn/trả/thế chấp chưa được xử lý kịp thời</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-black tracking-tight ${
              slaOverdueRequests.length > 0 ? 'bg-amber-200 text-amber-900' : 'bg-blue-200 text-blue-900'
            }`}>
              {slaOverdueRequests.length} Phiếu
            </span>
          </div>

          <div className="mt-4">
            {slaOverdueRequests.length === 0 ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 bg-white/70 py-2.5 px-3 rounded-xl border border-blue-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span>Tiến độ xử lý đạt chuẩn! Toàn bộ yêu cầu đều trong khung thời gian cam kết.</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-white/80 rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden text-xs">
                  {slaOverdueRequests.slice(0, 3).map((req, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between hover:bg-amber-100/50 transition-colors">
                      <div>
                        <div className="font-bold text-amber-950 flex items-center gap-1.5">
                          <span className="uppercase">[{req.itemType === 'checkout' ? 'Mượn sổ' : req.itemType === 'checkin' ? 'Trả sổ' : req.itemType}]</span>
                          <span>{req.assetName || 'GCN'}</span>
                        </div>
                        <div className="text-[11px] text-amber-800/80 mt-0.5">
                          Người tạo: {req.createdByName}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white">
                          Chờ {req.hoursWaiting}h
                        </span>
                        <div className="text-[10px] text-amber-700 mt-0.5">Vượt chuẩn SLA</div>
                      </div>
                    </div>
                  ))}
                </div>

                {!isReadOnly && (
                  <Link
                    to="/requests"
                    className="w-full py-1.5 text-xs font-bold text-amber-800 hover:text-amber-950 bg-white/60 hover:bg-white rounded-lg border border-amber-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <span>Chuyển tới trang Phê duyệt để xử lý ngay</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. KHỐI 2: Khối Cơ Cấu Trạng Thái Quỹ Đất Toàn Hệ Thống (Donut Chart) */}
      <DonutChart
        title="Cơ Cấu Trạng Thái Quỹ Đất Toàn Hệ Thống"
        subtitle="Tỷ lệ phân bổ Giấy chứng nhận đang lưu kho, thế chấp ngân hàng và đang mượn công tác"
        total={totalAllAssets}
        unit="GCN"
        segments={[
          {
            label: 'Trong kho (Lưu trữ an toàn)',
            count: totalInStock,
            color: '#10B981', // Emerald-500
            hoverColor: '#059669',
            bgBadge: 'bg-emerald-50',
            borderBadge: 'border-emerald-200',
            textBadge: 'text-emerald-700',
          },
          {
            label: 'Đang thế chấp Ngân hàng',
            count: totalMortgaged,
            color: '#F97316', // Orange-500
            hoverColor: '#EA580C',
            bgBadge: 'bg-orange-50',
            borderBadge: 'border-orange-200',
            textBadge: 'text-orange-700',
          },
          {
            label: 'Đang mượn / Luân chuyển',
            count: totalCheckedOut,
            color: '#3B82F6', // Blue-500
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
              title: 'Giấy chứng nhận đang trong kho',
              subtitle: `Tổng cộng ${totalInStock} GCN lưu trữ an toàn tại các kho`,
              assets: assets.filter((a) => a.custody_status === 'in_stock'),
            });
          } else if (seg.label.includes('thế chấp')) {
            setModalState({
              isOpen: true,
              title: 'Giấy chứng nhận đang thế chấp ngân hàng',
              subtitle: `Tổng cộng ${totalMortgaged} GCN đang thế chấp tại các tổ chức tín dụng`,
              assets: assets.filter((a) => a.mortgage_status === 'mortgaged'),
            });
          } else {
            setModalState({
              isOpen: true,
              title: 'Giấy chứng nhận đang mượn ngoài / luân chuyển',
              subtitle: `Tổng cộng ${totalCheckedOut} GCN đang được các đơn vị mượn công tác`,
              assets: assets.filter((a) => a.custody_status === 'checked_out'),
            });
          }
        }}
      />

      {/* 3. KHỐI 3: Khối Cơ Cấu Giấy Chứng Nhận Theo Từng Dự Án */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Cơ Cấu Giấy Chứng Nhận Theo Từng Dự Án</h3>
              <p className="text-xs text-slate-500">Thống kê lưu kho thực tế, tỷ lệ sẵn sàng và khối lượng đang thế chấp / mượn ngoài</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
            {projectStats.length} Dự án có GCN
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Tên Dự Án</th>
                <th className="py-3 px-3 text-center">Tổng GCN</th>
                <th className="py-3 px-3 text-center">Trong Kho</th>
                <th className="py-3 px-3 text-center">Đang Thế Chấp</th>
                <th className="py-3 px-3 text-center">Đang Mượn</th>
                <th className="py-3 px-4 min-w-[180px]">Tỷ Lệ Lưu Kho Tại Chỗ</th>
                <th className="py-3 px-3 text-center">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {projectStats.map(p => {
                const inStockRate = p.total > 0 ? Math.round((p.inStock / p.total) * 100) : 0;
                return (
                  <tr key={p.projectId} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{p.projectName}</span>
                      </div>
                    </td>

                    {/* Tổng GCN */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Dự án: ${p.projectName} (Toàn bộ)`,
                          subtitle: `Hiển thị tất cả Giấy chứng nhận thuộc dự án`,
                          assets: p.assets,
                        })}
                        className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors"
                        title="Bấm để xem danh sách"
                      >
                        {p.total}
                      </button>
                    </td>

                    {/* Trong Kho */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Dự án: ${p.projectName} (Trong kho)`,
                          subtitle: `Các GCN đang được lưu trữ bảo quản an toàn tại kho`,
                          assets: p.inStockAssets,
                        })}
                        className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        title="Bấm để xem danh sách GCN trong kho"
                      >
                        {p.inStock}
                      </button>
                    </td>

                    {/* Đang Thế Chấp */}
                    <td className="py-3 px-3 text-center">
                      {p.mortgaged > 0 ? (
                        <button
                          onClick={() => setModalState({
                            isOpen: true,
                            title: `Dự án: ${p.projectName} (Đang thế chấp)`,
                            subtitle: `Các GCN đang thế chấp tại ngân hàng/tổ chức tín dụng`,
                            assets: p.mortgagedAssets,
                          })}
                          className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                          title="Bấm để xem GCN đang thế chấp"
                        >
                          {p.mortgaged}
                        </button>
                      ) : (
                        <span className="text-slate-400 font-medium">0</span>
                      )}
                    </td>

                    {/* Đang Mượn */}
                    <td className="py-3 px-3 text-center">
                      {p.checkedOut > 0 ? (
                        <button
                          onClick={() => setModalState({
                            isOpen: true,
                            title: `Dự án: ${p.projectName} (Đang mượn ngoài)`,
                            subtitle: `Các GCN đang được phòng ban/cá nhân mượn công tác`,
                            assets: p.checkedOutAssets,
                          })}
                          className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                          title="Bấm để xem GCN đang mượn"
                        >
                          {p.checkedOut}
                        </button>
                      ) : (
                        <span className="text-slate-400 font-medium">0</span>
                      )}
                    </td>

                    {/* Tiến Trình Tỷ Lệ Lưu Kho */}
                    <td className="py-3 px-4">
                      <StorageProgressBar inStock={p.inStock} total={p.total} />
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setModalState({
                          isOpen: true,
                          title: `Toàn bộ GCN: ${p.projectName}`,
                          subtitle: `Tổng cộng ${p.total} GCN thuộc dự án`,
                          assets: p.assets,
                        })}
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors inline-flex"
                        title="Xem danh sách chi tiết"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Hàng Tổng Cộng */}
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                <td className="py-3 px-4 uppercase text-[11px] tracking-wider">Tổng cộng ({projectStats.length} Dự án)</td>
                <td className="py-3 px-3 text-center">{totalAllAssets}</td>
                <td className="py-3 px-3 text-center text-emerald-700">{totalInStock}</td>
                <td className="py-3 px-3 text-center text-purple-700">{totalMortgaged}</td>
                <td className="py-3 px-3 text-center text-amber-700">{totalCheckedOut}</td>
                <td className="py-3 px-4">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Trung bình: {totalAllAssets > 0 ? Math.round((totalInStock / totalAllAssets) * 100) : 0}% lưu kho an toàn
                  </div>
                </td>
                <td className="py-3 px-3 text-center">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5. Phân Bổ Thế Chấp Theo Ngân Hàng: Biểu Đồ Cột Ngang & Bảng Chi Tiết */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Biểu Đồ Cột Ngang So Sánh Ngân Hàng */}
        <div className="lg:col-span-5">
          <BankBarChart
            data={bankStats}
            totalMortgaged={totalMortgaged}
            onBarClick={(item) => {
              const matched = bankStats.find((b) => b.bankName === item.bankName);
              if (matched) {
                setModalState({
                  isOpen: true,
                  title: `Chi tiết GCN thế chấp: ${matched.bankName}`,
                  subtitle: `Đang có ${matched.count} GCN tại ngân hàng này`,
                  assets: matched.assets,
                });
              }
            }}
          />
        </div>

        {/* Bảng Dữ Liệu Chi Tiết */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-100 text-purple-800">
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Chi Tiết Danh Mục Thế Chấp Theo Ngân Hàng</h3>
                <p className="text-xs text-slate-500">Giám sát dư nợ tài sản bảo đảm và danh mục GCN thế chấp</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg">
              {totalMortgaged} GCN đang thế chấp
            </span>
          </div>

          <div className="overflow-x-auto">
            {bankStats.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Hiện tại không có Giấy chứng nhận nào đang ở trạng thái thế chấp ngân hàng.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Tổ Chức Tín Dụng</th>
                    <th className="py-3 px-3 text-center">Số GCN</th>
                    <th className="py-3 px-4 text-right">Định Giá TSĐB</th>
                    <th className="py-3 px-3 text-center">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {bankStats.map((b, idx) => (
                    <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="truncate max-w-[160px] sm:max-w-[200px]">{b.bankName}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Chiếm {b.percentage}% tổng GCN thế chấp
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setModalState({
                            isOpen: true,
                            title: `GCN thế chấp tại: ${b.bankName}`,
                            subtitle: `Tổng cộng ${b.count} Giấy chứng nhận`,
                            assets: b.assets,
                          })}
                          className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                          title="Bấm để xem danh sách"
                        >
                          {b.count}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {b.totalValue > 0 ? (
                          <span className="text-emerald-700 font-mono text-[11px]">
                            {b.totalValue.toLocaleString('vi-VN')} đ
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Chưa cập nhật</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setModalState({
                            isOpen: true,
                            title: `Chi tiết GCN thế chấp: ${b.bankName}`,
                            subtitle: `Đang có ${b.count} GCN tại ngân hàng này`,
                            assets: b.assets,
                          })}
                          className="p-1.5 text-purple-700 hover:text-purple-900 hover:bg-purple-100 rounded-lg transition-colors inline-flex"
                          title="Xem danh sách chi tiết"
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
      </div>

      {/* 4. KHỐI 4 (BÊN DƯỚI CÙNG): Khối Ma Trận Workload & Tình Hình Nắm Giữ GCN Liên Phòng Ban */}
      <DepartmentWorkloadMatrix
        assets={assets}
        pendingTransactions={pendingTransactions}
        isReadOnly={isReadOnly}
        onInspectAssets={(title, subtitle, detailAssets) =>
          setModalState({
            isOpen: true,
            title,
            subtitle,
            assets: detailAssets,
          })
        }
      />

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
