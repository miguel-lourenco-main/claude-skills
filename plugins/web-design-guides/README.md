# web-design-guides

A web-designer agent and four knowledge skills distilled from
[Lovable's public guides](https://lovable.dev/guides). All 291 guides were triaged. 47 carry
transferable design rules and are kept; the rest are app comparisons, business plans and tool
listicles. Rules are paraphrased, and a statistic is kept only when the guide names its source.

## What's inside

| Component | Job |
|---|---|
| **agent `web-designer`** | Plans a site or page, audits a URL/code/screenshot with severity-ranked findings, or answers a design question. Every decision is tagged with the skill rule behind it. Loads skills lazily. `model: sonnet` by default; edit the frontmatter to `inherit` for harder briefs. |
| **skill `site-architecture-navigation`** | Structure type by content volume, menu pattern choice, mobile nav, breadcrumbs/search/footer, accessible navbar build, IA audit and testing. |
| **skill `marketing-page-conversion`** | Landing page vs homepage routing, section order, form → headline → mobile → speed → proof fix order, CTA/copy/proof, SEO and CWV floor, vertical must-haves, portfolios. |
| **skill `web-ui-foundations`** | Responsive layout and fluid type, dark mode, scroll/motion pattern choice and a11y, trends, mobile app UX, chatbot UI, UX process, design-system scope. |
| **skill `brand-identity-basics`** | Brand system and positioning, logo type, logo font, colour strategy, reversed/single-colour marks, variant set, audience testing. |

Invoke the agent as `@agent-web-design-guides:web-designer`. The skills also trigger on their own
from their descriptions.

## Why it is shaped like this (context cost)

- **Always loaded**: each skill's description (~1 KB) is in context every turn, so there are four
  skills, not forty.
- **On invoke**: SKILL.md (~95–140 lines) loads and stays in context. It holds the merged rule set
  that answers most questions, plus an index table.
- **On demand**: `references/<guide>.md` are one note per guide (30–60 lines), read only when a
  rule is not enough. The agent caps itself at 4 notes per plan or answer, 8 per site audit.
- **Not preloaded**: the agent has no `skills:` frontmatter, which would inject every SKILL.md at
  startup whether needed or not. It invokes only the skills a task touches.

## Distillation rules (for growing it)

1. Keep decision rules, thresholds, patterns with use-when and avoid-when, checklists and
   anti-patterns. Drop product pitches, no-code build steps, pricing and filler.
2. Write in your own words. Never copy sentences.
3. Keep a number only with its named source ("per Baymard, per guide"); otherwise mark it
   "unsourced".
4. Score each note 1–5. Only notes at 3 or above (or `partial` with salvage) ship as references.
5. Put a new rule into the skill's SKILL.md only if it changes a decision. Otherwise it lives in
   the note and gets an index row.

`scripts/check-new-guides.py [--titles]` diffs the live sitemap against `sources.tsv`. It is
read-only and lists new and removed guides. The raw extracted text and per-cluster syntheses
live in the design-extraction lab (`sources/lovable-guides/`), not in this plugin.

## Neighbours

`marketing-presentations` (award-style scroll pages), `ui-ux-pro-max` (palettes, font pairings,
styles), `ui-ux-studio` (`ui-ux-director`, `ui-adversary`). The agent hands off to them and does
not duplicate them.
