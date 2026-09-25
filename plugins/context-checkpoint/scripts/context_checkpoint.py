#!/usr/bin/env python3
"""context-checkpoint — UserPromptSubmit hook.

Every N% of the context window (and at cold-cache / task-boundary moments) inject a short note
asking the model to decide, in one line, whether the context is worth keeping or compacting.
The decision is about relevance and freshness of what is in context, not its size; the
criteria are in the note itself and, with the measurements behind them, in
skills/context-checkpoint/RATIONALE.md.

Why a hook: no hook event receives the context percentage, and some models (Opus 4.7+, Fable)
do not receive the API's token-usage warnings, so the model is blind to its own context unless
something tells it. The transcript JSONL carries `message.usage` on every assistant entry;
input + cache_creation + cache_read of the last one is the formula the statusline documents for
`used_percentage`. The JSONL schema is not a documented interface: if it changes, this hook goes
silent. It never blocks a prompt (any error -> exit 0, no output).

Usage:
  (hook)     reads the hook JSON on stdin
  --status   print the current reading for the newest transcript of this cwd (or a given path)

Config (optional):  ~/.claude/context-checkpoint/config.json
State (per session): ~/.claude/context-checkpoint/<session_id>.json
"""
import json, os, re, sys, glob, datetime as dt

HOME = os.path.expanduser("~")
BASE = os.path.join(HOME, ".claude", "context-checkpoint")
CFG_PATH = os.path.join(BASE, "config.json")
DEFAULTS = {
    "step_pct": 15,             # fire each time the context crosses a new 15% band
    "cold_minutes": 55,         # idle >= this => the 1h prompt cache is (about to be) cold
    "min_ctx_tokens": 120000,   # below this there is nothing worth compacting (post-compact floor ~55-85k)
    "boundary_min_gap_pct": 5,  # a boundary-hint fires at most once per 5% of context
    "window_tokens": None,      # None => 1,000,000 if the settings model carries [1m] or is a 1M-native model, else 200,000
    "boundary_regex": r"(?i)^(faz |do a |make a )?(commit|push|pull|puxa|status)|\b(nova tarefa|next task|new task|outra sess[aã]o|another session|different session|sess[aã]o diferente|vamos (agora|passar|mudar)|lets (now|move|switch)|let's (now|move|switch))\b",
}
NATIVE_1M = ("fable", "sonnet-5", "opus-5", "opus-4-7", "opus-4-8", "opus-4-9")

def load_cfg():
    cfg = dict(DEFAULTS)
    try:
        with open(CFG_PATH) as f:
            cfg.update(json.load(f))
    except Exception:
        pass
    return cfg

def window_tokens(cfg):
    if cfg.get("window_tokens"):
        return int(cfg["window_tokens"])
    try:
        with open(os.path.join(HOME, ".claude", "settings.json")) as f:
            model = (json.load(f).get("model") or "").lower()
    except Exception:
        model = ""
    if "[1m]" in model or any(m in model for m in NATIVE_1M):
        return 1_000_000
    return 200_000

def ts(d):
    t = d.get("timestamp")
    try:
        return dt.datetime.fromisoformat(t.replace("Z", "+00:00")) if t else None
    except Exception:
        return None

def scan(path):
    """(ctx_tokens, last_activity_ts, compacted_after_last_usage, tool_tokens_since_compact, model)"""
    ctx = 0; last_t = None; compacted = False; tool_chars = 0; model = ""
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            typ = d.get("type")
            if typ == "system" and d.get("subtype") == "compact_boundary":
                compacted = True; tool_chars = 0
                continue
            if typ == "assistant":
                m = d.get("message") or {}
                u = m.get("usage") or {}
                n = (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0) + (u.get("cache_read_input_tokens") or 0)
                if n:
                    ctx = n; compacted = False; model = m.get("model") or model
            if typ == "user":
                c = (d.get("message") or {}).get("content")
                if isinstance(c, list):
                    for b in c:
                        if isinstance(b, dict) and b.get("type") == "tool_result":
                            cc = b.get("content")
                            tool_chars += len(cc) if isinstance(cc, str) else sum(len(x.get("text", "")) for x in (cc or []) if isinstance(x, dict))
            if typ in ("user", "assistant"):
                t = ts(d)
                if t: last_t = t
    return ctx, last_t, compacted, tool_chars // 4, model

def note(pct, ctx, window, idle_min, tool_tok, trigger):
    k = lambda n: f"{n//1000}k"
    return (
        f"[context-checkpoint] Context {pct}% ({k(ctx)} of {k(window)}), trigger: {trigger}. "
        f"Idle {idle_min} min before this prompt; ~{k(tool_tok)} tokens of tool output since the last compaction.\n"
        "Before doing the task, decide in one line whether to keep or compact. The decision is about RELEVANCE and FRESHNESS of what is in context, not its size:\n"
        "- Relevance density: how much of what is in context does the NEXT task depend on? Work that is committed/closed is a candidate for summarising; a task still mid-flight that needs exact strings, line numbers, an error trace, or the chronology of what was tried is NOT.\n"
        "- Staleness: if files in context changed elsewhere (another session, a pull), the context is now misleading, not just useless. That is a stronger reason than size.\n"
        "- Poison: failed approaches, loops, notification floods, big one-shot dumps (file reads, logs, diffs) already acted upon. They pull attention toward wrong paths.\n"
        "- Cache: if idle >= ~55 min or a model switch is coming, the full re-read is paid anyway, so compacting now is nearly free.\n"
        "- Runway: if a long autonomous phase (agent waves, sweeps) is about to start, it must fit without auto-compact firing mid-run near the window limit (arbitrary point, minutes of stall, loses in-flight state).\n"
        "- Before compacting: anything the summary must not lose (decisions, rulings, corrections you were given) goes to its durable home first (project decision files, run logs, memory).\n"
        "Reply format, as the FIRST line of your answer, in the user's language, then proceed with the task: "
        "`Context NN%: keep — <reason>` or `Context NN%: compact — <reason>; suggest /compact <what the summary must preserve>`. You cannot run /compact yourself; the user does."
    )

def newest_transcript(cwd):
    key = re.sub(r"[^A-Za-z0-9]", "-", os.path.abspath(cwd))
    paths = glob.glob(os.path.join(HOME, ".claude", "projects", key, "*.jsonl"))
    return max(paths, key=os.path.getmtime) if paths else None

def status(argv):
    path = argv[0] if argv else newest_transcript(os.getcwd())
    if not path or not os.path.exists(path):
        print("no transcript found"); return
    cfg = load_cfg(); window = window_tokens(cfg)
    ctx, last_t, compacted, tool_tok, model = scan(path)
    pct = int(ctx * 100 / window) if ctx else 0
    idle = int((dt.datetime.now(dt.timezone.utc) - last_t).total_seconds() // 60) if last_t else 0
    print(f"transcript: {path}\nmodel: {model or '?'}  window: {window//1000}k\ncontext: {ctx//1000}k ({pct}%)"
          f"{'  [stale: compaction just happened]' if compacted else ''}\nidle: {idle} min   tool output since compaction: ~{tool_tok//1000}k tokens\n"
          f"next band: {((pct // cfg['step_pct']) + 1) * cfg['step_pct']}%   config: {CFG_PATH if os.path.exists(CFG_PATH) else 'defaults'}")

def main():
    try:
        inp = json.load(sys.stdin)
    except Exception:
        return
    cfg = load_cfg()
    path = inp.get("transcript_path")
    sid = inp.get("session_id") or "unknown"
    if not path or not os.path.exists(path):
        return
    ctx, last_t, compacted, tool_tok, _ = scan(path)
    if compacted or ctx <= 0:
        return  # right after a compaction the usage line is stale; wait for the next turn
    window = window_tokens(cfg)
    pct = int(ctx * 100 / window)
    step = int(cfg["step_pct"])
    band = pct // step
    now = dt.datetime.now(dt.timezone.utc)
    idle_min = int((now - last_t).total_seconds() // 60) if last_t else 0

    os.makedirs(BASE, exist_ok=True)
    spath = os.path.join(BASE, f"{sid}.json")
    try:
        with open(spath) as f:
            st = json.load(f)
    except Exception:
        st = {"band": 0, "last_ctx": 0, "last_fire_pct": -100}
    if ctx < st.get("last_ctx", 0) * 0.6:   # context dropped a lot => compaction/clear; reset silently
        st = {"band": band, "last_ctx": ctx, "last_fire_pct": -100}

    trigger = None
    if band > st.get("band", 0) and ctx >= cfg["min_ctx_tokens"]:
        trigger = f"crossed {band*step}%"
    elif idle_min >= cfg["cold_minutes"] and ctx >= cfg["min_ctx_tokens"] and pct - st.get("last_fire_pct", -100) >= 1:
        trigger = f"cold cache (idle {idle_min} min)"
    else:
        prompt = inp.get("prompt") or ""
        if ctx >= cfg["min_ctx_tokens"] and pct - st.get("last_fire_pct", -100) >= cfg["boundary_min_gap_pct"] and re.search(cfg["boundary_regex"], prompt.strip()):
            trigger = "prompt looks like a task boundary"

    st["band"] = max(st.get("band", 0), band); st["last_ctx"] = ctx
    if trigger:
        st["last_fire_pct"] = pct
    with open(spath, "w") as f:
        json.dump(st, f)
    if not trigger:
        return
    print(json.dumps({
        "systemMessage": f"context-checkpoint: {pct}% ({ctx//1000}k/{window//1000}k) — {trigger}",
        "hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                               "additionalContext": note(pct, ctx, window, idle_min, tool_tok, trigger)},
    }))

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--status":
        status(sys.argv[2:])
    else:
        try:
            main()
        except Exception:
            pass  # a checkpoint must never block a prompt
