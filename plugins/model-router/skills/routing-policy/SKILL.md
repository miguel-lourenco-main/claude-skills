---
name: routing-policy
description: The model-routing policy - which model tier (Haiku, Sonnet, Opus, Fable) a piece of work should run on and when to delegate. Use when deciding what model to give a subagent or workflow stage, when the user asks "which model should this use", "route this to a cheaper model", "am I using too strong a model", or when planning a fan-out.
---

# Routing policy

The policy is injected at session start by this plugin's hook. Its single source of truth is
`${CLAUDE_PLUGIN_ROOT}/policy/ROUTING.md`; read that file and apply it.

When the user asks how their usage is split across models, run the analyzer:

```sh
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/analyze.py" --since YYYY-MM-DD [--until YYYY-MM-DD]
```

It reads `~/.claude/projects/**/*.jsonl` locally and prints turns and output tokens per model (main
session vs subagents), how many subagents inherited a top-tier model, and what share of main-session
tool turns were mechanical. Compare two windows to see whether routing changed anything.
