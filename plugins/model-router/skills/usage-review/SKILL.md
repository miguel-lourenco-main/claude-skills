---
name: usage-review
description: The bi-weekly, per-workstation model-usage review for model-router - measures how this machine's Claude Code sessions split across Haiku, Sonnet, Opus and Fable since the last review, records it, and proposes routing-policy changes. Use when the session-start note says a usage review is due, or when the user asks "run the usage review", "how is the routing doing", "am I still overusing Opus", "analyse my model usage".
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

4. Report to the user in under 15 lines: the three numbers with their change, what is still
   misrouted, and at most three concrete policy or agent changes.
   - Do not edit the plugin yourself. Policy changes belong in the claude-skills repo
     (`plugins/model-router/policy/ROUTING.md` plus a version bump) so every workstation gets them;
     offer to make that change.
