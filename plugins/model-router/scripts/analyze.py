#!/usr/bin/env python3
"""Where did the model turns go? Reads local Claude Code transcripts (~/.claude/projects).

Reports, for a date window:
  - assistant turns and output tokens per model, main session vs subagents
  - Agent-tool spawns by (subagent type, requested model) and how many inherited a top-tier model
  - share of main-session tool turns that were mechanical (git, CI, polling, inspection, ...)
"""
import argparse
import collections
import datetime as dt
import json
import re
import sys
from pathlib import Path

TOP_TIER = re.compile(r"opus|fable")
MECHANICAL = [
    ("ci", r"\bglab\b|\bgh (run|pr|api)\b|gitlab-runner"),
    ("git", r"(^|&&\s*|;\s*)git "),
    ("poll", r"\bsleep\b|\buntil\b|\bwatch\b"),
    ("inspect", r"^\s*(ls|cat|head|tail|grep|rg|find|wc|jq|sed -n|stat|du|df)\b"),
    ("docker/db", r"\bdocker\b|\bpsql\b|\bsupabase\b"),
]


def parse_day(s):
    return dt.date.today() if s == "today" else dt.date.fromisoformat(s)


def records(path):
    with open(path, errors="ignore") as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except ValueError:
                continue


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", required=True, help="YYYY-MM-DD or 'today'")
    ap.add_argument("--until", help="YYYY-MM-DD inclusive (default: today)")
    ap.add_argument("--projects-dir", default=str(Path.home() / ".claude" / "projects"))
    ap.add_argument("--last-subagents", type=int, default=0, help="also list the N most recent subagent models")
    args = ap.parse_args()
    since, until = parse_day(args.since), parse_day(args.until or "today")

    turns = collections.Counter()
    out_tokens = collections.Counter()
    spawns = collections.Counter()
    main_tool_turns = 0
    mech = collections.Counter()
    sub_first = []  # (timestamp, model, file) of each subagent transcript's first turn

    for f in Path(args.projects_dir).rglob("*.jsonl"):
        is_sub = "subagents" in f.parts
        first_seen = False
        for o in records(f):
            if o.get("type") != "assistant":
                continue
            ts = o.get("timestamp", "")
            try:
                day = dt.date.fromisoformat(ts[:10])
            except ValueError:
                continue
            if not since <= day <= until:
                continue
            msg = o.get("message") or {}
            model = msg.get("model") or "?"
            if not model.startswith("claude-"):  # <synthetic>, default, non-Claude providers
                continue
            where = "subagent" if is_sub else "main"
            turns[(where, model)] += 1
            out_tokens[(where, model)] += (msg.get("usage") or {}).get("output_tokens", 0)
            if is_sub and not first_seen:
                first_seen = True
                sub_first.append((ts, model, f.name))

            tools = [c for c in msg.get("content") or [] if isinstance(c, dict) and c.get("type") == "tool_use"]
            for t in tools:
                if t.get("name") == "Agent":
                    i = t.get("input") or {}
                    spawns[(i.get("subagent_type") or "general-purpose", i.get("model") or "inherit", model)] += 1
            if not is_sub and tools:
                main_tool_turns += 1
                t = tools[0]
                if t.get("name") == "Bash":
                    cmd = (t.get("input") or {}).get("command", "")
                    kind = next((k for k, p in MECHANICAL if re.search(p, cmd)), None)
                    if kind:
                        mech[kind] += 1

    print(f"Window {since} .. {until}\n")
    print("Assistant turns / output tokens by model")
    for where in ("main", "subagent"):
        rows = sorted(((m, n) for (w, m), n in turns.items() if w == where), key=lambda r: -r[1])
        total = sum(n for _, n in rows) or 1
        print(f"  {where}:")
        for m, n in rows:
            print(f"    {m:32} {n:7} turns ({100 * n / total:5.1f}%)  {out_tokens[(where, m)] / 1e3:8.0f}k out")

    sub_total = sum(n for (w, _), n in turns.items() if w == "subagent") or 1
    cheap = sum(n for (w, m), n in turns.items() if w == "subagent" and not TOP_TIER.search(m))
    print(f"\n  subagent turns on Sonnet/Haiku: {100 * cheap / sub_total:.1f}%")

    if spawns:
        total = sum(spawns.values())
        inherited_top = sum(n for (_, req, parent), n in spawns.items() if req == "inherit" and TOP_TIER.search(parent))
        print(f"\nAgent spawns: {total}; inherited a top-tier parent model with no explicit model: "
              f"{inherited_top} ({100 * inherited_top / total:.1f}%)")
        print("  note: spawns of agents whose frontmatter pins a model also count as 'inherit' here;")
        print("  the subagent turn table above shows what actually ran.")
        for (typ, req, parent), n in spawns.most_common(12):
            print(f"    {n:4}  {typ:28} model={req:8} parent={parent}")

    if main_tool_turns:
        m = sum(mech.values())
        print(f"\nMain-session tool turns: {main_tool_turns}; mechanical Bash: {m} ({100 * m / main_tool_turns:.1f}%)")
        for k, n in mech.most_common():
            print(f"    {k:10} {n}")

    if args.last_subagents:
        print(f"\nMost recent {args.last_subagents} subagents:")
        for ts, model, name in sorted(sub_first)[-args.last_subagents:]:
            print(f"    {ts[:19]}  {model:28} {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
