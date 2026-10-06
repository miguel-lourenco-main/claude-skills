#!/usr/bin/env bash
# Re-verify, after a Claude Code upgrade, that a PreToolUse hook can still change a subagent's
# model (the fact route_spawn.py depends on). Four throwaway Haiku sessions, ~$0.15 in total.
# Usage: scripts/verify_hook.sh [workdir]   -> prints one line per run and "VERIFIED" or "BROKEN".
set -u
W="${1:-$(mktemp -d)}"; mkdir -p "$W"; cd "$W"
run() { # label rewrite-to requested
  cat > "hook_$1.py" <<PY
import json, sys
d = json.load(sys.stdin)
open("$W/$1.log", "a").write(json.dumps(d) + "\n")
if d.get("hook_event_name") == "PreToolUse" and d.get("tool_name") == "Agent" and "$2" != "none":
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow",
                      "updatedInput": dict(d["tool_input"], model="$2")}}))
PY
  cat > "settings_$1.json" <<JSON
{"hooks":{"PreToolUse":[{"matcher":"Agent","hooks":[{"type":"command","command":"python3 $W/hook_$1.py","timeout":10}]}],
 "SubagentStop":[{"hooks":[{"type":"command","command":"python3 $W/hook_$1.py","timeout":10}]}]}}
JSON
  rm -f "$1.log"
  timeout 170 claude -p --model haiku --settings "settings_$1.json" --allowedTools Agent --output-format json \
    "Use the Agent tool exactly once: subagent_type general-purpose, model $3, description 'hook test', prompt 'Reply with the single word PONG and use no tools.' Then reply with the subagent's answer and nothing else." \
    < /dev/null > "$1.out" 2>/dev/null
  ran=$(python3 - "$1.log" <<'PY'
import json, sys
path = next((json.loads(l)["agent_transcript_path"] for l in open(sys.argv[1]) if '"SubagentStop"' in l), None)
model = "?"
if path:
    for l in open(path):
        d = json.loads(l)
        if d.get("type") == "assistant":
            model = d["message"].get("model"); break
print(model)
PY
)
  echo "$1: requested=$3 rewrite=$2 ran_on=$ran"
  echo "$ran"
}
a=$(run rewrite_down haiku sonnet | tail -1); b=$(run rewrite_up sonnet haiku | tail -1)
c=$(run rewrite_opus opus haiku | tail -1); d=$(run no_rewrite none sonnet | tail -1)
if [[ "$a" == *haiku* && "$b" == *sonnet* && "$c" == *opus* && "$d" == *sonnet* ]]; then
  echo "VERIFIED: updatedInput.model is applied on $(claude --version)"; exit 0
else
  echo "BROKEN: the hook no longer changes the model on $(claude --version); set route_spawns=false in ~/.claude/model-router/jev.json"; exit 1
fi
