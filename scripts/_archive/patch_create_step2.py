import re

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

text = text.replace("""        await supabase.from('transaction_items').insert([{
          transaction_id: txData.id,
          asset_id: params.assetId,
          type: 'checkin',
          status: 'pending',
          details: step2ItemDetails,
        }]);""", """        await supabase.from('transaction_items').insert([{
          transaction_id: txData.id,
          asset_id: params.assetId,
          type: 'checkin',
          reason: 'luân chuyển',
          status: 'pending',
          details: step2ItemDetails,
        }]);""")

text = text.replace("""        type: 'checkin',
        status: 'pending',
        details: step2ItemDetails,
        requested_details: step2ItemDetails,
        asset: asset,""", """        type: 'checkin',
        reason: 'luân chuyển',
        status: 'pending',
        details: step2ItemDetails,
        requested_details: step2ItemDetails,
        asset: asset,""")

with open('src/api/transactions.ts', 'w') as f:
    f.write(text)

