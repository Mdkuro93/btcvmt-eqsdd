import re

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

text = text.replace("""  const itemsToInsert = items.map(it => ({
    transaction_id: tx.id,
    asset_id: it.asset_id,
    type: it.type,
    details: it.details,
    status: 'pending',
  }));""", """  const itemsToInsert = items.map(it => ({
    transaction_id: tx.id,
    asset_id: it.asset_id,
    type: it.type,
    reason: it.details?.reason || null,
    details: it.details,
    status: 'pending',
  }));""")

text = text.replace("""      items: items.map((it, idx) => ({
        id: 'txi-' + Date.now() + '-' + idx,
        asset_id: it.asset_id,
        type: it.type,
        status: 'pending',
        details: it.details || {},
        asset: assets.find(a => a.id === it.asset_id),
      })),""", """      items: items.map((it, idx) => ({
        id: 'txi-' + Date.now() + '-' + idx,
        asset_id: it.asset_id,
        type: it.type,
        reason: it.details?.reason || null,
        status: 'pending',
        details: it.details || {},
        asset: assets.find(a => a.id === it.asset_id),
      })),""")

text = text.replace("""      items: items.map((it, idx) => ({
        id: insertedItems?.[idx]?.id || 'txi-' + Date.now() + '-' + idx,
        asset_id: it.asset_id,
        type: it.type,
        status: 'pending',
        details: it.details || {},""", """      items: items.map((it, idx) => ({
        id: insertedItems?.[idx]?.id || 'txi-' + Date.now() + '-' + idx,
        asset_id: it.asset_id,
        type: it.type,
        reason: it.details?.reason || null,
        status: 'pending',
        details: it.details || {},""")

with open('src/api/transactions.ts', 'w') as f:
    f.write(text)

