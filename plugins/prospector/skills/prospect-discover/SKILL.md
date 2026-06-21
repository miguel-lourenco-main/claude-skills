---
name: prospect-discover
description: Discover companies into the Prospector store within the active scope. Use when the user says "find/discover companies", "add prospects", "pull more leads", or wants to grow the candidate pool. Reads scope.json and writes company dossiers (sector, revenue, employees, contacts — not website quality). STUB phase: emits realistic synthetic PT companies; next phase swaps in real source adapters.
---

# Prospect · discover

Adds companies that match the active **scope** to the store. The scope (geography, verticals, revenue
and employee bands, suppression lists) is the query — read it from `scope.json`; edit it with
`prospect-scope` or the dashboard's *Edit scope*.

## Run

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
node "$PLUGIN/scripts/discover.mjs" '{"action":"discover","payload":{"count":5}}'
```

`payload.count` (1–10, default 3) = how many to add; optional `payload.vertical` restricts to one
vertical, otherwise it spans the scope's `verticals`. Prints `{added:[ids], count}`.

## Contract (for the next phase)

Replace the body of `scripts/discover.mjs` with real source adapters (Google Maps for existence +
"no website" signal, Racius for registry identity, einforma/Informa for the revenue filter). Keep the
output shape: one `companies/<id>.json` per company, `id` derived from tax id → domain → name+city,
with `provenance[]` recording which source supplied which field. Do **not** record website quality
here — that belongs to `prospect-audit`. Dedupe/identity-resolution across sources is a separate step.
