import re

with open('src/api/assets.ts', 'r') as f:
    text = f.read()

text = text.replace("""      current_holder_dept: a.current_holder_dept || null,
      notes: a.notes || null,""", """      current_holder_dept: a.current_holder_dept || null,
      current_owner_entity_id: a.current_owner_entity_id || null,
      current_owner_role: a.current_owner_role || null,
      notes: a.notes || null,""")

with open('src/api/assets.ts', 'w') as f:
    f.write(text)
