---
name: prospect-audit
description: Audit company websites in the Prospector store — capture + taste analysis producing a quality/opportunity score. Use when the user says "audit the websites", "score the sites", "check site quality", or wants the redesign-opportunity rating for one/some/all companies. Writes audits/<id>.website.json (tech signals + taste scores + opportunity). STUB phase: placeholder audit; next phase = real screenshots + vision taste pass.
---

# Prospect · audit

Produces a website audit per company: cheap **technical** signals (HTTPS, mobile-friendly, performance,
CMS/template age) and subjective **taste** scores (visual, typography, modernity, mobile, conversion),
combined into an `opportunity` (0–1) = how much a redesign would move the needle.

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
# specific companies:
node "$PLUGIN/scripts/audit.mjs" '{"action":"audit","companyIds":["pt-509812345"]}'
# or omit companyIds to audit every company in the store
node "$PLUGIN/scripts/audit.mjs" '{"action":"audit"}'
```

Prints `{audited:[ids], count}`. Re-running re-audits (overwrites the record).

## Contract (for the next phase)

Two real skills replace the stub: **capture** (Playwright — prime lazy-load, find section seams from
DOM sectioning elements + background-color transitions, merge tiny / split tall slices, cap to hero +
~6 sections + footer, plus a full-page thumbnail and a 390px mobile pass) and **taste** (feed those
frames to a vision pass scoring against the `ui-ux-pro-max` rubric). Keep the output shape:
`audits/<id>.website.json` with `tech`, `screenshots`, and `taste{scores,overall,datedSignals,issues,opportunity,effortEstimate}`.
Screenshots go under `screenshots/<id>/`.
