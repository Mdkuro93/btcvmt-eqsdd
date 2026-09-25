import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  X, 
  ArrowRight, 
  Compass, 
  Files, 
  Loader2, 
  CornerDownLeft, 
  Building2, 
  Warehouse, 
  Tag, 
  LayoutDashboard, 
  CheckSquare, 
  BarChart3, 
  Upload, 
  Settings, 
  BookText, 
  FileSearch, 
  ShieldCheck, 
  Users, 
  ClipboardCheck, 
  KeyRound 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { quickSearchAssets, QuickAssetSearchResult } from '../api/quickSearch';

interface NavPageItem {
  id: string;
  name: string;
  href: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  description?: string;
}

const ALL_NAV_PAGES: NavPageItem[] = [
  {
    id: 'dashboard',
    name: 'Tổng quan hệ thống',
    href: '/',
    category: 'Điều hướng',
    icon: LayoutDashboard,
    roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor', 'admin', 'super_admin'],
    description: 'Báo cáo số liệu tổng hợp, biểu đồ tồn kho, thế chấp',
  },
  {
    id: 'lookup',
    name: 'Tra cứu tình trạng GCN',
    href: '/lookup',
    category: 'Điều hướng',
    icon: FileSearch,
    roles: ['admin', 'super_admin', 'warehouse_manager', 'btc_manager', 'capital_dept', 'project_dept', 're_dept', 'investor', 'supervisor', 'viewer', 'user'],
    description: 'Tra cứu nhanh trạng thái lưu kho, thế chấp theo số GCN',
  },
  {
    id: 'assets',
    name: 'Danh sách GCN & Hồ sơ',
    href: '/assets',
    category: 'Điều hướng',
    icon: Files,
    roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor', 'admin', 'super_admin'],
    description: 'Quản lý toàn bộ Giấy chứng nhận, vị trí lưu kho, pháp nhân',
  },
  {
    id: 'requests',
    name: 'Yêu cầu & Duyệt kho',
    href: '/requests',
    category: 'Điều hướng',
    icon: CheckSquare,
    roles: ['btc_manager', 'warehouse_manager', 'capital_dept', 'project_dept', 're_dept', 'supervisor', 'investor', 'admin', 'super_admin'],
    description: 'Phiếu nhập, xuất mượn, thế chấp, giải chấp, chuyển nhượng',
  },
  {
    id: 'access-requests',
    name: 'Duyệt yêu cầu truy cập kho',
    href: '/access-requests',
    category: 'Điều hướng',
    icon: ShieldCheck,
    roles: ['btc_manager', 'warehouse_manager', 'admin', 'super_admin'],
    description: 'Phê duyệt quyền tra cứu hồ sơ kho cho người dùng bên ngoài',
  },
  {
    id: 'my-access',
    name: 'Quyền truy cập của tôi',
    href: '/my-access',
    category: 'Điều hướng',
    icon: KeyRound,
    roles: ['viewer', 'user'],
    description: 'Xem danh sách kho được cấp quyền và xin gia hạn truy cập',
  },
  {
    id: 'inventory-audits',
    name: 'Kiểm kê kho định kỳ',
    href: '/inventory-audits',
    category: 'Điều hướng',
    icon: ClipboardCheck,
    roles: ['btc_manager', 'warehouse_manager', 'admin', 'super_admin'],
    description: 'Đợt kiểm kê hiện vật GCN trong kho lưu trữ',
  },
  {
    id: 'activity-logs',
    name: 'Nhật ký biến động',
    href: '/activity-logs',
    category: 'Điều hướng',
    icon: BookText,
    roles: ['btc_manager', 'warehouse_manager', 'supervisor', 'admin', 'super_admin'],
    description: 'Lịch sử thao tác nghiệp vụ và kiểm toán hệ thống',
  },
  {
    id: 'reports',
    name: 'Báo cáo & Thống kê',
    href: '/reports',
    category: 'Điều hướng',
    icon: BarChart3,
    roles: ['btc_manager', 'warehouse_manager', 'supervisor', 'admin', 'super_admin'],
    description: 'Xuất báo cáo tồn kho, thế chấp ngân hàng, biến động GCN',
  },
  {
    id: 'user-management',
    name: 'Quản lý người dùng',
    href: '/user-management',
    category: 'Hệ thống',
    icon: Users,
    roles: ['admin', 'super_admin'],
    description: 'Quản lý tài khoản, phân quyền vai trò, duyệt đăng ký',
  },
  {
    id: 'admin',
    name: 'Quản trị danh mục',
    href: '/admin',
    category: 'Hệ thống',
    icon: Settings,
    roles: ['admin', 'super_admin'],
    description: 'Cấu hình kho, dự án, pháp nhân chủ sở hữu, ngân hàng',
  },
  {
    id: 'import',
    name: 'Import dữ liệu Excel',
    href: '/import',
    category: 'Hệ thống',
    icon: Upload,
    roles: ['warehouse_manager', 'btc_manager', 'admin', 'super_admin'],
    description: 'Nhập dữ liệu GCN hàng loạt từ bảng tính Excel',
  },
];

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchItem = 
  | { type: 'page'; item: NavPageItem }
  | { type: 'asset'; item: QuickAssetSearchResult };

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [assetResults, setAssetResults] = useState<QuickAssetSearchResult[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phân quyền cho trang được phép truy cập
  const allowedPages = useMemo(() => {
    if (!profile) return [];
    const r = (profile.role || '').toLowerCase();
    return ALL_NAV_PAGES.filter(page => {
      if (profile.status === 'pending') {
        return page.href === '/my-access';
      }
      if (r === 'admin' || r === 'super_admin') {
        if (page.href === '/my-access') return false; // Admin đã có toàn quyền
        return true;
      }
      if (page.roles.includes(r)) return true;
      if (r === 'quan_ly' && (page.roles.includes('warehouse_manager') || page.roles.includes('btc_manager'))) return true;
      if (r === 'chuyen_vien' && (page.roles.includes('capital_dept') || page.roles.includes('project_dept') || page.roles.includes('re_dept'))) return true;
      if ((r === 'nguoi_dung' || r === 'user') && page.roles.includes('viewer')) return true;
      return false;
    });
  }, [profile]);

  // Lọc trang theo từ khóa
  const filteredPages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allowedPages;
    return allowedPages.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.description && p.description.toLowerCase().includes(q)) ||
      p.href.toLowerCase().includes(q)
    );
  }, [allowedPages, query]);

  // Debounced search GCN từ Supabase
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setAssetResults([]);
      setLoadingAssets(false);
      return;
    }

    setLoadingAssets(true);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await quickSearchAssets(trimmed, 8);
        setAssetResults(results);
      } catch (err) {
        console.error('Lỗi tìm kiếm nhanh GCN:', err);
        setAssetResults([]);
      } finally {
        setLoadingAssets(false);
      }
    }, 280);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, isOpen]);

  // Danh sách phẳng gồm cả trang và GCN để điều khiển bằng bàn phím
  const combinedItems = useMemo<SearchItem[]>(() => {
    const list: SearchItem[] = [];
    filteredPages.forEach(p => list.push({ type: 'page', item: p }));
    assetResults.forEach(a => list.push({ type: 'asset', item: a }));
    return list;
  }, [filteredPages, assetResults]);

  // Reset selectedIndex khi danh sách thay đổi
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, combinedItems.length]);

  // Tự động focus vào ô tìm kiếm khi mở Modal
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setAssetResults([]);
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Điều hướng khi chọn 1 kết quả
  const handleSelect = useCallback((item: SearchItem) => {
    onClose();
    if (item.type === 'page') {
      navigate(item.item.href);
    } else {
      // Nhảy tới trang tra cứu hoặc danh sách GCN kèm từ khóa
      const targetQuery = item.item.certificate_no || item.item.asset_code || '';
      const r = (profile?.role || '').toLowerCase();
      // Nếu là viewer hoặc user thì vào trang /lookup, ngược lại vào /assets
      if (r === 'viewer' || r === 'user') {
        navigate(`/lookup?q=${encodeURIComponent(targetQuery)}`);
      } else {
        navigate(`/assets?search=${encodeURIComponent(targetQuery)}`);
      }
    }
  }, [navigate, onClose, profile]);

  // Bắt phím điều hướng Up/Down, Enter, ESC bên trong Modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (combinedItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % combinedItems.length);
      scrollToItem((selectedIndex + 1) % combinedItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + combinedItems.length) % combinedItems.length);
      scrollToItem((selectedIndex - 1 + combinedItems.length) % combinedItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = combinedItems[selectedIndex];
      if (selected) {
        handleSelect(selected);
      }
    }
  };

  const scrollToItem = (index: number) => {
    if (!listRef.current) return;
    const elements = listRef.current.querySelectorAll('[data-search-item]');
    if (elements[index]) {
      (elements[index] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transform transition-all flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header ô tìm kiếm */}
        <div className="relative flex items-center border-b border-gray-200 px-4 py-3.5 bg-white">
          <Search className="w-5 h-5 text-[#1E3A8A] shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Tìm kiếm trang, mã GCN, số phát hành, phân khu, dự án..."
            className="w-full text-base bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-hidden"
          />
          {loadingAssets && (
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0 mx-2" />
          )}
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setAssetResults([]);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors mr-1 cursor-pointer"
              title="Xóa tìm kiếm"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-md shrink-0 select-none">
            ESC
          </kbd>
        </div>

        {/* Danh sách kết quả */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 divide-y divide-gray-100 divide-dashed">
          {/* PHẦN 1: ĐIỀU HƯỚNG TRANG */}
          {filteredPages.length > 0 && (
            <div className="py-2 first:pt-1">
              <div className="px-3 pb-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-[#1E3A8A]" />
                Điều hướng trang ({filteredPages.length})
              </div>
              <div className="space-y-0.5">
                {filteredPages.map((page, idx) => {
                  const itemIndex = idx;
                  const isSelected = selectedIndex === itemIndex;
                  const Icon = page.icon;

                  return (
                    <div
                      key={page.id}
                      data-search-item
                      onClick={() => handleSelect({ type: 'page', item: page })}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-blue-50 text-[#1E3A8A] font-semibold shadow-2xs' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg transition-colors ${
                          isSelected ? 'bg-[#1E3A8A] text-white shadow-2xs' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate flex items-center gap-2">
                            <span>{page.name}</span>
                            <span className="text-[10px] font-mono font-normal text-gray-400">{page.href}</span>
                          </div>
                          {page.description && (
                            <div className="text-xs text-gray-500 truncate mt-0.5">
                              {page.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {isSelected && (
                          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-blue-600">
                            Đi tới <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PHẦN 2: TÌM KIẾM GCN / HỒ SƠ */}
          {query.trim().length >= 2 && (
            <div className="py-2">
              <div className="px-3 pb-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Files className="w-3.5 h-3.5 text-blue-600" />
                  Hồ sơ Giấy chứng nhận ({assetResults.length})
                </span>
                {loadingAssets && (
                  <span className="text-[11px] font-normal text-gray-400">Đang tra cứu...</span>
                )}
              </div>

              {assetResults.length === 0 && !loadingAssets ? (
                <div className="px-4 py-4 text-center text-xs text-gray-400">
                  Không tìm thấy GCN nào khớp với từ khóa "{query}".
                </div>
              ) : (
                <div className="space-y-0.5">
                  {assetResults.map((asset, idx) => {
                    const itemIndex = filteredPages.length + idx;
                    const isSelected = selectedIndex === itemIndex;

                    return (
                      <div
                        key={asset.id}
                        data-search-item
                        onClick={() => handleSelect({ type: 'asset', item: asset })}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-blue-50 text-[#1E3A8A] shadow-2xs' 
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`p-2 rounded-lg mt-0.5 transition-colors ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'
                          }`}>
                            <Tag className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-900 group-hover:text-[#1E3A8A]">
                                {asset.certificate_no}
                              </span>
                              {asset.asset_code && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {asset.asset_code}
                                </span>
                              )}
                              <span className={`px-2 py-0.2 rounded-full text-[10px] font-semibold ${
                                asset.is_in_warehouse || asset.custody_status === 'in_stock'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {asset.is_in_warehouse || asset.custody_status === 'in_stock' ? 'Đang lưu kho' : 'Đã xuất kho'}
                              </span>
                            </div>

                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
                              {(asset.business_project_name || asset.project_name) && (
                                <span className="flex items-center gap-1 truncate">
                                  <Building2 className="w-3 h-3 text-gray-400 shrink-0" />
                                  {asset.business_project_name || asset.project_name}
                                </span>
                              )}
                              {asset.legal_lot_code && (
                                <span>Thửa/Lô: <strong className="text-gray-700">{asset.legal_lot_code}</strong></span>
                              )}
                              {asset.warehouse_name && (
                                <span className="flex items-center gap-1 text-gray-400">
                                  <Warehouse className="w-3 h-3" /> {asset.warehouse_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 ml-3 flex items-center">
                          {isSelected && (
                            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-blue-600">
                              Mở chi tiết <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Trạng thái không có kết quả */}
          {combinedItems.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <Search className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-600">Không tìm thấy kết quả</p>
              <p className="text-xs text-gray-400 mt-1">Thử nhập từ khóa khác hoặc bấm ESC để đóng</p>
            </div>
          )}
        </div>

        {/* Footer phím tắt hướng dẫn */}
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-500 select-none">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded shadow-2xs font-mono font-semibold text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded shadow-2xs font-mono font-semibold text-[10px]">↓</kbd>
              <span>chọn</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded shadow-2xs font-mono font-semibold text-[10px] flex items-center gap-0.5">
                <CornerDownLeft className="w-2.5 h-2.5" /> Enter
              </kbd>
              <span>đi tới</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded shadow-2xs font-mono font-semibold text-[10px]">ESC</kbd>
              <span>đóng</span>
            </span>
          </div>
          <span className="hidden sm:inline text-gray-400">Tìm kiếm nhanh eQSDĐ</span>
        </div>
      </div>
    </div>
  );
};
