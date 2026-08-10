# -*- coding: utf-8 -*-
"""
Publish a monthly GFW report to GitHub Pages (custom domain update.readytorank.com.au).
Adds/updates the month, refreshes the shared tab manifest (months.json) and the root
redirect, then commits & pushes.

Usage:
  python3 publish.py <key> "<label>" <source_html> <source_assets_dir> [--no-push]
  e.g. python3 publish.py 2026-07 "July 2026" \
         ../reports/2026-07-july/gluten-free-world-social-report-july-2026.html \
         ../reports/2026-07-july/assets
Live month URL:  https://update.readytorank.com.au/gluten-free-world/<key>/
"""
import sys, os, re, json, shutil, subprocess

# This script lives at <repo>/_automation/gluten-free-world/publish.py, so the repo root is
# two levels up. Derived rather than hardcoded: the monthly routine runs in a cloud checkout
# whose path is not the local Dropbox one.
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROOT = os.path.join(REPO, "gluten-free-world")
BASE_URL = "https://update.readytorank.com.au/gluten-free-world"

key   = sys.argv[1]
label = sys.argv[2]
src_html   = sys.argv[3]
src_assets = sys.argv[4]
push = "--no-push" not in sys.argv[5:]

month_dir = os.path.join(ROOT, key)
os.makedirs(os.path.join(month_dir, "assets"), exist_ok=True)

# 1. report page
html = open(src_html, encoding="utf-8").read()
open(os.path.join(month_dir, "index.html"), "w", encoding="utf-8").write(html)

# 2. copy only the assets the page actually references (keeps repo lean)
refs = set(re.findall(r"assets/([A-Za-z0-9._-]+)", html))
for f in sorted(refs):
    s = os.path.join(src_assets, f)
    if os.path.exists(s):
        shutil.copy2(s, os.path.join(month_dir, "assets", f))
    else:
        print("WARN missing asset:", f)

# 3. manifest
mpath = os.path.join(ROOT, "months.json")
manifest = {"months": []}
if os.path.exists(mpath):
    manifest = json.load(open(mpath))
months = {m["key"]: m for m in manifest.get("months", [])}
months[key] = {"key": key, "label": label}
ordered = sorted(months.values(), key=lambda m: m["key"])
latest = ordered[-1]["key"]
json.dump({"latest": latest, "months": ordered}, open(mpath, "w"), indent=1)

# 4. root redirect -> latest month
redirect = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Gluten Free World — Social Reports</title>
<meta http-equiv="refresh" content="0; url=./{latest}/">
<link rel="canonical" href="{BASE_URL}/{latest}/">
<script>location.replace('./{latest}/'+location.hash);</script>
</head><body>Redirecting to the latest report… <a href="./{latest}/">Open it</a>.</body></html>"""
open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(redirect)

# 5. commit + push
# Stage ONLY the files this run produced. The routine runs unattended on the last day of
# the month; staging the whole gluten-free-world/ folder would sweep any unrelated work in
# progress (e.g. the content hub) straight onto the client-facing URL.
rel = lambda p: os.path.relpath(p, REPO)
paths = [rel(os.path.join(month_dir, "index.html")), rel(mpath), rel(os.path.join(ROOT, "index.html"))]
paths += [rel(os.path.join(month_dir, "assets", f)) for f in sorted(refs)
          if os.path.exists(os.path.join(month_dir, "assets", f))]
subprocess.run(["git", "-C", REPO, "add", "--"] + paths, check=True)

# Warn if someone else has already staged unrelated work. The commit below is path-scoped so
# it cannot sweep that in, but an unattended run should still say what it saw.
staged_now = subprocess.run(["git", "-C", REPO, "diff", "--cached", "--name-only"],
                            capture_output=True, text=True).stdout.split("\n")
foreign = [f for f in staged_now if f and f not in paths]
if foreign:
    print("NOTE other staged files present, NOT included in this commit:")
    for f in foreign:
        print("   ", f)

# Anything else dirty under gluten-free-world/ is deliberately left alone. Say so loudly,
# so an unattended run never silently skips something someone expected to go live.
others = subprocess.run(["git", "-C", REPO, "status", "--porcelain", "--", "gluten-free-world"],
                        capture_output=True, text=True).stdout.splitlines()
staged = set(paths)
skipped = [l[3:] for l in others if l[3:] not in staged and not l.startswith("A ") and not l.startswith("M ")]
if skipped:
    print("NOTE not staged by this run (left for a human):")
    for s in skipped:
        print("   ", s)

msg = f"Update: GFW {label} social report (auto-publish + month tabs)"
# Path-scoped commit. Without the pathspec this would also commit anything another session
# had already staged in this repo, and the routine runs unattended.
r = subprocess.run(["git", "-C", REPO, "commit", "-m", msg,
                    "-m", "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>",
                    "--"] + paths,
                   capture_output=True, text=True)
out = r.stdout.strip() or r.stderr.strip()
print(out)
nothing_to_do = "nothing to commit" in out or "no changes added" in out
if push and not nothing_to_do:
    p = subprocess.run(["git", "-C", REPO, "push", "origin", "main"], capture_output=True, text=True)
    print(p.stdout.strip() or p.stderr.strip())
elif nothing_to_do:
    print("Nothing changed, skipping push.")

print("LIVE month:", f"{BASE_URL}/{key}/")
print("LIVE latest:", f"{BASE_URL}/")
