import sys

with open('src/api/transactions.ts', 'r') as f:
    text = f.read()

open_braces = 0
for i, char in enumerate(text):
    if char == '{':
        open_braces += 1
    elif char == '}':
        open_braces -= 1

print(f"Open braces: {open_braces}")
