import sys

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'id="gearTab"' in l or 'id="petTab"' in l or 'id="skillTab"' in l or 'id="hallOfFameTab"' in l or 'id="statsTab"' in l:
        print(f'Line {i+2}: {lines[i+1].strip()}')
