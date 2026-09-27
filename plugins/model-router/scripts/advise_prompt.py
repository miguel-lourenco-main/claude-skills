#!/usr/bin/env python3
"""UserPromptSubmit hook: record an explicit model pin, and ask Jev whether the prompt is work
for a cheaper delegate.

The main session's model cannot be changed by a hook, so this half is advisory: when Jev is
confident the prompt is ship / status-report / ci-watcher / sysadmin / sweeper / mechanic /
reviewer work, one line of additionalContext names the delegate and rule 7 applies. When Jev
says "keep", is unsure, or is unreachable, nothing is injected. Skipped for slash commands,
short replies, sessions already on Haiku or Sonnet, and when `advise_prompts` is false.

A pin ("use opus", "usa o sonnet") is written to the session file; route_spawn.py honours it on
that turn's spawns and it is cleared on the next prompt that carries no pin.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jev  # noqa: E402

MIN_CHARS = 24
SKIP_RE = re.compile(r"^\s*(/|!|\[context-checkpoint\])")


def advise(data):
    prompt = data.get("prompt") or ""
    session = data.get("session_id")
    pin = jev.user_pin(prompt)
    jev.write_session(session, {"pin": pin})
    if pin:
        jev.log_decision({"event": "pin", "session": session, "reason": f"user pinned {pin}"})

    cfg = jev.config()
    if not cfg.get("advise_prompts", True) or len(prompt) < MIN_CHARS or SKIP_RE.match(prompt):
        return
    main = jev.main_session_model(data.get("transcript_path"))
    if jev.tier_of(main) in ("haiku", "sonnet"):
        return
    state = {"prompt": prompt[: cfg["max_state_chars"]], "main_session_model": main or "unknown"}
    try:
        answers, meta = jev.ask(state, jev.prompt_questions(), timeout=cfg["timeout"])
    except jev.JevUnavailable as e:
        jev.log_decision({"event": "prompt", "session": session, "error": str(e), "reason": "jev unavailable"})
        return
    route, conf = jev.decide_prompt(answers, cfg["threshold"])
    a = answers.get("route") or {}
    jev.log_decision({"event": "prompt", "session": session, "route": route, "jev_route": a.get("choice"),
                      "confidence": a.get("confidence"), "probabilities": a.get("probabilities"),
                      "reason": "advised" if route else "kept in main session", **meta})
    if route:
        target = jev.tiers()["route_agents"].get(route, route)
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": f"[model-router] Jev rates this prompt as {route} work (confidence {conf:.2f}). "
                                 f"Delegate it to {target} (policy rule 7) unless it needs this session's context; "
                                 f"if you keep it here, say why in one line."}}))


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return 0
    try:
        advise(data)
    except Exception as e:
        try:
            jev.log_decision({"event": "prompt", "error": f"{type(e).__name__}: {e}", "reason": "hook error; fail open"})
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
