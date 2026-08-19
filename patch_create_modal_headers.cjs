const fs = require('fs');
let code = fs.readFileSync('src/components/CreateAssetModal.tsx', 'utf8');

code = code.replace(
  `            <h4 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">1. Thông tin Chứng thư & Kho quản lý</h4>`,
  `            <h4 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">1. Thông tin chung</h4>`
);

code = code.replace(
  `            <h4 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">2. Dữ liệu Thửa đất & Mục đích sử dụng</h4>`,
  `            <h4 className="text-xs font-bold text-[#1E3A8A] uppercase tracking-wider">2. Thông tin pháp lý GCN QSDĐ</h4>`
);

fs.writeFileSync('src/components/CreateAssetModal.tsx', code);
