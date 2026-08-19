const fs = require('fs');
let code = fs.readFileSync('src/types/index.ts', 'utf8');

// replace usage_term with usage_term_type and usage_term_date
code = code.replace(
  /usage_term\?: string \| null;\s*\/\/ Thời hạn sử dụng.*/,
  `usage_term_type?: 'fixed_date' | 'long_term' | null;
  usage_term_date?: string | null;`
);

// add certificate_group and lot_no
code = code.replace(
  /subdivision: string \| null;/,
  `certificate_group?: 'so_lon' | 'so_nho' | null;
  subdivision: string | null;
  lot_no?: string | null;`
);

fs.writeFileSync('src/types/index.ts', code);
