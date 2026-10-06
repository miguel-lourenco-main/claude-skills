#!/usr/bin/env python3
"""SessionStart hook: emit policy/ROUTING.md as additionalContext.

Adds per-workstation notes when they apply: /model-router:setup has not been run here, or the
bi-weekly usage review is due (see review_state.py for what makes the last analysis invalid), or
no Jev key is configured so the decider hooks fail open.
"""
import json
import os
import sys
from pathlib import Path

root = Path(os.environ.get("CLAUDE_PLUGIN_ROOT", Path(__file__).resolve().parent.parent))
try:
    policy = (root / "policy" / "ROUTING.md").read_text()
except OSError:
    sys.exit(0)  # never break session start over a missing file

settings = Path.home() / ".claude" / "settings.json"
try:
    configured = json.loads(settings.read_text()).get("env", {}).get("CLAUDE_CODE_SUBAGENT_MODEL")
except (OSError, ValueError):
    configured = None
if not configured:
    policy += (
        "\nNote: this machine has not run /model-router:setup, so subagents spawned without a model "
        "inherit the main session's model. Mention this to the user once if you spawn subagents.\n"
    )

try:
    sys.path.insert(0, str(root / "scripts"))
    import jev

    jev.credentials()
except Exception as e:  # no key, or the module failed: routing is advisory-only on this machine
    policy += (
        f"\nNote: the Jev decider is inactive on this machine ({e}). Subagent tiers follow the policy "
        "text above until a key is set (see /model-router:setup). Mention this to the user once.\n"
    )

try:
    import review_state

    status = review_state.check()
    if status["due"]:
        policy += (
            f"\nUsage review due on this workstation: {status['reason']}. Tell the user in one line and "
            "run /model-router:usage-review before starting their first task (it runs on Sonnet and "
            "takes about a minute). If their first request is urgent, run it right after that task.\n"
        )
except Exception:  # a broken record must not break session start; the skill reports it
    pass

print(json.dumps({
    "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": policy}
}))
