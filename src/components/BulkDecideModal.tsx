import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, CheckCircle, AlertTriangle, Plus, Trash2, RotateCcw, Search, Building2, MapPin, Printer } from 'lucide-react';
import { Asset, Warehouse } from '../types';
import { fetchAssets } from '../api/assets';
import { getResponsibleWarehouseId } from '../lib/warehouseRouting';

interface BulkDecideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    approvedItems: any[];
    excludedItemIds: string[];
    originalRequestedCount: number;
    globalNotes: string;
    transactionId?: string;
  }) => Promise<void>;
  items: any[];
  warehouses: Warehouse[];
  onOpenPrint?: (payload: { item: any; transaction?: any }) => void;
}

export const BulkDecideModal: React.FC<BulkDecideModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  items,
  warehouses,
  onOpenPrint,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeItems, setActiveItems] = useState<any[]>([]);
  const [excludedItemIds, setExcludedItemIds] = useState<string[]>([]);
  const [editedItems, setEditedItems] = useState<Record<string, { notes: string; details: any }>>({});
  const [globalNotes, setGlobalNotes] = useState('');

  // Add Asset drawer/search state
  const [isAddModeOpen, setIsAddModeOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const originalCount = items.length;

  useEffect(() => {
    if (isOpen) {
      setActiveItems([...items]);
      setExcludedItemIds([]);
      const initial: Record<string, { notes: string; details: any }> = {};
      items.forEach(item => {
        initial[item.id] = {
          notes: item.notes || '',
          details: item.details ? JSON.parse(JSON.stringify(item.details)) : {},
        };
      });
      setEditedItems(initial);
      setGlobalNotes('');
      setIsAddModeOpen(false);
      setAssetSearchQuery('');
    }
  }, [isOpen, items]);

  // Load available assets for adding into the batch
  useEffect(() => {
    if (!isOpen || !isAddModeOpen) return;

    let isMounted = true;
    setLoadingAssets(true);

    const firstItem = items[0];
    const warehouseId = getResponsibleWarehouseId(firstItem, firstItem?.type);

    fetchAssets({
      warehouseId: warehouseId || undefined,
      custody_status: firstItem?.type === 'checkout' ? 'in_stock' : undefined,
    }, 1, 100).then(res => {
      if (isMounted) {
        setAvailableAssets(res.data || []);
      }
    }).catch(err => {
      console.error('Failed to fetch assets for bulk add', err);
    }).finally(() => {
      if (isMounted) setLoadingAssets(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, isAddModeOpen, items]);

  if (!isOpen || items.length === 0) return null;

  const currentCount = activeItems.length;
  const isCountChanged = currentCount !== originalCount;
  const isNoteRequired = isCountChanged;
  const isNoteMissing = isNoteRequired && (!globalNotes || globalNotes.trim().length === 0);

  const handleRemoveItem = (itemId: string) => {
    const itemToRemove = activeItems.find(i => i.id === itemId);
    if (!itemToRemove) return;

    setActiveItems(prev => prev.filter(i => i.id !== itemId));
    if (!itemId.startsWith('new-added-')) {
      setExcludedItemIds(prev => Array.from(new Set([...prev, itemId])));
    }
  };

  const handleRestoreItem = (itemId: string) => {
    const originalItem = items.find(i => i.id === itemId);
    if (!originalItem) return;

    setExcludedItemIds(prev => prev.filter(id => id !== itemId));
    setActiveItems(prev => [...prev, originalItem]);
  };

  const handleAddAsset = (asset: Asset) => {
    const existing = activeItems.find(i => (i.asset?.id || i.asset_id) === asset.id);
    if (existing) return;

    const templateItem = items[0] || {};
    const newId = `new-added-${asset.id}-${Date.now()}`;
    const newItem = {
      id: newId,
      transaction_id: templateItem.transaction_id || templateItem.transaction?.id,
      asset_id: asset.id,
      asset: asset,
      type: templateItem.type || 'checkout',
      status: 'pending',
      details: templateItem.details ? JSON.parse(JSON.stringify(templateItem.details)) : {},
      notes: 'Thêm bổ sung vào đợt duyệt',
    };

    setActiveItems(prev => [...prev, newItem]);
    setEditedItems(prev => ({
      ...prev,
      [newId]: {
        notes: '',
        details: newItem.details,
      },
    }));
  };

  const handleDetailChange = (itemId: string, field: string, value: any) => {
    setEditedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        details: {
          ...(prev[itemId]?.details || {}),
          [field]: value,
        },
      },
    }));
  };

  const handleItemNotesChange = (itemId: string, noteVal: string) => {
    setEditedItems(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { details: {} }),
        notes: noteVal,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNoteMissing) {
      return;
    }

    setLoading(true);
    try {
      const approvedPayload = activeItems.map(item => ({
        itemId: item.id,
        assetId: item.asset?.id || item.asset_id,
        decision: 'approved' as const,
        notes: editedItems[item.id]?.notes || globalNotes,
        finalDetails: editedItems[item.id]?.details || item.details,
        type: item.type,
      }));

      const txId = items[0]?.transaction_id || items[0]?.transaction?.id;

      await onConfirm({
        approvedItems: approvedPayload,
        excludedItemIds,
        originalRequestedCount: originalCount,
        globalNotes,
        transactionId: txId,
      });
      onClose();
    } catch (err) {
      console.error('Bulk decision failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredAvailableAssets = availableAssets.filter(a => {
    const isAlreadyInActive = activeItems.some(i => (i.asset?.id || i.asset_id) === a.id);
    if (isAlreadyInActive) return false;

    if (!assetSearchQuery.trim()) return true;
    const q = assetSearchQuery.toLowerCase();
    return (
      a.certificate_no?.toLowerCase().includes(q) ||
      a.owner_name?.toLowerCase().includes(q) ||
      a.subdivision?.toLowerCase().includes(q) ||
      a.land_lot_no?.toLowerCase().includes(q)
    );
  });

  const excludedItemsList = items.filter(i => excludedItemIds.includes(i.id));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-900/60 backdrop-blur-xs" onClick={onClose} />

        <div className="relative inline-block w-full max-w-4xl p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-2xl rounded-2xl border border-gray-200 my-8">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Phê Duyệt Hàng Loạt
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Kiểm tra danh sách GCN thực tế bàn giao, điều chỉnh số lượng và phát hành chứng từ xuất/nhập
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Count Comparison Banner */}
          <div className="mt-4 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/80 border-gray-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Yêu cầu gốc:</span>
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-200 text-gray-800">
                  {originalCount} sổ
                </span>
              </div>
              <span className="text-gray-300">→</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Thực nhận / Thực duyệt:</span>
                <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                  isCountChanged
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {currentCount} sổ
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAddModeOpen(!isAddModeOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isAddModeOpen ? 'Đóng tìm kiếm' : 'Thêm GCN khác'}
            </button>
          </div>

          {/* Warning when count changes */}
          {isCountChanged && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Số lượng duyệt thực tế khác yêu cầu ban đầu</span> (Yêu cầu: {originalCount} sổ — Thực nhận: {currentCount} sổ).
                <br />
                Bắt buộc nhập lý do điều chỉnh vào <span className="font-bold">Ghi chú chung</span> bên dưới để hệ thống gửi thông báo đối chiếu đến người lập phiếu.
              </div>
            </div>
          )}

          {/* Quick Add Asset Drawer */}
          {isAddModeOpen && (
            <div className="mt-4 p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-blue-600" />
                  Tìm GCN cùng kho để thêm vào đợt duyệt này
                </span>
                <span className="text-[11px] text-gray-500">
                  {filteredAvailableAssets.length} GCN khả dụng
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Nhập số sổ GCN, tên chủ sở hữu, phân khu, số thửa..."
                  value={assetSearchQuery}
                  onChange={e => setAssetSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1.5 divide-y divide-gray-100 bg-white p-2 rounded-lg border border-gray-200">
                {loadingAssets ? (
                  <div className="py-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Đang tải danh sách tài sản...
                  </div>
                ) : filteredAvailableAssets.length === 0 ? (
                  <div className="py-4 text-center text-xs text-gray-400">
                    Không tìm thấy GCN phù hợp để thêm.
                  </div>
                ) : (
                  filteredAvailableAssets.map(asset => (
                    <div key={asset.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs hover:bg-gray-50 p-1.5 rounded">
                      <div>
                        <span className="font-bold text-gray-900 font-mono">{asset.certificate_no}</span>
                        <span className="text-gray-500 ml-2">({asset.owner_name || 'Chưa có tên'})</span>
                        <div className="text-[11px] text-gray-400">
                          PK: {asset.subdivision || '-'} · Thửa: {asset.land_lot_no || '-'} · DT: {asset.area ? asset.area.toLocaleString('vi-VN') + ' m²' : '-'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddAsset(asset)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                      >
                        + Thêm vào đợt
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            
            {/* List of active items */}
            <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
              {activeItems.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-xs bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  Đã loại bỏ toàn bộ GCN. Vui lòng thêm lại ít nhất 1 GCN hoặc khôi phục danh sách gốc bên dưới.
                </div>
              ) : (
                activeItems.map((item, idx) => {
                  const asset = item.asset;
                  const details = editedItems[item.id]?.details || {};
                  const isNewlyAdded = item.id?.startsWith('new-added-');

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isNewlyAdded
                          ? 'bg-blue-50/40 border-blue-200'
                          : 'bg-gray-50/60 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[10px] font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-gray-900 font-mono">
                                {asset?.certificate_no || 'Chưa xác định'}
                              </span>
                              {isNewlyAdded && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                                  GCN mới bổ sung
                                </span>
                              )}
                              <span className="text-[11px] font-medium px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                {item.type}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {asset?.owner_name && <span>Chủ sở hữu: <strong className="text-gray-700">{asset.owner_name}</strong> · </span>}
                              {asset?.subdivision && <span>Phân khu: <strong>{asset.subdivision}</strong> · </span>}
                              {asset?.land_lot_no && <span>Thửa: <strong>{asset.land_lot_no}</strong> · </span>}
                              <span>Diện tích: <strong>{asset?.area ? asset.area.toLocaleString('vi-VN') + ' m²' : '-'}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Remove item button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          title="Loại bỏ GCN này khỏi đợt duyệt"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Item-specific inputs */}
                      {item.type === 'checkout' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 pt-2.5 border-t border-gray-200/60">
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                              Bộ phận/Ban nhận sổ
                            </label>
                            <input
                              type="text"
                              value={details.department || ''}
                              onChange={e => handleDetailChange(item.id, 'department', e.target.value)}
                              placeholder="Ban DAĐT, Pháp chế..."
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                              Kho xuất / Chuyển đến
                            </label>
                            <select
                              value={details.targetWarehouseId || ''}
                              onChange={e => handleDetailChange(item.id, 'targetWarehouseId', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                            >
                              <option value="">(Giữ nguyên kho hiện tại)</option>
                              {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {item.type === 'mortgage' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 pt-2.5 border-t border-gray-200/60">
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Ngân hàng thế chấp</label>
                            <input
                              type="text"
                              value={details.bank || ''}
                              onChange={e => handleDetailChange(item.id, 'bank', e.target.value)}
                              placeholder="Vietcombank, BIDV..."
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Giá trị định giá (VNĐ)</label>
                            <input
                              type="number"
                              value={details.valuation || ''}
                              onChange={e => handleDetailChange(item.id, 'valuation', e.target.value)}
                              placeholder="Số tiền định giá"
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                            />
                          </div>
                        </div>
                      )}

                      <div className="mt-2">
                        <input
                          type="text"
                          placeholder="Ghi chú riêng cho sổ này (nếu có)..."
                          value={editedItems[item.id]?.notes || ''}
                          onChange={e => handleItemNotesChange(item.id, e.target.value)}
                          className="w-full px-2.5 py-1 text-xs border border-gray-200 rounded-md bg-white text-gray-700 placeholder-gray-400"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Excluded items list (Collapsible / Restore) */}
            {excludedItemsList.length > 0 && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-600 mb-2">
                  <span>GCN đã loại bỏ ({excludedItemsList.length} sổ):</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {excludedItemsList.map(item => (
                    <div
                      key={item.id}
                      className="inline-flex items-center gap-2 px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-lg text-gray-600"
                    >
                      <span className="font-mono">{item.asset?.certificate_no}</span>
                      <button
                        type="button"
                        onClick={() => handleRestoreItem(item.id)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold text-[11px]"
                      >
                        <RotateCcw className="w-3 h-3" /> Khôi phục
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Global Notes */}
            <div className="pt-3 border-t border-gray-200">
              <label className="block text-xs font-semibold text-gray-800 mb-1">
                Ghi chú chung {isNoteRequired && <span className="text-red-500">* (Bắt buộc khi có điều chỉnh số lượng)</span>}
              </label>
              <textarea
                value={globalNotes}
                onChange={e => setGlobalNotes(e.target.value)}
                rows={2}
                placeholder={
                  isNoteRequired
                    ? "Nhập rõ lý do điều chỉnh số lượng (ví dụ: Số lượng đề xuất ban đầu 3 sổ, thực nhận 2 sổ do...)"
                    : "Nhập ghi chú chung áp dụng cho toàn bộ đợt duyệt..."
                }
                className={`w-full px-3 py-2 text-xs border rounded-xl focus:outline-none focus:ring-2 ${
                  isNoteMissing
                    ? 'border-red-300 ring-2 ring-red-100 bg-red-50/20'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
              />
              {isNoteMissing && (
                <p className="text-[11px] text-red-600 mt-1 font-medium">
                  Vui lòng nhập lý do điều chỉnh số lượng trước khi xác nhận phê duyệt.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-200">
              <div>
                {onOpenPrint && activeItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const firstItem = activeItems[0] || {};
                      onOpenPrint({
                        item: firstItem,
                        transaction: {
                          type: firstItem.type || 'checkout',
                          items: activeItems,
                          created_at: new Date().toISOString(),
                        },
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1E3A8A] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> Xem trước biên bản ({activeItems.length} sổ)
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Hủy bỏ
                </button>

                <button
                  type="submit"
                  disabled={loading || activeItems.length === 0 || isNoteMissing}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Đang xử lý...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Xác nhận duyệt {activeItems.length} GCN
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};
