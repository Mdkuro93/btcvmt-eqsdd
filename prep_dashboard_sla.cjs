const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// 1. Add fetchTransactions to imports if not there
if (!code.includes('fetchTransactions')) {
  code = code.replace(
    "import { fetchAssets } from '../api/assets';",
    "import { fetchAssets } from '../api/assets';\nimport { fetchTransactions } from '../api/transactions';"
  );
}

// 2. Add state
if (!code.includes('const [overdueSLA, setOverdueSLA] = useState(0);')) {
  code = code.replace(
    "const [generatingDemo, setGeneratingDemo] = useState(false);",
    "const [generatingDemo, setGeneratingDemo] = useState(false);\n  const [overdueSLA, setOverdueSLA] = useState(0);"
  );
}

// 3. Update loadStats to fetch transactions
const newLoadStats = `  const loadStats = async () => {
    setLoading(true);
    try {
      const { data } = await fetchAssets({}, 1, 10000);
      setAssets(data || []);

      const txs = await fetchTransactions();
      if (txs) {
        const now = new Date();
        let overdueCount = 0;
        txs.forEach((tx: any) => {
          (tx.items || []).forEach((item: any) => {
            if (item.status === 'pending') {
              const created = new Date(item.created_at);
              const diffMs = now.getTime() - created.getTime();
              const diffHours = diffMs / (1000 * 60 * 60);
              if (diffHours > 24) overdueCount++; // SLA 24h
            }
          });
        });
        setOverdueSLA(overdueCount);
      }
    } catch (err) {
      console.warn('Load stats error:', err);
    } finally {
      setLoading(false);
    }
  };`;

if (code.includes('  const loadStats = async () => {')) {
  code = code.replace(/  const loadStats = async \(\) => \{[\s\S]*?  \};/, newLoadStats);
}

// 4. Add to stats grid
const overdueCard = `
        {overdueSLA > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 shadow-sm flex items-center col-span-full md:col-span-1">
            <div className="bg-red-100 p-3 rounded-lg">
              <CheckSquare className="h-6 w-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-red-600">Yêu cầu quá hạn SLA (>24h)</p>
              <h3 className="text-2xl font-bold text-red-900">{overdueSLA} phiếu</h3>
            </div>
          </div>
        )}`;

code = code.replace(/<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">/, '<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">' + overdueCard);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
