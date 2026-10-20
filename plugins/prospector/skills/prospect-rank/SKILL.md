---
name: prospect-rank
description: Rank companies in the Prospector store by website redesign OPPORTUNITY and regenerate leads.md. Use when the user says "rank my leads", "who should I pitch first", "rebuild the leads list", or wants the prioritized call sheet. Ranking is purely by opportunity (0–1, from the audit's taste grade) — there is no composite score.
---

# Prospect · rank

Orders every company by **opportunity** — how much a redesign would help its site (0–1, derived from
the audit's taste grade; not-yet-audited sites get honest priors). Revenue and vertical are shown for
context but do NOT change the ranking. Regenerates `leads.md`.

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/workspace/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
node "$PLUGIN/scripts/rank.mjs" '{"action":"rank"}'
```

Prints `{ranked, top}` and writes `leads.md` (a markdown table ordered by `Opp`). The opportunity
signal lives in `opportunityOf()` in `lib/store.mjs`, so the dashboard and this skill rank identically.
The dashboard ranks live client-side, so this is mainly for the `leads.md` export (run it after a round
of audits/grading).
