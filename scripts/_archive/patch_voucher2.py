import re

with open('src/lib/voucherEngine.ts', 'r') as f:
    text = f.read()

text = text.replace(
    "export function generateNextVoucherCode(\n  warehouse: Warehouse | null | undefined,\n  txType: string,\n  date: Date = new Date()\n)",
    "export function generateNextVoucherCode(\n  warehouse: Warehouse | null | undefined,\n  txType: string,\n  reason?: string,\n  date: Date = new Date()\n)"
)
text = text.replace("const vType = getVoucherTypeFromTransaction(txType);", "const vType = getVoucherTypeFromTransaction(txType, reason);")

text = text.replace(
    "export function previewVoucherCode(\n  warehouse: Warehouse | null | undefined,\n  txType: string,\n  date: Date = new Date()\n)",
    "export function previewVoucherCode(\n  warehouse: Warehouse | null | undefined,\n  txType: string,\n  reason?: string,\n  date: Date = new Date()\n)"
)

with open('src/lib/voucherEngine.ts', 'w') as f:
    f.write(text)

