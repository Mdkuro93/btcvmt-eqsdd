const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

const oldExportLoop = `      // Rows 6+: Data
      filteredAssets.forEach((asset, idx) => {
        const isMortgaged = asset.mortgage_status === 'mortgaged';
        const valuation = asset.mortgage_valuation || 0;
        const guaranteeRatio = asset.collateral_ratio || 0;
        const guaranteeVal = asset.collateral_value || 0;
        
        let notesArr = [];
        if (asset.notes) notesArr.push(asset.notes);
        if (asset.custody_status === 'checked_out') notesArr.push(\`Đang xuất mượn cho \${asset.current_holder_dept || 'Bộ phận'}\`);
        if (asset.lifecycle_status === 'invalidated') notesArr.push('Sổ đã hủy do tách thửa');
        const notesStr = notesArr.length > 0 ? notesArr.join(' - ') : 'Lưu kho an toàn';

        const row = [
          idx + 1,
          // Thông tin chung
          asset.projects?.name || '-',
          asset.usage_purpose || '-',
          asset.parent_asset_id ? 'Sổ con (Tách thửa)' : (asset.lifecycle_status === 'invalidated' ? 'Sổ gốc (Đã tách)' : 'Sổ chính'),
          asset.subdivision || '-',
          asset.land_lot_no || asset.subdivision || '-',
          asset.map_sheet_no ? \`Tờ \${asset.map_sheet_no} / Thửa \${asset.land_lot_no || '-'}\` : '-',
          asset.area || 0,
          // Thông tin pháp lý GCN
          asset.owner_name || 'Công ty Cổ phần Đầu tư VMT',
          asset.land_lot_no || '-',
          asset.map_sheet_no || '-',
          asset.address_detail || (asset.province ? \`\${asset.district || ''}, \${asset.province}\` : '-'),
          asset.certificate_no,
          \`CH-\${asset.certificate_no.replace(/\\D/g, '') || String(100 + idx)}\`,
          asset.created_at ? new Date(asset.created_at).toLocaleDateString('vi-VN') : '15/01/2024',
          asset.warehouses?.name || 'Kho Trung Tâm BTC',
          asset.usage_purpose || '-',
          asset.usage_term || '-',
          // Thế chấp
          isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
          isMortgaged ? (asset.mortgage_bank || '-') : '-',
          isMortgaged ? (asset.mortgage_unit || '-') : '-',
          isMortgaged ? (asset.mortgage_bank_2 || '-') : '-',
          isMortgaged ? (asset.mortgage_unit_2 || '-') : '-',
          valuation ? valuation : 0,
          guaranteeRatio ? \`\${guaranteeRatio}%\` : '-',
          guaranteeVal ? guaranteeVal : 0,
          // Ghi chú
          notesStr
        ];
        wsData.push(row);
      });`;

const newExportLoop = `      // Rows 6+: Data
      filteredAssets.forEach((asset, idx) => {
        const isMortgaged = asset.mortgage_status === 'mortgaged';
        const valuation = asset.mortgage_valuation || 0;
        const guaranteeRatio = asset.collateral_ratio || 0;
        const guaranteeVal = asset.collateral_value || 0;
        
        let notesArr = [];
        if (asset.notes) notesArr.push(asset.notes);
        if (asset.custody_status === 'checked_out') notesArr.push(\`Đang xuất mượn cho \${asset.current_holder_dept || 'Bộ phận'}\`);
        if (asset.lifecycle_status === 'invalidated') notesArr.push('Sổ đã hủy do tách thửa');
        const notesStr = notesArr.length > 0 ? notesArr.join(' - ') : '-';

        const row = [
          idx + 1,
          // Thông tin chung
          asset.projects?.name || '-',
          asset.asset_type || '-',
          asset.certificate_group === 'so_lon' ? 'Sổ lớn' : (asset.certificate_group === 'so_nho' ? 'Sổ nhỏ' : '-'),
          asset.subdivision || '-',
          asset.lot_no || '-',
          (asset.subdivision && asset.lot_no) ? \`\${asset.subdivision}-\${asset.lot_no}\` : '-',
          asset.area || 0,
          // Thông tin pháp lý GCN
          asset.owner_name || '-',
          asset.land_lot_no || '-',
          asset.map_sheet_no || '-',
          asset.address_detail || '-',
          asset.certificate_no || '-',
          asset.registry_no || '-',
          asset.registry_date ? new Date(asset.registry_date).toLocaleDateString('vi-VN') : '-',
          asset.managing_unit || '-',
          asset.usage_purpose || '-',
          asset.usage_term_type === 'long_term' ? 'Lâu dài' : (asset.usage_term_type === 'fixed_date' && asset.usage_term_date ? \`Đến ngày \${new Date(asset.usage_term_date).toLocaleDateString('vi-VN')}\` : '-'),
          // Thế chấp
          isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
          isMortgaged ? (asset.mortgage_bank || '-') : '-',
          isMortgaged ? (asset.mortgage_unit || '-') : '-',
          isMortgaged ? (asset.mortgage_bank_2 || '-') : '-',
          isMortgaged ? (asset.mortgage_unit_2 || '-') : '-',
          valuation ? valuation : 0,
          guaranteeRatio ? \`\${guaranteeRatio}%\` : '-',
          guaranteeVal ? guaranteeVal : 0,
          // Ghi chú
          notesStr
        ];
        wsData.push(row);
      });`;

code = code.replace(oldExportLoop, newExportLoop);
fs.writeFileSync('src/pages/Reports.tsx', code);
