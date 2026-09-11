import re

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

# Add } before "    const txs = mockStore.getTransactions();"
text = text.replace("    const txs = mockStore.getTransactions();\n    const updatedTxs", "    }\n\n    const txs = mockStore.getTransactions();\n    const updatedTxs")

with open('src/api/transactions.ts', 'w') as f:
    f.write(text)

