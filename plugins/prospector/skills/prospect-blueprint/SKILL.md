---
name: prospect-blueprint
description: Full redesign blueprint for a website you've DECIDED to redesign — deep-capture every key page (desktop+mobile screenshots, rendered code, design tokens, forms, runtime errors, interactions), study how the site actually looks and works, then write a solutions-and-implementation plan a human or an agent can execute. Use when the user says "make a redesign plan for <company/site>", "blueprint this website", "deep audit + improvement plan", "capture everything about this site and plan the rebuild", or to drain queued `blueprint` requests. Composes prospect-audit (taste grade) + prospect-deepdive (business dossier) + a multi-page capture crawler; writes blueprints/<id>/blueprint.md. NOT for scoring leads (use prospect-audit) or deciding IF a redesign is worth pitching (use prospect-hunt).
---

# Prospect · blueprint (redesign deep-dive + implementation plan)

The audit answers *"is this site bad enough to pitch?"*. The blueprint answers *"we're doing it —
what exactly is wrong, what do we build instead, and in what order?"*. It has three halves:

1. **Capture** (mechanical) — a crawler records everything measurable about the site.
2. **Study** (you) — you look at ALL of it until you genuinely understand how the site looks,
   works, and fails. **Accuracy is the whole point**: every claim in the blueprint must trace to
   something captured or observed. Never pad the issue list with generic possibilities.
3. **Plan** (you) — web-dev + UI/UX expertise turns each issue into a concrete solution and the
   solutions into an ordered implementation plan.

## 0 · Setup

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$PLUGIN" >/dev/null 2>&1 || true
```

Entry points:
- **Direct, by company**: resolve the id — `node "$PLUGIN/scripts/find.mjs" '{"q":"<name or domain>"}'`.
- **Direct, by URL** (site not in the store): pass `{"url":"https://…"}` — artifacts land under the
  domain as id.
- **Queued** (dashboard/API): `node "$PLUGIN/scripts/blueprint-pending.mjs"` → items with `reqId`;
  resolve each when done (step 5).

## 1 · Foundations (reuse, don't redo)

A blueprint stands on the two cheaper artifacts. Bring them up to date first:

- **Audit + grade** — if `find.mjs` shows no fresh graded audit:
  `node "$PLUGIN/scripts/audit.mjs" '{"action":"audit","companyIds":["<id>"]}'`, then grade the
  screenshots per **prospect-audit** (its rubric + `grade.mjs`). The taste grade anchors severity.
- **Dossier** — if `hasDossier:false`, run the **prospect-deepdive** research (who they are, what they
  sell, reviews, competitors, decision-maker). The plan must serve the BUSINESS: a restaurant blueprint
  that ignores booking, or a clinic one that ignores trust signals, is malpractice. For a bare-URL run
  (no store company), a quick WebSearch pass on the business stands in for the dossier.

## 2 · Deep capture (mechanical)

```bash
node "$PLUGIN/scripts/blueprint.mjs" '{"companyId":"<id>"}'          # or '{"url":"https://…"}'
# knobs: PROSPECTOR_BP_PAGES (default 8 pages), PROSPECTOR_BP_LINKCHECK (default 40 links)
```

It crawls the homepage + nav + sitemap pages (up to the cap) and writes under
`$PROSPECTOR_ROOT/blueprints/<id>/`:

- `pages/<slug>/desktop-N.png` + `mobile-N.png` — full-page tiles of EVERY crawled page, both viewports
- `pages/<slug>/mobile-menu.png` — the opened hamburger nav (when it found one; home page)
- `pages/<slug>/dom.html` — the **rendered** (post-JS) DOM per page, for code-level review
- `capture.json` — per page: SEO/meta, headings + landmarks, forms (fields, submit), image alt
  coverage, unlabeled inputs, word counts, link counts, load ms, console errors, failed requests,
  request count + transfer weight; site-wide: fonts, color palette, JS libraries, tech probe
  (CMS, HTTPS, domain age, analytics…), broken internal links

Everything in it is **measured** — trust it over your assumptions, and flag anything that looks off.

## 3 · Study — understand the site before judging it

This is where blueprints earn accuracy. Budget real effort here:

- **Read `capture.json` first** — it's the map: pages, tech, errors, forms, broken links.
- **Read the screenshots — all pages, desktop AND mobile**, not just the hero. Note per page what
  works, what's dated, what's broken; compare pages for inconsistency (fonts/colors drifting between
  pages is itself a finding — check `site.fonts`/`site.colors` sprawl).
- **Read `dom.html`** for the key pages: semantic structure (heading order, landmarks), inline-style
  soup vs. classes, table layouts, framework leftovers, hidden content, embedded trackers.
- **Walk the flows a customer would**: how do you book / order / contact / find prices / find opening
  hours? Count the steps; note where each flow dead-ends. The forms inventory in `capture.json` tells
  you what exists — judge whether it's findable and usable.
- **Interact where the capture can't answer**: if something material is unclear (does the form submit?
  does the carousel work? what does the 404 look like?), verify it — WebFetch the endpoint, or run a
  one-off Playwright check via `node -e` reusing `$PLUGIN/lib/capture.mjs` helpers. Don't guess.
- Cross-reference the **audit grade** (taste issues) and the **dossier** (what reviews complain about,
  what competitors' sites do better — fetch 1–2 competitor sites for comparison if the dossier names them).

## 4 · Plan — the blueprint document

Bring design expertise to bear: consult **`ui-ux-pro-max`** (style/palette/typography/UX rules for the
product type) and, if available, **`ui-ux-director`**/`ui-ux-references` for real-world reference
quality. Then write `blueprints/<id>/blueprint.md`:

```markdown
# Redesign blueprint — <Company>
**Site:** <url> · **Captured:** <date> · **Pages studied:** N desktop+mobile · **Taste:** <overall>/5 · **Opportunity:** <0–1>
**Verdict in one line:** <the summary you'd tell the client>

## 1 · The site today (accurate capture)
Site map of crawled pages + what each is for. Tech stack (CMS, JS libs, hosting signals). How the
key flows work TODAY, step by step. What already works well (keep-list — a redesign that throws
away what works is a regression).

## 2 · Issue register
One row per issue, each traceable to evidence:
| # | Severity | Area | Issue | Evidence |
severity: critical (loses customers now) / high / medium / low.
area: ux-flow · visual · content · mobile · performance · seo · accessibility · code · trust.
Evidence = the file/measurement that shows it (pages/menu/mobile-2.png, capture.json consoleErrors…).

## 3 · Redesign direction
The target: IA (proposed page structure), visual system (style, palette, typography — per
ui-ux-pro-max guidance for this product type), content plan (what's missing/what to rewrite),
and the recommended stack (honor the client's constraints; justify the choice in one paragraph —
e.g. keep WordPress + new theme vs. rebuild static — including how the site will be maintained).

## 4 · Solutions
For each issue (or coherent group): the fix, why it works, and its acceptance criteria. Reference
the issue numbers. Design solutions concretely ("booking CTA fixed in the mobile header, one tap to
the form") — not aspirationally ("improve conversion").

## 5 · Implementation plan
Ordered phases (e.g. 0 quick-wins on the live site · 1 foundation · 2 pages · 3 content/SEO ·
4 launch). Each task: what / issues it resolves / acceptance criteria / effort (S/M/L) /
dependencies. Written so EITHER a developer or an agent can pick up any task cold. End with a
launch checklist (redirects, analytics, forms tested, mobile pass, perf budget, a11y pass).

## 6 · Open questions for the client
Only what genuinely blocks or reshapes the work (branding assets? booking system contract? content
ownership? budget for photography?).
```

Ground rules: every issue cites evidence; every solution maps to issues; every phase-task maps to
solutions. If the capture failed on something (a page errored, mobile pass missing), say so in §1
instead of writing around it.

## 5 · Resolve + surface

- Queued request → `node "$PLUGIN/scripts/blueprint-resolve.mjs" '{"reqId":"<reqId>","summary":"blueprint for <name>: N issues, M phases"}'`
- Tell the user the one-line verdict, the top 3 critical issues, and where the blueprint lives.

## Notes

- **Agent-only**: the watch-loop skips `blueprint`; a Claude session or the agent-runner drains it.
- Re-running `blueprint.mjs` recaptures `pages/` + `capture.json` but leaves an existing
  `blueprint.md` alone — refresh the capture freely, rewrite the plan deliberately.
- Cost: this is the expensive skill by design (a crawl + reading ~50+ images). Don't use it to
  qualify leads — that's prospect-audit/hunt's job; blueprint is for committed work.
- Bash sandbox blocks Playwright/Chrome — run `blueprint.mjs` with sandbox disabled (loopback-safe,
  same as audit capture).
