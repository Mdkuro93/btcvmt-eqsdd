import React, { useState, useEffect } from 'react';
import { Asset } from '../types';
import { fetchLatestCheckinScanUrl } from '../api/transactions';
import { StatusBadges } from './StatusBadges';
import { formatPlotCode } from '../lib/assetIdentifier';
import { AssetTransferHistory } from './AssetTransferHistory';
import { 
  X, 
  FileText, 
  ExternalLink, 
  Building2, 
  Landmark, 
  Calendar, 
  Clock, 
  Layers, 
  Info,
  ShieldCheck 
} from 'lucide-react';

interface AssetDetailProps {
  asset: Asset;
  onClose?: () => void;
  onPreviewScan?: (url: string) => void;
}

export const AssetDetail: React.FC<AssetDetailProps> = ({
  asset,
  onClose,
  onPreviewScan,
}) => {
  const [latestScanUrl, setLatestScanUrl] = useState<string | null>(null);
  const [loadingScanUrl, setLoadingScanUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');

  useEffect(() => {
    let isMounted = true;
    if (asset?.id) {
      setLoadingScanUrl(true);
      fetchLatestCheckinScanUrl(asset.id)
        .then(url => {
          if (isMounted) setLatestScanUrl(url);
        })
        .catch(err => {
          console.warn('Lỗi lấy scan_url:', err);
          if (isMounted) setLatestScanUrl(null);
        })
        .finally(() => {
          if (isMounted) setLoadingScanUrl(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [asset?.id]);

  const effectiveScanUrl = latestScanUrl || asset.scan_file_url || null;

  return (
    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden max-w-4xl w-full flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1E3A8A] flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                GCN: {asset.certificate_no || 'Chưa có số GCN'}
              </h3>
              {effectiveScanUrl && (
                <a
                  href={effectiveScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
                  title="Mở bản scan từ phiếu nhập kho trên OneDrive trong tab mới"
                >
                  <span>📄 Xem Bản Scan</span>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600 ml-0.5" />
                </a>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Mã định danh hệ thống: <span className="font-mono font-medium">{asset.asset_code || '-'}</span>
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-100/50 px-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('info')}
          className={`py-3 px-4 border-b-2 transition-colors ${
            activeTab === 'info'
              ? 'border-[#1E3A8A] text-[#1E3A8A]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Thông tin chi tiết
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'border-[#1E3A8A] text-[#1E3A8A]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Lịch sử giao dịch & Chuyển nhượng
        </button>
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700">
        {activeTab === 'info' ? (
          <>
            {/* Trạng thái vận hành */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Trạng thái vận hành</h4>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center gap-3">
                <StatusBadges
                  custody_status={asset.custody_status}
                  lifecycle_status={asset.lifecycle_status}
                  sale_status={asset.sale_status}
                  mortgage_status={asset.mortgage_status}
                />
                {asset.expected_return_date && (
                  <span className="text-xs text-slate-600 font-medium">
                    · Hạn trả mượn: {asset.expected_return_date}
                  </span>
                )}
              </div>
            </div>

            {/* Thông tin Định danh & Pháp lý */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Thông tin Thửa đất & Pháp lý</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white p-4 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block">Số GCN QSDĐ</span>
                  <span className="font-bold text-slate-900 text-sm">{asset.certificate_no}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Mã Lô Pháp Lý</span>
                  <span className="font-semibold text-slate-800">{formatPlotCode(asset.legal_lot_code)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Diện tích</span>
                  <span className="font-semibold text-slate-800">{asset.area ? `${asset.area} m²` : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Số Thửa / Tờ Bản Đồ</span>
                  <span className="font-medium text-slate-800">
                    Thửa {asset.land_lot_no || '-'} / Tờ {asset.map_sheet_no || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Nhóm Sổ</span>
                  <span className="font-medium text-slate-800">
                    {asset.certificate_group === 'so_lon' ? 'Sổ lớn (Dự án)' : 'Sổ nhỏ (Phân lô)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Loại Tài Sản</span>
                  <span className="font-medium text-slate-800">{asset.asset_type || '-'}</span>
                </div>
              </div>
            </div>

            {/* Tài liệu đính kèm & Bản scan */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tài liệu đính kèm & Bản Scan</h4>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center gap-3">
                {effectiveScanUrl ? (
                  <a
                    href={effectiveScanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>📄 Xem Bản Scan</span>
                    <ExternalLink className="w-3.5 h-3.5 text-blue-200" />
                  </a>
                ) : (
                  <span className="text-xs text-slate-500 italic">
                    Chưa có liên kết bản scan từ phiếu nhập kho hoặc hệ thống.
                  </span>
                )}
                {asset.scan_file_url && onPreviewScan && (
                  <button
                    onClick={() => onPreviewScan(asset.scan_file_url!)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
                  >
                    <span>Xem trước trong hệ thống</span>
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 flex items-center justify-between">
              <span className="text-xs text-blue-900 font-medium">
                Link bản scan gắn theo phiếu nhập kho gần nhất:
              </span>
              {effectiveScanUrl ? (
                <a
                  href={effectiveScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-300 rounded-md transition-colors"
                >
                  <span>📄 Xem Bản Scan</span>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                </a>
              ) : (
                <span className="text-xs text-slate-400 italic">Không có link scan</span>
              )}
            </div>
            <AssetTransferHistory assetId={asset.id} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          >
            Đóng
          </button>
        )}
      </div>
    </div>
  );
};

export default AssetDetail;
