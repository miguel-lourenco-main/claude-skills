---
name: ui-ux-director
description: Conducts inspiration-driven UI design by composing two other skills — ui-ux-pro-max (style/color/typography/layout RULES) and ui-ux-references (a vault of real production EXAMPLES + an extraction pipeline). Its job is the judgment neither of those has on its own: decide when a task actually needs real-world inspiration, query the reference library, judge whether what comes back is enough, and when it is NOT enough, grow the library (discover + extract new sites) before designing. Use as the ENTRY POINT when you want to "design/redesign a UI with real-world inspiration", "find references and then build it", "make this feel like the best <restaurant/SaaS/portfolio> sites", or "awwwards/godly-grade" work. Also owns VARIATIONS MODE — "build the same site in N styles", "show me versions with each of my design skills", "give me options to compare" — which builds the one brief as several style-skill-driven variants plus a compare page. NOT for pure rule-only design (use ui-ux-pro-max alone) and NOT for just searching or growing the library (use ui-ux-references directly).
---

# UI/UX Director

The conductor. It does not invent design rules and it does not re-implement the reference
pipeline — it **sequences** them and owns the *decisions* between them:

- **ui-ux-pro-max** — the RULES: styles, color systems, font pairings, layout, a11y, per-product-type
  guidance. The director defers to it for "how should this look / what's correct."
- **ui-ux-references** — the EXAMPLES: a queryable Obsidian vault of real production UIs (screenshots,
  HTML/CSS/JS, teardowns) plus `discover`/`extract` scripts to grow it. The director defers to it for
  "what do real, good <X> sites actually do" and for capturing new ones.

> **Delegation principle (important):** this skill stays thin. It must **reference** the behavior of
> the other two, never copy their content. Don't restate pro-max's color/type rules here, and don't
> re-explain the extraction internals — invoke them. That's what keeps ui-ux-pro-max independently
> updatable: its rules live in one place, and the director just calls it.

## 0 · Locate the reference skill & check prerequisites

`ui-ux-references` is bundled in this plugin, with a fallback to the personal-skills install:

```bash
REFS="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/ui-ux-references}"
[ -d "$REFS" ] || REFS="$HOME/.claude/skills/ui-ux-references"
[ -d "$REFS" ] && echo "references: $REFS" || echo "references: NOT FOUND"
```

Graceful degradation:
- **`ui-ux-references` missing** → you lose the example/discovery loop. Fall back to rules-only design
  with ui-ux-pro-max, and tell the user the reference library isn't installed.
- **`ui-ux-pro-max` missing** → you lose the rule layer. Still pull references and design from them,
  but tell the user the rules skill isn't installed (recommend installing it for color/type/a11y).
- The extraction step needs a real network (see the references skill's "Restricted networks" note).
  In a sandbox with egress limits, skip discovery and design from whatever the vault already has.

## 1 · The decision loop

```
design / redesign request
│
├─ (v) Does the user want to COMPARE candidate looks rather than commit to one?
│       ("variations", "N styles", "one per skill", "options to choose from")
│   └─ YES → variations mode (§8). Each variant still runs (a)–(d) below.
│
├─ (a) Does this need real-world inspiration?
│       YES if: novel or unusual product type · a "make it feel premium / awwwards / like <brand>"
│               ask · a redesign of something that currently looks generic · the user explicitly
│               asks for references/inspiration.
│       NO  if: a small component tweak · a well-trodden pattern you already know · the user wants
│               speed over polish · purely functional/internal UI.
│   └─ NO  → go design with ui-ux-pro-max rules (skip to §4). Don't force inspiration where it adds nothing.
│
├─ (b) YES → map the product to a vault category and QUERY (§2).
│
├─ (c) Is what came back ENOUGH? (§3 sufficiency test)
│       ENOUGH      → design from those references (§4).
│       NOT ENOUGH  → GROW the library (§5): discover → extract → teardown → re-index → re-query,
│                     then re-test (c). Cap the growth so this terminates.
│
└─ (d) Design (§4), then optionally review against rules + references (§6).
```

## 2 · Query the existing library

Pick descriptive terms (vibe + product) and the closest category, then:

```bash
python3 "$REFS/scripts/query.py" "<vibe + product, e.g. 'warm rustic restaurant'>" \
        --category <category> -n 6 --json
```

The JSON gives, per match: `category`, `title`, `quality` (1–100), `tags`, `palette`, `when_to_use`,
and absolute paths (`note`, `above_fold`, `full`, `raw_html`, `rendered_html`). For the matches you'll
actually use, **open the screenshots with the Read tool and read the note** — the tags/palette/teardown
are the distilled lessons. (Full mechanics: see the ui-ux-references skill, "Use references when designing".)

## 3 · Sufficiency test — "is there enough inspiration?"

Treat the query result as **NOT enough** if any of these hold:

- the target **category doesn't exist** in the vault yet (query returns nothing for it), or
- **fewer than ~3** relevant matches come back, or
- the matches are **off-vibe / wrong category** (judge from `tags`, `palette`, `when_to_use` — not just count), or
- **fewer than ~2** matches have `quality ≥ 70`.

Otherwise it's enough — proceed to design. Use judgement; these are thresholds, not laws. State briefly
to the user which references you're building on (or that you're growing the library first).

## 4 · Design

With the references in hand, design with **ui-ux-pro-max** for the rules (style system, palette,
font pairing, layout, interaction states, a11y) and the **concrete patterns** from the references for
what actually works in this product space. **Adapt to the brand — never copy a reference 1:1.** Cite the
1–3 references you're drawing the strongest cues from so the user can see the lineage.

## 5 · Grow the library (only when §3 says "not enough")

Run on a normal network (the extractor drives a real browser). Keep it bounded so the loop terminates.

```bash
# If the category is new, add it to sources.json first (see the references skill, "Sources / categories"),
# or pass specific URLs as seeds / --url.

node "$REFS/research/discover.cjs" <category> --limit 12      # find candidate live sites
node "$REFS/research/extract.cjs"  <category>                 # extract them -> vault notes + assets
#   or a single hand-picked site (e.g. an Awwwards/Godly find):
node "$REFS/research/extract.cjs"  <category> --url https://a-great-site.com
```

Then **do the teardown yourself** for each freshly captured note (this is the analytical step that turns
raw capture into reusable lessons) — follow the ui-ux-references skill's **"Then do the teardown"**
section exactly (look at `above-fold.jpg`/`full.jpg`, fill the frontmatter + the `%% TEARDOWN %%` body).
Finally rebuild the index and re-query:

```bash
node "$REFS/scripts/build-index.cjs"
python3 "$REFS/scripts/query.py" "<terms>" --category <category> -n 6 --json
```

**Termination:** grow at most ~once or twice per request. If the vibe still isn't covered after a
discover+extract pass, design from the closest references you have and tell the user the library is thin
for this niche (so they can seed specific URLs later). Don't loop indefinitely.

## 6 · Optional review pass

After building, you can review the result against (a) ui-ux-pro-max's rules and a11y guidance and
(b) the specific references you cited — does it capture what made them good without cloning them? Report
gaps as concrete fixes.

## 7 · Persisting new references

Growing the library writes into the bundled `ui-ux-references` vault (git + Git LFS). To keep the new
examples, commit them from the monorepo — see the ui-ux-references skill's "Sync" section. (Don't commit
from inside the plugin cache; commit from your `claude-skills` checkout.)

## 8 · Variations mode — same brief, N competing looks

For "build it in different styles so I can compare". One brief, several complete variants, a
compare page, then a decision. The director conducts; the taste skills design.

**(1) Assemble the roster.** List the design/taste skills actually available in this session
(personal + project `.claude/skills` + plugins — e.g. taste skills like `design-taste-frontend`,
`gpt-taste`, `high-end-visual-design`, or style-specific ones like `minimalist-ui`,
`industrial-brutalist-ui`). Propose a roster to the user — default to their full-website taste
skills, ~3 variants — and let them swap in a specific style direction from ui-ux-pro-max (a
named style + palette + font pairing) as a variant when no skill covers a vibe they want.
A variant = **one driver** (one taste skill, or one pro-max style direction), never a blend.

**(2) Shared brief, shared references.** Write the brief once (product, content, sections,
constraints) — all variants build from it, so differences are attributable to the driver, not
to scope drift. If the request warrants inspiration, run §2–§3 ONCE and hand the same
references to every variant.

**(3) Build in isolation.** One subagent per variant, each into its own directory
(`variants/<driver-name>/`), each instructed to load and follow ONLY its driver skill (plus the
shared brief/references). Isolation is the point: tastes must not bleed. Run variants in
parallel; cap at ~4 per round — more choices stop being comparable.

**(4) The compare page.** Generate `variants/index.html`: each variant as a labeled card
(driver name, one-line intent, screenshot or live iframe, link to open full). Side-by-side
first, one-click to full-screen each. Screenshot each variant if a browser is available;
otherwise link the running pages.

**(5) Decide and converge.** The user picks a winner. Offer to graft specific elements they
liked from the losers onto it (named concretely: "B's hero type scale", "C's footer") — then
delete or archive the losing variants so the repo doesn't rot. For fine-tuning the winner's
values (fonts, colors, spacing) live in the browser, hand over to the **style-tweaker** skill
(bundled in this plugin).

**Termination:** one round of variants, at most one follow-up round (e.g. two new drivers on
the winner's direction). This mode chooses a direction; it is not an endless tournament.
