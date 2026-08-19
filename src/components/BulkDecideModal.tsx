import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Warehouse } from '../types';

interface BulkDecideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (decisions: any[]) => Promise<void>;
  items: any[];
  warehouses: Warehouse[];
}

export const BulkDecideModal: React.FC<BulkDecideModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  items,
  warehouses,
}) => {
  const [loading, setLoading] = useState(false);
  const [editedItems, setEditedItems] = useState<any>({});
  const [globalNotes, setGlobalNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      const initial: any = {};
      items.forEach(item => {
        initial[item.id] = {
          notes: '',
          details: item.details ? JSON.parse(JSON.stringify(item.details)) : {}
        };
      });
      setEditedItems(initial);
      setGlobalNotes('');
    }
  }, [isOpen, items]);

  if (!isOpen || items.length === 0) return null;

  const handleDetailChange = (itemId: string, field: string, value: any) => {
    setEditedItems((prev: any) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        details: {
          ...prev[itemId].details,
          [field]: value
        }
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = items.map(item => ({
        itemId: item.id,
        decision: 'approved',
        notes: editedItems[item.id].notes || globalNotes,
        finalDetails: editedItems[item.id].details,
      }));
      await onConfirm(payload);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative inline-block w-full max-w-4xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600"/> Duyệt hàng loạt ({items.length} tài sản)
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-4">
              {items.map(item => {
                const asset = item.asset;
                const details = editedItems[item.id]?.details || {};
                return (
                  <div key={item.id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex justify-between mb-2">
                      <span className="font-semibold text-gray-800">{asset?.certificate_no}</span>
                      <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded">{item.type}</span>
                    </div>

                    {item.type === 'checkout' && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Bộ phận nhận</label>
                          <input type="text" value={details.department || ''} onChange={e => handleDetailChange(item.id, 'department', e.target.value)} className="w-full px-2 py-1 text-sm border rounded" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Kho xuất</label>
                          <select value={details.targetWarehouseId || ''} onChange={e => handleDetailChange(item.id, 'targetWarehouseId', e.target.value)} className="w-full px-2 py-1 text-sm border rounded">
                            <option value="">Chọn kho</option>
                            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        </div>
                      </div>
                    )}

                    {item.type === 'mortgage' && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Ngân hàng</label>
                          <input type="text" value={details.bank || ''} onChange={e => handleDetailChange(item.id, 'bank', e.target.value)} className="w-full px-2 py-1 text-sm border rounded" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Giá trị định giá</label>
                          <input type="number" value={details.valuation || ''} onChange={e => handleDetailChange(item.id, 'valuation', e.target.value)} className="w-full px-2 py-1 text-sm border rounded" />
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-2">
                      <input 
                        type="text" 
                        placeholder="Ghi chú riêng cho sổ này..." 
                        value={editedItems[item.id]?.notes || ''} 
                        onChange={e => setEditedItems((p:any) => ({...p, [item.id]: {...p[item.id], notes: e.target.value}}))}
                        className="w-full px-2 py-1 text-sm border rounded bg-white"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú chung (áp dụng nếu không có ghi chú riêng)</label>
              <textarea
                value={globalNotes}
                onChange={e => setGlobalNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ghi chú chung..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Xác nhận duyệt tất cả
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
