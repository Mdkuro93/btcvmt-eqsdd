import re

with open('src/pages/Import.tsx', 'r') as f:
    text = f.read()

# Add import for fetchInvestorEntities
if 'fetchInvestorEntities' not in text:
    text = text.replace("import { fetchProjects", "import { fetchInvestorEntities } from '../api/investorEntities';\nimport { fetchProjects")

old_process = """  const processFile = (file: File) => {
    setFile(file);
    setLoading(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Expected headers: "Số GCN", "Tên dự án", "Phân khu", "Diện tích", "Chủ sở hữu"
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        // Map and validate
        const mappedData = rawData.map((row: any, index: number) => {
          const certificate_no = row['Số GCN']?.toString().trim();
          const projectName = row['Tên dự án']?.toString().trim();
          const subdivision = row['Phân khu']?.toString().trim() || null;
          const area = row['Diện tích'] ? parseFloat(row['Diện tích']) : null;
          const owner_name = row['Chủ sở hữu']?.toString().trim() || null;

          // Find project ID
          let project_id = null;
          let hasError = false;
          let errorMessage = '';

          if (!certificate_no) {
            hasError = true;
            errorMessage = 'Thiếu Số GCN';
          }

          if (projectName) {
            const project = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
            if (project) {
              project_id = project.id;
            } else {
              hasError = true;
              errorMessage = `Không tìm thấy dự án: ${projectName}`;
            }
          }

          return {
            _originalRow: index + 2, // Excel rows are 1-indexed, and header is 1
            certificate_no,
            project_id,
            projectName, // Keep for display
            subdivision,
            area,
            owner_name,
            custody_status: 'in_stock',
            lifecycle_status: 'active',
            sale_status: 'not_ready',
            mortgage_status: 'none',
            hasError,
            errorMessage,
            isDuplicate: false,
          };
        });"""

new_process = """  const processFile = (file: File) => {
    setFile(file);
    setLoading(true);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const investorEntities = await fetchInvestorEntities();
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Expected headers: "Số GCN", "Tên dự án", "Phân khu", "Diện tích", "Chủ sở hữu", "Mã công ty sở hữu", "Phân loại"
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        
        // Map and validate
        const mappedData = rawData.map((row: any, index: number) => {
          const certificate_no = row['Số GCN']?.toString().trim();
          const projectName = row['Tên dự án']?.toString().trim();
          const subdivision = row['Phân khu']?.toString().trim() || null;
          const area = row['Diện tích'] ? parseFloat(row['Diện tích']) : null;
          const owner_name = row['Chủ sở hữu']?.toString().trim() || null;
          const companyCode = row['Mã công ty sở hữu']?.toString().trim();
          const roleRaw = row['Phân loại']?.toString().trim().toLowerCase();

          // Find project ID
          let project_id = null;
          let hasError = false;
          let errorMessage = '';

          if (!certificate_no) {
            hasError = true;
            errorMessage = 'Thiếu Số GCN';
          }

          if (projectName) {
            const project = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());
            if (project) {
              project_id = project.id;
            } else {
              hasError = true;
              errorMessage = `Không tìm thấy dự án: ${projectName}`;
            }
          }

          let current_owner_entity_id = null;
          let current_owner_role = null;

          if (companyCode) {
            const entity = investorEntities.find(e => e.company_code?.toLowerCase() === companyCode.toLowerCase());
            if (entity) {
              current_owner_entity_id = entity.id;
              if (roleRaw === 'cđt' || roleRaw === 'cdt') current_owner_role = 'cdt';
              else if (roleRaw === 'nđt' || roleRaw === 'ndt') current_owner_role = 'ndt';
              else current_owner_role = 'cdt'; // Default to cdt if not specified correctly but entity exists
            } else {
              hasError = true;
              errorMessage = `Không tìm thấy pháp nhân với mã: ${companyCode}`;
            }
          }

          return {
            _originalRow: index + 2, // Excel rows are 1-indexed, and header is 1
            certificate_no,
            project_id,
            projectName, // Keep for display
            subdivision,
            area,
            owner_name,
            current_owner_entity_id,
            current_owner_role,
            companyCode, // Keep for display
            roleRaw, // Keep for display
            custody_status: 'in_stock',
            lifecycle_status: 'active',
            sale_status: 'not_ready',
            mortgage_status: 'none',
            hasError,
            errorMessage,
            isDuplicate: false,
          };
        });"""

text = text.replace(old_process, new_process)

# Now we need to update the Excel template download function
old_download = """  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Số GCN': 'DA-123456',
        'Tên dự án': 'Dự án A',
        'Phân khu': 'Khu 1',
        'Diện tích': 150.5,
        'Chủ sở hữu': 'Nguyễn Văn A'
      }
    ]);
"""
new_download = """  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        'Số GCN': 'DA-123456',
        'Tên dự án': 'Dự án A',
        'Phân khu': 'Khu 1',
        'Diện tích': 150.5,
        'Chủ sở hữu': 'Nguyễn Văn A',
        'Mã công ty sở hữu': 'CTY-A',
        'Phân loại': 'CĐT'
      }
    ]);
"""

text = text.replace(old_download, new_download)

# Also update the table header to show the new columns
old_table_header = """                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lỗi (nếu có)</th>
                </tr>"""

new_table_header = """                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pháp nhân (Mã)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lỗi (nếu có)</th>
                </tr>"""

text = text.replace(old_table_header, new_table_header)

old_table_row = """                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.owner_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">"""

new_table_row = """                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.owner_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.companyCode ? `${row.companyCode} (${row.roleRaw})` : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">"""

text = text.replace(old_table_row, new_table_row)


old_dbData = """      const dbData = validData.map(d => {
        const { _originalRow, projectName, hasError, errorMessage, isDuplicate, ...rest } = d;
        return rest;
      });"""

new_dbData = """      const dbData = validData.map(d => {
        const { _originalRow, projectName, companyCode, roleRaw, hasError, errorMessage, isDuplicate, ...rest } = d;
        return rest;
      });"""

text = text.replace(old_dbData, new_dbData)

with open('src/pages/Import.tsx', 'w') as f:
    f.write(text)

