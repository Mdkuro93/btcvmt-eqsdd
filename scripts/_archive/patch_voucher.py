import re

with open('src/lib/voucherEngine.ts', 'r') as f:
    text = f.read()

# Replace getVoucherTypeFromTransaction
old_func = """export function getVoucherTypeFromTransaction(txType: string): VoucherType {
  switch (txType) {
    case 'checkout':
    case 'mortgage':
    case 'sale_update':
    case 'split_parent':
    case 'sell':
      return 'PX';
    case 'checkin':
    case 'unmortgage':
    case 'create_asset':
    case 'split_child':
    case 'import':
    default:
      if (['checkout', 'mortgage', 'sale_update', 'split_parent', 'sell'].includes(txType)) {
        return 'PX';
      }
      return 'PN';
  }
}"""

new_func = """export function getVoucherTypeFromTransaction(txType: string, reason?: string): VoucherType {
  if (txType === 'checkout') return 'PX';
  if (txType === 'checkin') return 'PN';
  
  // fallback for older code if any
  if (['mortgage', 'sale_update', 'split_parent', 'sell'].includes(txType)) {
    return 'PX';
  }
  return 'PN';
}"""

text = text.replace(old_func, new_func)

with open('src/lib/voucherEngine.ts', 'w') as f:
    f.write(text)

