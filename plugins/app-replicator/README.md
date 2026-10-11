# app-replicator

Replicate an existing web app from the outside. The `product-teardown` skill studies a live app in
your real Chrome through one extractor agent and writes an evidence-tagged replication spec that a
blind rebuilder can work from: surface map, feature inventory with tier gating, behaviour specs
measured by probes (audio, timers, editors, state, persistence), API map, design tokens and an asset
catalogue (copyrighted media is catalogued, never downloaded). The output is shaped to seed
`project-genesis`. Every claim is tagged measured / observed / documented / inferred / unverified and
checked by a lint.

## Skills

- **product-teardown** (`skills/product-teardown/`) — tear down a live web app into a replication spec.
  Invoke: `/app-replicator:product-teardown <url> [survey|full]`.

## Agents

- **replication-extractor** (`agents/replication-extractor.md`) — runs the briefing in
  `skills/product-teardown/references/extractor-briefing.md` in the user's Chrome; model opus;
  spawned by the skill, not meant to be called by hand.

## Output

`replication/<slug>/` containing:

- `SPEC.md` — the replication spec (sections 0-12, ending in a genesis hand-off)
- `api-map.md` — endpoints and third parties
- `assets.md` — asset catalogue with rebuild sources
- `design-tokens.json` — colours, fonts, sizes, spacing, radii, shadows, motion
- `PROGRESS.md` — pass checklist, test writes, resume note, budget
- `evidence/` — screenshots and probe output the `ev` column points to

## Scripts

- `spec-lint.mjs`: `node skills/product-teardown/scripts/spec-lint.mjs replication/<slug>`
- probes: pasted into the Chrome javascript tool by the agent.

## Policy

- Read-only on the target, except user-approved test writes that are cleaned up afterwards.
- Never types credentials.
- Catalogues media, never downloads it.
- Names mechanisms, never copies source.

## Planned

- **replication-verify** — blind-clone fidelity check.

## Install

```
/plugin marketplace update claude-skills
/plugin install app-replicator@claude-skills
```

Then restart Claude Code.
