---
name: ui-ux-director
description: Conducts inspiration-driven UI design by composing two other skills — ui-ux-pro-max (style/color/typography/layout RULES) and ui-ux-references (a vault of real production EXAMPLES + an extraction pipeline). Its job is the judgment neither of those has on its own: decide when a task actually needs real-world inspiration, query the reference library, judge whether what comes back is enough, and when it is NOT enough, grow the library (discover + extract new sites) before designing. Use as the ENTRY POINT when you want to "design/redesign a UI with real-world inspiration", "find references and then build it", "make this feel like the best <restaurant/SaaS/portfolio> sites", or "awwwards/godly-grade" work. NOT for pure rule-only design (use ui-ux-pro-max alone) and NOT for just searching or growing the library (use ui-ux-references directly).
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
