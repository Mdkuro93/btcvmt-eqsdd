import re

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

# We need to find the `if (decision === 'approved') {` block in decideTransactionItem and replace it.
# Actually we can just find `if (itemType === 'checkout') {` inside `runLocalDecideLogic`.
# It's better to just write a focused regex.

new_logic = """
      if (itemType === 'checkout') {
        assetUpdates.custody_status = 'checked_out';
        
        if (isInterWarehouseTransfer && currentAsset?.custody_status !== 'in_transit') {
          assetUpdates.custody_status = 'in_transit';
          assetUpdates.current_holder_dept = details.department || 'Đang luân chuyển kho';
          if (details.returnDate) assetUpdates.expected_return_date = details.returnDate;
          if (details.reason) assetUpdates.borrow_purpose = details.reason;
          await updateAsset(effectiveAssetId, assetUpdates);

          await createTransferReceiptStep({
            assetId: effectiveAssetId,
            sourceWarehouseId: sourceWarehouseId!,
            targetWarehouseId: targetWarehouseId!,
            voucherCode: generatedVoucher,
            details,
            transactionParent,
            performerId,
          });
        } else {
          assetUpdates.current_holder_dept = details.department || null;
          if (details.reason === 'mượn' && details.returnDate) {
            assetUpdates.expected_return_date = details.returnDate;
          }
          if (details.reason) assetUpdates.borrow_purpose = details.reason;
          
          if (details.reason === 'thế chấp' || (details.reason === 'chuyển nhượng' && details.concurrentMortgage)) {
            assetUpdates.mortgage_status = 'mortgaged';
            if (details.bank) assetUpdates.mortgage_bank = details.bank;
            if (details.mortgage_unit) assetUpdates.mortgage_borrower = details.mortgage_unit;
            if (details.valuation) assetUpdates.mortgage_valuation = Number(details.valuation);
            if (details.expected_release_date) assetUpdates.mortgage_expected_release_date = details.expected_release_date;
          }

          if (details.reason === 'xuất bán') {
            assetUpdates.sale_status = details.saleStatus || 'sold';
            if (details.salePrice) assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Xuất bán giá: ${details.salePrice}`;
          }

          if (details.reason === 'tách sổ' || details.reason === 'đổi sổ') {
             // Handle split/reissue logic...
             const splitType = details.splitType || 'full';
             if (splitType === 'reissue') {
               assetUpdates.lifecycle_status = 'invalidated';
               assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã cấp đổi sang GCN mới: ${details.newCertificateNo || ''} (Lý do: ${details.reissueReason || ''})`;
             } else if (splitType === 'partial') {
               const totalSplitArea = (details.splitChildren || []).reduce((sum: number, c: any) => sum + (Number(c.area) || 0), 0);
               const remainingArea = Math.max(0, (currentAsset?.area || 0) - totalSplitArea);
               assetUpdates.lifecycle_status = 'active';
               assetUpdates.area = remainingArea;
               assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã trích tách một phần (${totalSplitArea.toLocaleString('vi-VN')} m² theo QĐ ${details.decisionNo || ''}). Diện tích còn lại: ${remainingArea.toLocaleString('vi-VN')} m²`;
             } else {
               assetUpdates.lifecycle_status = 'invalidated';
               assetUpdates.notes = `${currentAsset?.notes ? currentAsset.notes + ' | ' : ''}Đã tách toàn bộ thành ${(details.splitChildren || []).length} sổ con theo QĐ ${details.decisionNo || ''}`;
             }
          }
          
          await updateAsset(effectiveAssetId, assetUpdates);
          
          // Child creation logic for split...
          if ((details.reason === 'tách sổ' || details.reason === 'đổi sổ') && (details.splitType === 'partial' || details.splitType === 'full') && Array.isArray(details.splitChildren)) {
            for (const child of details.splitChildren) {
              if (!child.certificate_no) continue;
              const childAssetData = {
                certificate_no: child.certificate_no,
                project_id: currentAsset?.project_id || null,
                subdivision: child.subdivision || currentAsset?.subdivision || null,
                lot_no: child.land_lot_no || currentAsset?.lot_no || null,
                area: child.area ? Number(child.area) : null,
                owner_name: currentAsset?.owner_name || null,
                warehouse_id: currentAsset?.warehouse_id || null,
                parent_asset_id: effectiveAssetId,
                custody_status: 'in_stock' as any,
                lifecycle_status: 'active' as any,
                sale_status: 'not_ready' as any,
                mortgage_status: 'none' as any,
                map_sheet_no: currentAsset?.map_sheet_no || null,
                land_lot_no: child.land_lot_no || currentAsset?.land_lot_no || null,
                province: currentAsset?.province || null,
                district: currentAsset?.district || null,
                ward: currentAsset?.ward || null,
                address_detail: currentAsset?.address_detail || null,
                usage_purpose: currentAsset?.usage_purpose || null,
                asset_type: currentAsset?.asset_type || null,
                managing_unit: currentAsset?.managing_unit || null,
                notes: `Tách từ GCN gốc: ${currentAsset?.certificate_no || ''} theo QĐ ${details.decisionNo || ''}`,
              };
              await createAsset(childAssetData);
            }
          } else if ((details.reason === 'tách sổ' || details.reason === 'đổi sổ') && details.splitType === 'reissue' && details.newCertificateNo) {
            const reissuedAssetData = {
              certificate_no: details.newCertificateNo,
              registry_no: details.newRegistryNo || currentAsset?.registry_no || null,
              project_id: currentAsset?.project_id || null,
              subdivision: currentAsset?.subdivision || null,
              lot_no: currentAsset?.lot_no || null,
              area: currentAsset?.area || null,
              owner_name: currentAsset?.owner_name || null,
              warehouse_id: currentAsset?.warehouse_id || null,
              parent_asset_id: effectiveAssetId,
              custody_status: 'in_stock' as any,
              lifecycle_status: 'active' as any,
              sale_status: currentAsset?.sale_status || 'not_ready',
              mortgage_status: currentAsset?.mortgage_status || 'none',
              map_sheet_no: currentAsset?.map_sheet_no || null,
              land_lot_no: currentAsset?.land_lot_no || null,
              province: currentAsset?.province || null,
              district: currentAsset?.district || null,
              ward: currentAsset?.ward || null,
              address_detail: currentAsset?.address_detail || null,
              usage_purpose: currentAsset?.usage_purpose || null,
              asset_type: currentAsset?.asset_type || null,
              managing_unit: currentAsset?.managing_unit || null,
              notes: `Cấp đổi từ GCN gốc: ${currentAsset?.certificate_no || ''}`,
            };
            await createAsset(reissuedAssetData);
          }
        }
      } else if (itemType === 'checkin') {
        assetUpdates.custody_status = 'in_stock';
        assetUpdates.warehouse_id = details.targetWarehouseId || currentAsset?.warehouse_id;
        assetUpdates.expected_return_date = null;
        assetUpdates.current_holder_dept = null;
        
        if (details.reason === 'giải chấp') {
          assetUpdates.mortgage_status = 'none';
          assetUpdates.mortgage_bank = null;
          assetUpdates.mortgage_borrower = null;
          assetUpdates.mortgage_valuation = null;
          assetUpdates.mortgage_expected_release_date = null;
        }

        await updateAsset(effectiveAssetId, assetUpdates);
        
        if (details.updateOwnership && details.newOwnerEntityId) {
          if (isSupabaseConfigured) {
            const { supabase } = require('../lib/supabase');
            await supabase.rpc('transfer_asset_ownership', {
              p_asset_id: effectiveAssetId,
              p_to_entity_id: details.newOwnerEntityId,
              p_to_role: details.newOwnerRole,
              p_note: `Đồng thời nhập kho: ${details.reason || ''}`,
              p_transferred_by: performerId || null
            });
          } else {
             const mockStore = require('../lib/mockStore').mockStore;
             const transferData = {
                id: 'trf-' + Date.now(),
                asset_id: effectiveAssetId,
                from_entity_id: currentAsset?.current_owner_entity_id,
                from_role: currentAsset?.current_owner_role,
                to_entity_id: details.newOwnerEntityId,
                to_role: details.newOwnerRole,
                transferred_by: performerId || null,
                transferred_at: new Date().toISOString(),
                note: `Đồng thời nhập kho: ${details.reason || ''}`,
                created_at: new Date().toISOString()
             };
             mockStore.addAssetOwnershipTransfer(transferData);
             await updateAsset(effectiveAssetId, {
                current_owner_entity_id: details.newOwnerEntityId,
                current_owner_role: details.newOwnerRole
             });
          }
        }
      }
"""

start_str = "      if (itemType === 'checkout') {"
end_str = "    const txs = mockStore.getTransactions();"

start_idx = text.find(start_str)
end_idx = text.find(end_str, start_idx)

if start_idx != -1 and end_idx != -1:
    new_text = text[:start_idx] + new_logic + "    " + text[end_idx:]
    with open('src/api/transactions.ts', 'w') as f:
        f.write(new_text)
    print("Patched transactions.ts successfully.")
else:
    print("Could not find start or end index.")

