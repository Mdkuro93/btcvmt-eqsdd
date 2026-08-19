const fs = require('fs');
let code = fs.readFileSync('src/pages/Assets.tsx', 'utf8');

// Import createMultipleAssets
code = code.replace(
  "import { fetchAssets, fetchProjects, createAsset, fetchWarehouses, deleteAsset, deleteMultipleAssets } from '../api/assets';",
  "import { fetchAssets, fetchProjects, createAsset, fetchWarehouses, deleteAsset, deleteMultipleAssets, createMultipleAssets } from '../api/assets';"
);

// Import ImportExcelModal
if (!code.includes("import { ImportExcelModal } from '../components/ImportExcelModal';")) {
  code = code.replace(
    "import { CreateAssetModal } from '../components/CreateAssetModal';",
    "import { CreateAssetModal } from '../components/CreateAssetModal';\nimport { ImportExcelModal } from '../components/ImportExcelModal';"
  );
}

// Add state for ImportModal
if (!code.includes("const [isImportModalOpen, setIsImportModalOpen] = useState(false);")) {
  code = code.replace(
    "const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);",
    "const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);\n  const [isImportModalOpen, setIsImportModalOpen] = useState(false);"
  );
}

// Add handleImportMultiple
if (!code.includes("const handleImportMultiple = async")) {
  const handleImportFunc = `  const handleImportMultiple = async (assetsData: Partial<Asset>[]) => {
    try {
      await createMultipleAssets(assetsData);
      toast.success(\`Đã import thành công \${assetsData.length} GCN\`);
      loadAssets();
    } catch (err: any) {
      toast.error('Lỗi khi lưu dữ liệu vào hệ thống: ' + err.message);
    }
  };

  const handleImportExcel = () => {
    setIsImportModalOpen(true);
  };
`;
  code = code.replace(
    "  const handleImportExcel = () => {\n    // We will open a modal or file input for this\n    document.getElementById('excel-upload')?.click();\n  };",
    handleImportFunc
  );
}

// Add the import button
const oldButtons = `        {profile?.role === 'btc_manager' && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="-ml-1 mr-2 h-4 w-4" />
            Khai báo GCN mới
          </button>
        )}`;

const newButtons = `        {(profile?.role === 'btc_manager' || profile?.role === 'super_admin') && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-blue-200 text-sm font-medium rounded-md shadow-sm text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Upload className="-ml-1 mr-2 h-4 w-4" />
              Import Excel
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#1E3A8A] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="-ml-1 mr-2 h-4 w-4" />
              Khai báo GCN mới
            </button>
          </div>
        )}`;

code = code.replace(oldButtons, newButtons);

// Add the ImportModal component to the render tree
if (!code.includes("<ImportExcelModal")) {
  const modals = `      <CreateAssetModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateAsset}
        projects={projects}
        warehouses={warehouses}
      />
      
      <ImportExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportMultiple}
        projects={projects}
        warehouses={warehouses}
      />`;
      
  code = code.replace(
    `<CreateAssetModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateAsset}
        projects={projects}
        warehouses={warehouses}
      />`,
      modals
  );
}

fs.writeFileSync('src/pages/Assets.tsx', code);
