import re

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

text = text.replace(
    "const { voucherCode } = generateNextVoucherCode(responsibleWarehouse, itemType);",
    "const { voucherCode } = generateNextVoucherCode(responsibleWarehouse, itemType, details?.reason);"
)

with open('src/api/transactions.ts', 'w') as f:
    f.write(text)

