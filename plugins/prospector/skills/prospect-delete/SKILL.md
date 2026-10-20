---
name: prospect-delete
description: Delete companies from the Prospector store, including their audit, screenshots, outreach, and dossier. Use when the user says "delete these companies", "remove from the store", "drop these leads", or "clear out the junk". Destructive and intentional — confirm the ids first. Backs the dashboard's 🗑 Delete button.
---

# Prospect · delete

Removes the chosen companies and everything keyed to them (`companies/<id>.json`,
`audits/<id>.website.json`, `screenshots/<id>/`, `outreach/<id>.md`, `dossiers/<id>.md`). Destructive —
there is no undo, so be sure of the ids (the dashboard gates this behind a confirm dialog).

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/workspace/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
node "$PLUGIN/scripts/delete.mjs" '{"action":"delete","companyIds":["loc-some-id","web-other-id"]}'
```

Prints `{deleted, count}` (silently skips ids that are already gone). Also runs from the dashboard (the
🗑 Delete button enqueues the same `delete` action for the loop).
