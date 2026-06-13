#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
query.py — search the UI reference Obsidian vault.

Reads the generated cache `vault/_index.json` (fast). If it's missing, falls back to a
regex frontmatter scan of `vault/References/**/<slug>.md` (no PyYAML needed). Returns the
best matches with absolute paths to the note + screenshots so the agent can open them.

Usage:
  python3 scripts/query.py "restaurant warm rustic"
  python3 scripts/query.py "dark fine dining" --category restaurant -n 5
  python3 scripts/query.py "" --category restaurant        # list a category
  python3 scripts/query.py "bakery" --json
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VAULT = os.path.join(ROOT, "vault")
INDEX = os.path.join(VAULT, "_index.json")
REFS = os.path.join(VAULT, "References")


# ---- regex frontmatter fallback (mirrors scripts/lib/frontmatter.cjs) ----
def _unquote(s):
    s = s.strip()
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        inner = s[1:-1]
        if s[0] == '"':
            try:
                return json.loads(s)
            except Exception:
                return inner
        return inner
    return s


def _split_commas(s):
    out, cur, q = [], "", None
    for ch in s:
        if q:
            cur += ch
            if ch == q:
                q = None
        elif ch in '"\'':
            q = ch
            cur += ch
        elif ch == ",":
            out.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    return out


def _parse_val(v):
    v = v.strip()
    if v == "":
        return ""
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1].strip()
        return [_unquote(x) for x in _split_commas(inner)] if inner else []
    return _unquote(v)


def parse_frontmatter(md):
    m = re.match(r"^﻿?---\r?\n(.*?)\r?\n---\r?\n?", md, re.S)
    if not m:
        return {}, md
    data = {}
    for line in re.split(r"\r?\n", m.group(1)):
        mm = re.match(r"^([A-Za-z0-9_-]+):\s?(.*)$", line)
        if mm:
            data[mm.group(1)] = _parse_val(mm.group(2))
    return data, md[m.end():]


def _section(body, name):
    m = re.search(r"^##\s+%s\s*$(.*?)(?=^##\s|%%%%|<!--|\Z)" % re.escape(name), body, re.S | re.M | re.I)
    if not m:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"_\(pending[^)]*\)_", "", m.group(1), flags=re.I)).strip()


def rel(p):
    return os.path.relpath(p, VAULT).replace(os.sep, "/")


def load_from_notes():
    records = []
    if not os.path.isdir(REFS):
        return records
    for cat in sorted(os.listdir(REFS)):
        cdir = os.path.join(REFS, cat)
        if not os.path.isdir(cdir):
            continue
        for slug in sorted(os.listdir(cdir)):
            note = os.path.join(cdir, slug, slug + ".md")
            if not os.path.isfile(note):
                continue
            data, body = parse_frontmatter(open(note, encoding="utf-8").read())
            d = os.path.join(cdir, slug)
            records.append({
                "slug": slug, "category": data.get("category", cat), "title": data.get("title", slug),
                "url": data.get("url", ""), "quality": _num(data.get("quality")),
                "status": data.get("status", "ok"),
                "tags": data.get("tags", []) if isinstance(data.get("tags"), list) else [],
                "palette": data.get("palette", []) if isinstance(data.get("palette"), list) else [],
                "style_text": _section(body, "Style"), "strengths_text": _section(body, "Strengths"),
                "patterns_text": _section(body, "Notable patterns"), "when_to_use": _section(body, "When to use"),
                "note": rel(note), "above_fold": rel(os.path.join(d, "assets/above-fold.jpg")),
                "full": rel(os.path.join(d, "assets/full.jpg")),
                "raw_html": rel(os.path.join(d, "assets/raw.html")),
                "rendered_html": rel(os.path.join(d, "assets/rendered.html")),
            })
    return records


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def load_index():
    if os.path.isfile(INDEX):
        try:
            return json.load(open(INDEX, encoding="utf-8"))
        except Exception:
            pass
    return load_from_notes()


def hay(r):
    return " ".join([
        r.get("category", ""), r.get("title", ""), r.get("url", ""),
        " ".join(r.get("tags", [])), " ".join(r.get("palette", [])),
        r.get("style_text", ""), r.get("strengths_text", ""),
        r.get("patterns_text", ""), r.get("when_to_use", ""),
    ]).lower()


def score(r, terms):
    if not terms:
        return 1.0
    h = hay(r)
    s = 0.0
    cat = (r.get("category", "") or "").lower()
    tags = " ".join(r.get("tags", [])).lower()
    for t in terms:
        if t in cat:
            s += 2.0
        if t in tags:
            s += 2.0
        s += h.count(t)
    s += _num(r.get("quality")) / 20.0
    return s


def abspath(p):
    return os.path.join(VAULT, p) if p else p


def main():
    ap = argparse.ArgumentParser(description="Search the UI reference vault")
    ap.add_argument("query", nargs="?", default="")
    ap.add_argument("--category", "-c", default=None)
    ap.add_argument("-n", type=int, default=3)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    items = [r for r in load_index() if r.get("status", "ok") == "ok"]
    if args.category:
        items = [r for r in items if r.get("category") == args.category]
    terms = [t for t in re.split(r"\s+", args.query.lower()) if t]
    ranked = sorted(items, key=lambda r: score(r, terms), reverse=True)
    if terms:
        ranked = [r for r in ranked if score(r, terms) > 0]
    ranked = ranked[: args.n]

    if args.json:
        print(json.dumps([{
            **{k: r.get(k) for k in ("slug", "category", "title", "url", "quality", "tags", "palette", "when_to_use")},
            "note": abspath(r.get("note")), "above_fold": abspath(r.get("above_fold")),
            "full": abspath(r.get("full")), "raw_html": abspath(r.get("raw_html")),
            "rendered_html": abspath(r.get("rendered_html")),
        } for r in ranked], indent=2, ensure_ascii=False))
        return

    if not ranked:
        print(f"No matches for '{args.query}'. Library has {len(items)} reference(s)."
              " Grow it: node research/extract.cjs <category> (or --url <site>), then node scripts/build-index.cjs")
        return

    print(f"## UI references — query: '{args.query}' ({len(ranked)} of {len(items)})\n")
    for i, r in enumerate(ranked, 1):
        print(f"### {i}. {r.get('title') or r['slug']}  [{r.get('category')}] · quality {int(_num(r.get('quality')))}/100")
        print(f"- url: {r.get('url')}")
        if r.get("tags"):
            print(f"- tags: {', '.join(t for t in r['tags'] if t != 'ui-reference')}")
        if r.get("palette"):
            print(f"- palette: {', '.join(r['palette'])}")
        if r.get("when_to_use"):
            print(f"- when to use: {r['when_to_use']}")
        print(f"- note (read this): {abspath(r.get('note'))}")
        print(f"- screenshot (look): {abspath(r.get('above_fold'))}  |  full: {abspath(r.get('full'))}")
        print(f"- raw html: {abspath(r.get('raw_html'))}  |  rendered: {abspath(r.get('rendered_html'))}")
        print("")


if __name__ == "__main__":
    main()
