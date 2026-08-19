import React, { useState, useEffect } from 'react';
import { lookupAssets, fetchProjects } from '../api/assets';
import { Project } from '../types';
import { StatusBadges } from '../components/StatusBadges';
import { Search, Loader2, FileSearch } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const Lookup: React.FC = () => {
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

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  };

  const executeSearch = async (pageNum: number, isLoadMore = false) => {
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
      <div className="text-center">
        <FileSearch className="w-10 h-10 text-[#1E3A8A] mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-gray-900">Tra cứu tình trạng GCN</h1>
        <p className="text-sm text-gray-500 mt-1">Dán danh sách GCN (mỗi mã một dòng) hoặc tên phân khu để kiểm tra</p>
      </div>

      <form onSubmit={handleSearch} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Dự án</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="block w-full border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
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
                placeholder="GCN-VMT-0001&#10;GCN-VMT-0002&#10;Khu A..."
                rows={3}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-semibold rounded-md text-white bg-[#1E3A8A] hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2">
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

