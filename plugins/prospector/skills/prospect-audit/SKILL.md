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
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/workspace/personal/projects/claude-skills/plugins/prospector}"
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
viewport/mobile, CMS, last-seen year, domain age via RDAP, page title, meta-description/OG/structured-
data presence, analytics, HTML weight); on success `capture`s screenshots (desktop + mobile full-page
tiles) into `screenshots/<id>/` while measuring runtime signals (load ms, JS libraries, console errors,
failed requests, request count, transfer weight); writes the audit with `taste:{pending:true}`.
Prints `{audited, unreachable, skipped, captureError}`.

**Freshness guard:** a company whose audit is already **graded** and newer than 30 days is **skipped**
(re-auditing would wipe the grade back to pending). Override per run with `"force":true` (always
re-audit) or `"maxAgeDays":N` (custom window). Ungraded/pending/unreachable audits always re-run.

## Phase 2 — taste grading (you, the agent)

For each captured-but-ungraded site, **look at the real screenshots and grade them** — this is the part
only a vision-capable agent can do honestly.

```bash
node "$PLUGIN/scripts/pending.mjs"        # → items[] with absolute screenshot paths
```

For each item: **Read** the `thumbnail` + `screenshots` (the actual PNGs), then grade against the
`ui-ux-pro-max` rubric (1=worst … 5=best) on: `visual, typography, layout, modernity, mobile, trust,
conversion`. Calibrate honestly:

- **1–2** = visibly broken or ~10+ years dated (fixed-width, clip-art, unstyled, unreadable);
  **3** = works but generic/tired; **4** = solid modern template; **5** = genuinely well-designed.
  Most small-business sites are 2–4 — don't cluster everything at 2.
- Score `mobile` from the **mobile tiles**, not by squinting at desktop. No mobile tiles captured +
  `mobileFriendly:false` in tech = strong evidence, but say what you saw.
- Every `issues[]` entry should name evidence you actually saw ("hero text overlaps nav on mobile-1"),
  not generic possibilities. The tech signals (no HTTPS, no viewport, ancient CMS/copyright,
  console errors, failed requests, heavy pageBytes, slow loadMs) feed the judgement too.

Derive `opportunity` (0–1 = how much a redesign would help — low taste/old/non-mobile → high),
`datedSignals[]`, `issues[]` (severity/area/note), `effortEstimate` (S/M/L), and a one-line `summary`
(the verdict you'd tell the client — it's reused in dossiers and outreach). Then persist:

```bash
node "$PLUGIN/scripts/grade.mjs" '{"companyId":"pt-509812345","taste":{
  "scores":{"visual":2,"typography":2,"layout":3,"modernity":1,"mobile":1,"trust":3,"conversion":2},
  "opportunity":0.86,"effortEstimate":"M",
  "summary":"2012-era fixed-width template, broken on mobile, no booking path",
  "datedSignals":["non-responsive","2018 copyright","stock carousel"],
  "issues":[{"severity":"high","area":"mobile","note":"layout breaks on phones (mobile-1/2)"}]}}'
```

(The script validates: scores clamp to 1–5, opportunity to 0–1.) Grade from what you actually see —
never guess scores for a site you didn't view. Finally re-rank (orders leads.md by opportunity):
`node "$PLUGIN/scripts/rank.mjs" '{"action":"rank"}'`.

## Contract (next phase)

`tech.lighthousePerf` is left `null` rather than faked — wire a real perf measure later. The tiling
capture + runtime observers live in `lib/capture.mjs`; the reachability/tech probe in `lib/probe.mjs`.

**Going deeper:** the audit is the quick screener (homepage-only, one grade). When a redesign is
already decided and you need the full picture — every key page, code, interactions, an issue register
and an implementation plan — use **`prospect-blueprint`** instead of stretching the audit.
