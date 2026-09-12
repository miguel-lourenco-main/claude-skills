# marketing-presentations

Build HTML presentations, decks, report pages, and story pages that feel like high-end
marketing/landing pages: one scrollable single-file page with scroll-driven visual
storytelling and award-site craft — oversized typography, choreographed motion, a
section-by-section persuasion arc — one notch more formal than the sites it learned from.

- **marketing-presentations** — turn presentation content into a "visual script" (the page's
  screenplay, with numbers) and implement it as a self-contained HTML page, self-scored
  against 8 dimensions in bounded verification passes; or extract design knowledge from a
  reference site to grow the skill's knowledge base. Not for app UI, dashboards, or plain
  documents.

## Commands

`/marketing-presentations [build|extract <url>] [content source / target]`

- **build** (default) — reads the content source you name (outline, doc, data, existing
  deck), picks a register (REPORT for formal/data, BRUTALIST for manifesto/ambition,
  EDITORIAL for brand/craft), writes `visual-script.md` next to the deliverable, builds the
  page as one HTML file, then verifies it in the browser: a two-pass walk, a timed hero
  capture, flipbooks over every pin, a hover capture, one batch of fixes, at most one
  confirming pass; scored on eight craft dimensions plus award feel and brand fidelity.
  Desktop 1440×900 first; responsive only on request. A page inside an existing design world
  starts from that world's register and borrows one mechanism, never a whole pole.
- **extract `<url>`** — triages and extracts a reference site (an Awwwards pick, say) into
  `./design-extractions/<slug>/` (or a directory you name), then proposes a merge into the
  knowledge base in your skills checkout: confidence upgrades for confirmed principles, new
  axis poles for divergences, every addition tagged `observed-once` with its source site.
  Validated items are never weakened. Offers, but does not start, the full blind-clone
  validation loop.

## How the knowledge base was built

Nothing in `references/` is taste. It came out of a design-extraction lab that ran three
full cycles, one award site at a time: **extract** the site into a stand-alone spec of prose
and measured numbers → have an implementer who **never saw the original** build a blind
clone from the spec alone → **evaluate** original vs clone in the browser on eight
dimensions, classifying every gap as an extraction gap or an implementation gap. Knowledge
was kept only when the clone passed (overall ≥ 8/10, no dimension < 6).

| Cycle | Site | Register | Blind clone |
|---|---|---|---|
| 1 | HOBRO | dark mono-brutalist agency page | 8.3/10, round 1 |
| 2 | Vero | luxury-editorial serif atelier | 8.6/10, round 1, knowledge-first |
| 3 | State of AI Design | data-editorial report-as-marketing-page | 8.6/10, round 1, knowledge-first |

Cycles 2 and 3 were *knowledge-first*: the clone was attempted from the accumulated knowledge
before any extraction, on a register the knowledge had not seen. Two consecutive passes on
distinct registers is what declared the loop converged and turned the lab output into this
skill.

What ships in `skills/marketing-presentations/references/`:

- `design-principles.md` — 14 cross-validated spine principles + 15 style axes with
  BRUTALIST / EDITORIAL / REPORT pole parameters, each item carrying its confidence tag, and
  Part IV: what a page that belongs to an existing brand world needs beyond craft (an object
  to look at, a stage the reader's hand moves, a boot state, rooms as content + declared
  silence) — validated by building three takes on one product world and juring them on
  award feel and brand fidelity (2026-09-12).
- `visual-script.md` — the authoring guide for the page's screenplay (persuasion arc,
  register choice, per-section spec template, motion as ~6 generator rules, formality dial).
- `implementation.md` — single-file skeleton, three engine patterns, shared components,
  fonts, placeholder media, and the verification checklist the evaluators actually used.
- `extraction-method.md` — the site-triage, browser-handling, structure and motion pass
  checklists, plus the "first pass misses these" list built from real extraction gaps.
- `validation-lab.md` — the extract → blind-clone → evaluate loop, pass bar, eval dimensions,
  and the merge/regression rules (validated files are baselines, never edited).

## Growing it

Run `extract <url>` on a site whose register the axes do not yet cover, and merge what it
finds. For the strongest form of merge run the full loop in `validation-lab.md`: blind clone,
A/B evaluation, at most three refine rounds. A site that confirms existing principles
upgrades their confidence; a site that diverges adds a pole, never a blended midpoint. After
real uses, `skill-retro` appends to `skills/marketing-presentations/FEEDBACK.md`; recurring
friction there is what earns a SKILL.md edit.

## Install

Register this repo's marketplace once per machine, then enable the plugin:

```jsonc
// ~/.claude/settings.json
{
  "extraKnownMarketplaces": {
    "claude-skills": { "source": { "source": "git", "url": "<REMOTE_URL>" } }
  },
  "enabledPlugins": { "marketing-presentations@claude-skills": true }
}
```

Then `/plugin marketplace update` → `/plugin update` → restart. Edit the skill in your
checkout of this repo, never in `~/.claude/plugins/marketplaces/claude-skills/` (the cache).
