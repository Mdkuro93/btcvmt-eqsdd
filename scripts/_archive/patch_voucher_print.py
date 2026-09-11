import re

with open('src/components/VoucherPrintModal.tsx', 'r') as f:
    text = f.read()

text = text.replace(
    "const vType = getVoucherTypeFromTransaction(txType);",
    "const vType = getVoucherTypeFromTransaction(txType, details?.reason);"
)

with open('src/components/VoucherPrintModal.tsx', 'w') as f:
    f.write(text)

