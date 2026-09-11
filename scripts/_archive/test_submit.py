import re

with open('src/components/RequestModal.tsx', 'r') as f:
    text = f.read()

text = text.replace(
"""        if (updateOwnership && newOwnerEntityId) {
          details.updateOwnership = true;
          details.newOwnerEntityId = newOwnerEntityId;
          details.newOwnerRole = newOwnerRole;
        }""",
"""        if (selectedOpt.reason === 'chuyển nhượng' && newOwnerEntityId) {
          details.updateOwnership = true;
          details.newOwnerEntityId = newOwnerEntityId;
          details.newOwnerRole = newOwnerRole;
        }"""
)

with open('src/components/RequestModal.tsx', 'w') as f:
    f.write(text)

