---
name: context-checkpoint
description: Explains and tunes the context-checkpoint hook — the keep-or-compact verdict that appears every N% of context, after a long pause, or on a task-boundary prompt — and reads the current context size on demand. Use when the user asks "how full is my context", "should I compact now", "why did the context checkpoint fire", "what did the digest say", "why did Jev say keep", "compact even at a low percentage?", "change the checkpoint step", "turn the digest or the decider off", "turn the checkpoint off", or wants the reasoning behind deliberate (rather than automatic) compaction. NOT for compacting itself (only the user can run /compact) and NOT for model routing or quota (use model-router).
---

# context-checkpoint

Compaction in Claude Code normally happens only when the window is nearly full, at an arbitrary
point mid-task. This plugin makes it a deliberate decision. At set moments a hook digests what is
actually in context, has that digest graded, and injects the verdict; the session's model states
it as the first line of its reply — `Context NN%: keep — <reason>` or
`Context NN%: compact — <reason>; suggest /compact <focus>`. The user runs `/compact`; the model
never can.

```bash
CC="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT}"; [ -n "$CC" ] || CC="$HOME/.claude/plugins/marketplaces/claude-skills/plugins/context-checkpoint"
python3 "$CC/scripts/context_checkpoint.py" --status     # context, decider, digest model, biggest dumps
python3 "$CC/scripts/context_checkpoint.py" --dry-run    # run the whole chain now, print what the hook would emit
cat "$HOME/.claude/context-checkpoint/config.json" 2>/dev/null || echo "defaults in use"
```

## 1 · The four stages

Each is cheaper than the one after it, and each degrades to the one before.

| # | stage | cost | what it produces |
|---|---|---|---|
| 0 | **Gate** — band crossing, cold cache, task-boundary prompt | free, local | whether to spend anything at all. Nothing below 120k, nothing right after a compaction |
| 1 | **Inventory** — one pass over the transcript since the last compaction | free, local | turns, tool-call histogram, the largest one-shot dumps *named*, files touched, errors, recent prompts |
| 2 | **Digest** — a cheap model reads the inventory and the recent exchanges | ~1 s, ~$0.0003 | five lines: **in flight / closed / stale / poison / next needs**. This is what the console shows |
| 3 | **Decision** — Jev grades that digest | ~0.5 s, ~$0.00004 | `P(compact)`, `relevance` 0–4, `loss_risk` 0–4, each with calibrated probabilities |

**Jev grades; the hook decides.** `verdict()` combines the three answers by arithmetic, so the
rule is inspectable and tunable rather than a model's mood: compact when `P(compact) ≥ compact_at`
**and** `loss_risk ≤ loss_veto`. The veto is the important half — a context whose in-flight state
exists nowhere else is kept however confident the yes/no was, because losing it costs a
re-derivation while keeping it costs only window. Jev is a decision model: it answers typed
questions with probabilities and writes no prose, which is why stage 2 exists at all.

With no key, a failed call or a timeout, the note falls back to the criteria below and the
session's own model makes the call — which is what this plugin did before stages 2 and 3 existed.

## 2 · Answering the note

The verdict is **advisory**: it is graded from a digest, and the digest cannot see what you are
about to do. Agree and state it, or disagree and say why — that the next task needs detail the
digest does not mention is a good reason, and the only one that outranks a `compact`.

The decision is about **relevance and freshness of what is in context, not its size**. Ask, in
order: how much of the context does the next task depend on (closed, committed work is a
candidate for summarising; mid-flight work that needs exact strings or an error trace is not);
is any of it now stale (files changed in another session or by a pull — worse than useless); is
any of it poison (failed paths, loops, notification floods, big dumps already acted on); is the
cache cold anyway (idle ≥ 55 min, model switch), so compacting is nearly free; is a long
autonomous phase about to start that must not hit auto-compact mid-run. Against: precision in
flight, and anything below ~120k, where the summary costs more than it saves. Before recommending
`compact`, make sure decisions and corrections already sit in their durable home (decision files,
run logs, memory), then name what the summary must preserve in the `/compact` focus.
`RATIONALE.md` beside this file carries the measurements behind each rule.

## 3 · Tuning (per machine)

Write `~/.claude/context-checkpoint/config.json`; any key overrides the default:

| key | default | meaning |
|---|---|---|
| `step_pct` | 15 | fire each time the context crosses a new band of this width |
| `cold_minutes` | 55 | idle minutes after which the prompt cache (1h TTL) counts as cold |
| `min_ctx_tokens` | 120000 | never fire below this; post-compaction context is ~55–85k |
| `boundary_min_gap_pct` | 5 | a boundary-looking prompt fires at most once per this many % |
| `window_tokens` | auto | 1M for `[1m]` / 1M-native models in settings, else 200k |
| `boundary_regex` | commit/push/pull/status, "new task", "another session", "vamos agora…" | prompts that mark a task boundary |
| `digest` | `true` | `false` sends the raw inventory to the decider and prints no summary |
| `digest_via` | `auto` | `api` (one HTTPS call, ~1 s), `cli` (`claude -p`, no cash but ~24 s, almost all of it process start-up), `auto` = api when a key resolves |
| `digest_api_model` | `google/gemini-2.5-flash-lite` | any OpenRouter chat model; 1M context, ~$0.0003 a digest |
| `digest_model` | `haiku` | the model the `cli` path passes to `claude -p` |
| `digest_chars` | 9000 | how much recent conversation the digest model is shown (tool *results* are never included — they are the bulk being characterised) |
| `decider` | `auto` | `jev` or `auto` (jev when a key resolves); anything else leaves the call to the session model |
| `jev_model` / `jev_url` | `jev-latest` / OpenRouter `/systemone` | the decision model and its endpoint |
| `compact_at` | 0.55 | `P(compact)` at or above this, with the veto clear, means compact |
| `loss_veto` | 2.5 | `loss_risk` (0–4) above this keeps the context whatever `P(compact)` says |
| `digest_timeout_s` / `jev_timeout_s` | 35 / 12 | per-stage budgets; a timeout degrades, never blocks |

**The key.** Read from `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY` or `JEV_API_KEY` in the
environment, else from `~/.claude/context-checkpoint/jev.env` or the model-router plugin's
`jev.env`, as `NAME=value`. Keep it out of any working tree: a marketplace checkout is a git repo,
and the monorepo's `.gitignore` covers `*.env` for exactly this reason.

To silence the whole thing: disable the plugin (`/plugin`), or set `min_ctx_tokens` above the
window. To keep the checkpoint but stop spending: `"digest": false, "decider": "model"`.

## 4 · What it does not do

It does not compact. It does not read the prompt beyond the boundary regex and a 400-character
excerpt sent to the decider. It never blocks a prompt: every stage is timeboxed and any error
exits silently. It reads the session transcript's `usage` fields, which are not a documented
interface; if they change, the note stops appearing and `--status` says so.
