---
name: prospect-shortlist
description: Mark/unmark companies in the Prospector store as potential clients (shortlist). Use when the user says "shortlist these", "save as a potential client", "mark as a prospect", "star this company", or "remove from my shortlist". Sets pipeline.shortlisted; the dashboard shows a ★ and a "Shortlisted only" filter. Backs the dashboard's ★ Shortlist button + per-row star.
---

# Prospect · shortlist

Flags companies as **potential clients** to come back to — orthogonal to their pipeline `status`. It's the
"save this one to dig into later" marker; pair it with `prospect-deepdive` for the ones worth researching.

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
# add to shortlist:
node "$PLUGIN/scripts/shortlist.mjs" '{"action":"shortlist","companyIds":["web-regional-pt"],"payload":{"value":true}}'
# remove from shortlist:
node "$PLUGIN/scripts/shortlist.mjs" '{"action":"shortlist","companyIds":["web-regional-pt"],"payload":{"value":false}}'
```

Sets `pipeline.shortlisted` on each id; prints `{changed, count, value}`. `payload.value` defaults to true.
Also runs from the dashboard (the ★ button / row star enqueue the same `shortlist` action for the loop).
