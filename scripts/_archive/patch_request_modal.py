import re

with open('src/components/RequestModal.tsx', 'r') as f:
    text = f.read()

# I want to rewrite the first few lines of the form to split it into two steps:
# 1. Loại thao tác (checkout/checkin)
# 2. Lý do cụ thể (lọc theo thao tác và role)

old_options_logic = """  // Filter allowed types based on role
  const allowedOptions: { key: string, type: TransactionType, reason: TransactionReason, label: string }[] = [];
  
  const addOpt = (type: TransactionType, reason: TransactionReason, label: string) => {
    allowedOptions.push({ key: `${type}_${reason}`, type, reason, label });
  };"""

new_options_logic = """  // Filter allowed types based on role
  const allowedOptions: { key: string, type: TransactionType, reason: TransactionReason, label: string }[] = [];
  
  const addOpt = (type: TransactionType, reason: TransactionReason, label: string) => {
    allowedOptions.push({ key: `${type}_${reason}`, type, reason, label });
  };
  
  const [selectedMainType, setSelectedMainType] = useState<TransactionType | ''>('');"""

text = text.replace(old_options_logic, new_options_logic)

old_form_select = """          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại yêu cầu</label>
            <select
              required
              value={requestKey}
              onChange={(e) => setRequestKey(e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="" disabled>-- Chọn loại yêu cầu --</option>
              {allowedOptions.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>"""

new_form_select = """          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thao tác</label>
              <select
                required
                value={selectedMainType}
                onChange={(e) => {
                  setSelectedMainType(e.target.value as TransactionType);
                  setRequestKey('');
                }}
                className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="" disabled>-- Chọn thao tác --</option>
                <option value="checkout">Xuất kho</option>
                <option value="checkin">Nhập kho</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lý do cụ thể</label>
              <select
                required
                value={requestKey}
                onChange={(e) => setRequestKey(e.target.value)}
                disabled={!selectedMainType}
                className="w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="" disabled>-- Chọn lý do --</option>
                {allowedOptions.filter(o => o.type === selectedMainType).map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>"""

text = text.replace(old_form_select, new_form_select)

old_reset_effect = """  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setRequestKey(allowedOptions.length > 0 ? allowedOptions[0].key : '');"""

new_reset_effect = """  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMainType('');
      setRequestKey('');"""

text = text.replace(old_reset_effect, new_reset_effect)

with open('src/components/RequestModal.tsx', 'w') as f:
    f.write(text)

