#!/usr/bin/env python3
"""Jev, TypeSafe AI's System One decision model, as model-router's decider.

Jev never generates text. It takes a `state` and a map of typed questions and returns typed
answers with a probability distribution and a calibrated confidence per question:

    POST {base}/v1/systemone   Authorization: Bearer <key>
    {"model": ..., "state": <text|object>, "questions": {name: {type, instructions, criteria}}}
    -> {"model": ..., "answers": {name: {type, choice|score|noul, confidence, probabilities}},
        "usage": {"input_tokens", "output_tokens", "cost"?}}

Question types: choice (criteria = {option: description}), score (criteria = [ordered levels]),
noul (yes/no; criteria = {"true": ..., "false": ...}). Confidence is 0..1 and derives from the
shape of the distribution; every published guide says the same thing: act only above a
threshold, and never let a low-confidence answer make anything worse.

Access, cheapest working route first: OPENROUTER_API_KEY (base https://openrouter.ai/api, model
typesafe/jev-1.13, no waitlist) or TYPESAFE_API_KEY (base https://api.typesafe.ai, model
jev-latest, early access). Keys come from the environment or from ~/.claude/model-router/jev.env
(KEY=value lines, mode 600) so they never sit in settings.json. Input is $0.042 per million
tokens and output is free, so a routing decision costs a few millionths of a dollar.

This module is stdlib only. Every caller is a hook that must fail open: any exception here means
"no decision", never a broken session.

The last SAMPLES_KEEP exchanges (the exact state and questions sent, the exact answers and usage
returned) are kept in ~/.claude/model-router/jev-samples.jsonl, mode 600, so the quality of what
Jev is asked and what it answers can be checked by eye. Failed calls are not samples; they go to
decisions.jsonl with the error.

CLI:
  jev.py --check          one live call; prints the route, latency and cost, exit 1 if unusable
  jev.py --explain [N]    the last N routing decisions from decisions.jsonl (default 10)
  jev.py --samples [N]    the last N request/response pairs, in full (default all kept)
  jev.py --status         is a key configured, which route, threshold, log path (no network)
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PLUGIN_ROOT", Path(__file__).resolve().parent.parent))
STATE_DIR = Path.home() / ".claude" / "model-router"
ENV_FILE = STATE_DIR / "jev.env"
CONFIG_FILE = STATE_DIR / "jev.json"
DECISIONS = STATE_DIR / "decisions.jsonl"
SAMPLES = STATE_DIR / "jev-samples.jsonl"
SAMPLES_KEEP = 10
SESSIONS_DIR = STATE_DIR / "sessions"

DEFAULTS = {
    "threshold": 0.8,      # Jev's confidence below which the caller's choice stands
    "timeout": 4.0,        # seconds per HTTP call; the hook budget is 10
    "max_state_chars": 6000,
    "advise_prompts": True,
    "route_spawns": True,
    "samples_keep": SAMPLES_KEEP,
}
ROUTES = {
    "openrouter": {"base": "https://openrouter.ai/api", "model": "typesafe/jev-1.13", "env": "OPENROUTER_API_KEY"},
    "typesafe": {"base": "https://api.typesafe.ai", "model": "jev-latest", "env": "TYPESAFE_API_KEY"},
}
MODEL_WORDS = ("haiku", "sonnet", "opus", "fable")
# "use opus", "on sonnet", "com o opus", "usa o haiku", "em fable", "no opus" — an explicit pin
# in the user's own words, in English or Portuguese. Deliberately needs a verb or preposition
# before the name so "am I overusing Opus" does not pin anything.
PIN_RE = re.compile(
    r"\b(?:use|using|with|on|run|spawn|switch to|usa|usar|com|em|no|na|corre|correr|põe|poe|mete)"
    r"\s+(?:the\s+|o\s+|a\s+)?(haiku|sonnet|opus|fable)\b", re.I)


class JevUnavailable(Exception):
    """No key, no network, bad answer: the caller keeps its own decision."""


# --- configuration -------------------------------------------------------------------------

def _read_env_file(path=ENV_FILE):
    values = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def config():
    """Merged settings: DEFAULTS < ~/.claude/model-router/jev.json < environment (JEV_* vars)."""
    cfg = dict(DEFAULTS)
    try:
        cfg.update(json.loads(CONFIG_FILE.read_text()))
    except (OSError, ValueError):
        pass
    if os.environ.get("JEV_THRESHOLD"):
        cfg["threshold"] = float(os.environ["JEV_THRESHOLD"])
    if os.environ.get("JEV_TIMEOUT"):
        cfg["timeout"] = float(os.environ["JEV_TIMEOUT"])
    return cfg


def credentials():
    """(route name, base url, model, key) for the first configured route, else JevUnavailable."""
    env = dict(_read_env_file())
    env.update({k: v for k, v in os.environ.items() if k.endswith("_API_KEY") or k.startswith("JEV_")})
    for name in ("openrouter", "typesafe"):
        r = ROUTES[name]
        key = env.get(r["env"])
        if key:
            base = env.get("JEV_BASE_URL") or r["base"]
            model = env.get("JEV_MODEL") or r["model"]
            return name, base.rstrip("/"), model, key
    raise JevUnavailable("no OPENROUTER_API_KEY or TYPESAFE_API_KEY (env or ~/.claude/model-router/jev.env)")


# --- the call ------------------------------------------------------------------------------

def ask(state, questions, timeout=None):
    """One System One call. Returns (answers, meta) or raises JevUnavailable."""
    route, base, model, key = credentials()
    cfg = config()
    body = json.dumps({"model": model, "state": state, "questions": questions}).encode()
    req = urllib.request.Request(
        f"{base}/v1/systemone", data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "HTTP-Referer": "https://gitlab.com/public-work4/claude-skills",
                 "X-Title": "model-router"})
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout or cfg["timeout"]) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read()[:300].decode(errors="replace")
        raise JevUnavailable(f"HTTP {e.code} from {route}: {detail}") from e
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise JevUnavailable(f"{route}: {e}") from e
    answers = data.get("answers")
    if not isinstance(answers, dict):
        raise JevUnavailable(f"{route}: no answers in response")
    usage = data.get("usage") or {}
    meta = {"route": route, "model": data.get("model", model),
            "latency_ms": round((time.monotonic() - t0) * 1000),
            "input_tokens": usage.get("input_tokens"), "cost_usd": usage.get("cost")}
    record_sample({"model": model, "state": state, "questions": questions}, data, meta, keep=cfg["samples_keep"])
    return answers, meta


def record_sample(request, response, meta, keep=SAMPLES_KEEP, path=SAMPLES):
    """Keep the last `keep` exchanges, verbatim, for checking Jev's answers by eye. Best effort."""
    try:
        try:
            lines = path.read_text().splitlines()
        except OSError:
            lines = []
        lines.append(json.dumps({"ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                                 "request": request, "response": response, "meta": meta}, ensure_ascii=False))
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text("\n".join(lines[-keep:]) + "\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except OSError:
        pass


def samples(path=SAMPLES):
    try:
        return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    except OSError:
        return []


# --- questions ------------------------------------------------------------------------------

def tiers():
    return json.loads((ROOT / "policy" / "tiers.json").read_text())


def spawn_questions(t=None):
    t = t or tiers()
    return {
        "tier": {"type": "choice",
                 "instructions": "The cheapest model tier that does this delegated task well. "
                                 "Judge the task the subagent is being given, not the caller.",
                 "criteria": {k: t["tiers"][k] for k in t["order"]}},
        "judgement": {"type": "score",
                      "instructions": "How much open judgement the task needs.",
                      "criteria": ["Fully specified: the what and where are settled, only the doing remains",
                                   "Bounded judgement inside a given spec, list or lens",
                                   "Open design, architecture, strategy, verification of others' work, or synthesis"]},
        "risky": {"type": "noul",
                  "instructions": "The task changes shared state that is hard to undo.",
                  "criteria": {"true": "It pushes, deploys, deletes, force-writes, pays, sends, or edits production data or config.",
                               "false": "It reads, reports, drafts, or edits local files that a review will catch."}},
    }


def prompt_questions(t=None):
    t = t or tiers()
    return {
        "route": {"type": "choice",
                  "instructions": "Who should do what this prompt asks: the main session itself, or one "
                                  "of these cheaper delegates. Pick a delegate only when the prompt is "
                                  "plainly that kind of work on its own.",
                  "criteria": dict(t["routes"])},
    }


def spawn_state(tool_input, parent_model=None, max_chars=None):
    max_chars = max_chars or config()["max_state_chars"]
    prompt = str(tool_input.get("prompt") or "")
    return {
        "subagent_type": tool_input.get("subagent_type") or "general-purpose",
        "description": tool_input.get("description") or "",
        "requested_model": tool_input.get("model") or "inherit",
        "parent_model": parent_model or "unknown",
        "prompt": prompt[:max_chars] + (" …[truncated]" if len(prompt) > max_chars else ""),
    }


# --- decisions ------------------------------------------------------------------------------

def tier_of(model_name):
    """'claude-opus-5-5' / 'opus' / 'claude-fable-5-1[1m]' -> 'opus' / 'fable'; None if unknown."""
    if not model_name:
        return None
    m = model_name.lower()
    return next((w for w in MODEL_WORDS if w in m), None)


def decide_spawn(tool_input, answers, threshold, requested_default=None, t=None):
    """Return (new_model_or_None, reason). Never proposes fable; never downgrades a risky or
    judgement-heavy task; never acts below the threshold."""
    t = t or tiers()
    order = t["order"]
    tier = answers.get("tier") or {}
    chosen, conf = tier.get("choice"), float(tier.get("confidence") or 0)
    if chosen not in order:
        return None, f"jev answered {chosen!r}, not a tier"
    if conf < threshold:
        return None, f"jev {chosen} at {conf:.2f} < {threshold}: caller's choice stands"
    requested = tier_of(tool_input.get("model")) or requested_default
    if requested is None:
        return chosen, f"jev {chosen} ({conf:.2f}); caller set no model"
    if requested == chosen:
        return None, f"jev agrees: {chosen} ({conf:.2f})"
    if requested in t["never_assign"]:
        return chosen, f"caller asked for {requested}, which a subagent never gets; jev {chosen} ({conf:.2f})"
    downgrade = order.index(chosen) < order.index(requested)
    if downgrade:
        j = answers.get("judgement") or {}
        if float(j.get("score") or 0) >= 1.5 and float(j.get("confidence") or 0) >= threshold:
            return None, f"jev {chosen} ({conf:.2f}) but judgement {j['score']:.1f}: kept {requested}"
        r = answers.get("risky") or {}
        if float(r.get("noul") or 0) >= threshold:
            return None, f"jev {chosen} ({conf:.2f}) but risky {r['noul']:.2f}: kept {requested}"
    return chosen, f"jev {chosen} ({conf:.2f}) over caller's {requested}"


def decide_prompt(answers, threshold, t=None):
    """Return (route_or_None, confidence). None means keep it in the main session."""
    t = t or tiers()
    a = answers.get("route") or {}
    route, conf = a.get("choice"), float(a.get("confidence") or 0)
    if route not in t["routes"] or route == "keep" or conf < threshold:
        return None, conf
    return route, conf


# --- session pins and the log ----------------------------------------------------------------

def session_file(session_id):
    return SESSIONS_DIR / f"{re.sub(r'[^A-Za-z0-9_-]', '_', str(session_id))}.json"


def read_session(session_id):
    try:
        return json.loads(session_file(session_id).read_text())
    except (OSError, ValueError):
        return {}


def write_session(session_id, data):
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = session_file(session_id).with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    os.replace(tmp, session_file(session_id))


def user_pin(prompt):
    m = PIN_RE.search(prompt or "")
    return m.group(1).lower() if m else None


def log_decision(record):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    record = dict(record, ts=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"))
    with open(DECISIONS, "a") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def main_session_model(transcript_path, tail_bytes=200_000):
    """The model of the last assistant turn in a transcript, or None."""
    try:
        with open(transcript_path, "rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            fh.seek(max(0, size - tail_bytes))
            lines = fh.read().decode(errors="ignore").splitlines()
    except OSError:
        return None
    for line in reversed(lines):
        if '"assistant"' not in line:
            continue
        try:
            o = json.loads(line)
        except ValueError:
            continue
        model = (o.get("message") or {}).get("model")
        if o.get("type") == "assistant" and model and model.startswith("claude-"):
            return model
    return None


# --- CLI --------------------------------------------------------------------------------------

def _status():
    try:
        route, base, model, _ = credentials()
        cred = f"{route} ({base}, {model})"
    except JevUnavailable as e:
        cred = f"none: {e}"
    cfg = config()
    return {"credentials": cred, "threshold": cfg["threshold"], "timeout_s": cfg["timeout"],
            "route_spawns": cfg["route_spawns"], "advise_prompts": cfg["advise_prompts"],
            "decisions_log": str(DECISIONS), "samples": str(SAMPLES), "samples_keep": cfg["samples_keep"],
            "env_file": str(ENV_FILE), "config_file": str(CONFIG_FILE)}


def _check():
    state = spawn_state({"subagent_type": "general-purpose", "description": "wait for pipeline",
                         "prompt": "Poll GitLab pipeline 1234 in project x/y every 60s until it finishes and report the state."})
    answers, meta = ask(state, spawn_questions())
    tier = answers.get("tier") or {}
    print(f"ok: {meta['route']} {meta['model']} answered tier={tier.get('choice')} "
          f"(confidence {tier.get('confidence')}) in {meta['latency_ms']} ms, "
          f"{meta.get('input_tokens')} input tokens, cost {meta.get('cost_usd')}")
    return 0 if tier.get("choice") == "haiku" else 2


def _explain(n):
    try:
        lines = DECISIONS.read_text().splitlines()[-n:]
    except OSError:
        print(f"no decisions yet ({DECISIONS})")
        return 0
    for line in lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        head = f"{d.get('ts', '')[:19]} {d.get('event', ''):7}"
        if d.get("event") == "spawn":
            print(f"{head} {d.get('subagent_type', ''):24} {str(d.get('requested')):8} -> "
                  f"{str(d.get('applied')):8} {d.get('reason', '')}  [{d.get('latency_ms', '-')} ms]")
        elif d.get("event") == "prompt":
            print(f"{head} route={d.get('route')} conf={d.get('confidence')} {d.get('reason', '')}"
                  f"  [{d.get('latency_ms', '-')} ms]")
        else:
            print(f"{head} {d.get('reason') or d.get('error', '')}")
    return 0


def _samples(n):
    rows = samples()
    if not rows:
        print(f"no samples yet ({SAMPLES})")
        return 0
    for i, s in enumerate(rows[-n:], 1):
        req, resp, meta = s.get("request", {}), s.get("response", {}), s.get("meta", {})
        print(f"=== sample {i}/{min(n, len(rows))}  {s.get('ts', '')}  {meta.get('route')} {meta.get('model')}  "
              f"{meta.get('latency_ms')} ms  {meta.get('input_tokens')} in  ${meta.get('cost_usd')}")
        print("--- state sent")
        print(json.dumps(req.get("state"), indent=2, ensure_ascii=False))
        print("--- questions sent")
        for name, q in (req.get("questions") or {}).items():
            print(f"  {name} ({q.get('type')}): {q.get('instructions')}")
        print("--- answers")
        for name, a in (resp.get("answers") or {}).items():
            value = a.get("choice", a.get("score", a.get("noul")))
            conf = a.get("confidence")
            probs = a.get("probabilities")
            print(f"  {name}: {value}" + (f"  confidence {conf}" if conf is not None else "")
                  + (f"  {json.dumps(probs)}" if probs else ""))
        print()
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="one live call; exit 0 if Jev is usable and sane")
    ap.add_argument("--explain", nargs="?", const=10, type=int, metavar="N", help="last N decisions")
    ap.add_argument("--samples", nargs="?", const=SAMPLES_KEEP, type=int, metavar="N",
                    help="last N request/response pairs kept for quality checks")
    ap.add_argument("--status", action="store_true", help="configuration without touching the network")
    args = ap.parse_args()
    if args.check:
        try:
            return _check()
        except JevUnavailable as e:
            print(f"unusable: {e}")
            return 1
    if args.explain is not None:
        return _explain(args.explain)
    if args.samples is not None:
        return _samples(args.samples)
    print(json.dumps(_status(), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
