import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { StatusBadges } from '../components/StatusBadges';
import { Search, Loader2, FileSearch } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const Lookup: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error('Nhập số GCN hoặc tên phân khu để tra cứu');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const { data, error } = await supabase.rpc('lookup_asset_status', { p_query: query.trim() });
      if (error) throw error;
      setResults(data || []);
    } catch (error: any) {
      toast.error('Lỗi tra cứu: ' + error.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Toaster position="top-right" />
      <div className="text-center">
        <FileSearch className="w-10 h-10 text-[#1E3A8A] mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-gray-900">Tra cứu tình trạng GCN</h1>
        <p className="text-sm text-gray-500 mt-1">Nhập số GCN hoặc tên phân khu để kiểm tra tình trạng hiện tại</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="VD: CQ123456 hoặc Khu A..."
            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-semibold rounded-md text-white bg-[#1E3A8A] hover:bg-blue-800 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tra cứu'}
        </button>
      </form>

      {searched && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
          ) : !results || results.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">Không tìm thấy GCN nào khớp với "{query}".</div>
          ) : (
            results.map((r, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{r.certificate_no}</div>
                  <div className="text-xs text-gray-500">{r.project_name} {r.subdivision ? `· ${r.subdivision}` : ''}</div>
                </div>
                <StatusBadges
                  custody_status={r.custody_status}
                  lifecycle_status={r.lifecycle_status}
                  sale_status={r.sale_status}
                  mortgage_status={r.mortgage_status}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
