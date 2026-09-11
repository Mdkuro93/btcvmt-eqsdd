import re

with open('src/components/DecideRequestModal.tsx', 'r') as f:
    text = f.read()

text = text.replace(
    "return previewVoucherCode(currentWarehouse, item.type);",
    "return previewVoucherCode(currentWarehouse, item.type, details?.reason);"
)

with open('src/components/DecideRequestModal.tsx', 'w') as f:
    f.write(text)


with open('src/components/RequestModal.tsx', 'r') as f:
    text = f.read()

text = text.replace(
    """                {previewVoucherCode(
                  warehouses.find(w => w.id === targetWarehouseId) || warehouses.find(w => w.id === selectedAssets[0]?.warehouse_id) || warehouses[0],
                  selectedOpt.type
                )}""",
    """                {previewVoucherCode(
                  warehouses.find(w => w.id === targetWarehouseId) || warehouses.find(w => w.id === selectedAssets[0]?.warehouse_id) || warehouses[0],
                  selectedOpt.type,
                  selectedOpt.reason
                )}"""
)

with open('src/components/RequestModal.tsx', 'w') as f:
    f.write(text)

