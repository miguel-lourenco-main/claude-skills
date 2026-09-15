#!/usr/bin/env python3
"""List lovable.dev guides that are not in sources.tsv yet, so the knowledge base can be grown.

Read-only: prints new slugs with their titles, writes nothing.
Usage: python3 scripts/check-new-guides.py [--titles]
Triage each new guide by hand (or with an agent) using the distillation rules in the plugin
README, then add a row to sources.tsv and, if kept, a note under the right skill's references/.
"""
import re, sys, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (claude-skills web-design-guides refresh)"}

def get(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "ignore")

known = {line.split("\t", 1)[0] for line in (ROOT / "sources.tsv").read_text().splitlines()
         if line and not line.startswith(("#", "slug\t"))}
sitemap = get("https://lovable.dev/sitemap/en.xml")
live = sorted({m for m in re.findall(r'https://lovable\.dev/guides/([^<\s"]+)', sitemap)
               if not m.startswith("category/")})
new = [s for s in live if s not in known]
gone = sorted(known - set(live))
print(f"live guides: {len(live)}  known: {len(known)}  new: {len(new)}  removed: {len(gone)}")
for slug in new:
    title = ""
    if "--titles" in sys.argv:
        m = re.search(r"<title>(.*?)</title>", get(f"https://lovable.dev/guides/{slug}"), re.S)
        title = m.group(1).replace(" | Lovable", "").strip() if m else ""
    print(f"NEW  {slug}  {title}")
for slug in gone:
    print(f"GONE {slug}")
