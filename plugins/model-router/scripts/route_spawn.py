#!/usr/bin/env python3
"""PreToolUse hook on the Agent tool: let Jev pick the subagent's tier.

Verified on Claude Code 2.1.283 (research/2026-09-27-hook-model-rewrite): returning the whole
tool_input with `model` replaced in `updatedInput` changes the model the subagent runs on, up
or down. Everything here fails open: no key, a timeout, an odd answer, or any exception means
the spawn goes through exactly as the caller wrote it.

Precedence, highest first:
  1. A model the user pinned in this session's last prompt ("use opus") — honoured as written.
  2. A model-router agent (ci-watcher, sweeper, mechanic, reviewer, sysadmin) runs on the model in
     its own frontmatter; a caller's explicit upgrade is undone (rule 2 of the policy). No Jev call.
  3. `fork` inherits the parent and ignores `model`; other plugins' agents (a `:` in the type)
     carry their own frontmatter: both left alone.
  4. Everything else (general-purpose, Explore, Plan, claude, user agents): Jev decides, and its
     answer is applied only above the confidence threshold, never as fable, never as a downgrade
     of a task Jev itself scores as judgement-heavy or risky.
Every decision is appended to ~/.claude/model-router/decisions.jsonl.
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jev  # noqa: E402

PLUGIN = "model-router"


def pinned_agents():
    """{agent name: frontmatter model} for this plugin's own agents."""
    out = {}
    for f in (jev.ROOT / "agents").glob("*.md"):
        try:
            head = f.read_text().split("---", 2)[1]
        except (OSError, IndexError):
            continue
        name = re.search(r"^name:\s*(\S+)", head, re.M)
        model = re.search(r"^model:\s*(\S+)", head, re.M)
        if name and model:
            out[name.group(1)] = model.group(1)
    return out


def emit(tool_input, model, note):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "permissionDecision": "allow",
        "updatedInput": dict(tool_input, model=model),
        "additionalContext": f"[model-router] {note}"}}))


def route(data):
    tool_input = data.get("tool_input") or {}
    kind = tool_input.get("subagent_type") or "general-purpose"
    requested = tool_input.get("model")
    base = {"event": "spawn", "session": data.get("session_id"), "subagent_type": kind,
            "description": tool_input.get("description"), "requested": requested or "inherit"}

    pin = jev.read_session(data.get("session_id")).get("pin")
    if pin:
        if requested and jev.tier_of(requested) != pin:
            emit(tool_input, pin, f"the user pinned {pin} for this turn; {kind} runs on {pin}")
            jev.log_decision(dict(base, applied=pin, reason="user pin"))
        else:
            jev.log_decision(dict(base, applied=None, reason=f"user pin {pin}; caller already there"))
        return

    if kind == "fork":
        jev.log_decision(dict(base, applied=None, reason="fork inherits the parent"))
        return
    if ":" in kind:
        plugin, name = kind.split(":", 1)
        pins = pinned_agents() if plugin == PLUGIN else {}
        if name in pins:
            want = pins[name]
            if requested and jev.tier_of(requested) != want:
                emit(tool_input, want, f"{kind} is pinned to {want} (its frontmatter); the caller's "
                                       f"{requested} was undone. Escalate only after a {want} result failed (rule 5).")
                jev.log_decision(dict(base, applied=want, reason="pinned agent; caller's model undone"))
            else:
                jev.log_decision(dict(base, applied=None, reason=f"pinned agent on {want}"))
            return
        jev.log_decision(dict(base, applied=None, reason="another plugin's agent; its frontmatter decides"))
        return

    cfg = jev.config()
    if not cfg.get("route_spawns", True):
        return
    parent = jev.main_session_model(data.get("transcript_path"))
    state = jev.spawn_state(tool_input, parent_model=parent, max_chars=cfg["max_state_chars"])
    try:
        answers, meta = jev.ask(state, jev.spawn_questions(), timeout=cfg["timeout"])
    except jev.JevUnavailable as e:
        jev.log_decision(dict(base, applied=None, error=str(e), reason="jev unavailable; caller's choice stands"))
        return
    default = jev.tier_of(os.environ.get("CLAUDE_CODE_SUBAGENT_MODEL")) or jev.tier_of(parent)
    model, reason = jev.decide_spawn(tool_input, answers, cfg["threshold"], requested_default=default)
    tier = answers.get("tier") or {}
    rec = dict(base, applied=model, reason=reason, jev_tier=tier.get("choice"),
               confidence=tier.get("confidence"), probabilities=tier.get("probabilities"),
               judgement=(answers.get("judgement") or {}).get("score"),
               risky=(answers.get("risky") or {}).get("noul"), **meta)
    jev.log_decision(rec)
    if model:
        emit(tool_input, model, f"Jev routed this {kind} spawn to {model}: {reason}.")


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    if data.get("tool_name") != "Agent":
        return 0
    try:
        route(data)
    except Exception as e:  # a hook must never break a spawn
        try:
            jev.log_decision({"event": "spawn", "error": f"{type(e).__name__}: {e}", "reason": "hook error; fail open"})
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
