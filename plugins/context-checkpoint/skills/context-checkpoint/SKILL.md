---
name: context-checkpoint
description: Explains and tunes the context-checkpoint hook — the keep-or-compact note that appears every N% of context, after a long pause, or on a task-boundary prompt — and reads the current context size on demand. Use when the user asks "how full is my context", "should I compact now", "why did the context checkpoint fire", "compact even at a low percentage?", "change the checkpoint step", "turn the checkpoint off", or wants the reasoning behind deliberate (rather than automatic) compaction. NOT for compacting itself (only the user can run /compact) and NOT for model routing or quota (use model-router).
---

# context-checkpoint

Compaction in Claude Code normally happens only when the window is nearly full, at an
arbitrary point mid-task. This plugin makes it a deliberate decision: at set moments a hook
injects a `[context-checkpoint]` note and the model answers, as the first line of its reply,
`Context NN%: keep — <reason>` or `Context NN%: compact — <reason>; suggest /compact <focus>`.
The user runs `/compact`; the model never can.

```bash
CC="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT}"; [ -n "$CC" ] || CC="$HOME/.claude/plugins/marketplaces/claude-skills/plugins/context-checkpoint"
python3 "$CC/scripts/context_checkpoint.py" --status      # current reading for this cwd's newest session
cat "$HOME/.claude/context-checkpoint/config.json" 2>/dev/null || echo "defaults in use"
```

## 1 · Answering the note

The decision is about **relevance and freshness of what is in context, not its size**. Ask,
in order: how much of the context does the next task depend on (closed, committed work is a
candidate for summarising; mid-flight work that needs exact strings or an error trace is not);
is any of it now stale (files changed in another session or by a pull — worse than useless);
is any of it poison (failed paths, loops, notification floods, big dumps already acted on);
is the cache cold anyway (idle ≥ 55 min, model switch), so compacting is nearly free; is a long
autonomous phase about to start that must not hit auto-compact mid-run. Against: precision in
flight, and anything below ~120k, where the summary costs more than it saves. Before
recommending `compact`, make sure decisions and corrections already sit in their durable home
(decision files, run logs, memory), then name what the summary must preserve in the `/compact`
focus. `RATIONALE.md` beside this file carries the measurements behind each rule.

## 2 · Tuning (per machine)

Write `~/.claude/context-checkpoint/config.json`; any key overrides the default:

| key | default | meaning |
|---|---|---|
| `step_pct` | 15 | fire each time the context crosses a new band of this width |
| `cold_minutes` | 55 | idle minutes after which the prompt cache (1h TTL) counts as cold |
| `min_ctx_tokens` | 120000 | never fire below this; post-compaction context is ~55–85k |
| `boundary_min_gap_pct` | 5 | a boundary-looking prompt fires at most once per this many % |
| `window_tokens` | auto | 1M for `[1m]` / 1M-native models in settings, else 200k |
| `boundary_regex` | commit/push/pull/status, "new task", "another session", "vamos agora…" | prompts that mark a task boundary |

To silence it: disable the plugin (`/plugin`), or set `min_ctx_tokens` above the window.

## 3 · What it does not do

It does not compact, does not read the prompt beyond the boundary regex, and never blocks a
prompt: on any error it exits silently. It reads the session transcript's `usage` fields, which
are not a documented interface; if they change, the note stops appearing and `--status` says so.
