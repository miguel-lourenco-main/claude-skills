---
name: style-tweaker
description: Inject a live style-tweaking sidebar into the website currently being built — a dev-only panel of controls (fonts, colors, spacing, radius, shadows, plus knobs for this app's specific components) bound to CSS custom properties, so every change restyles the page in real time and different values can be compared side by side (snapshot A/B). Use when the user says "style tweaker", "tweak panel", "let me try different fonts/colors live", "add a design playground/sidebar", "I want to compare styles in the browser", or is iterating on visual polish and keeps asking for one-value edits. When they settle on values, export them into the real stylesheet and strip the panel. NOT for designing from scratch (use ui-ux-director) and NOT for design rules/palettes (use ui-ux-pro-max).
---

# Style tweaker

Turns style iteration from an edit-rebuild-look loop into a live comparison: a sidebar in the
running app whose controls write CSS custom properties on `:root`, so the page restyles the
instant a value changes. The user drags a slider or swaps a font and *sees* the difference;
snapshots A/B let them flip between two whole candidate looks.

The engine is the bundled template — you customize a config, never rewrite the panel:

```bash
TWEAK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/style-tweaker}"
[ -d "$TWEAK" ] || TWEAK="$HOME/.claude/skills/style-tweaker"
ls "$TWEAK/assets/tweak-panel.js" || echo "template NOT FOUND"
```

## 1 · Tokenize first — the panel can only tweak CSS variables

Scan the project for existing design tokens (CSS custom properties on `:root`, a Tailwind
`@theme` / `tailwind.config`, a theme/tokens file). Every aspect the user wants tweakable must
resolve to a CSS variable:

- **Already tokenized** → bind controls straight to those variables. Do not invent parallel ones.
- **Hardcoded values** (e.g. `font-family: Inter` repeated in rules) → lift them into `:root`
  variables first (`--font-body`, `--radius`, …) and replace the hardcoded uses with `var(...)`.
  This refactor is the real enabling work — do it surgically and only for the aspects being tweaked.
- **Tailwind utility classes**: map the tweakable aspects through Tailwind's theme variables
  (v4 `@theme` tokens are CSS variables already; v3 → wire `theme.extend` values to `var(...)`).

Tell the user which tokens you lifted, so the tokenization survives even if the panel is later removed.

## 2 · Copy the template and write the app's config

Copy `$TWEAK/assets/tweak-panel.js` into the project (convention: `src/dev/` or `dev/` — a
location the production build can exclude). Then rewrite only its `CONFIG` block:

- **`project`** — app name (namespaces localStorage persistence).
- **`fontRoster`** — the candidate families for every font control. Pick 4–8 *deliberate*
  candidates for this brand (defer taste to ui-ux-pro-max's font pairings if installed): each
  entry has `name`, a `stack` (full font-family value with fallbacks), and optionally `google`
  (css2 family spec — the panel lazy-loads it on first selection).
- **`sections`** — first the GENERAL tokens (Typography, Color, Shape & space), then **one
  section per app-specific component** worth tweaking (Navbar height, Card padding, Hero
  overlay opacity, Button weight…). Walk the app's actual components to find these — the
  app-specific knobs are what makes the panel feel made for this project rather than generic.
- Control types: `font`, `range` (min/max/step/unit), `color` (initial value must be 6-digit
  hex to preview correctly), `select` (named presets — right for shadows/borders), `text`
  (free CSS escape hatch). Prefer few high-leverage controls over exhaustive ones.

## 3 · Load it in dev only

Wire the script so it never ships to production:

- **Vite / SvelteKit / Astro**: `if (import.meta.env.DEV) import('./dev/tweak-panel.js')` in the entry.
- **Next.js**: in the root layout/client entry — `if (process.env.NODE_ENV === 'development') import('@/dev/tweak-panel')` inside a `useEffect`, or a `<Script src="/dev/tweak-panel.js"/>` rendered only in dev.
- **Plain HTML**: a `<script src="dev/tweak-panel.js"></script>` tag before `</body>`; remove it (or the whole `dev/`) at deploy time.

Runtime affordances (tell the user): `Ctrl+.` hides/shows the panel, `?tweak=off` disables it
for a clean look, tweaks persist in localStorage across reloads.

## 4 · Drive the comparison

Run the dev server and let the user play — that's the point. Support the loop:

- **A/B**: "Save A", tweak toward a second candidate, "Save B", then flip Use A / Use B to
  compare whole looks (not single values). This is how font choices actually get made.
- When the user describes a direction in words ("warmer", "tighter", "more premium"), translate
  it into concrete values yourself, set them as a snapshot, and let them compare.
- If a wanted aspect isn't tweakable yet, extend `CONFIG` (and tokenize per §1) — don't
  hand-edit styles behind the panel's back while it's active.

## 5 · Settle — export, then strip

When the user lands on values: **Copy CSS** exports the changed tokens as a `:root { … }`
block (falls back to console if the clipboard is blocked). Apply those values into the real
stylesheet/theme as the new defaults — the tweaks live in inline styles + localStorage and are
NOT permanent until you do this. If a Google font won, add its proper `<link>`/import to the app.

Then either remove the panel wiring or leave it (it's dev-only) for the next polish round —
ask the user which. The panel is scaffolding; the tokenized stylesheet is the deliverable.
