import re

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

# Replace for supabase
text = re.sub(
    r"type:\s*i\.type,\s*status:\s*'pending',",
    r"type: i.type,\n          reason: i.details?.reason || null,\n          status: 'pending',",
    text
)

with open('src/api/transactions.ts', 'w') as f:
    f.write(text)

