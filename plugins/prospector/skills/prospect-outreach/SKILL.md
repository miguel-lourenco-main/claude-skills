---
name: prospect-outreach
description: Draft outreach for selected companies in the Prospector store. Use when the user says "write outreach", "draft the cold email", "prep the pitch", or wants contact-ready material for specific leads. Writes outreach/<id>.md (a PT email draft seeded from the audit's dated signals) and flips status to outreach-ready. STUB phase: skeleton draft; next phase composes a real spec mockup + humanized copy.
---

# Prospect · outreach

Generates a per-company outreach draft, seeded from the audit (its dated signals become the hook), and
marks the company `outreach-ready`.

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
node "$PLUGIN/scripts/outreach.mjs" '{"action":"outreach","companyIds":["pt-509812345"]}'
```

Writes `outreach/<id>.md` for each id; prints `{written:[ids], count}`.

## Contract (for the next phase)

The highest-converting tactic is a **speculative homepage mockup** + a non-AI-sounding email. Compose
with existing skills: `ui-ux-pro-max` / `ui-ux-director` to render a redesigned hero from the audit's
issues, and `humanizer` to clean the copy. Keep the output under `outreach/<id>.md` and keep updating
`pipeline.status`. Respect the scope's suppression lists (don't draft for already-contacted leads).
