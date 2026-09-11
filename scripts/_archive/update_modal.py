import re

with open('src/components/RequestModal.tsx', 'r') as f:
    content = f.read()

# Replace TransactionType with TransactionType, TransactionReason
content = content.replace("import { TransactionType, Asset } from '../types';", "import { TransactionType, TransactionReason, Asset } from '../types';\nimport { fetchInvestorEntities } from '../api/investorEntities';")

content = content.replace("onSubmit: (type: TransactionType, details: any) => Promise<void>;", "onSubmit: (type: TransactionType, details: any, reason?: TransactionReason) => Promise<void>;")

# Replace the type state with a combined option state
# Actually, it's easier to just write out the full component.
