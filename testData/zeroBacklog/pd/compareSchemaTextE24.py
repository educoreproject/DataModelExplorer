#!/usr/bin/env python3
# compareSchemaTextE24.py <base getSchemaText> <head getSchemaText> — zbE E2-4's named getSchema change: within a label
# line the property names are alphabetical (keys() scan) where nodeTypeProperties gave its own order. A label line is
# compared as (label, number shown, '+N more' count, and the SET when nothing is elided); every other line byte for byte.
import re, sys
LABEL_LINE = re.compile(r'^- \*\*([^*]+)\*\* — (.*?)(, \.\.\. \(\+(\d+) more\))?$')
def normalised(lineText):
    m = LABEL_LINE.match(lineText)
    if not m or ', ' not in m.group(2) and m.group(3) is None and not m.group(2).replace('_','').replace(',','').isidentifier():
        return lineText
    shownList = m.group(2).split(', ')
    return ('LABEL', m.group(1), len(shownList), m.group(4), tuple(sorted(shownList)) if m.group(4) is None else None)
baseList = open(sys.argv[1]).read().split('\n'); headList = open(sys.argv[2]).read().split('\n')
if len(baseList) != len(headList): print(f'LINE COUNT {len(baseList)} vs {len(headList)}'); sys.exit(1)
orderOnly = 0; other = []
for i, (b, h) in enumerate(zip(baseList, headList)):
    if b == h: continue
    if normalised(b) == normalised(h) and isinstance(normalised(b), tuple): orderOnly += 1; continue
    other.append((i + 1, b, h))
print(f'{len(baseList)} lines; {orderOnly} label lines differ by order only; {len(other)} other difference(s)')
for n, b, h in other: print(f'  line {n}:\n    < {b}\n    > {h}')
