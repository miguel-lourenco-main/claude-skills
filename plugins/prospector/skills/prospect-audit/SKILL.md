---
name: prospect-audit
description: Really audit company websites in the Prospector store — reachability + tech signals + real Playwright screenshots, then the agent grades the visual taste. Use when the user says "audit the websites", "score the sites", "check site quality", or wants the redesign-opportunity rating for one/some/all companies. Writes audits/<id>.website.json. NO fabrication — no-website / unreachable sites get reachable:false and taste:null; captured sites get taste:{pending} until the agent grades the screenshots.
---

# Prospect · audit

A real audit has a **mechanical** phase (a script) and a **judgment** phase (you, the agent, looking at
the screenshots). Nothing is ever fabricated: a site that has no URL or won't load gets
`reachable:false` and `taste:null`; a captured site gets `taste:{pending:true}` until graded.

## Setup (one-time)

Capture needs Playwright (uses the system Google Chrome — no Chromium download):

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$PLUGIN"
```

Re-run after a plugin update (the cache copy's `node_modules` is not preserved).

## Phase 1 — capture (mechanical script)

```bash
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
# specific companies (or omit companyIds to do all):
node "$PLUGIN/scripts/audit.mjs" '{"action":"audit","companyIds":["pt-509812345"]}'
```

Per company it: gates on `digital.hasWebsite`; `probe`s the URL (reachability + real `tech`: https,
viewport/mobile, CMS, last-seen year, domain age via RDAP); on success `capture`s screenshots
(desktop hero + section split, full-page thumbnail, 390px mobile) into `screenshots/<id>/`; writes the
audit with `taste:{pending:true}`. Prints `{audited, unreachable, captureError}`.

## Phase 2 — taste grading (you, the agent)

For each captured-but-ungraded site, **look at the real screenshots and grade them** — this is the part
only a vision-capable agent can do honestly.

```bash
node "$PLUGIN/scripts/pending.mjs"        # → items[] with absolute screenshot paths
```

For each item: **Read** the `thumbnail` + `screenshots` (the actual PNGs), then grade against the
`ui-ux-pro-max` rubric (1=worst … 5=best) on: `visual, typography, layout, modernity, mobile, trust,
conversion`. Derive `opportunity` (0–1 = how much a redesign would help — low taste/old/again-non-mobile
→ high), `datedSignals[]`, `issues[]` (severity/area/note), `effortEstimate` (S/M/L). Combine the tech
signals (no HTTPS, no viewport, ancient CMS/copyright) into your judgement. Then persist:

```bash
node "$PLUGIN/scripts/grade.mjs" '{"companyId":"pt-509812345","taste":{
  "scores":{"visual":2,"typography":2,"layout":3,"modernity":1,"mobile":1,"trust":3,"conversion":2},
  "opportunity":0.86,"effortEstimate":"M",
  "datedSignals":["non-responsive","2018 copyright","stock carousel"],
  "issues":[{"severity":"high","area":"mobile","note":"layout breaks on phones"}]}}'
```

Grade from what you actually see — never guess scores for a site you didn't view. Finally re-rank
(orders leads.md by opportunity): `node "$PLUGIN/scripts/rank.mjs" '{"action":"rank"}'`.

## Contract (next phase)

`tech.lighthousePerf` is left `null` rather than faked — wire a real perf measure later. The capture
section-split + mobile pass live in `lib/capture.mjs`; the reachability/tech probe in `lib/probe.mjs`.
