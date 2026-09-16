import fs from 'fs';
let content = fs.readFileSync('src/pages/Requests.tsx', 'utf8');

// Imports
content = content.replace(
  "import { fetchWarehouses } from '../api/assets';",
  "import { fetchWarehouses, fetchAssets } from '../api/assets';\nimport { fetchDeclarationRequests, approveDeclarationRequest, rejectDeclarationRequest } from '../api/assetDeclarationRequests';\nimport { generateNextAssetCode } from '../lib/assetIdentifier';"
);

// State and Tabs
content = content.replace(
  "export const Requests: React.FC = () => {",
  `export const Requests: React.FC = () => {\n  const [activeTab, setActiveTab] = useState<'giao_dich' | 'gcn_moi'>('giao_dich');\n  const [declarationRequests, setDeclarationRequests] = useState<any[]>([]);\n  const [loadingDeclarations, setLoadingDeclarations] = useState(false);`
);

// Load Declarations Function
const loadTxFunc = `  const loadTransactions = async () => {`;
const loadDeclFunc = `  const loadDeclarationRequests = async () => {
    setLoadingDeclarations(true);
    try {
      const data = await fetchDeclarationRequests();
      setDeclarationRequests(data || []);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải danh sách đề xuất');
    } finally {
      setLoadingDeclarations(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'gcn_moi') {
      loadDeclarationRequests();
    }
  }, [activeTab]);

  const handleApproveDeclaration = async (req: any) => {
    try {
      let prefix = null;
      if (req.request_type === 'cap_moi' || req.request_type === 'tach_so') {
        const assetsRes = await fetchAssets({ projectId: req.project_id || undefined, collateralType: req.collateral_type });
        const existingAssets = assetsRes.data || [];
        const fullCode = generateNextAssetCode(undefined, req.province, req.collateral_type, existingAssets);
        prefix = fullCode.substring(0, fullCode.lastIndexOf('_') + 1);
      }
      await approveDeclarationRequest(req.id, prefix);
      toast.success('Đã duyệt và nhập kho GCN thành công!');
      loadDeclarationRequests();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi duyệt yêu cầu');
    }
  };

  const handleRejectDeclaration = async (req: any) => {
    const reason = window.prompt('Nhập lý do từ chối:');
    if (reason === null) return;
    try {
      await rejectDeclarationRequest(req.id, reason);
      toast.success('Đã từ chối yêu cầu.');
      loadDeclarationRequests();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi từ chối yêu cầu');
    }
  };
`;
content = content.replace(loadTxFunc, loadDeclFunc + loadTxFunc);

// Render Tabs
const renderTabs = `
      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 px-1">
        <button
          onClick={() => setActiveTab('giao_dich')}
          className={\`pb-3 text-sm font-bold border-b-2 transition-colors \${
            activeTab === 'giao_dich'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }\`}
        >
          Phiếu yêu cầu giao dịch
        </button>
        <button
          onClick={() => setActiveTab('gcn_moi')}
          className={\`pb-3 text-sm font-bold border-b-2 transition-colors \${
            activeTab === 'gcn_moi'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }\`}
        >
          Đề xuất GCN mới (Khai báo)
        </button>
      </div>
`;
content = content.replace(
  /<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">/,
  renderTabs + `\n      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">`
);

// Tab Content conditional render
content = content.replace(
  /{overdueAssets\.length > 0/g,
  `{activeTab === 'giao_dich' ? (<>\n      {overdueAssets.length > 0`
);

const endOfTransactions = `
        )}
      </div>`;
const newTabContent = `
        )}
      </div>
      </>) : (
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        {loadingDeclarations ? (
          <div className="p-12 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Đang tải...</div>
        ) : declarationRequests.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">Chưa có đề xuất khai báo GCN nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="py-3 px-4 font-semibold">Loại YC / Ngày</th>
                  <th className="py-3 px-4 font-semibold">GCN & Lô đất</th>
                  <th className="py-3 px-4 font-semibold">Người yêu cầu</th>
                  <th className="py-3 px-4 font-semibold">Trạng thái</th>
                  <th className="py-3 px-4 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {declarationRequests.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-bold text-blue-900">
                        {req.request_type === 'cap_moi' ? 'Cấp mới' : req.request_type === 'tach_so' ? 'Tách sổ' : 'Cấp đổi'}
                      </div>
                      <div className="text-gray-500">{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm')}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold">{req.certificate_no}</div>
                      <div className="text-gray-500">{req.projects?.name || '-'} {req.subdivision ? '· ' + req.subdivision : ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{req.requester?.full_name || '-'}</div>
                      <div className="text-gray-500">{req.requester?.email || '-'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <ItemStatusBadge status={req.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isApprover && req.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleRejectDeclaration(req)} className="px-3 py-1 rounded text-red-700 hover:bg-red-50 border border-red-200 font-semibold">Từ chối</button>
                          <button onClick={() => handleApproveDeclaration(req)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm">Duyệt</button>
                        </div>
                      )}
                      {req.status === 'rejected' && req.rejection_reason && (
                        <div className="text-red-600 text-[11px] mt-1 text-right">Lý do: {req.rejection_reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
`;
content = content.replace(endOfTransactions, newTabContent);

fs.writeFileSync('src/pages/Requests.tsx', content, 'utf8');
