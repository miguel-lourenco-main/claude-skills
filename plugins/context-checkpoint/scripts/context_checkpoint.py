#!/usr/bin/env python3
"""context-checkpoint — UserPromptSubmit hook.

Every N% of the context window (and at cold-cache / task-boundary moments) decide whether the
context is worth keeping or compacting. The decision is about relevance and freshness of what is
in context, not its size; the criteria are in the note itself and, with the measurements behind
them, in skills/context-checkpoint/RATIONALE.md.

Why a hook: no hook event receives the context percentage, and some models (Opus 4.7+, Fable) do
not receive the API's token-usage warnings, so the model is blind to its own context unless
something tells it. The transcript JSONL carries `message.usage` on every assistant entry; input
+ cache_creation + cache_read of the last one is the formula the statusline documents for
`used_percentage`. The JSONL schema is not a documented interface: if it changes, this hook goes
silent. It never blocks a prompt (any error -> exit 0, no output).

## Three stages, cheapest first

0. **Gate (free, local).** Band crossing, cold cache, or a task-boundary prompt. Nothing below
   `min_ctx_tokens` and nothing right after a compaction. The stages below run ONLY when this
   gate opens — a model call on every prompt would tax every prompt to answer a question that
   changes a few times a session.
1. **Inventory (free, local).** A deterministic read of the transcript since the last compaction:
   turns, the tool-call histogram, the largest one-shot dumps, files touched, how the session
   has been spending itself. Facts, no judgement.
2. **Digest (cheap model, ~5-10s).** Haiku turns that inventory plus the latest exchanges into
   five short lines — what is in flight, what is closed, what is stale, what is poison, what the
   next prompt needs. This is what the console shows and what the decider reads. A summary is
   exactly the kind of bounded language work the cheapest rung does well, and the expensive model
   in the session never has to spend its own attention producing one.
3. **Decision (Jev, ~0.5s, ~$0.00003).** The digest becomes the `state` of a decision-model call:
   one yes/no and two graded questions, answered with calibrated probabilities. Jev grades; THIS
   FILE decides, by arithmetic over the grades (see `verdict`), so the threshold is inspectable
   and tunable rather than a model's mood. A high loss-risk vetoes a compact the same way a
   strong mismatch vetoes a job match.

Every stage degrades to the one before it. No Jev key, a failed call, a timeout: the hook falls
back to asking the session's own model to make the call, which is what it did before any of this
existed, and says so in the note.

Usage:
  (hook)      reads the hook JSON on stdin
  --status    print the current reading for the newest transcript of this cwd (or a given path)
  --dry-run   run the whole chain against that transcript and print what the hook would emit

Config (optional):  ~/.claude/context-checkpoint/config.json
State (per session): ~/.claude/context-checkpoint/<session_id>.json
"""
import json, os, re, sys, glob, subprocess, datetime as dt
from collections import Counter

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

    # --- stage 2: the cheap model that writes the digest -----------------------------------
    "digest": True,             # false => the decider reads the raw inventory instead
    # How to reach that model. `api` is one HTTPS call and measured ~1s; `cli` spawns
    # `claude -p`, which costs no cash but ~24s, almost all of it process start-up, and this
    # hook is holding the person's prompt while it runs. `auto` takes the API when a key
    # resolves, which is the same key the decider uses, and the CLI otherwise.
    "digest_via": "auto",
    "digest_api_url": "https://openrouter.ai/api/v1/chat/completions",
    "digest_api_model": "google/gemini-2.5-flash-lite",   # ~$0.0003 a digest at 1M context
    "digest_model": "haiku",    # the CLI fallback's model: the cheapest rung on the subscription
    "digest_timeout_s": 35,     # the CLI path needs the room; the API path answers in about one second
    "digest_chars": 9000,       # how much recent transcript the cheap model is shown

    # --- stage 3: the decision model ------------------------------------------------------
    "decider": "auto",          # auto => jev when a key resolves, else the session's own model
    "jev_url": "https://openrouter.ai/api/v1/systemone",
    "jev_model": "jev-latest",
    "jev_timeout_s": 12,
    # Where a key file may sit. Globbed, and deliberately wider than one path: the key started
    # inside the marketplace checkout, moving it out of that working tree was the right call, and
    # the hook went silently keyless for a day because its one hard-coded path had moved. A
    # config for this is not the answer either — the failure is invisible (`--status` says
    # "no key", nothing else does), so the default has to find a key that was put somewhere
    # reasonable.
    "jev_key_files": ["~/.claude/context-checkpoint/jev.env",
                      "~/.claude/model-router/jev.env",
                      "~/.claude/*/jev.env",
                      "~/.claude/*.env",
                      "~/.config/jobhunt/jev.env"],
    "jev_key_envs": ["OPENROUTER_API_KEY", "TYPESAFE_API_KEY", "JEV_API_KEY"],
    "compact_at": 0.55,         # P(compact) at or above this, and the loss veto clear, => compact
    "loss_veto": 2.5,           # loss_risk (0-4) above this keeps the context whatever P(compact) says
}
NATIVE_1M = ("fable", "sonnet-5", "opus-5", "opus-4-7", "opus-4-8", "opus-4-9")

# A digest spawns `claude -p`, which is itself a Claude Code session and would fire this very
# hook. The child's context is a few thousand tokens so `min_ctx_tokens` already stops it — but
# relying on a threshold to prevent recursion is how a threshold change becomes a fork bomb.
CHILD_ENV = "CONTEXT_CHECKPOINT_CHILD"


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


def _text_of(content):
    """The plain text of a message's content, whatever shape it arrived in."""
    if isinstance(content, str):
        return content
    out = []
    for b in content or []:
        if isinstance(b, dict) and b.get("type") == "text":
            out.append(b.get("text") or "")
    return "\n".join(out)


def scan(path):
    """Read the transcript once.

    Returns (reading, inventory). `reading` is what the gate needs — context size, idleness,
    whether a compaction just landed. `inventory` is what stages 2 and 3 read: the same pass,
    since the file is the expensive part and walking it twice to keep two functions tidy would
    double the cost of every prompt that opens the gate.
    """
    ctx = 0; last_t = None; compacted = False; tool_chars = 0; model = ""
    tools = Counter(); dumps = []; files = Counter(); prompts = []; errors = []
    turns = 0; first_t = None; pending = {}

    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            typ = d.get("type")

            if typ == "system" and d.get("subtype") == "compact_boundary":
                # Everything before the boundary is no longer in context, so it is not in the
                # inventory either: the digest must describe what the model can still see.
                compacted = True; tool_chars = 0
                tools.clear(); dumps.clear(); files.clear(); prompts.clear(); errors.clear()
                turns = 0; first_t = None; pending.clear()
                continue

            if typ == "assistant":
                m = d.get("message") or {}
                u = m.get("usage") or {}
                n = ((u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0)
                     + (u.get("cache_read_input_tokens") or 0))
                if n:
                    ctx = n; compacted = False; model = m.get("model") or model
                turns += 1
                for b in (m.get("content") or []):
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        name = b.get("name") or "?"
                        tools[name] += 1
                        inp = b.get("input") or {}
                        target = inp.get("file_path") or inp.get("path") or inp.get("notebook_path")
                        if target:
                            files[os.path.basename(str(target))] += 1
                        label = str(target or inp.get("command") or inp.get("pattern")
                                    or inp.get("description") or "")[:110]
                        pending[b.get("id")] = (name, label)

            if typ == "user":
                c = (d.get("message") or {}).get("content")
                if isinstance(c, list):
                    for b in c:
                        if isinstance(b, dict) and b.get("type") == "tool_result":
                            cc = b.get("content")
                            size = (len(cc) if isinstance(cc, str)
                                    else sum(len(x.get("text", "")) for x in (cc or []) if isinstance(x, dict)))
                            tool_chars += size
                            # A result names its call with `tool_use_id`, never `id`; keyed on
                            # `id` every dump came back anonymous, which is most of what makes
                            # the biggest ones legible.
                            name, label = pending.pop(b.get("tool_use_id"), ("?", ""))
                            # The big ones are the whole question: a 50k file read already acted
                            # on is the cheapest thing in the window to give up.
                            dumps.append((size, name, label))
                            body = cc if isinstance(cc, str) else ""
                            if b.get("is_error") or re.search(r"(?m)^(error|Traceback|fatal:)", body[:400]):
                                errors.append(f"{name} {label}"[:120])
                else:
                    txt = _text_of(c).strip()
                    # Hook and reminder injections are not the person talking.
                    if txt and not txt.startswith("<") and "system-reminder" not in txt[:200]:
                        prompts.append(txt[:300])
                        turns += 1

            if typ in ("user", "assistant"):
                t = ts(d)
                if t:
                    last_t = t
                    if first_t is None:
                        first_t = t

    dumps.sort(reverse=True)
    inv = {
        "turns": turns,
        "span_minutes": int((last_t - first_t).total_seconds() // 60) if (first_t and last_t) else 0,
        "tool_calls": dict(tools.most_common(10)),
        "largest_outputs": [{"tokens": s // 4, "tool": n, "what": w} for s, n, w in dumps[:8] if s > 4000],
        "files_touched": [k for k, _ in files.most_common(12)],
        "errors_seen": errors[-5:],
        "recent_prompts": prompts[-6:],
    }
    return (ctx, last_t, compacted, tool_chars // 4, model), inv


# --------------------------------------------------------------------------------------- stage 2

DIGEST_PROMPT = """You are summarising a coding session's context so another process can decide \
whether that context is still worth keeping or should be replaced by a summary.

Answer ONLY with a JSON object, no prose and no code fence, with exactly these string fields, \
each at most 200 characters, each a plain statement (write "none" when there is nothing):

  "in_flight"  work started and NOT finished: edits half-applied, a failing test, an open \
question, anything whose exact details would have to be re-derived if the transcript were summarised.
  "closed"     work that is finished: committed, pushed, answered, verified.
  "stale"      anything in context that is now WRONG or superseded: files changed since they were \
read, a state that has moved on, conclusions overtaken by later findings.
  "poison"     bulk already acted upon that only occupies room now: large file reads, log dumps, \
listings, repeated notifications, abandoned approaches.
  "next_needs" what the newest user prompt actually requires from the context, if anything.

Be concrete and name things. Do not speculate about what you cannot see.

--- session facts ---
{inventory}

--- most recent exchanges ---
{tail}
"""


def transcript_tail(path, limit):
    """The last `limit` characters of real conversation — prompts, assistant prose, tool names.

    Tool RESULTS are deliberately left out: they are the bulk this whole plugin exists to
    measure, and pasting them into the digest would spend the cheap model's window on exactly
    the content the digest is supposed to characterise rather than reproduce.
    """
    rows = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                typ = d.get("type")
                if typ == "system" and d.get("subtype") == "compact_boundary":
                    rows = []
                elif typ == "user":
                    c = (d.get("message") or {}).get("content")
                    if not isinstance(c, list):
                        t = _text_of(c).strip()
                        if t and not t.startswith("<"):
                            rows.append("USER: " + t[:700])
                elif typ == "assistant":
                    t = _text_of((d.get("message") or {}).get("content")).strip()
                    if t:
                        rows.append("CLAUDE: " + t[:700])
    except Exception:
        return ""
    tail, total = [], 0
    for r in reversed(rows):
        total += len(r)
        tail.append(r)
        if total >= limit:
            break
    return "\n\n".join(reversed(tail))


def _digest_api(cfg, key, prompt):
    import urllib.request
    body = json.dumps({
        "model": cfg["digest_api_model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500,
        "temperature": 0,
    }).encode()
    req = urllib.request.Request(
        cfg["digest_api_url"], data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=float(cfg["digest_timeout_s"])) as r:
        d = json.load(r)
    return ((d.get("choices") or [{}])[0].get("message") or {}).get("content") or ""


def _digest_cli(cfg, prompt):
    # The child would fire this same hook; CHILD_ENV is what stops that, not the token floor.
    env = dict(os.environ, **{CHILD_ENV: "1"})
    p = subprocess.run(
        ["claude", "-p", "--model", str(cfg["digest_model"]), "--allowed-tools", ""],
        input=prompt, capture_output=True, text=True,
        timeout=float(cfg["digest_timeout_s"]), env=env,
    )
    return (p.stdout or "").strip()


def digest(cfg, inv, path, key=None):
    """Five lines about this context, written by the cheapest rung. None if it cannot."""
    prompt = DIGEST_PROMPT.format(
        inventory=json.dumps(inv, indent=1)[:6000],
        tail=transcript_tail(path, int(cfg["digest_chars"])),
    )
    via = cfg.get("digest_via", "auto")
    try:
        if via == "api" or (via == "auto" and key):
            out = _digest_api(cfg, key, prompt)
        else:
            out = _digest_cli(cfg, prompt)
    except Exception:
        return None
    if not out:
        return None
    m = re.search(r"\{.*\}", out, re.S)          # tolerate a fence or a stray sentence
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except Exception:
        return None
    keys = ("in_flight", "closed", "stale", "poison", "next_needs")
    return {k: str(d.get(k) or "none")[:260] for k in keys} if isinstance(d, dict) else None


# --------------------------------------------------------------------------------------- stage 3

QUESTIONS = {
    "compact": {
        "type": "noul",
        "instructions": "Should this coding session's context be compacted now — replaced by a "
                        "summary? Answer yes when most of what is in context is finished work the "
                        "next task will not need, or is stale or bulk already acted upon. Answer "
                        "no when work is mid-flight and its exact details would have to be "
                        "re-derived.",
    },
    "relevance": {
        "type": "score",
        "instructions": "How much does the next task depend on the detail currently in context?",
        "criteria": [
            "Nothing: everything in context is closed and committed",
            "Little: only the conclusions matter",
            "Some: a few details would have to be re-read",
            "Much: several threads are still open",
            "Everything: mid-flight work needing exact strings, line numbers or an error trace",
        ],
    },
    "loss_risk": {
        "type": "score",
        "instructions": "How much would be permanently lost by summarising this context right now?",
        "criteria": [
            "Nothing: it is all recorded in files, commits or memory",
            "Little: a summary would carry it",
            "Some: a few specifics would blur",
            "Much: decisions and corrections live only here",
            "Critical: in-flight state exists only in this transcript",
        ],
    },
}


def jev_key(cfg):
    for name in cfg["jev_key_envs"]:
        v = os.environ.get(name)
        if v:
            return v.strip()
    for pattern in cfg["jev_key_files"]:
        for f in sorted(glob.glob(os.path.expanduser(pattern))):
            try:
                for line in open(f):
                    k, _, v = line.partition("=")
                    if k.strip() in cfg["jev_key_envs"] and v.strip():
                        return v.strip().strip('"').strip("'")
            except Exception:
                continue
    return None


def ask_jev(cfg, key, state):
    """One decision call. Returns the parsed answers, or None.

    urllib rather than requests: a hook may not assume a third-party package is installed in
    whatever interpreter the harness happens to run it with.
    """
    import urllib.request, urllib.error
    body = json.dumps({"model": cfg["jev_model"], "state": state, "questions": QUESTIONS}).encode()
    req = urllib.request.Request(
        cfg["jev_url"], data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=float(cfg["jev_timeout_s"])) as r:
            d = json.load(r)
    except Exception:
        return None
    a = d.get("answers") or {}
    if "compact" not in a:
        return None
    return {
        "p_compact": float(a["compact"].get("noul") or 0.0),
        "relevance": float((a.get("relevance") or {}).get("score") or 0.0),
        "relevance_conf": float((a.get("relevance") or {}).get("confidence") or 0.0),
        "loss_risk": float((a.get("loss_risk") or {}).get("score") or 0.0),
        "loss_conf": float((a.get("loss_risk") or {}).get("confidence") or 0.0),
        "model": d.get("model") or cfg["jev_model"],
        "cost": float((d.get("usage") or {}).get("cost") or 0.0),
    }


def verdict(cfg, ans):
    """Grades in, decision out — the arithmetic, not the model's mood.

    Jev answers three questions independently and never combines them; combining is done here so
    the rule is inspectable and tunable, and so `loss_risk` can VETO. A context whose in-flight
    state exists nowhere else is kept however confidently the yes/no said otherwise: losing it
    costs a re-derivation, while keeping it costs some window.
    """
    veto = ans["loss_risk"] > float(cfg["loss_veto"])
    if veto:
        return "keep", f"loss risk {ans['loss_risk']:.1f}/4 vetoes compacting"
    if ans["p_compact"] >= float(cfg["compact_at"]):
        return "compact", f"P(compact) {ans['p_compact']:.2f}, relevance {ans['relevance']:.1f}/4"
    return "keep", f"P(compact) {ans['p_compact']:.2f} below {cfg['compact_at']}"


# --------------------------------------------------------------------------------------- output

CRITERIA = (
    "- Relevance density: how much of what is in context does the NEXT task depend on? Work that is committed/closed is a candidate for summarising; a task still mid-flight that needs exact strings, line numbers, an error trace, or the chronology of what was tried is NOT.\n"
    "- Staleness: if files in context changed elsewhere (another session, a pull), the context is now misleading, not just useless. That is a stronger reason than size.\n"
    "- Poison: failed approaches, loops, notification floods, big one-shot dumps (file reads, logs, diffs) already acted upon. They pull attention toward wrong paths.\n"
    "- Cache: if idle >= ~55 min or a model switch is coming, the full re-read is paid anyway, so compacting now is nearly free.\n"
    "- Runway: if a long autonomous phase (agent waves, sweeps) is about to start, it must fit without auto-compact firing mid-run near the window limit (arbitrary point, minutes of stall, loses in-flight state).\n"
    "- Before compacting: anything the summary must not lose (decisions, rulings, corrections you were given) goes to its durable home first (project decision files, run logs, memory).\n"
)
REPLY_FORMAT = (
    "Reply format, as the FIRST line of your answer, in the user's language, then proceed with the task: "
    "`Context NN%: keep — <reason>` or `Context NN%: compact — <reason>; suggest /compact <what the summary must preserve>`. "
    "You cannot run /compact yourself; the user does."
)


def head(pct, ctx, window, idle_min, tool_tok, trigger):
    k = lambda n: f"{n // 1000}k"
    return (f"[context-checkpoint] Context {pct}% ({k(ctx)} of {k(window)}), trigger: {trigger}. "
            f"Idle {idle_min} min before this prompt; ~{k(tool_tok)} tokens of tool output since the last compaction.")


def note(hdr, dig, ans, call, pct):
    """What the session's model is told. With a verdict it is a recommendation to state or
    dispute; without one it is the question, as it always was."""
    parts = [hdr]
    if dig:
        parts.append("A cheap model read the transcript and reports:\n"
                     f"- in flight: {dig['in_flight']}\n- closed: {dig['closed']}\n"
                     f"- stale: {dig['stale']}\n- poison: {dig['poison']}\n- next task needs: {dig['next_needs']}")
    if ans and call:
        line, why = call
        parts.append(
            f"A decision model ({ans['model']}) graded that digest: P(compact) {ans['p_compact']:.2f}, "
            f"relevance {ans['relevance']:.1f}/4, loss risk {ans['loss_risk']:.1f}/4 → **{line}** ({why}).\n"
            f"That verdict is advisory and it cannot see what you are about to do. State it as your first "
            f"line if you agree; say plainly that you disagree, and why, if the next task needs detail the "
            f"digest above does not mention."
        )
    else:
        parts.append("No decision model was available, so the call is yours. "
                     "The decision is about RELEVANCE and FRESHNESS of what is in context, not its size:\n" + CRITERIA)
    parts.append(REPLY_FORMAT)
    return "\n".join(parts)


def clip(s, n=150):
    """Cut to a word, not to a character: a console line ending mid-word reads as corruption."""
    s = " ".join(s.split())
    if len(s) <= n:
        return s
    return s[:s.rfind(" ", 0, n) or n].rstrip(" ,;.") + "…"


def console(pct, ctx, window, trigger, dig, ans, call, took):
    """The one line (plus a few) the person actually sees in their terminal."""
    out = [f"context-checkpoint: {pct}% ({ctx // 1000}k/{window // 1000}k) — {trigger}"]
    if dig:
        for label, key in (("in flight", "in_flight"), ("closed", "closed"),
                           ("stale", "stale"), ("poison", "poison")):
            v = dig[key]
            if v and v.lower() != "none":
                out.append(f"  {label}: {clip(v)}")
    if ans and call:
        line, why = call
        out.append(f"  jev: {line} — {why} (${ans['cost']:.5f}, {took:.1f}s)")
    elif dig:
        out.append(f"  decision: left to the session model ({took:.1f}s)")
    return "\n".join(out)


# --------------------------------------------------------------------------------------- drivers

def newest_transcript(cwd):
    key = re.sub(r"[^A-Za-z0-9]", "-", os.path.abspath(cwd))
    paths = glob.glob(os.path.join(HOME, ".claude", "projects", key, "*.jsonl"))
    return max(paths, key=os.path.getmtime) if paths else None


def assess(cfg, path, inv, pct, idle_min, trigger, prompt=""):
    """Stages 2 and 3. Returns (digest|None, answers|None, verdict|None, seconds)."""
    t0 = dt.datetime.now()
    key = jev_key(cfg)
    dig = digest(cfg, inv, path, key) if cfg.get("digest") else None
    ans = call = None
    if cfg.get("decider", "auto") in ("auto", "jev") and key:
        state = {"context_pct": pct, "idle_minutes": idle_min, "trigger": trigger,
                 "newest_user_prompt": (prompt or "")[:400]}
        # Without a digest the decider still gets facts rather than nothing — the inventory is
        # already structured, it simply has no judgement in it.
        state.update(dig or {"inventory": json.dumps(inv)[:4000]})
        ans = ask_jev(cfg, key, state)
        if ans:
            call = verdict(cfg, ans)
    return dig, ans, call, (dt.datetime.now() - t0).total_seconds()


def status(argv):
    path = argv[0] if argv else newest_transcript(os.getcwd())
    if not path or not os.path.exists(path):
        print("no transcript found"); return
    cfg = load_cfg(); window = window_tokens(cfg)
    (ctx, last_t, compacted, tool_tok, model), inv = scan(path)
    pct = int(ctx * 100 / window) if ctx else 0
    idle = int((dt.datetime.now(dt.timezone.utc) - last_t).total_seconds() // 60) if last_t else 0
    key = jev_key(cfg)
    decider = ("jev" if key else "session model (no key)") if cfg.get("decider", "auto") in ("auto", "jev") else cfg["decider"]
    via = cfg.get("digest_via", "auto")
    dig_desc = "off"
    if cfg.get("digest"):
        api = via == "api" or (via == "auto" and key)
        dig_desc = f"{cfg['digest_api_model']} (api)" if api else f"{cfg['digest_model']} (cli)"
    print(f"transcript: {path}\nmodel: {model or '?'}  window: {window // 1000}k\n"
          f"context: {ctx // 1000}k ({pct}%)"
          f"{'  [stale: compaction just happened]' if compacted else ''}\n"
          f"idle: {idle} min   tool output since compaction: ~{tool_tok // 1000}k tokens\n"
          f"next band: {((pct // cfg['step_pct']) + 1) * cfg['step_pct']}%   "
          f"config: {CFG_PATH if os.path.exists(CFG_PATH) else 'defaults'}\n"
          f"decider: {decider}   digest: {dig_desc}\n"
          f"turns since compaction: {inv['turns']}   biggest dumps: "
          + ", ".join(f"{d['what'][:28] or d['tool']} ~{d['tokens'] // 1000}k" for d in inv["largest_outputs"][:3]))


def dry_run(argv):
    path = argv[0] if argv else newest_transcript(os.getcwd())
    if not path or not os.path.exists(path):
        print("no transcript found"); return
    cfg = load_cfg(); window = window_tokens(cfg)
    (ctx, last_t, _, tool_tok, _), inv = scan(path)
    pct = int(ctx * 100 / window) if ctx else 0
    idle = int((dt.datetime.now(dt.timezone.utc) - last_t).total_seconds() // 60) if last_t else 0
    dig, ans, call, took = assess(cfg, path, inv, pct, idle, "dry run", inv["recent_prompts"][-1] if inv["recent_prompts"] else "")
    print("--- console ---")
    print(console(pct, ctx, window, "dry run", dig, ans, call, took))
    print("\n--- additionalContext ---")
    print(note(head(pct, ctx, window, idle, tool_tok, "dry run"), dig, ans, call, pct))


def main():
    if os.environ.get(CHILD_ENV):
        return  # this session IS the digest; it has nothing to check and must not spawn another
    try:
        inp = json.load(sys.stdin)
    except Exception:
        return
    cfg = load_cfg()
    path = inp.get("transcript_path")
    sid = inp.get("session_id") or "unknown"
    if not path or not os.path.exists(path):
        return
    (ctx, last_t, compacted, tool_tok, _), inv = scan(path)
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

    prompt = inp.get("prompt") or ""
    trigger = None
    if band > st.get("band", 0) and ctx >= cfg["min_ctx_tokens"]:
        trigger = f"crossed {band * step}%"
    elif idle_min >= cfg["cold_minutes"] and ctx >= cfg["min_ctx_tokens"] and pct - st.get("last_fire_pct", -100) >= 1:
        trigger = f"cold cache (idle {idle_min} min)"
    elif (ctx >= cfg["min_ctx_tokens"] and pct - st.get("last_fire_pct", -100) >= cfg["boundary_min_gap_pct"]
          and re.search(cfg["boundary_regex"], prompt.strip())):
        trigger = "prompt looks like a task boundary"

    st["band"] = max(st.get("band", 0), band); st["last_ctx"] = ctx
    if trigger:
        st["last_fire_pct"] = pct
    with open(spath, "w") as f:
        json.dump(st, f)
    if not trigger:
        return

    dig, ans, call, took = assess(cfg, path, inv, pct, idle_min, trigger, prompt)
    print(json.dumps({
        "systemMessage": console(pct, ctx, window, trigger, dig, ans, call, took),
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": note(head(pct, ctx, window, idle_min, tool_tok, trigger), dig, ans, call, pct),
        },
    }))


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "--status":
        status(sys.argv[2:])
    elif arg == "--dry-run":
        dry_run(sys.argv[2:])
    else:
        try:
            main()
        except Exception:
            pass  # a checkpoint must never block a prompt
