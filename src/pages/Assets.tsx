import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAssets, fetchProjects, createAsset, fetchWarehouses } from '../api/assets';
import { createTransaction } from '../api/transactions';
import { Asset, TransactionType } from '../types';
import { StatusBadges } from '../components/StatusBadges';
import { RequestModal } from '../components/RequestModal';
import { CreateAssetModal } from '../components/CreateAssetModal';
import { AssetHistoryModal } from '../components/AssetHistoryModal';
import { Search, Loader2, Filter, AlertCircle, Plus } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const Assets: React.FC = () => {
  const { user, profile } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [custodyStatus, setCustodyStatus] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [saleStatus, setSaleStatus] = useState('');
  const [mortgageStatus, setMortgageStatus] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [subdivision, setSubdivision] = useState('');

  // Selection
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null);

  useEffect(() => {
    loadProjects();
    fetchWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  useEffect(() => {
    loadAssets();
  }, [search, subdivision, projectId, custodyStatus, lifecycleStatus, saleStatus, mortgageStatus, warehouseId]);

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data || []);
    } catch (error) {
      console.error('Failed to load projects', error);
      toast.error('Lỗi tải danh sách dự án');
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await fetchAssets({
        search,
        projectId,
        custody_status: custodyStatus,
        lifecycle_status: lifecycleStatus,
        sale_status: saleStatus,
        mortgage_status: mortgageStatus,
        warehouseId,
        subdivision,
      });
      setAssets(data || []);
      // clear selection when filters change? Optional. Let's keep it.
    } catch (error) {
      console.error('Failed to load assets', error);
      toast.error('Lỗi tải danh sách GCN');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedAssetIds(new Set(assets.map(a => a.id)));
    } else {
      setSelectedAssetIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedAssetIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAssetIds(newSet);
  };

  const handleCreateRequest = async (type: TransactionType, details: any) => {
    if (!user || !profile) return;
    try {
      await createTransaction(
        user.id,
        type,
        details,
        Array.from(selectedAssetIds)
      );
      toast.success('Gửi yêu cầu thành công!');
      setSelectedAssetIds(new Set());
      loadAssets(); // Reload to see any instant status changes if any (though usually pending)
    } catch (error: any) {
      console.error(error);
      toast.error('Lỗi gửi yêu cầu: ' + error.message);
    }
  };

  const handleCreateAsset = async (assetData: Partial<Asset>) => {
    await createAsset(assetData);
    loadAssets();
  };

  const selectedAssetsList = assets.filter(a => selectedAssetIds.has(a.id));

  return (
    <div className="space-y-4">
      <Toaster position="top-right" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Danh sách GCN QSDĐ</h1>
        {profile?.role === 'btc_manager' && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="-ml-1 mr-2 h-4 w-4" />
            Khai báo GCN
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Tìm theo số GCN..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Tìm theo phân khu/lô..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={subdivision}
            onChange={(e) => setSubdivision(e.target.value)}
          />
        </div>
        
        <div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            <option value="">Tất cả dự án</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
           <select value={custodyStatus} onChange={e => setCustodyStatus(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="">Tất cả (Lưu kho)</option>
            <option value="in_stock">Trong kho</option>
            <option value="checked_out">Đang mượn/xuất</option>
          </select>
        </div>

        <div>
           <select value={lifecycleStatus} onChange={e => setLifecycleStatus(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="">Tất cả (Vòng đời)</option>
            <option value="active">Active</option>
            <option value="split">Đã tách</option>
            <option value="invalidated">Vô hiệu</option>
          </select>
        </div>

        <div>
           <select value={saleStatus} onChange={e => setSaleStatus(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="">Tất cả (Kinh doanh)</option>
            <option value="not_ready">Chưa SS bán</option>
            <option value="ready_for_sale">Sẵn sàng bán</option>
            <option value="sold">Đã bán</option>
          </select>
        </div>

        <div>
           <select value={mortgageStatus} onChange={e => setMortgageStatus(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="">Tất cả (Thế chấp)</option>
            <option value="none">Không thế chấp</option>
            <option value="mortgaged">Đang thế chấp</option>
          </select>
        </div>

        <div>
           <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            <option value="">Tất cả (Kho)</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Bar */}
      {selectedAssetIds.size > 0 && (
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">
            Đã chọn {selectedAssetIds.size} GCN
          </span>
          {profile?.role !== 'viewer' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Tạo yêu cầu
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={assets.length > 0 && selectedAssetIds.size === assets.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số GCN
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dự án / Phân khu
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Diện tích (m²)
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kho quản lý
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lịch sử
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
                    <p className="mt-2 text-sm text-gray-500">Đang tải dữ liệu...</p>
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto" />
                    <p className="mt-2 text-sm text-gray-500">Không tìm thấy tài sản nào phù hợp.</p>
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={selectedAssetIds.has(asset.id)}
                        onChange={() => handleSelectOne(asset.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{asset.certificate_no}</div>
                      <div className="text-sm text-gray-500">{asset.owner_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{asset.projects?.name || '-'}</div>
                      <div className="text-sm text-gray-500">{asset.subdivision || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {asset.area ? asset.area.toLocaleString('vi-VN') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{asset.warehouses?.name || <span className="text-gray-400 italic">Chưa gán kho</span>}</div>
                      {asset.custody_status === 'checked_out' && asset.current_holder_dept && (
                        <div className="text-xs text-amber-600">Đang tại: {asset.current_holder_dept}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadges
                        custody_status={asset.custody_status}
                        lifecycle_status={asset.lifecycle_status}
                        sale_status={asset.sale_status}
                        mortgage_status={asset.mortgage_status}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setHistoryAsset(asset)}
                        className="text-sm text-[#1E3A8A] hover:underline font-medium"
                      >
                        Xem lịch sử
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {profile && (
        <>
          <RequestModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSubmit={handleCreateRequest}
            selectedAssets={selectedAssetsList}
            userRole={profile.role}
            warehouses={warehouses}
          />
          <CreateAssetModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSubmit={handleCreateAsset}
            projects={projects}
            warehouses={warehouses}
          />
        </>
      )}

      {historyAsset && (
        <AssetHistoryModal
          assetId={historyAsset.id}
          certificateNo={historyAsset.certificate_no}
          onClose={() => setHistoryAsset(null)}
        />
      )}
    </div>
  );
};
