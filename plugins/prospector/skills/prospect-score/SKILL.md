---
name: prospect-score
description: Score and rank companies in the Prospector store by lead quality. Use when the user says "score the leads", "rank my prospects", "who should I contact first", or wants the prioritized call sheet. Computes leadScore = money × site-matters × redesign-opportunity (weights from scope) and regenerates leads.md. Real math even in the stub phase.
---

# Prospect · score

Combines three signals into one 0–100 lead score, per the scope's `weights`:

```
leadScore = w.canPay      · normalize(revenue, netIncome)      # can they pay?
          + w.siteMatters · verticalWeight(vertical)           # does the website drive revenue?
          + w.opportunity · audit.taste.opportunity            # how bad is the current site?
```

This is the "money × bad-website × website-actually-matters" intersection, made mechanical. Companies
without an audit get a neutral opportunity prior (lower if they already have a site).

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
node "$PLUGIN/scripts/score.mjs" '{"action":"score"}'
```

Writes `pipeline.leadScore` onto every company and regenerates `leads.md` (a ranked markdown table).
Prints `{scored, top}`. The scoring formula lives in `lib/store.mjs` (`leadScore`, `VERTICAL_WEIGHT`)
so the dashboard and this skill always agree.
