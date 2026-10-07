---
name: decision-model
description: This skill should be used when a decision inside a tool, hook, agent or plugin has a bounded answer space and repeats - "should this be compacted", "is this failure a flake or real", "does this belong on the same branch", "which bucket does this item go in", "gate this before it runs" - or when the user asks to "use Jev for this", "route decisions through the decision model", or "can a cheaper model decide this". Explains what a decision model is good and bad at, how to shape a question, and how to call the shared client. NOT for choosing which Claude tier runs a task: the router's spawn hook already asks Jev that (see routing-policy).
version: 0.1.0
model: sonnet
---

# decision-model

Some questions in this fleet are not writing tasks. They have a fixed answer space, they repeat,
and being wrong costs real time. **Jev** — TypeSafe's "System One" model — answers exactly those:
typed questions about a state, with calibrated probabilities, in ~0.4 s for about $0.00004. It
returns no prose at all, which is its strength here and its whole limitation.

## Use it when all four hold

1. **The answer space is bounded.** Yes/no, one of a named set, or a position on 2–10 described
   levels. If the useful answer is a sentence, this is the wrong model.
2. **It repeats.** A decision taken once a month is cheaper to think about than to wire.
3. **Being wrong is expensive.** A wasted CI cycle, a lost context, a destroyed row.
4. **You can act on a probability.** A calibrated number is the product; if you were going to
   treat 0.51 and 0.99 identically, a cheap classifier or a plain rule will do.

**Do not use it** for: asking which Claude tier runs a task (the router's `PreToolUse` hook
already puts that question to Jev on every Agent spawn, see `routing-policy`; a second call from a
skill or an agent could only disagree with it); anything needing a reason the user will read;
extraction, naming, summarising, or code; and any decision whose answer space you cannot write
down before asking.

## The shape of a good question

Jev cannot explain itself, so a badly worded question returns a confident number with nothing
behind it and no prose to give it away. Three rules:

- **Describe every level in words.** `score` with levels "0 … 4" invites the model to invent a
  meaning. Levels that read "Nothing: it is all recorded elsewhere" … "Critical: in-flight state
  exists only here" are answerable.
- **Put the facts in the state, the judgement in the question.** The state is data — counts,
  names, excerpts. The question is what to make of it.
- **Ask more than one.** A yes/no alone is a coin with a number on it. Add the one or two scores
  that would make you overrule it, and combine them in *your* code (below).

## Grades in, decision out

**The model grades; the caller decides.** Combine the answers with arithmetic you wrote, so the
rule is inspectable, tunable, and reviewable in a diff — and so one answer can veto another.
Worked example, from `context-checkpoint`:

```python
# compact when the yes/no says so AND nothing irreplaceable would be lost
veto = loss_risk > 2.5              # 0-4 scale, described levels
if veto:        verdict = "keep"
elif p_compact >= 0.55: verdict = "compact"
else:           verdict = "keep"
```

That veto is not decoration. On its first real firing Jev answered `P(compact) 0.60` while the
session was mid-edit on an unfinished file; the yes/no alone would have thrown that away.

## Calling it

```bash
echo '{"state": {...}, "questions": {...}}' \
  | python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev_decide.py"
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev_decide.py" --self-test   # is it reachable at all
```

From Python, import the builders instead of hand-rolling JSON: `noul()`, `choice()`, `score()`,
and `value()` / `band()` to read an answer back without knowing its type.

The request itself is the router's own (`scripts/jev.py`, the client behind the spawn hook), so
there is one place this plugin talks to Jev, and one key lookup: the environment, the router's
`~/.claude/model-router/jev.env`, then any other plugin's `jev.env` under `~/.claude`
(`jev.KEY_FILES`), so a key put down for one plugin serves every decision on the machine. The
shared client differs from the hooks in two ways, both on purpose: it never raises, and it does
not write to the router's sample log, which stays about routing. Its wait is `JEV_TIMEOUT_S`
(default 12 s) or the request's `timeout_s`; the hooks' shorter `JEV_TIMEOUT` does not apply here.

**Every caller must have a fallback.** The client returns `{"ok": false, "reason": …}` for a
missing key, a timeout, an outage or a malformed request, and never raises. Branch on `ok`; the
`reason` is a sentence for a log, not a code to match on. A decision that cannot be reached without
Jev is a decision that stops working the day the key expires — degrade to the rule, the heuristic
or the human, and say which one answered.

**Budget the wait.** A hook holding someone's prompt should bound the whole call and skip the
question rather than start one it cannot finish; `context-checkpoint`'s `max_seconds` is the
pattern.

## Where it is wired today

| caller | decision | what it replaced |
|---|---|---|
| `model-router` (spawn hook) | which tier an Agent spawn runs on | policy text the orchestrating model could ignore |
| `model-router` (prompt hook) | is this prompt plainly delegate work | the same |
| `context-checkpoint` | keep or compact this context | the session's own model, judging itself from inside |
| `git-steward:pipeline-health` | flake or real failure, when the tells conflict, before spending a CI cycle | a guess |
| `git-steward:branch-scope` | same branch or a new one, when the rules do not settle it | a habit |
| *(candidate)* | which bucket an ambiguous backlog item goes in | a label rule |

## Additional resources

- **`${CLAUDE_PLUGIN_ROOT}/scripts/jev_decide.py`** — the client, the builders, the contract.
- **`${CLAUDE_PLUGIN_ROOT}/skills/routing-policy/SKILL.md`** — which *Claude* tier runs a task.
  The router asks Jev that itself, in a hook; this skill is for every other decision.
