const fs = require('fs');
let code = fs.readFileSync('src/pages/Requests.tsx', 'utf8');

if (!code.includes('import { BulkDecideModal }')) {
  code = code.replace(
    "import { DecideRequestModal } from '../components/DecideRequestModal';",
    "import { DecideRequestModal } from '../components/DecideRequestModal';\nimport { BulkDecideModal } from '../components/BulkDecideModal';"
  );
}

const confirmBulk = `  const confirmBulkDecision = async (payloads: any[]) => {
    if (!user) return;
    try {
      for (const p of payloads) {
        await decideTransactionItem(p.itemId, p.decision, p.notes, user.id, p.finalDetails);
      }
      toast.success('Đã duyệt hàng loạt thành công');
      await loadTransactions();
      setSelectedItems(new Set());
    } catch (error: any) {
      toast.error('Lỗi khi duyệt hàng loạt: ' + (error.message || ''));
      console.error(error);
    }
  };`;

if (!code.includes('const confirmBulkDecision')) {
  code = code.replace("  const confirmDecision = async", confirmBulk + "\n\n  const confirmDecision = async");
}

const toggleSelection = `  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const getSelectedItemsFull = () => {
    const list: any[] = [];
    transactions.forEach(tx => {
      (tx.items || []).forEach((i: any) => {
        if (selectedItems.has(i.id)) list.push(i);
      });
    });
    return list;
  };`;

if (!code.includes('const toggleItemSelection')) {
  code = code.replace("  const toggleExpand", toggleSelection + "\n\n  const toggleExpand");
}

const headerChanges = `<h1 className="text-2xl font-bold text-gray-900">
          {isApprover ? 'Duyệt phiếu yêu cầu' : 'Phiếu yêu cầu của tôi'}
        </h1>
        {isApprover && selectedItems.size > 0 && (
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md font-semibold text-sm hover:bg-blue-700"
          >
            Duyệt {selectedItems.size} mục đã chọn
          </button>
        )}`;
code = code.replace(/<h1 className="text-2xl font-bold text-gray-900">[\s\S]*?<\/h1>/, headerChanges);

const thChanges = `{isApprover && <th className="py-1 pr-4 w-8"></th>}`;
code = code.replace(/\{isApprover && <th className="py-1 pr-4 text-right">Thao tác<\/th>\}/, thChanges + '\n                                {isApprover && <th className="py-1 pr-4 text-right">Thao tác</th>}');

const tdChanges = `{isApprover && (
                                <td className="py-2 pr-4">
                                  {item.status === 'pending' && (
                                    <input 
                                      type="checkbox" 
                                      checked={selectedItems.has(item.id)}
                                      onChange={() => toggleItemSelection(item.id)}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                  )}
                                </td>
                              )}`;
code = code.replace(/<tr key=\{item\.id\} className="border-t border-gray-200">/, '<tr key={item.id} className="border-t border-gray-200">\n                              ' + tdChanges);

const bulkModalRender = `      <BulkDecideModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onConfirm={confirmBulkDecision}
        items={getSelectedItemsFull()}
        warehouses={warehouses}
      />
    </div>`;

code = code.replace(/<\/div>\n  \);\n\};$/, bulkModalRender + '\n  );\n};');

fs.writeFileSync('src/pages/Requests.tsx', code);
