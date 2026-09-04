import React, { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { lookupAssets, fetchProjects } from '../api/assets';
import { Project } from '../types';
import { StatusBadges } from '../components/StatusBadges';
import { Search, Loader2, FileSearch, Clock, AlertTriangle, ShieldCheck, RefreshCw, LogOut, Settings, User } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { checkLookupAccess } from '../lib/accessGuard';
import { format } from 'date-fns';

export const Lookup: React.FC = () => {
  const { profile, refreshProfile, signOut } = useAuth();
  const [queryText, setQueryText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  
  const [results, setResults] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Kiểm tra nếu người dùng chưa đăng nhập -> Chuyển về trang Login
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  const accessCheck = checkLookupAccess(profile);

  useEffect(() => {
    if (accessCheck.allowed) {
      loadProjects();
    }
  }, [accessCheck.allowed]);

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      toast.success('Đã cập nhật trạng thái mới nhất!');
    } catch {
      toast.error('Không thể làm mới trạng thái');
    } finally {
      setRefreshing(false);
    }
  };

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  };

  const executeSearch = async (pageNum: number, isLoadMore = false) => {
    // Re-verify lookup access before executing search
    const currentAccess = checkLookupAccess(profile);
    if (!currentAccess.allowed) {
      toast.error(currentAccess.message || 'Tài khoản của bạn chưa có quyền tra cứu dữ liệu.');
      return;
    }

    const queries = queryText
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    if (queries.length === 0) {
      toast.error('Nhập số GCN hoặc tên phân khu để tra cứu');
      return;
    }

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setSearched(true);
    }

    try {
      const { data, totalCount: total } = await lookupAssets(queries, projectId, pageNum, pageSize);
      if (isLoadMore) {
        setResults(prev => [...prev, ...data]);
      } else {
        setResults(data);
      }
      setTotalCount(total);
      setPage(pageNum);
    } catch (error: any) {
      toast.error('Lỗi tra cứu: ' + error.message);
      if (!isLoadMore) {
        setResults([]);
        setTotalCount(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(1, false);
  };

  const handleLoadMore = () => {
    executeSearch(page + 1, true);
  };

  const hasMore = results.length < totalCount;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Toaster position="top-right" />

      {/* Header thanh người dùng & Điều hướng */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#1E3A8A] text-white flex items-center justify-center font-bold font-mono text-sm shadow-xs">
            {profile?.username ? profile.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <span>{profile?.username || profile?.full_name || profile?.email}</span>
              <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-[#1E3A8A] border border-blue-200">
                {profile?.role || 'user'}
              </span>
            </div>
            <div className="text-[11px] text-gray-500">
              Trạng thái:{' '}
              <span className={`font-semibold ${
                profile?.status === 'approved' ? 'text-emerald-700' : profile?.status === 'pending' ? 'text-amber-700' : 'text-red-700'
              }`}>
                {profile?.status === 'approved' ? 'Đã duyệt (approved)' : profile?.status === 'pending' ? 'Chờ duyệt (pending)' : 'Bị từ chối (rejected)'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Quản trị hệ thống</span>
            </Link>
          )}

          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition cursor-pointer"
            title="Đăng xuất khỏi tài khoản"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>

      <div className="text-center">
        <FileSearch className="w-10 h-10 text-[#1E3A8A] mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-gray-900">Tra cứu tình trạng GCN</h1>
        <p className="text-sm text-gray-500 mt-1">Dán danh sách GCN (mỗi mã một dòng) hoặc tên phân khu để kiểm tra</p>
      </div>

      {/* Thông báo điều kiện quyền tra cứu */}
      {!accessCheck.allowed ? (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Clock className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900 mb-2">
              {profile?.status === 'pending' ? 'Trạng thái: Chờ phê duyệt (pending)' : 'Trạng thái: Chưa đủ điều kiện tra cứu'}
            </span>
            <h3 className="text-xl font-extrabold text-amber-950">
              Tài khoản của bạn đang chờ Admin phê duyệt hoặc đã hết hạn tra cứu
            </h3>
          </div>
          <p className="text-sm text-amber-900 max-w-lg mx-auto leading-relaxed">
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span>Tài khoản đã được duyệt tra cứu • </span>
              <strong className="text-emerald-950">Thời hạn còn lại: {accessCheck.remainingText}</strong>
              <span className="text-emerald-700"> (hết hạn lúc {format(new Date(profile.access_expires_at), 'HH:mm dd/MM/yyyy')})</span>
            </div>
          </div>
          <button
            onClick={handleRefreshStatus}
            disabled={refreshing}
            className="text-emerald-800 hover:text-emerald-950 font-medium flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Đồng bộ hạn</span>
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Tài khoản đã được duyệt: <strong>Không giới hạn thời gian tra cứu</strong></span>
          </div>
        </div>
      )}

      {/* Lookup Form */}
      <form onSubmit={handleSearch} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Dự án</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!accessCheck.allowed}
              className="block w-full border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">Tất cả dự án</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 sm:flex-[2]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mã GCN / Phân khu</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                disabled={!accessCheck.allowed}
                placeholder={accessCheck.allowed ? "GCN-VMT-0001\nGCN-VMT-0002\nKhu A..." : "Bạn cần được duyệt tài khoản để tra cứu"}
                rows={3}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button 
            type="submit" 
            disabled={loading || !accessCheck.allowed} 
            className="px-5 py-2.5 text-sm font-semibold rounded-md text-white bg-[#1E3A8A] hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Tra cứu
          </button>
        </div>
      </form>

      {searched && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Kết quả tra cứu</span>
            <span className="text-xs text-gray-500">Tìm thấy <b>{totalCount}</b> kết quả</span>
          </div>
          
          <div className="divide-y divide-gray-200">
            {loading && !loadingMore ? (
              <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
            ) : results.length === 0 ? (
              <div className="p-10 text-center text-gray-500 text-sm">Không tìm thấy GCN nào khớp với từ khóa.</div>
            ) : (
              results.map((r, i) => (
                <div key={i} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50">
                  <div>
                    <div className="font-semibold text-gray-900">{r.certificate_no}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{r.project_name} {r.subdivision ? `· ${r.subdivision}` : ''}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
                    <StatusBadges
                      custody_status={r.custody_status}
                      lifecycle_status={r.lifecycle_status}
                      sale_status={r.sale_status}
                      mortgage_status={r.mortgage_status}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          
          {hasMore && !loading && (
            <div className="p-4 border-t border-gray-200 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                Xem thêm
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

