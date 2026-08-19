const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

// The block inside filteredAssets.forEach
const oldBlock = `        const row = [
          idx + 1,
          // Thông tin chung
          asset.projects?.name || '-',
          asset.land_use_purpose || 'Đất ở tại đô thị',
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
          asset.land_use_purpose || 'Đất ở tại đô thị (ODT)',
          asset.land_use_term || 'Lâu dài',
          // Thế chấp
          isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
          isMortgaged ? (asset.mortgage_bank || 'BIDV - CN TP.HCM') : '-',
          isMortgaged ? (asset.mortgage_unit || 'Ban Nguồn Vốn') : '-',
          '-',
          '-',
          valuation ? valuation : 0,
          guaranteeRatio ? \`\${guaranteeRatio}%\` : '-',
          guaranteeVal ? guaranteeVal : 0,
          // Ghi chú
          asset.custody_status === 'checked_out' ? \`Đang mượn tại \${asset.current_holder_dept || 'Ban NV'}\` : (asset.lifecycle_status === 'invalidated' ? 'Sổ gốc đã hủy (sau tách)' : 'Trong kho')
        ];`;

const newBlock = `        const row = [
          idx + 1,
          // Thông tin chung
          asset.projects?.name || '-',
          asset.asset_type || '-',
          asset.parent_asset_id ? 'Sổ con (Tách thửa)' : (asset.lifecycle_status === 'invalidated' ? 'Sổ gốc (Đã tách)' : 'Sổ chính'),
          asset.subdivision || '-',
          asset.land_lot_no || asset.subdivision || '-',
          asset.map_sheet_no ? \`Tờ \${asset.map_sheet_no} / Thửa \${asset.land_lot_no || '-'}\` : '-',
          asset.area || 0,
          // Thông tin pháp lý GCN
          asset.owner_name || '-',
          asset.land_lot_no || '-',
          asset.map_sheet_no || '-',
          asset.address_detail || (asset.province ? \`\${asset.district || ''}, \${asset.province}\` : '-'),
          asset.certificate_no,
          asset.registry_no || '-',
          asset.registry_date ? new Date(asset.registry_date).toLocaleDateString('vi-VN') : '-',
          asset.managing_unit || '-',
          asset.usage_purpose || '-',
          asset.usage_term || '-',
          // Thế chấp
          isMortgaged ? 'Đã thế chấp' : 'Chưa thế chấp',
          isMortgaged ? (asset.mortgage_bank || '-') : '-',
          isMortgaged ? (asset.mortgage_unit || '-') : '-',
          '-',
          '-',
          valuation ? valuation : 0,
          guaranteeRatio ? \`\${guaranteeRatio}%\` : '-',
          guaranteeVal ? guaranteeVal : 0,
          // Ghi chú
          asset.custody_status === 'checked_out' ? \`Đang mượn tại \${asset.current_holder_dept || 'Ban NV'}\` : (asset.lifecycle_status === 'invalidated' ? 'Sổ gốc đã hủy (sau tách)' : 'Trong kho')
        ];`;

code = code.replace(oldBlock, newBlock);
fs.writeFileSync('src/pages/Reports.tsx', code);
