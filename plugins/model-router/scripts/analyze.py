#!/usr/bin/env python3
"""Where did the model turns go? Reads local Claude Code transcripts (~/.claude/projects).

Reports, for a date window:
  - assistant turns and output tokens per model, main session vs subagents
  - how many subagents actually ran on a top-tier model (Opus/Fable), and which ones
  - Agent-tool spawns by (subagent type, requested model, parent model)
  - share of main-session tool turns that were mechanical (git, CI, polling, inspection, ...)
  - what the Jev decider did (~/.claude/model-router/decisions.jsonl): spawns re-tiered, kept,
    guarded, failed open; prompts advised; latency and cost

--record appends the result to this workstation's usage-review history and writes a markdown
report; without --since it then starts where the previous recorded analysis ended.
"""
import argparse
import collections
import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import review_state  # noqa: E402

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


def pct(part, whole):
    return round(100 * part / whole, 1) if whole else 0.0


def collect_decisions(path, since, until):
    """Summarise the decider's log for the window; empty dict when there is no log."""
    c = collections.Counter()
    latency, cost = [], 0.0
    try:
        lines = Path(path).read_text().splitlines()
    except OSError:
        return {}
    for line in lines:
        try:
            d = json.loads(line)
            day = dt.date.fromisoformat(d.get("ts", "")[:10])
        except ValueError:
            continue
        if not since <= day <= until:
            continue
        ev = d.get("event")
        if ev == "spawn":
            c["spawns"] += 1
            if d.get("error"):
                c["spawn_failed_open"] += 1
            elif d.get("applied"):
                c["spawn_retiered"] += 1
                if d.get("reason", "").startswith("pinned") or d.get("reason") == "user pin":
                    c["spawn_pin_enforced"] += 1
            elif "kept" in d.get("reason", ""):
                c["spawn_guarded"] += 1
            elif "< " in d.get("reason", ""):
                c["spawn_low_confidence"] += 1
        elif ev == "prompt":
            c["prompts"] += 1
            if d.get("error"):
                c["prompt_failed_open"] += 1
            elif d.get("route"):
                c["prompt_advised"] += 1
        if d.get("latency_ms") is not None:
            latency.append(d["latency_ms"])
        cost += float(d.get("cost_usd") or 0)
    out = dict(c)
    if latency:
        out["latency_ms_median"] = sorted(latency)[len(latency) // 2]
    out["cost_usd"] = round(cost, 5)
    return out


def collect(projects_dir, since, until):
    turns = collections.Counter()
    out_tokens = collections.Counter()
    spawns = collections.Counter()
    top_spawn_desc = collections.Counter()
    mech = collections.Counter()
    main_tool_turns = 0
    subagents = []  # (timestamp, model, file) per subagent transcript, from its first turn

    for f in Path(projects_dir).rglob("*.jsonl"):
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
                subagents.append((ts, model, f.name))

            tools = [c for c in msg.get("content") or [] if isinstance(c, dict) and c.get("type") == "tool_use"]
            for t in tools:
                if t.get("name") == "Agent":
                    i = t.get("input") or {}
                    req = i.get("model") or "inherit"
                    spawns[(i.get("subagent_type") or "general-purpose", req, model)] += 1
                    if TOP_TIER.search(req) or (req == "inherit" and TOP_TIER.search(model)):
                        top_spawn_desc[i.get("description") or "?"] += 1
            if not is_sub and tools:
                main_tool_turns += 1
                t = tools[0]
                if t.get("name") == "Bash":
                    cmd = (t.get("input") or {}).get("command", "")
                    kind = next((k for k, p in MECHANICAL if re.search(p, cmd)), None)
                    if kind:
                        mech[kind] += 1

    by_model = {w: {} for w in ("main", "subagent")}
    for (w, m), n in turns.items():
        by_model[w][m] = {"turns": n, "output_tokens": out_tokens[(w, m)]}
    sub_turns = sum(v["turns"] for v in by_model["subagent"].values())
    cheap_turns = sum(v["turns"] for m, v in by_model["subagent"].items() if not TOP_TIER.search(m))
    top_subagents = sum(1 for _, m, _ in subagents if TOP_TIER.search(m))
    mech_total = sum(mech.values())
    return {
        "window": {"since": since.isoformat(), "until": until.isoformat()},
        "by_model": by_model,
        "subagent_turns_cheap_pct": pct(cheap_turns, sub_turns),
        "subagents_total": len(subagents),
        "subagents_top_tier": top_subagents,
        "subagents_top_tier_pct": pct(top_subagents, len(subagents)),
        "spawns": [
            {"type": t, "model": r, "parent": p, "count": n} for (t, r, p), n in spawns.most_common()
        ],
        "top_tier_spawn_descriptions": [d for d, _ in top_spawn_desc.most_common(15)],
        "main_tool_turns": main_tool_turns,
        "main_mechanical_turns": mech_total,
        "main_mechanical_pct": pct(mech_total, main_tool_turns),
        "main_mechanical_breakdown": dict(mech.most_common()),
        "recent_subagents": [{"ts": ts[:19], "model": m, "file": n} for ts, m, n in sorted(subagents)[-10:]],
        "jev": collect_decisions(review_state.STATE_DIR / "decisions.jsonl", since, until),
    }


def render(m, previous=None):
    lines = [f"Window {m['window']['since']} .. {m['window']['until']}", ""]
    lines.append("Assistant turns / output tokens by model")
    for where in ("main", "subagent"):
        rows = sorted(m["by_model"][where].items(), key=lambda r: -r[1]["turns"])
        total = sum(v["turns"] for _, v in rows)
        lines.append(f"  {where}:")
        for model, v in rows:
            lines.append(f"    {model:32} {v['turns']:7} turns ({pct(v['turns'], total):5.1f}%)"
                         f"  {v['output_tokens'] / 1e3:8.0f}k out")

    lines += [
        "",
        f"Subagent turns on Sonnet/Haiku: {m['subagent_turns_cheap_pct']}%   (target > 30%)",
        f"Subagents that ran on Opus/Fable: {m['subagents_top_tier']} of {m['subagents_total']}"
        f" ({m['subagents_top_tier_pct']}%)   (target < 20%)",
        f"Main-session mechanical tool turns: {m['main_mechanical_turns']} of {m['main_tool_turns']}"
        f" ({m['main_mechanical_pct']}%)   {m['main_mechanical_breakdown']}",
    ]
    if previous:
        p = previous.get("metrics", {})
        lines.append("")
        lines.append(f"Change since the previous analysis ({previous.get('ran_on')}):")
        for key, label in (("subagent_turns_cheap_pct", "subagent turns on Sonnet/Haiku"),
                           ("subagents_top_tier_pct", "subagents on Opus/Fable"),
                           ("main_mechanical_pct", "main mechanical turns")):
            if key in p:
                lines.append(f"  {label:32} {p[key]:5.1f}% -> {m[key]:5.1f}%  ({m[key] - p[key]:+.1f})")

    j = m.get("jev") or {}
    if j.get("spawns") or j.get("prompts"):
        lines += ["", f"Jev decider: {j.get('spawns', 0)} spawns seen, {j.get('spawn_retiered', 0)} re-tiered "
                      f"({j.get('spawn_pin_enforced', 0)} by pin), {j.get('spawn_guarded', 0)} guarded, "
                      f"{j.get('spawn_low_confidence', 0)} below threshold, {j.get('spawn_failed_open', 0)} failed open; "
                      f"{j.get('prompts', 0)} prompts, {j.get('prompt_advised', 0)} advised to delegate; "
                      f"median {j.get('latency_ms_median', '-')} ms, ${j.get('cost_usd', 0)}"]
    elif "jev" in m:
        lines += ["", "Jev decider: no decisions logged in this window (no key, or hooks not installed)"]

    if m["spawns"]:
        lines += ["", "Agent spawns (type, requested model, parent model):"]
        for s in m["spawns"][:12]:
            lines.append(f"    {s['count']:4}  {s['type']:28} model={s['model']:8} parent={s['parent']}")
    if m["top_tier_spawn_descriptions"]:
        lines += ["", "Spawns that ran (or would run) top-tier - check for misrouted mechanical work:"]
        lines += [f"    - {d}" for d in m["top_tier_spawn_descriptions"]]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", help="YYYY-MM-DD or 'today' (default: end of the last recorded analysis, else 14 days ago)")
    ap.add_argument("--until", help="YYYY-MM-DD inclusive (default: today)")
    ap.add_argument("--projects-dir", default=str(Path.home() / ".claude" / "projects"))
    ap.add_argument("--last-subagents", type=int, default=0, help="also list the N most recent subagent models")
    ap.add_argument("--json", action="store_true", help="print metrics as JSON instead of text")
    ap.add_argument("--record", action="store_true",
                    help="record this analysis for the bi-weekly review and write a markdown report")
    args = ap.parse_args()

    until = parse_day(args.until or "today")
    if args.since:
        since = parse_day(args.since)
    else:
        last = review_state.check()["last"]
        try:
            since = dt.date.fromisoformat(last["metrics"]["window"]["until"])
        except (TypeError, KeyError, ValueError):
            since = until - dt.timedelta(days=review_state.INTERVAL_DAYS)

    metrics = collect(args.projects_dir, since, until)
    previous = review_state.check()["last"] if args.record else None
    text = render(metrics, previous)

    if args.record:
        review_state.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        report = review_state.REPORTS_DIR / f"{dt.date.today().isoformat()}.md"
        report.write_text(f"# Usage review {dt.date.today().isoformat()}\n\n```text\n{text}\n```\n")
        review_state.record(metrics, report)
        text += f"\n\nRecorded for this workstation; report: {report}"

    if args.json:
        print(json.dumps(metrics, indent=2))
    else:
        print(text)
    if args.last_subagents:
        print(f"\nMost recent {args.last_subagents} subagents:")
        for s in metrics["recent_subagents"][-args.last_subagents:]:
            print(f"    {s['ts']}  {s['model']:28} {s['file']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
