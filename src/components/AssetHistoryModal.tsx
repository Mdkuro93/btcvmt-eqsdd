import React, { useEffect, useState } from 'react';
import { fetchActivityLogs } from '../api/activityLogs';
import { fetchLatestCheckinScanUrl } from '../api/transactions';
import { X, Loader2, History, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  assetId: string;
  certificateNo: string;
  onClose: () => void;
}

export const AssetHistoryModal: React.FC<Props> = ({ assetId, certificateNo, onClose }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanUrl, setScanUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchActivityLogs({ assetId })
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));

    fetchLatestCheckinScanUrl(assetId)
      .then(setScanUrl)
      .catch(() => setScanUrl(null));
  }, [assetId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#1E3A8A]" />
            <h3 className="text-base font-semibold text-gray-900">
              Lịch sử biến động — {certificateNo}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {scanUrl && (
              <a
                href={scanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                title="Mở file scan từ phiếu nhập kho gần nhất trên OneDrive"
              >
                <span>📄 Xem Bản Scan</span>
                <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
              </a>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">Chưa có biến động nào được ghi nhận cho GCN này.</p>
          ) : (
            <ol className="relative border-l border-gray-200 ml-2 space-y-6">
              {logs.map((l) => (
                <li key={l.id} className="ml-4">
                  <div className="absolute w-2.5 h-2.5 bg-[#1E3A8A] rounded-full -left-[5px] mt-1.5 border border-white" />
                  <time className="text-xs text-gray-400">
                    {l.log_date ? format(new Date(l.log_date), 'dd/MM/yyyy') : ''}
                  </time>
                  <div className="text-sm font-semibold text-gray-900">{l.action_type} <span className="text-xs font-normal text-blue-700">· {l.document_no}</span></div>
                  <p className="text-sm text-gray-600">{l.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {l.used_by && <>Đối tượng sử dụng: {l.used_by} · </>}
                    Thực hiện bởi: {l.performer?.full_name || l.performer?.email || '—'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};
