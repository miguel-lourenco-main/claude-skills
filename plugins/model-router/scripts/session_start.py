#!/usr/bin/env python3
"""SessionStart hook: emit policy/ROUTING.md as additionalContext.

Also warns when this machine has not run /model-router:setup, since the subagent default model
cannot ship inside a plugin and has to live in each machine's settings.json.
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

print(json.dumps({
    "hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": policy}
}))
