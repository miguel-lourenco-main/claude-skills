---
name: product-teardown
description: Tear down a live web app into a replication spec a rebuilder who never sees the original can work from — one extractor agent measures it in the user's Chrome, every claim tagged measured / observed / documented / inferred / unverified and lint-checked. Use when the user wants to recreate an existing product and needs the details written down first: "replicate this app", "clone <app>", "teardown <app>", "recreate <app>", "extract a replication spec from <url>", "reverse-engineer this web app", "study <product> so we can rebuild it". NOT for critiquing your own UI (use ui-adversary), NOT for design-only or marketing-page extraction (use marketing-presentations `extract <url>` or ui-ux-references), NOT for redesign pitches to prospects (use prospect-blueprint), NOT for market-positioning dossiers (use competitor-profiling).
argument-hint: "<url> [survey|full]"
---

# Product teardown

A rebuild from memory of a product fails on the details nobody wrote down: the sixth favorite that
triggers an upsell, the 250 ms fade, the title that ticks in the tab. This skill sends one agent to
measure those details in the live app and writes them as a spec a blind rebuilder can execute.

**Writes** `replication/<slug>/`: `SPEC.md`, `api-map.md`, `assets.md`, `design-tokens.json`,
`PROGRESS.md`, `evidence/` (screenshots, GIFs, probe JSON). **Needs** Claude in Chrome with the user
logged into the target; `full` depth is a ~75 min Opus session. **Policy:** read-only on the target
except user-approved test data (deleted afterwards); media is catalogued, never downloaded; mechanisms
are named, never copied. The skill ends at the spec — `project-genesis` builds from it.

Evidence tags used below: **M** measured · **O** observed · **D** documented · **I** inferred ·
**U** unverified (each `U` has a row in SPEC §11, the unverified register).

## 0 · Resolve paths and preflight

Everything the agent needs is a file; find them first and say what is missing. Each bash block in
this skill is a separate call, so the blocks save their variables to `.pt-env` and re-source it.

```bash
PT="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/product-teardown}"
[ -d "$PT" ] || PT="$HOME/.claude/skills/product-teardown"
for f in references/extractor-briefing.md references/app-gap-list.md scripts/spec-lint.mjs \
         templates/SPEC.template.md templates/api-map.template.md templates/assets.template.md \
         templates/PROGRESS.template.md templates/design-tokens.template.json \
         scripts/probes/dialog-guard.js scripts/probes/dom-inventory.js scripts/probes/media-hook.js \
         scripts/probes/media-sample.js scripts/probes/storage-snapshot.js scripts/probes/title-sampler.js \
         scripts/probes/notification-hook.js scripts/probes/resource-entries.js scripts/probes/tokens.js; do
  [ -f "$PT/$f" ] || echo "MISSING: $f"; done
command -v node >/dev/null || echo "MISSING: node (lint will be skipped)"
# extraction-method.md lives in a sibling plugin: first path = repo checkout layout, second = plugin cache
EM=$(ls "$PT/../../../marketing-presentations/skills/marketing-presentations/references/extraction-method.md" \
       "$HOME"/.claude/plugins/cache/claude-skills/marketing-presentations/*/skills/marketing-presentations/references/extraction-method.md 2>/dev/null | head -1)
printf 'PT=%q\nEM=%q\n' "$PT" "${EM:-NONE}" > "${TMPDIR:-/tmp}/.pt-env"; cat "${TMPDIR:-/tmp}/.pt-env"
```

- Briefing, lint or a template missing → stop and say so; there is no useful fallback.
- `EM=NONE` → continue; the design pass falls back to the tokens probe plus screenshots.
- Load the Chrome tools in ONE ToolSearch call (`select:mcp__claude-in-chrome__tabs_context_mcp,
  mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate`) and run `tabs_context_mcp`.
  No Chrome tools → **degraded mode**: skip §3 and the §4 spot-check; WebFetch the public pages
  (home, pricing, features, help, store listings) yourself and fill the templates with `**Mode:**
  degraded`, the `NOT A LIVE TEARDOWN` banner, and only `D` or `U` behaviour rows. §2 and the lint
  still apply.

## 1 · Scope the teardown with the user

The agent cannot ask questions mid-run, so every choice is made here. If arguments were given
(`<url> [survey|full]`), pre-fill and skip those questions. One `AskUserQuestion` call, each with a
default:

1. **Target URL(s) and slug** — default: the URL given; slug = domain without TLD.
2. **Account tier you hold** — none / free / pro / business. Ask the user to log in to the target in
   Chrome *now*; the agent never types credentials. Not logged in → gated surfaces will be
   `documented-only`; they can log in and re-run later for the rest.
3. **Surfaces or flows that matter** — default: everything reachable.
4. **Depth** — `survey` (~25 min: surfaces, feature inventory, tokens, no GIFs) or `full` (~75 min:
   all probes). Default `full`.
5. **Test writes** — "May the agent create and then delete test data in your account (favorites,
   notes, similar)?" **Default: no** (read-only; every write-flow becomes a `U` row).

Stated, not asked: media is catalogued, never downloaded. Output dir defaults to
`./replication/<slug>/`; if the current directory is not the future rebuild repo, ask where.

## 2 · Seed the output folder

The output folder is the only place this skill writes — never the plugin cache. Screenshots the
browser tools save elsewhere are copied into `evidence/` by the agent.

```bash
. "${TMPDIR:-/tmp}/.pt-env"; SLUG="<slug from §1>"; OUT="${OUT:-$PWD/replication/$SLUG}"
mkdir -p "$OUT/evidence/probes"
for t in SPEC api-map assets PROGRESS; do cp -n "$PT/templates/$t.template.md" "$OUT/$t.md"; done
cp -n "$PT/templates/design-tokens.template.json" "$OUT/design-tokens.json"
printf 'SLUG=%q\nOUT=%q\n' "$SLUG" "$OUT" >> "${TMPDIR:-/tmp}/.pt-env"; ls "$OUT"
```

## 3 · Spawn the extractor

The agent judges only what it can see, like a first-time user, so its prompt must be complete on its
own. Launch **one** background agent, `app-replicator:replication-extractor` (fallback if it cannot
see the Chrome tools: `general-purpose` with `model: opus`; `survey` depth may use `model: sonnet`).
Its prompt is `references/extractor-briefing.md` with every `{{slot}}` filled:

- target URL(s), slug, tier, surfaces, depth, the test-write answer, the user's hints;
- absolute paths: `$OUT`, `$PT/scripts/probes`, `$PT/scripts/spec-lint.mjs`,
  `$PT/references/app-gap-list.md`, and `$EM` (or `NONE`).

While it runs, **do not touch Chrome** — the agent owns the browser. Do other work; do not
pre-announce findings.

## 4 · Audit the spec

The report is the deliverable, but it is checked before it is relayed:

1. `. "${TMPDIR:-/tmp}/.pt-env"; node "$PT/scripts/spec-lint.mjs" "$OUT"` — must exit 0 (no `node`
   → say the lint was skipped).
2. Spot-check **at most three** load-bearing `M` claims live in Chrome (a count, a timing, a token).
   Skipped in degraded mode.
3. Lint failure or a contradicted claim → **one** fix-up round: a fresh agent with the same briefing,
   scoped to the failing IDs, resuming from `PROGRESS.md`. Whatever still fails becomes a `U` row.
   No second round.
4. Read `PROGRESS.md › Test writes`; anything created but not deleted (agent crashed) → offer the
   user the cleanup.

## 5 · Relay and hand off

The user reads one message, so it carries the verdict and the next command. Tell them: the coverage
line (surfaces · features · probes · M/O/D/I/U), the biggest surprises, what is blocked on them
(tier, permissions, logout test), and where the files are. Then print the hand-off as SPEC §12
carries it (fragment — substitute the slug):

```
/project-genesis:genesis seed from replication/<slug>/SPEC.md — v1 = free-tier features (SPEC §3 rows tier=free); pro rows → Planned after v1; non-goals and clean-room rules from §10; assets per assets.md
```

Suggest adding `replication/*/evidence/*.gif` to the rebuild repo's `.gitignore`. Mention that a
`replication-verify` skill (blind-clone fidelity check against spec and original) is planned. The
skill stops here; it never starts the rebuild.

## Notes

- **Cost.** `full` is a ~75 min browser session on Opus by design; use `survey` to size a target.
- **Legal posture.** The spec describes observable behaviour and names mechanisms; it carries no
  brand assets, copy, media or source. Whether a rebuild may ship is the user's call — SPEC §10 lists
  what must be substituted.
- **Prior art** and what was deliberately not adopted: `references/prior-art.md`.
