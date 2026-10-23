#!/usr/bin/env python3
# compareNamedChangesE.py <baseDir> <headDir> — lane zbE's P-d comparator for JSON answers: every differing answer reduced to
# key paths (list indexes folded to []) with ADDED / REMOVED / CHANGED, counted, so each difference can be checked against
# the named lane E changes. getSchemaText is compared by compareSchemaTextE24.py.
import collections, json, os, re, sys
baseDir, headDir = sys.argv[1], sys.argv[2]
def walk(x, y, p=''):
    out = []
    if isinstance(x, dict) and isinstance(y, dict):
        for k in sorted(set(x) | set(y)):
            if k not in x: out.append((p + '.' + k, 'ADDED'))
            elif k not in y: out.append((p + '.' + k, 'REMOVED'))
            else: out += walk(x[k], y[k], p + '.' + k)
    elif isinstance(x, list) and isinstance(y, list) and len(x) == len(y):
        for i, (u, v) in enumerate(zip(x, y)): out += walk(u, v, p + '[]')
    elif x != y:
        out.append((p, 'CHANGED' + (f' len {len(x)}->{len(y)}' if isinstance(x, list) and isinstance(y, list) else '')))
    return out
for fileName in sorted(os.listdir(baseDir)):
    if not fileName.endswith('.json'): continue
    a = json.load(open(os.path.join(baseDir, fileName))); b = json.load(open(os.path.join(headDir, fileName)))
    if a == b: continue
    print(fileName, collections.Counter(f'{p} {k}' for p, k in walk(a, b)).most_common(12))
