const fs = require('fs');
let code = fs.readFileSync('src/pages/Requests.tsx', 'utf8');

// 1. Import DecideRequestModal and fetchWarehouses
if (!code.includes('import { DecideRequestModal }')) {
  code = code.replace(
    "import { fetchTransactions, decideTransactionItem } from '../api/transactions';",
    "import { fetchTransactions, decideTransactionItem } from '../api/transactions';\nimport { fetchWarehouses } from '../api/assets';\nimport { DecideRequestModal } from '../components/DecideRequestModal';"
  );
}

// 2. Add state
const stateBlock = `  const [decidingItemId, setDecidingItemId] = useState<string | null>(null);

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [modalItem, setModalItem] = useState<any>(null);
  const [modalDecision, setModalDecision] = useState<'approved' | 'rejected' | null>(null);
  
  // Bulk approval state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  useEffect(() => {
    fetchWarehouses().then(setWarehouses).catch(() => {});
  }, []);
`;
if (!code.includes('const [warehouses, setWarehouses]')) {
  code = code.replace("  const [decidingItemId, setDecidingItemId] = useState<string | null>(null);", stateBlock);
}

// 3. handleDecide -> open modal
const newHandleDecide = `  const handleDecide = (item: any, decision: 'approved' | 'rejected') => {
    setModalItem(item);
    setModalDecision(decision);
  };

  const confirmDecision = async (decision: 'approved' | 'rejected', notes: string, finalDetails?: any) => {
    if (!user || !modalItem) return;
    setDecidingItemId(modalItem.id);
    try {
      await decideTransactionItem(modalItem.id, decision, notes, user.id, finalDetails);
      toast.success(decision === 'approved' ? 'Đã duyệt' : 'Đã từ chối');
      await loadTransactions();
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(modalItem.id);
        return next;
      });
    } catch (error: any) {
      toast.error('Lỗi khi xử lý: ' + (error.message || ''));
      console.error(error);
    } finally {
      setDecidingItemId(null);
      setModalItem(null);
      setModalDecision(null);
    }
  };`;

// replace handleDecide
if (code.includes('const handleDecide = async (itemId: string, decision: \'approved\' | \'rejected\')')) {
  code = code.replace(/  const handleDecide = async \(itemId: string, decision: 'approved' \| 'rejected'\) => \{[\s\S]*?  \};/, newHandleDecide);
}

// 4. Update the buttons in render
const oldButtons = `<button
                                        disabled={decidingItemId === item.id}
                                        onClick={() => handleDecide(item.id, 'rejected')}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                      >
                                        Từ chối
                                      </button>
                                      <button
                                        disabled={decidingItemId === item.id}
                                        onClick={() => handleDecide(item.id, 'approved')}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                      >
                                        {decidingItemId === item.id ? 'Đang xử lý...' : 'Duyệt'}
                                      </button>`;

const newButtons = `<button
                                        disabled={decidingItemId === item.id}
                                        onClick={() => handleDecide(item, 'rejected')}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                      >
                                        Từ chối
                                      </button>
                                      <button
                                        disabled={decidingItemId === item.id}
                                        onClick={() => handleDecide(item, 'approved')}
                                        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                      >
                                        {decidingItemId === item.id ? 'Đang xử lý...' : 'Duyệt'}
                                      </button>`;

code = code.replace(oldButtons, newButtons);

// 5. Add modal to the end
const renderModal = `      <DecideRequestModal
        isOpen={!!modalItem && !!modalDecision}
        onClose={() => { setModalItem(null); setModalDecision(null); }}
        onConfirm={confirmDecision}
        item={modalItem}
        decisionType={modalDecision!}
        warehouses={warehouses}
      />
    </div>
  );
};`;

if (!code.includes('<DecideRequestModal')) {
  code = code.replace(/    <\/div>\n  \);\n\};/, renderModal);
}

fs.writeFileSync('src/pages/Requests.tsx', code);
