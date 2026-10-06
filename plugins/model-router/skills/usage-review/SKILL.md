---
name: usage-review
description: The bi-weekly, per-workstation model-usage review for model-router - measures how this machine's Claude Code sessions split across Haiku, Sonnet, Opus and Fable since the last review, what the Jev decider did, records it, and proposes routing-policy changes. Use when the session-start note says a usage review is due, or when the user asks "run the usage review", "how is the routing doing", "am I still overusing Opus", "analyse my model usage".
model: sonnet
---

# Usage review (every 14 days, on each workstation)

Each workstation keeps its own record in `~/.claude/model-router/usage-review.json`. A review is due
when that record is missing, unreadable, from an older analyzer, from another host, dated in the
future, or 14+ days old.

1. Check the status:

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/review_state.py"
   ```

   If it is not due and the user did not ask for a review, say when the next one is due and stop.

2. Run and record the analysis. The window starts where the previous recorded analysis ended, or 14
   days back on a first run:

   ```sh
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/analyze.py" --record
   ```

   On a workstation's first review, also pass `--since` with the date model-router was installed there,
   if the user knows it, so the numbers only cover routed sessions.

3. Read the output and judge it against the targets: subagents on Opus/Fable under 20%, subagent
   turns on Sonnet/Haiku above 30%, and the main-session mechanical share trending down.
   - Use the "spawns that ran top-tier" list to name concrete work that should have gone to a
     `model-router:*` agent or carried an explicit `model`.
   - Use the change since the previous analysis to say whether things are improving.
   - If the window has almost no sessions, say the sample is too small to judge.

4. Judge the Jev decider from its line in the output and from
   `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev.py" --explain 30`:
   - "failed open" close to "spawns seen" means no key or a dead route: point at `/model-router:setup`.
   - a re-tiered share near zero with many spawns means the orchestrator already routes well, or the
     threshold is too high; a high "guarded" count means Jev wanted to downgrade judgement-heavy work
     and was stopped, which is the guard doing its job.
   - if a re-tiered spawn produced a result the session then had to redo on a higher tier, name it:
     that is the case for raising `threshold` in `~/.claude/model-router/jev.json`.
   - read `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/jev.py" --samples` (the last 10 exchanges,
     verbatim) and say whether the answers look right for what was sent: a tier that disagrees
     with the prompt's own words, or a confidence that does not match the spread of the
     probabilities, is a finding about the questions in `policy/tiers.json`, not about the caller.
5. Report to the user in under 15 lines: the three numbers with their change, what is still
   misrouted, and at most three concrete policy or agent changes.
   - Do not edit the plugin yourself. Policy changes belong in the claude-skills repo
     (`plugins/model-router/policy/ROUTING.md` plus a version bump) so every workstation gets them;
     offer to make that change.
