import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router-dom';
import { fetchProjects } from '../api/assets';
import { Project, Asset } from '../types';
import { StatusBadges } from '../components/StatusBadges';
import { AssetDetail } from '../components/AssetDetail';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import * as XLSX from 'xlsx';
import {
  parseClipboardText,
  parseAndNormalize,
  ParsedLookupToken,
} from '../utils/normalize';
import {
  executeSmartBulkLookup,
  generateTeamsZaloReplyText,
  SmartLookupSummary,
  SmartLookupResultItem,
} from '../services/lookupService';
import { extractTextFromImage } from '../services/ocrService';
import {
  Search,
  Loader2,
  FileSearch,
  Clock,
  ShieldCheck,
  RefreshCw,
  LogOut,
  Settings,
  ClipboardPaste,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building,
  Warehouse as WarehouseIcon,
  Sparkles,
  MessageSquareShare,
  Eye,
  Trash2,
  Filter,
  Info,
  Layers,
  FileSpreadsheet,
  Camera,
  Image as ImageIcon,
  ScanText,
  Download,
  Upload,
  FolderUp,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { checkLookupAccess } from '../lib/accessGuard';
import { format } from 'date-fns';

export type TableDensity = 'compact' | 'comfortable';
const DENSITY_STORAGE_KEY = 'lookup_table_density';

export const Lookup: React.FC = () => {
  const { profile, refreshProfile, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  // Density preference state
  const [density, setDensity] = useState<TableDensity>(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      if (saved === 'compact' || saved === 'comfortable') return saved;
    } catch (e) {
      console.warn('Cannot read density from localStorage:', e);
    }
    return 'comfortable';
  });

  const handleToggleDensity = (mode: TableDensity) => {
    setDensity(mode);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, mode);
    } catch (e) {
      console.warn('Cannot save density to localStorage:', e);
    }
  };

  // Inputs
  const [rawText, setRawText] = useState<string>(initialQuery);
  const [projectId, setProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);

  // Lookup results state
  const [summary, setSummary] = useState<SmartLookupSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Filter tab on results: 'all' | 'found' | 'not_found' | 'in_stock' | 'mortgaged'
  const [activeTab, setActiveTab] = useState<'all' | 'found' | 'not_found' | 'in_stock' | 'mortgaged'>('all');
  const [selectedReceiptFilter, setSelectedReceiptFilter] = useState<string | null>(null);
  const [copiedReply, setCopiedReply] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Asset detail modal / scan preview
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [previewScanUrl, setPreviewScanUrl] = useState<{ urlOrPath: string; certificateNo?: string; title?: string } | null>(null);

  // OCR image states
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrStatusText, setOcrStatusText] = useState<string>('');
  const [ocrSuccessInfo, setOcrSuccessInfo] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const excelInputRef = React.useRef<HTMLInputElement>(null);

  const accessCheck = checkLookupAccess(profile);

  // Parse tokens live as user types or pastes
  const parsedTokens: ParsedLookupToken[] = useMemo(() => {
    return parseAndNormalize(rawText);
  }, [rawText]);

  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  }, []);

  useEffect(() => {
    if (accessCheck.allowed) {
      loadProjects();
    }
  }, [accessCheck.allowed, loadProjects]);

  // Execute smart lookup
  const handleExecuteLookup = useCallback(async (tokensToSearch?: ParsedLookupToken[]) => {
    const currentAccess = checkLookupAccess(profile);
    if (!currentAccess.allowed) {
      toast.error(currentAccess.message || 'Tài khoản của bạn chưa có quyền tra cứu dữ liệu.');
      return;
    }

    const tokens = tokensToSearch || parsedTokens;
    if (tokens.length === 0) {
      toast.error('Vui lòng nhập hoặc dán ít nhất 1 mã GCN / Mã Lô để tra cứu.');
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const resultSummary = await executeSmartBulkLookup(tokens, projectId || undefined);
      setSummary(resultSummary);
      if (resultSummary.foundCount > 0) {
        toast.success(`Đã tìm thấy ${resultSummary.foundCount}/${resultSummary.totalRequested} GCN/Lô đất!`);
      } else {
        toast('Không tìm thấy bản ghi nào khớp trong hệ thống.', { icon: '⚠️' });
      }
    } catch (err: any) {
      console.error('Lỗi khi thực hiện tra cứu thông minh:', err);
      toast.error('Lỗi tra cứu: ' + (err.message || 'Lỗi kết nối cơ sở dữ liệu'));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [profile, parsedTokens, projectId]);

  // Handle URL query parameter 'q'
  useEffect(() => {
    const qParam = searchParams.get('q');
    if (qParam && qParam.trim() && accessCheck.allowed) {
      setRawText(qParam.trim());
      const initialTokens = parseAndNormalize(qParam.trim());
      if (initialTokens.length > 0) {
        handleExecuteLookup(initialTokens);
      }
    }
  }, [searchParams, accessCheck.allowed, handleExecuteLookup]);

  // OCR image extraction handler
  const handleImageOcr = async (file: File | Blob) => {
    setOcrLoading(true);
    setOcrProgress(5);
    setOcrStatusText('Đang nạp ảnh và khởi tạo bộ nhận diện...');
    setOcrSuccessInfo(null);

    try {
      toast.loading('🔍 Đang trích xuất mã từ ảnh chụp màn hình...', { id: 'ocr-loading' });
      const extracted = await extractTextFromImage(file, (pct, status) => {
        setOcrProgress(pct);
        setOcrStatusText(status);
      });

      toast.dismiss('ocr-loading');

      if (!extracted || !extracted.trim()) {
        toast.error('Không nhận diện được ký tự nào từ ảnh. Vui lòng kiểm tra lại độ nét của ảnh chụp.');
        return;
      }

      // Đổ toàn bộ đoạn chữ trích xuất được vào ô textarea (ghi đè thay vì nối tiếp để không bị nhân đôi dữ liệu)
      const cleanExtracted = extracted.trim();
      setRawText(cleanExtracted);
      const identified = parseAndNormalize(cleanExtracted);
      setOcrSuccessInfo(`Đã đọc thành công ${cleanExtracted.length} ký tự từ ảnh (${identified.length} mã nhận diện).`);
      toast.success(`Đã nhận diện thành công ${identified.length} mã GCN từ ảnh chụp!`);
    } catch (err: any) {
      toast.dismiss('ocr-loading');
      console.error('OCR Error:', err);
      toast.error('Lỗi khi đọc ảnh OCR: ' + (err.message || 'Không thể xử lý'));
    } finally {
      setOcrLoading(false);
    }
  };

  // Clipboard Paste Event Listener (text or screenshot image)
  const handlePasteEvent = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    // Kiểm tra nếu clipboard chứa file ảnh (ví dụ screenshot chụp màn hình Teams/Zalo bấm Ctrl+V)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1 || item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await handleImageOcr(file);
          return;
        }
      }
    }
  };

  // Paste from clipboard helper (button click)
  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        toast.error('Clipboard trống hoặc không chứa văn bản.');
        return;
      }
      setOcrSuccessInfo(null);
      setRawText(clipText.trim());
      toast.success('Đã dán nội dung từ Clipboard!');
    } catch {
      toast.error('Trình duyệt chặn quyền truy cập Clipboard. Bạn hãy dán bằng phím Ctrl + V hoặc Cmd + V.');
    }
  };

  // Sample templates
  const handleLoadSampleTeams = () => {
    setOcrSuccessInfo(null);
    const sample = `DN426146 (Sunneva) 373 m2
DN426775 (Sunneva) 313,1 m2
DN426776 (Sunneva) 310 m2
DN426134 (Sunneva) 375 m2
DN426171 (Sunneva) 373 m2
DN426172 (Sunneva) 373 m2`;
    setRawText(sample);
  };

  const handleLoadSampleExcel = () => {
    setOcrSuccessInfo(null);
    const sample = `DN426171\tCồn Dầu\tB3-4.16
CG123456\tSpana\tLK02-15
BA998877\tCora\tBT-VIP-08
DN999999\tChưa rõ\tLô 99`;
    setRawText(sample);
  };

  const handleLoadSampleProject = () => {
    setOcrSuccessInfo(null);
    const sample = `Dự án Hòa Quý (Sunneva)
Nam Hòa Xuân
DCC
Spana`;
    setRawText(sample);
  };

  // Full reset handler for [Xóa] button
  const handleClearInput = () => {
    setRawText('');
    setOcrSuccessInfo(null);
    setSummary(null);
    setSearched(false);
    setActiveTab('all');
    setSelectedReceiptFilter(null);
  };

  const handleTextChange = (newVal: string) => {
    setRawText(newVal);
    if (ocrSuccessInfo) {
      setOcrSuccessInfo(null);
    }
  };

  const handleRemoveToken = (tokenToRemove: ParsedLookupToken) => {
    if (ocrSuccessInfo) setOcrSuccessInfo(null);
    // Remove the original token substring from rawText
    const updated = rawText
      .split(/\r?\n/)
      .map(line => line.replace(tokenToRemove.original, '').trim())
      .filter(Boolean)
      .join('\n');
    setRawText(updated);
  };

  // Copy Quick Reply for Teams / Zalo
  const handleCopyTeamsZaloReply = () => {
    if (!summary) return;
    const replyText = generateTeamsZaloReplyText(summary);
    navigator.clipboard.writeText(replyText);
    setCopiedReply(true);
    toast.success('Đã copy tin nhắn phản hồi Teams/Zalo (gom nhóm theo Phiếu Nhập Kho) vào Clipboard!');
    setTimeout(() => setCopiedReply(false), 3000);
  };

  // Copy single code
  const handleCopySingleCode = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    toast.success(`Đã sao chép: ${text}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Import batch list from Excel or CSV file
  const handleImportFileExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rawJson: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (!rawJson || rawJson.length === 0) {
        toast.error('File Excel/CSV không có dữ liệu.');
        return;
      }

      // Find target column: check row 0 for matching header names
      const headerRow = rawJson[0] || [];
      let targetColIndex = 0;
      for (let col = 0; col < headerRow.length; col++) {
        const h = String(headerRow[col] || '').trim().toLowerCase();
        if (/^(mã\s*gcn|ma\s*gcn|số\s*gcn|so\s*gcn|gcn|mã\s*sổ|ma\s*so|số\s*sổ|so\s*so|certificate|asset_code|mã\s*tài\s*sản)/i.test(h)) {
          targetColIndex = col;
          break;
        }
      }

      const codes: string[] = [];
      const firstCell = String(headerRow[targetColIndex] || '').trim();
      const isHeader = isNaN(Number(firstCell)) && /gcn|mã|số|sổ|code|cert/i.test(firstCell);
      const startIndex = isHeader ? 1 : 0;

      for (let r = startIndex; r < rawJson.length; r++) {
        const row = rawJson[r];
        if (row && row[targetColIndex] !== undefined && row[targetColIndex] !== null) {
          const val = String(row[targetColIndex]).trim();
          if (val && !codes.includes(val)) {
            codes.push(val);
          }
        }
      }

      if (codes.length === 0) {
        toast.error('Không tìm thấy mã GCN nào trong cột dữ liệu của file.');
        return;
      }

      const joinedText = codes.join('\n');
      setOcrSuccessInfo(null);
      setRawText(joinedText);
      toast.success(`Đã nạp thành công ${codes.length} mã GCN từ file "${file.name}"!`);
    } catch (err: any) {
      console.error('Lỗi khi đọc file Excel:', err);
      toast.error('Lỗi khi đọc file Excel/CSV: ' + (err.message || 'File không hợp lệ'));
    } finally {
      e.target.value = '';
    }
  };

  // Export full lookup results to Excel (.xlsx)
  const handleExportExcelReport = () => {
    if (!summary || summary.results.length === 0) {
      toast.error('Chưa có kết quả tra cứu để xuất báo cáo.');
      return;
    }

    try {
      const exportData = summary.results.map((item, idx) => {
        const a = item.asset;
        const isFound = item.matched && Boolean(a);

        let custodyStatusText = 'Chưa vào kho';
        if (a?.custody_status === 'in_stock') custodyStatusText = 'Trong kho';
        else if (a?.custody_status === 'checked_out') custodyStatusText = `Đang xuất kho${a.borrow_purpose ? ` (${a.borrow_purpose})` : ''}`;
        else if (a?.custody_status === 'in_transit') custodyStatusText = 'Đang luân chuyển';

        return {
          'STT': idx + 1,
          'Mã GCN nhập vào': item.token.original,
          'Mã chuẩn hóa': item.token.cleaned,
          'Trạng thái tìm thấy': isFound ? 'Đã tìm thấy' : 'Chưa có trên hệ thống / Sai mã',
          'Số GCN hệ thống': a?.certificate_no || '—',
          'Mã TSĐB': a?.asset_code || '—',
          'Số Phiếu Nhập Kho': a?.import_receipt_number || '—',
          'Dự án pháp lý': a?.projects?.name || '—',
          'Dự án kinh doanh / Phân khu': a?.business_project_name || '—',
          'Mã Lô pháp lý': a?.legal_lot_code || '—',
          'Mã Lô kinh doanh': a?.business_plot_code || '—',
          'Số thửa': a?.land_lot_no || '—',
          'Số tờ': a?.map_sheet_no || '—',
          'Diện tích (m²)': a?.area ? Number(a.area) : '—',
          'Vị trí kho vật lý': a?.warehouses?.name || '—',
          'Phân loại kho': a?.warehouses?.is_central ? 'Kho Trung Tâm' : 'Kho Vệ Tinh / Chi Nhánh',
          'Trạng thái kho': isFound ? custodyStatusText : '—',
          'Trạng thái thế chấp': a?.mortgage_status === 'mortgaged' ? 'Đang thế chấp' : (isFound ? 'Không thế chấp' : '—'),
          'Ngân hàng thế chấp': a?.mortgage_bank || '—',
          'Chủ sở hữu hiện tại': a?.current_owner_entity?.name || '—',
          'Vai trò chủ sở hữu': a?.current_owner_role === 'cdt' ? 'Chủ Đầu Tư' : (a?.current_owner_role === 'ndt' ? 'Nhà Đầu Tư' : '—'),
          'Ghi chú': a?.notes || '—',
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ket_Qua_Tra_Cuu');

      const fileName = `Ket_Qua_Tra_Cuu_GCN_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Đã xuất báo cáo Excel thành công: ${fileName}`);
    } catch (err: any) {
      console.error('Lỗi khi xuất báo cáo Excel:', err);
      toast.error('Không thể xuất file Excel: ' + (err.message || 'Lỗi'));
    }
  };

  // Filtered results by active tab & receipt filter
  const filteredResults = useMemo(() => {
    if (!summary) return [];
    let baseList: SmartLookupResultItem[] = [];
    switch (activeTab) {
      case 'found':
        baseList = summary.foundItems;
        break;
      case 'not_found':
        baseList = summary.notFoundItems;
        break;
      case 'in_stock':
        baseList = summary.foundItems.filter(i => i.asset?.custody_status === 'in_stock');
        break;
      case 'mortgaged':
        baseList = summary.foundItems.filter(i => i.asset?.mortgage_status === 'mortgaged' || i.asset?.custody_status === 'checked_out');
        break;
      case 'all':
      default:
        baseList = summary.results;
        break;
    }

    if (selectedReceiptFilter) {
      return baseList.filter(item => item.asset?.import_receipt_number === selectedReceiptFilter);
    }

    return baseList;
  }, [summary, activeTab, selectedReceiptFilter]);

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      toast.success('Đã cập nhật trạng thái tài khoản mới nhất!');
    } catch {
      toast.error('Không thể làm mới trạng thái');
    } finally {
      setRefreshing(false);
    }
  };

  // Check login
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      <Toaster position="top-right" />

      {/* Header thanh người dùng & Điều hướng */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1E3A8A] dark:bg-blue-600 text-white flex items-center justify-center font-bold font-mono text-sm shadow-xs">
            {profile?.username ? profile.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>{profile?.username || profile?.full_name || profile?.email}</span>
              <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-[#1E3A8A] dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                {profile?.role || 'user'}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400">
              Trạng thái:{' '}
              <span className={`font-semibold ${
                profile?.status === 'active' || profile?.status === 'approved'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : profile?.status === 'pending'
                  ? 'text-amber-700 dark:text-amber-400'
                  : profile?.status === 'rejected'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-gray-500 dark:text-slate-400'
              }`}>
                {profile?.status === 'active' || profile?.status === 'approved'
                  ? 'Đang hoạt động'
                  : profile?.status === 'pending'
                  ? 'Chờ duyệt'
                  : profile?.status === 'rejected'
                  ? 'Bị từ chối'
                  : 'Tạm khóa'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Theme Toggle in Header */}
          <ThemeToggle variant="segmented" className="hidden sm:inline-flex" />

          {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] dark:text-blue-400 bg-blue-50 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-slate-700 border border-blue-200 dark:border-slate-700 rounded-lg transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Quản trị hệ thống</span>
            </Link>
          )}

          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-slate-700 border border-red-200 dark:border-slate-700 rounded-lg transition cursor-pointer"
            title="Đăng xuất khỏi tài khoản"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>

      {/* Hero Title */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-[#1E3A8A] dark:text-blue-400 mb-3 shadow-inner border border-blue-100 dark:border-blue-900/50">
          <FileSearch className="w-8 h-8 text-[#1E3A8A] dark:text-blue-400" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Tra cứu hàng loạt thông minh
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          Tự động chuẩn hóa khoảng trắng thừa, sửa lỗi gõ phím và bóc tách trực tiếp tin nhắn từ <strong>Teams, Zalo hoặc bảng tính Excel</strong>.
        </p>
      </div>

      {/* Thông báo điều kiện quyền tra cứu */}
      {!accessCheck.allowed ? (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Clock className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 mb-2">
              {profile?.status === 'pending' ? 'Trạng thái: Chờ phê duyệt (pending)' : 'Trạng thái: Chưa đủ điều kiện tra cứu'}
            </span>
            <h3 className="text-xl font-extrabold text-amber-950 dark:text-amber-200">
              Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu
            </h3>
          </div>
          <p className="text-sm text-amber-900 dark:text-amber-300 max-w-lg mx-auto leading-relaxed">
            {profile?.status === 'pending' ? (
              <>
                Tài khoản <strong>{profile?.username || profile?.email}</strong> hiện có trạng thái <strong>pending</strong>. Quản trị viên (Admin) cần phê duyệt (status: approved) và cấp hạn tra cứu (access_expires_at) để bạn có thể xem dữ liệu GCN.
              </>
            ) : (
              <>
                Tài khoản <strong>{profile?.username || profile?.email}</strong> chưa được phê duyệt hoặc thời hạn tra cứu đã hết {profile?.access_expires_at ? `(hết hạn lúc ${format(new Date(profile.access_expires_at), 'dd/MM/yyyy HH:mm')})` : ''}. Vui lòng liên hệ Admin để được gia hạn.
              </>
            )}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={handleRefreshStatus}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-xl text-sm font-semibold shadow-xs transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Đang kiểm tra...' : 'Kiểm tra lại trạng thái duyệt'}</span>
            </button>
          </div>
        </div>
      ) : profile?.access_expires_at ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200 shadow-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span>Tài khoản đã được duyệt tra cứu • </span>
              <strong className="text-emerald-950 dark:text-emerald-100">Thời hạn còn lại: {accessCheck.remainingText}</strong>
              <span className="text-emerald-700 dark:text-emerald-400"> (hết hạn lúc {format(new Date(profile.access_expires_at), 'HH:mm dd/MM/yyyy')})</span>
            </div>
          </div>
          <button
            onClick={handleRefreshStatus}
            disabled={refreshing}
            className="text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-100 font-medium flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Đồng bộ hạn</span>
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Tài khoản đã được duyệt: <strong>Không giới hạn thời gian tra cứu</strong></span>
          </div>
        </div>
      )}

      {/* SMART BULK INPUT SECTION */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
        {/* Top Controls: Dự án & Quick sample buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Building className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Dự án áp dụng:</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!accessCheck.allowed}
              className="text-xs font-medium px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="">Tất cả dự án trong hệ thống</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Mẫu thử nhanh */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Dán mẫu thử:</span>
            <button
              type="button"
              onClick={handleLoadSampleTeams}
              disabled={!accessCheck.allowed}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-[11px] transition-colors cursor-pointer"
              title="Dán đoạn tin nhắn mẫu từ Zalo / Teams"
            >
              <Sparkles className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
              <span>Mẫu Teams/Zalo</span>
            </button>
            <button
              type="button"
              onClick={handleLoadSampleExcel}
              disabled={!accessCheck.allowed}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-[11px] transition-colors cursor-pointer"
              title="Dán bảng cột copy từ Excel"
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>Mẫu Excel</span>
            </button>
            <button
              type="button"
              onClick={handleLoadSampleProject}
              disabled={!accessCheck.allowed}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-[11px] transition-colors cursor-pointer"
              title="Dán mẫu tìm kiếm theo Tên Dự án & Từ viết tắt"
            >
              <Building className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span>Mẫu Dự Án (Aliases)</span>
            </button>
          </div>
        </div>

        {/* Textarea thông minh & Hỗ trợ Paste ảnh OCR */}
        <div onPaste={handlePasteEvent}>
          {/* Hidden file inputs */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleImageOcr(file);
              }
              e.target.value = '';
            }}
          />

          <input
            type="file"
            ref={excelInputRef}
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={handleImportFileExcel}
          />

          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>Mã GCN / Phân khu</span>
              <span className="text-slate-400 dark:text-slate-500 font-normal lowercase">(hỗ trợ dán 10 - 200 mã cùng lúc, import Excel & paste ảnh)</span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Nút Import từ Excel/CSV */}
              <button
                type="button"
                id="btn-import-excel-lookup"
                onClick={() => excelInputRef.current?.click()}
                disabled={!accessCheck.allowed || ocrLoading}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
                title="Tải lên file Excel (.xlsx, .xls) hoặc CSV để nạp tự động danh sách mã GCN"
              >
                <FolderUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>📁 Import từ Excel/CSV</span>
              </button>

              {/* Nút Tải ảnh / OCR */}
              <button
                type="button"
                id="btn-upload-image-ocr"
                onClick={() => fileInputRef.current?.click()}
                disabled={!accessCheck.allowed || ocrLoading}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer disabled:opacity-50"
                title="Tải file ảnh hoặc ảnh chụp màn hình để nhận diện OCR"
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>📷 Tải ảnh / Dán ảnh OCR</span>
              </button>

              {/* Nút Dán Clipboard */}
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                disabled={!accessCheck.allowed || ocrLoading}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer disabled:opacity-50"
                title="Dán nhanh văn bản từ bộ nhớ tạm"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Dán từ Clipboard</span>
              </button>

              {rawText && (
                <button
                  type="button"
                  onClick={handleClearInput}
                  disabled={ocrLoading}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Xóa trắng ô nhập"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              onPaste={handlePasteEvent}
              disabled={!accessCheck.allowed || ocrLoading}
              placeholder={accessCheck.allowed
                ? "Dán danh sách 10 - 200 mã GCN (phân tách bởi xuống dòng, dấu phẩy hoặc tab), copy từ Excel HOẶC chụp màn hình Teams/Zalo bấm Ctrl + V dán ảnh vào đây..."
                : "Bạn cần được duyệt tài khoản để tra cứu"}
              rows={8}
              className="w-full px-3.5 py-3 font-mono text-xs text-slate-800 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-sans disabled:bg-slate-100 dark:disabled:bg-slate-800 min-h-[240px] max-h-[450px] resize-y leading-relaxed shadow-inner"
            />

            {/* OCR Loading Overlay */}
            {ocrLoading && (
              <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center p-4 z-20 border border-indigo-200 dark:border-indigo-800 animate-in fade-in duration-150">
                <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin mb-2" />
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ScanText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Đang trích xuất mã từ ảnh chụp màn hình... ({ocrProgress}%)</span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{ocrStatusText}</p>
                <div className="w-56 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-2.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-400 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* OCR Success Badge */}
          {ocrSuccessInfo && (
            <div className="mt-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in duration-150">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>✅ {ocrSuccessInfo}</span>
              </span>
              <button
                type="button"
                onClick={() => setOcrSuccessInfo(null)}
                className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 font-bold ml-2 cursor-pointer"
                title="Đóng thông báo"
              >
                ×
              </button>
            </div>
          )}

          {/* Real-time Token Detection Chips Bar */}
          <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Đã nhận diện: <strong className="font-extrabold text-blue-900 dark:text-blue-200">{parsedTokens.length}</strong> mã GCN cần tra cứu</span>
              </span>

              {/* Chips preview (tối đa 6 chips) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {parsedTokens.slice(0, 6).map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-mono border border-slate-200 dark:border-slate-700 shadow-2xs"
                  >
                    <span className="font-bold">{t.cleaned}</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-sans">
                      ({t.type === 'gcn' ? 'GCN' : t.type === 'block_lot' ? 'Lô' : t.type === 'project' ? 'Dự án' : 'Chung'})
                    </span>
                  </span>
                ))}
                {parsedTokens.length > 6 && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    +{parsedTokens.length - 6} mã khác
                  </span>
                )}
              </div>
            </div>

            {/* Action button */}
            <button
              type="button"
              onClick={() => handleExecuteLookup()}
              disabled={loading || !accessCheck.allowed || parsedTokens.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 active:scale-95 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tra cứu dữ liệu...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Tra cứu {parsedTokens.length > 0 ? `(${parsedTokens.length} mã)` : ''}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RESULTS DISPLAY SECTION */}
      {searched && summary && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* 1. Summary Cards (Hội tụ kết quả) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Tổng số */}
            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Tổng số mã tra</span>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{summary.totalRequested}</div>
            </div>

            {/* Tìm thấy */}
            <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">Tìm thấy</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">{summary.foundCount}</div>
            </div>

            {/* Không tìm thấy */}
            <div className={`p-3.5 rounded-xl border shadow-2xs ${summary.notFoundCount > 0 ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-300 uppercase tracking-wider block">Chưa có trên HT</span>
                <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className={`text-2xl font-extrabold mt-1 ${summary.notFoundCount > 0 ? 'text-amber-800 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {summary.notFoundCount}
              </div>
            </div>

            {/* Trong kho */}
            <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider block">Trong kho</span>
                <WarehouseIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-2xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">{summary.inStockCount}</div>
            </div>

            {/* Thế chấp / Xuất mượn */}
            <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800 shadow-2xs col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider block">Đang thế chấp</span>
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 mt-1">{summary.mortgagedCount}</div>
            </div>
          </div>

          {/* 2. Action Bar & Filter Tabs & Density Control */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Tất cả ({summary.totalRequested})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('found')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'found'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tìm thấy ({summary.foundCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('not_found')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'not_found'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Chưa có ({summary.notFoundCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('in_stock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'in_stock'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50'
                }`}
              >
                <WarehouseIcon className="w-3.5 h-3.5" />
                <span>Trong kho ({summary.inStockCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('mortgaged')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                  activeTab === 'mortgaged'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Thế chấp / Xuất ({summary.mortgagedCount + summary.checkedOutCount})</span>
              </button>
            </div>

            {/* Quick Actions & Density Switcher */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Nút chuyển đổi Mật độ Bảng (Display Density: Thoáng vs Nén) */}
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <button
                  type="button"
                  id="density-comfortable-btn"
                  onClick={() => handleToggleDensity('comfortable')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    density === 'comfortable'
                      ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Hiển thị bảng chế độ Thoáng (Khoảng cách rộng rãi)"
                >
                  <span>↕️ Thoáng</span>
                </button>
                <button
                  type="button"
                  id="density-compact-btn"
                  onClick={() => handleToggleDensity('compact')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    density === 'compact'
                      ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Hiển thị bảng chế độ Nén (Thu hẹp khoảng cách để xem được nhiều dòng hơn)"
                >
                  <span>↕️ Nén</span>
                </button>
              </div>

              {/* Nút Xuất Báo Cáo Excel */}
              <button
                type="button"
                id="btn-export-excel-report"
                onClick={handleExportExcelReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 rounded-xl transition-all shadow-2xs hover:shadow-xs cursor-pointer active:scale-95"
                title="Tải xuống toàn bộ bảng kết quả tra cứu dạng file Excel (.xlsx)"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Xuất Báo Cáo Excel</span>
              </button>

              {/* Nút Copy Phản Hồi Teams/Zalo */}
              <button
                type="button"
                id="btn-copy-teams-reply"
                onClick={handleCopyTeamsZaloReply}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 bg-gradient-to-r from-amber-50 to-blue-50 dark:from-slate-800 dark:to-slate-800 hover:from-amber-100 hover:to-blue-100 dark:hover:from-slate-700 dark:hover:to-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl transition-all shadow-2xs hover:shadow-xs cursor-pointer active:scale-95"
                title="Tự động copy đoạn tin nhắn trả lời định dạng chuẩn cho Teams/Zalo (phân loại theo Phiếu Nhập Kho)"
              >
                {copiedReply ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-400">Đã copy phản hồi!</span>
                  </>
                ) : (
                  <>
                    <MessageSquareShare className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-blue-400" />
                    <span>Copy phản hồi Teams / Zalo</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Receipt Filter Banner */}
          {selectedReceiptFilter && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-950 dark:text-amber-200 animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="text-base">📦</span>
                <span>Đang lọc danh sách theo Phiếu Nhập Kho:</span>
                <span className="font-mono font-extrabold bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-200 px-2 py-0.5 rounded text-xs">
                  {selectedReceiptFilter}
                </span>
                <span className="text-amber-800 dark:text-amber-300 font-semibold">({filteredResults.length} GCN)</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceiptFilter(null)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 bg-amber-100/80 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-900 px-2 py-1 rounded-md transition-colors cursor-pointer"
                title="Bỏ lọc phiếu nhập kho"
              >
                ✕ Bỏ lọc phiếu
              </button>
            </div>
          )}

          {/* 3. Results Table with Compact / Comfortable Density & Dark Mode */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold">
                  <tr>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} w-12 text-center`}>STT</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} min-w-[140px]`}>Mã GCN nhập vào</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} min-w-[130px] text-center`}>Trạng thái</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} min-w-[160px]`}>Số GCN / Mã TSĐB</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} min-w-[170px]`}>Dự án & Mã Lô</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} min-w-[180px]`}>Vị trí Kho & Phiếu Nhập</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} min-w-[160px]`}>Trạng thái pháp lý & vận hành</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} min-w-[150px]`}>Chủ sở hữu</th>
                    <th className={`${density === 'compact' ? 'py-2 px-3 text-[10px]' : 'py-3 px-3.5 text-[11px]'} w-16 text-center`}>Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-normal">
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        <Info className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="font-semibold text-slate-600 dark:text-slate-400">Không có kết quả trong mục này</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Thử chọn tab khác hoặc kiểm tra lại chuỗi tìm kiếm.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((item, index) => {
                      const a = item.asset;
                      const isFound = item.matched && Boolean(a);
                      const cellPadding = density === 'compact' ? 'py-1.5 px-3 text-xs' : 'py-3 px-3.5 text-xs';

                      return (
                        <tr
                          key={index}
                          className={`transition-colors ${
                            isFound
                              ? 'hover:bg-blue-50/40 dark:hover:bg-blue-950/30'
                              : 'bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/60 dark:hover:bg-amber-950/40'
                          }`}
                        >
                          {/* STT */}
                          <td className={`${cellPadding} text-center text-slate-400 dark:text-slate-500 font-mono text-[11px]`}>
                            {index + 1}
                          </td>

                          {/* Mã GCN nhập vào */}
                          <td className={cellPadding}>
                            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs">
                                {item.token.original}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                              <span>Chuẩn hóa:</span>
                              <strong className="text-slate-600 dark:text-slate-300 font-mono">{item.token.cleaned}</strong>
                            </div>
                          </td>

                          {/* Trạng thái tìm thấy */}
                          <td className={`${cellPadding} text-center`}>
                            {isFound ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Tìm thấy</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                                <XCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Chưa có trên HT</span>
                              </span>
                            )}
                          </td>

                          {/* Số GCN / Mã TSĐB */}
                          <td className={cellPadding}>
                            {isFound && a ? (
                              <div>
                                <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                  <span>{a.certificate_no}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopySingleCode(a.certificate_no, e)}
                                    className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                    title="Sao chép số GCN"
                                  >
                                    {copiedCode === a.certificate_no ? (
                                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                                  {a.asset_code || '-'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 text-xs italic">Sai mã / Chưa nhập</span>
                            )}
                          </td>

                          {/* Dự án & Mã Lô */}
                          <td className={`${cellPadding} min-w-[180px]`}>
                            {isFound && a ? (
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                                  {a.projects?.name ? (
                                    <span>
                                      <span className="text-slate-900 dark:text-slate-100">{a.projects.name}</span>
                                      {a.business_project_name && a.business_project_name.toLowerCase() !== a.projects.name.toLowerCase() && (
                                        <span className="text-blue-700 dark:text-blue-400 font-bold"> - {a.business_project_name}</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-slate-800 dark:text-slate-200 font-medium">{a.business_project_name || 'Chưa gán DA'}</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                  {a.legal_lot_code && (
                                    <span className="font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                      Lô PL: {a.legal_lot_code}
                                    </span>
                                  )}
                                  {a.business_plot_code && (
                                    <span className="font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/60">
                                      Lô KD: {a.business_plot_code}
                                    </span>
                                  )}
                                  {!a.legal_lot_code && !a.business_plot_code && (
                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>

                          {/* Vị trí Kho vật lý & Số Phiếu Nhập Kho */}
                          <td className={cellPadding}>
                            {isFound && a ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <WarehouseIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                  <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 block leading-tight">
                                      {a.warehouses?.name || 'Chưa phân kho'}
                                    </span>
                                    {a.warehouses?.is_central && (
                                      <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-semibold">
                                        Kho Trung Tâm
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Badge Mã Phiếu Nhập Kho chuyên sâu */}
                                {a.import_receipt_number ? (
                                  <div className="pt-0.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedReceiptFilter(prev => prev === a.import_receipt_number ? null : a.import_receipt_number!);
                                      }}
                                      className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border transition-all cursor-pointer shadow-2xs ${
                                        selectedReceiptFilter === a.import_receipt_number
                                          ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300 dark:ring-amber-800'
                                          : 'bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/80 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                      }`}
                                      title={`Phiếu nhập kho: ${a.import_receipt_number} (Bấm để lọc nhanh toàn bộ GCN thuộc phiếu này)`}
                                    >
                                      <span>📦</span>
                                      <span>{a.import_receipt_number}</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block italic">Chưa có số PNK</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>

                          {/* Trạng thái */}
                          <td className={cellPadding}>
                            {isFound && a ? (
                              <div className="space-y-1">
                                <StatusBadges
                                  custody_status={a.custody_status}
                                  lifecycle_status={a.lifecycle_status}
                                  sale_status={a.sale_status}
                                  mortgage_status={a.mortgage_status}
                                  showMortgage={false}
                                />
                                {a.mortgage_status === 'mortgaged' && (
                                  <div className="text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800 inline-block">
                                    🏦 Thế chấp: {a.mortgage_bank || 'Ngân hàng'}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>

                          {/* Chủ sở hữu */}
                          <td className={cellPadding}>
                            {isFound && a ? (
                              <div>
                                <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[150px] block" title={a.current_owner_entity?.name || 'Chưa cập nhật'}>
                                  {a.current_owner_entity?.name || 'Chưa cập nhật'}
                                </span>
                                {a.current_owner_role && (
                                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                    ({a.current_owner_role === 'cdt' ? 'Chủ Đầu Tư' : 'Nhà Đầu Tư'})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>

                          {/* Chi tiết */}
                          <td className={`${cellPadding} text-center`}>
                            {isFound && a ? (
                              <button
                                type="button"
                                onClick={() => setDetailAsset(a)}
                                className="p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Xem chi tiết toàn bộ thông tin GCN"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Asset Detail Modal */}
      {detailAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <AssetDetail
            asset={detailAsset}
            onClose={() => setDetailAsset(null)}
            onPreviewScan={(url) => {
              setPreviewScanUrl({
                urlOrPath: url,
                certificateNo: detailAsset.certificate_no,
                title: `Bản scan GCN ${detailAsset.certificate_no}`,
              });
            }}
          />
        </div>
      )}

      {/* Document Scan Preview Modal */}
      {previewScanUrl && (
        <DocumentPreviewModal
          isOpen={Boolean(previewScanUrl)}
          onClose={() => setPreviewScanUrl(null)}
          fileUrlOrPath={previewScanUrl.urlOrPath}
          certificateNo={previewScanUrl.certificateNo}
          title={previewScanUrl.title}
        />
      )}
    </div>
  );
};

export default Lookup;
