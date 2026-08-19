const fs = require('fs');
let code = fs.readFileSync('src/pages/Assets.tsx', 'utf8');

code = code.replace(
  "import { fetchAssets, fetchProjects, createAsset, fetchWarehouses, deleteAsset } from '../api/assets';",
  "import { fetchAssets, fetchProjects, createAsset, fetchWarehouses, deleteAsset, deleteMultipleAssets } from '../api/assets';"
);

const trashIconImport = "import { Search, Loader2, Filter, AlertCircle, Plus, AlertTriangle, FileText, ExternalLink, MapPin, Building2, Trash2, Upload } from 'lucide-react';";
code = code.replace(/import \{ Search, Loader2, Filter, AlertCircle, Plus, AlertTriangle, FileText, ExternalLink, MapPin, Building2 \} from 'lucide-react';/, trashIconImport);

const bulkDeleteFunc = `  const handleDeleteMultiple = async () => {
    if (!window.confirm(\`Bạn có chắc chắn muốn XÓA VĨNH VIỄN \${selectedAssetIds.size} GCN đã chọn không? Hành động này không thể hoàn tác.\`)) {
      return;
    }
    setLoading(true);
    try {
      const ids = Array.from(selectedAssetIds);
      await deleteMultipleAssets(ids);
      toast.success(\`Đã xóa thành công \${ids.length} GCN\`);
      setSelectedAssetIds(new Set());
      loadAssets();
    } catch (error) {
      toast.error('Lỗi khi xóa tài sản');
      console.error(error);
      setLoading(false);
    }
  };

  const handleImportExcel = () => {
    // We will open a modal or file input for this
    document.getElementById('excel-upload')?.click();
  };
`;

code = code.replace("  const selectedAssetsList = assets.filter(a => selectedAssetIds.has(a.id));", bulkDeleteFunc + "\n  const selectedAssetsList = assets.filter(a => selectedAssetIds.has(a.id));");

const actionButtonsStr = `          {profile?.role !== 'viewer' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Tạo yêu cầu
            </button>
          )}`;

const newActionButtonsStr = `          <div className="flex items-center gap-2">
            {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
              <button
                onClick={handleDeleteMultiple}
                className="inline-flex items-center px-4 py-2 border border-red-200 text-sm font-medium rounded-md shadow-sm text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Xóa {selectedAssetIds.size} GCN
              </button>
            )}
            {profile?.role !== 'viewer' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Tạo yêu cầu
              </button>
            )}
          </div>`;

code = code.replace(actionButtonsStr, newActionButtonsStr);

fs.writeFileSync('src/pages/Assets.tsx', code);
