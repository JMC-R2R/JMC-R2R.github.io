#!/usr/bin/env python3
"""Stamp every dashboard page with the engine's current version, so browsers load a changed engine
straight away instead of a cached copy (Jose 15/11/2026: Hot Chicken looked "not updated" after a
merge because GitHub Pages lets browsers keep assets for 10 minutes and the hub's frame kept longer).

Run from the Pages repo root after any change to assets/dashboard.js or assets/dashboard.css:
    python3 bump_engine_version.py
The version is the first 10 characters of each file's SHA-1, so it only changes when the file does."""
import hashlib, pathlib, re
root = pathlib.Path(__file__).resolve().parent
ver = {f: hashlib.sha1((root / 'assets' / f).read_bytes()).hexdigest()[:10] for f in ('dashboard.js', 'dashboard.css')}
pat = re.compile(r'((?:\.\./)+assets/(dashboard\.(?:js|css)))(\?v=[0-9a-f]+)?(?=["\'])')
changed = 0
for page in root.glob('**/index.html'):
    if '.git' in page.parts: continue
    s = page.read_text(); t = pat.sub(lambda m: f'{m.group(1)}?v={ver[m.group(2)]}', s)
    if t != s: page.write_text(t); changed += 1; print('stamped', page.relative_to(root))
print(f'{changed} pages stamped · dashboard.js v={ver["dashboard.js"]} · dashboard.css v={ver["dashboard.css"]}')
