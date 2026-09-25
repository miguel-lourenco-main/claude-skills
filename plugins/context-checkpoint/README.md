# context-checkpoint

Deliberate context compaction for Claude Code. A `UserPromptSubmit` hook reads the live context
size from the session transcript and, at set moments, injects a note that makes the model decide
in one line whether the context is worth keeping or compacting. The user then runs `/compact`
with the focus the model suggests.

Why: on the workstation this was built on, every compaction over 12 large sessions had fired at
96% of a 1M window (never at a task boundary), each stalling ~2 minutes and summarising in-flight
work; sessions were resumed after a 34-hour pause with 920k of cold-cache context for a prompt
that began "I worked in another session, pull the changes". Nothing in the harness tells the
model how full its context is (no hook carries it, and Fable/Opus 4.7+ do not receive the API's
token warnings), so the model cannot make the call unless something asks it to.

## What it ships

| Component | Purpose |
|---|---|
| `hooks/hooks.json` + `scripts/context_checkpoint.py` | The checkpoint: fires every 15% of context, after ≥ 55 min idle (cold cache), or on a task-boundary prompt; silent below 120k and right after a compaction |
| `scripts/context_checkpoint.py --status` | Current context reading for this cwd's newest session |
| `/context-checkpoint` | The decision criteria, per-machine tuning, and `RATIONALE.md` with the measurements |

## Install on each workstation

```text
/plugin marketplace update claude-skills
/plugin install context-checkpoint@claude-skills
```

Optional per-machine tuning in `~/.claude/context-checkpoint/config.json` (keys in the skill).
No settings are written; state lives in `~/.claude/context-checkpoint/<session>.json`.

## The rule in one line

Size is the wrong variable. Context earns its cost only while the next task depends on it;
the periodic check exists so the question "how much of this do I still need, and is any of it
now wrong?" gets asked at all.
