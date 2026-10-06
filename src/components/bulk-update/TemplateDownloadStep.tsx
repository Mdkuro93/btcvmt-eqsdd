import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download,
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Info,
  AlertTriangle,
  Building2,
  Copy,
  Check,
  Search,
  RotateCw,
  Loader2,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { BulkUpdateMode, BulkProjectItem, listBulkUpdateProjects } from '../../api/bulkUpdate';
import { BULK_MODES_CONFIG, downloadExcelTemplate } from '../../utils/bulkUpdateExcel';

interface Props {
  selectedMode: BulkUpdateMode;
  onPrev: () => void;
  onNext: () => void;
  onProjectsLoaded?: (projects: BulkProjectItem[]) => void;
}

export const TemplateDownloadStep: React.FC<Props> = ({
  selectedMode,
  onPrev,
  onNext,
  onProjectsLoaded,
}) => {
  const config = BULK_MODES_CONFIG[selectedMode];

  // Danh mục dự án thời gian thực (tải mới mỗi khi mở bước, không cache)
  const [projects, setProjects] = useState<BulkProjectItem[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<boolean>(false);
  const [lastUpdatedTimeStr, setLastUpdatedTimeStr] = useState<string>('');

  const lastFetchedTimeRef = useRef<number>(0);

  const formatTimeWithSeconds = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // Tải danh mục dự án thời gian thực
  const fetchProjects = async (silent: boolean = false) => {
    if (!silent) setIsLoadingProjects(true);
    setProjectsError(null);
    try {
      const data = await listBulkUpdateProjects();
      setProjects(data);
      const now = new Date();
      lastFetchedTimeRef.current = now.getTime();
      setLastUpdatedTimeStr(formatTimeWithSeconds(now));
      if (onProjectsLoaded) {
        onProjectsLoaded(data);
      }
      return data;
    } catch (err: any) {
      console.error('Lỗi tải danh mục dự án cho mẫu Excel:', err);
      const msg = err.message || 'Không thể tải danh mục dự án từ máy chủ.';
      setProjectsError(msg);
      if (!silent) toast.error(msg);
      throw err;
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Tải danh mục khi mount hoặc khi selectedMode thay đổi
  // Lắng nghe visibilitychange để tải lại khi quay lại tab (tối đa 1 lần mỗi 30 giây) (Prompt 12 Mục 5)
  useEffect(() => {
    fetchProjects();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastFetchedTimeRef.current >= 30000) {
          fetchProjects(true).catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedMode]);

  // Nút "Tải mẫu Excel" phải lấy danh mục MỚI ngay lúc bấm (Prompt 12 Mục 2)
  const handleDownload = async () => {
    if (isDownloadingTemplate) return;
    setIsDownloadingTemplate(true);
    try {
      let freshProjects: BulkProjectItem[] = [];
      let isLoadError = false;
      try {
        freshProjects = await listBulkUpdateProjects();
        setProjects(freshProjects);
        const now = new Date();
        lastFetchedTimeRef.current = now.getTime();
        setLastUpdatedTimeStr(formatTimeWithSeconds(now));
        if (onProjectsLoaded) {
          onProjectsLoaded(freshProjects);
        }
      } catch (err: any) {
        console.warn('Không tải được danh mục dự án khi tạo mẫu:', err);
        isLoadError = true;
        toast.error('Không tải được danh mục dự án mới nhất, sheet 3 sẽ ghi chú lỗi này.');
      }

      downloadExcelTemplate(selectedMode, freshProjects, isLoadError);
      if (!isLoadError) {
        toast.success('Đã tải xuống file mẫu Excel kèm sheet «Danh mục dự án».');
      }
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleCopyProjectName = async (name: string, id: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedId(id);
      toast.success(`Đã sao chép: "${name}"`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Không thể sao chép vào bộ nhớ tạm.');
    }
  };

  // Lọc dự án theo ô tìm kiếm (chỉ tìm theo tên và khu vực)
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.areaName && p.areaName.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Bước 2 / 6
              </span>
              <h2 className="text-base font-bold text-gray-900">
                Tải mẫu Excel: {config.title}
              </h2>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              File Excel mẫu gồm 3 sheet: <b>Sheet 1 «Dữ liệu»</b> để nhập dữ liệu; <b>Sheet 2 «Hướng dẫn»</b> giải thích từng cột; <b>Sheet 3 «Danh mục dự án»</b> cung cấp danh sách tên dự án hợp lệ theo phạm vi quản lý của bạn.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloadingTemplate}
            className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex-shrink-0 disabled:opacity-75"
          >
            {isDownloadingTemplate ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang lấy danh mục dự án...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Tải mẫu Excel (.xlsx)</span>
              </>
            )}
          </button>
        </div>

        {/* Cảnh báo định dạng */}
        <div className="my-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start space-x-2.5">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <b>Cột «Tên dự án» là bắt buộc:</b> Mọi dòng phải điền đúng chính xác tên dự án theo sheet «Danh mục dự án» để đối soát.
            </div>
          </div>
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <b>Quy mô cho phép:</b> Tối đa <b>5.000 dòng</b> dữ liệu và dung lượng file không quá <b>5 MB</b>.
            </div>
          </div>
          <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-lg flex items-start space-x-2.5">
            <FileSpreadsheet className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-purple-900 leading-relaxed">
              <b>Ô trống = giữ nguyên:</b> Các trường không cần cập nhật có thể để trống hoặc bỏ hẳn cột khỏi file (trừ các cột bắt buộc).
            </div>
          </div>
        </div>

        {/* Khối Danh mục dự án bạn được phép cập nhật (Prompt 12 Mục 5) */}
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-blue-700" />
              <h3 className="text-sm font-bold text-gray-900">
                Danh mục dự án bạn được phép cập nhật ({projects.length} dự án)
              </h3>
            </div>
            <div className="flex items-center space-x-2">
              {lastUpdatedTimeStr && (
                <span className="text-[11px] text-gray-500 hidden md:inline">
                  Cập nhật lúc {lastUpdatedTimeStr}
                </span>
              )}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo tên hoặc khu vực..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-white border border-gray-300 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
                />
              </div>
              <button
                type="button"
                onClick={() => fetchProjects(false)}
                disabled={isLoadingProjects}
                title="Làm mới danh mục dự án"
                className="p-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingProjects ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Trạng thái tải / lỗi / dữ liệu */}
          {isLoadingProjects ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-2 text-xs text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>Đang tải danh mục dự án thời gian thực...</span>
            </div>
          ) : projectsError ? (
            <div className="my-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{projectsError}</p>
                <button
                  type="button"
                  onClick={() => fetchProjects(false)}
                  className="mt-1.5 px-3 py-1 bg-rose-600 text-white rounded text-[11px] font-medium hover:bg-rose-700"
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-500">
              {searchQuery ? 'Không tìm thấy dự án nào khớp với từ khóa tìm kiếm.' : 'Không có dự án nào có GCN thuộc phạm vi quản lý của bạn.'}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto max-h-56 overflow-y-auto border border-gray-200 rounded-lg bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-700 font-semibold sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <th className="py-2 px-3">Tên dự án pháp lý</th>
                    <th className="py-2 px-3">Khu vực</th>
                    <th className="py-2 px-3 text-right">Số GCN hiệu lực</th>
                    <th className="py-2 px-3 text-center w-24">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProjects.map((p) => {
                    const isCopied = copiedId === p.id;
                    return (
                      <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="py-2 px-3 font-medium text-gray-900">{p.name}</td>
                        <td className="py-2 px-3 text-gray-600">{p.areaName || '-'}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700">
                          {p.assetCount.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleCopyProjectName(p.name, p.id)}
                            className={`inline-flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                              isCopied
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                            title="Sao chép tên dự án để dán vào Excel"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Đã chép</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Chép tên</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-gray-500 italic">
            <span>* Nhấn nút <b>«Chép tên»</b> để sao chép nhanh tên dự án chuẩn vào cột <b>Tên dự án (project_name)</b> trong file Excel.</span>
            {lastUpdatedTimeStr && (
              <span className="md:hidden not-italic text-gray-400 mt-1 sm:mt-0">Cập nhật lúc {lastUpdatedTimeStr}</span>
            )}
          </div>
        </div>

        {/* Bảng tra cứu cột trong mẫu */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center space-x-2">
            <span>Danh sách các cột trong mẫu Excel ({config.guides.length} cột)</span>
          </h3>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Tên cột (Khóa JSON)</th>
                  <th className="py-2.5 px-3">Tên trường</th>
                  <th className="py-2.5 px-3">Yêu cầu</th>
                  <th className="py-2.5 px-3">Định dạng</th>
                  <th className="py-2.5 px-3">Ví dụ</th>
                  <th className="py-2.5 px-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {config.guides.map((g) => (
                  <tr key={g.key} className="hover:bg-gray-50/50">
                    <td className="py-2.5 px-3 font-mono font-bold text-gray-900">{g.key}</td>
                    <td className="py-2.5 px-3 text-gray-800">{g.name}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          g.required.includes('Bắt buộc')
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {g.required}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{g.format}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-600">{g.example}</td>
                    <td className="py-2.5 px-3 text-gray-500 max-w-xs">{g.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nút chuyển bước */}
        <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại: Chọn loại</span>
          </button>

          <button
            type="button"
            onClick={onNext}
            className="px-6 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-lg text-sm font-semibold shadow-sm flex items-center space-x-2 transition-colors"
          >
            <span>Tiếp tục: Tải file lên</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
