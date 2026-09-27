---
name: routing-policy
description: The model-routing policy - which model tier (Haiku, Sonnet, Opus, Fable) a piece of work should run on, when to delegate, and what the Jev decider did with recent spawns. Use when deciding what model to give a subagent or workflow stage, when the user asks "which model should this use", "route this to a cheaper model", "am I using too strong a model", "why did this spawn run on haiku", or when planning a fan-out.
---

# Routing policy

The policy is injected at session start by this plugin's hook. Its single source of truth is
`${CLAUDE_PLUGIN_ROOT}/policy/ROUTING.md`; read that file and apply it. The tier criteria Jev
sees are `${CLAUDE_PLUGIN_ROOT}/policy/tiers.json`; keep the two consistent when either changes.

To see what the decider did, and why a spawn ran where it did:

```sh
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev.py" --explain 10   # last decisions: requested -> applied, reason, latency
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev.py" --samples 3    # the last exchanges verbatim: what was sent, what came back
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev.py" --status       # key route, threshold, log path (no network)
```

When the user asks how their usage is split across models, run the analyzer:

```sh
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/analyze.py" --since YYYY-MM-DD [--until YYYY-MM-DD]
```

It reads `~/.claude/projects/**/*.jsonl` locally and prints turns and output tokens per model (main
session vs subagents), how many subagents ran on a top-tier model, what share of main-session
tool turns were mechanical, and what the Jev decider did in the window. Compare two windows to
see whether routing changed anything.
