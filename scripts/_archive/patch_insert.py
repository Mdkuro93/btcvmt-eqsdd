import re

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

# For Supabase insert
old_sb_items = """        const insertItems = items.map(i => ({
          transaction_id: txData.id,
          asset_id: i.asset_id,
          type: i.type,
          status: 'pending',
          details: i.details,
        }));"""

new_sb_items = """        const insertItems = items.map(i => ({
          transaction_id: txData.id,
          asset_id: i.asset_id,
          type: i.type,
          reason: i.details?.reason || null,
          status: 'pending',
          details: i.details,
        }));"""

text = text.replace(old_sb_items, new_sb_items)

# For MockStore insert
old_mock_items = """      items: items.map(i => ({
        id: 'txi-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        transaction_id: newTxId,
        asset_id: i.asset_id,
        type: i.type,
        status: 'pending',
        details: i.details,
        requested_details: i.details,
        asset: assets.find(a => a.id === i.asset_id)
      })),"""

new_mock_items = """      items: items.map(i => ({
        id: 'txi-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        transaction_id: newTxId,
        asset_id: i.asset_id,
        type: i.type,
        reason: i.details?.reason || null,
        status: 'pending',
        details: i.details,
        requested_details: i.details,
        asset: assets.find(a => a.id === i.asset_id)
      })),"""

text = text.replace(old_mock_items, new_mock_items)

with open('src/api/transactions.ts', 'w') as f:
    f.write(text)

