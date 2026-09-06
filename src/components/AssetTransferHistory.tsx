import React, { useState, useEffect } from 'react';
import { AssetOwnershipTransfer } from '../types';
import { fetchAssetOwnershipTransfers } from '../api/investorEntities';
import { ArrowLeftRight, Clock, User, FileText, Loader2, Building2, ShieldAlert } from 'lucide-react';

interface Props {
  assetId: string;
  refreshTrigger?: number;
}

export const AssetTransferHistory: React.FC<Props> = ({ assetId, refreshTrigger }) => {
  const [transfers, setTransfers] = useState<AssetOwnershipTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchAssetOwnershipTransfers(assetId)
      .then(data => {
        if (isMounted) {
          setTransfers(data || []);
        }
      })
      .catch(err => {
        console.error('Lỗi tải lịch sử chuyển nhượng:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [assetId, refreshTrigger]);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${d.toLocaleDateString('vi-VN')}`;
    } catch {
      return dateStr;
    }
  };

  const renderRoleBadge = (role?: string | null) => {
    if (role === 'cdt') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
          CĐT
        </span>
      );
    }
    if (role === 'ndt') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
          NĐT
        </span>
      );
    }
    return <span className="text-gray-400 text-[10px] italic">Chưa xác định</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-500 gap-2 text-xs">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span>Đang tải lịch sử chuyển nhượng sở hữu...</span>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center text-xs text-gray-500">
        <ArrowLeftRight className="w-6 h-6 text-gray-400 mx-auto mb-1.5 opacity-60" />
        <p className="font-medium text-gray-600">Chưa có lịch sử chuyển nhượng nào</p>
        <p className="text-[11px] text-gray-400 mt-0.5">GCN này chưa ghi nhận đợt bàn giao / chuyển nhượng quyền sở hữu nào.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="font-bold text-[#1E3A8A] text-xs uppercase flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5" /> Lịch sử chuyển nhượng quyền sở hữu ({transfers.length} lần)
        </h5>
        <span className="text-[11px] text-gray-500">Sắp xếp: Mới nhất trước</span>
      </div>

      <div className="space-y-2.5">
        {transfers.map((item, idx) => {
          const fromName = item.from_entity?.name || (item.from_entity_id ? `Pháp nhân #${item.from_entity_id.slice(-6)}` : 'Chưa liên kết CĐT/NĐT');
          const fromCode = item.from_entity?.company_code;
          const toName = item.to_entity?.name || (item.to_entity_id ? `Pháp nhân #${item.to_entity_id.slice(-6)}` : 'Pháp nhân mới');
          const toCode = item.to_entity?.company_code;

          return (
            <div
              key={item.id || idx}
              className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs hover:border-blue-300 transition-colors"
            >
              {/* Header: Time & Performer */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-[11px] text-gray-500">
                <div className="flex items-center gap-1.5 font-medium text-gray-700">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>{formatDateTime(item.transferred_at)}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-600">
                  <User className="w-3 h-3 text-gray-400" />
                  <span>
                    Người thực hiện: <strong>{item.performer?.full_name || item.performer?.email || 'Hệ thống'}</strong>
                  </span>
                </div>
              </div>

              {/* Transfer Details: From -> To */}
              <div className="pt-2.5 grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] items-center gap-2 text-xs">
                {/* From Entity */}
                <div className="bg-gray-50 p-2 rounded-lg border border-gray-200/80">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block mb-0.5">Bên chuyển nhượng (Cũ):</span>
                  <div className="font-semibold text-gray-800 leading-tight">
                    {fromName} {fromCode && <span className="font-mono text-gray-500 text-[11px]">({fromCode})</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-500">Vai trò:</span>
                    {renderRoleBadge(item.from_role)}
                  </div>
                </div>

                {/* Arrow Icon */}
                <div className="flex justify-center text-blue-600 font-bold">
                  <div className="p-1.5 bg-blue-50 rounded-full border border-blue-200">
                    <ArrowLeftRight className="w-4 h-4" />
                  </div>
                </div>

                {/* To Entity */}
                <div className="bg-blue-50/50 p-2 rounded-lg border border-blue-200">
                  <span className="text-[10px] text-blue-700 uppercase font-semibold block mb-0.5">Bên tiếp nhận (Mới):</span>
                  <div className="font-bold text-blue-950 leading-tight">
                    {toName} {toCode && <span className="font-mono text-blue-700 text-[11px]">({toCode})</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11px] text-blue-800 font-medium">Vai trò:</span>
                    {renderRoleBadge(item.to_role)}
                  </div>
                </div>
              </div>

              {/* Transfer Note */}
              {item.note && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-start gap-1.5 text-[11px] text-gray-600">
                  <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-gray-700">Lý do / Căn cứ:</strong> {item.note}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
