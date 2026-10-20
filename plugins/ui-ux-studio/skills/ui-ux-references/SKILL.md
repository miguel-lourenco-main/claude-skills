---
name: ui-ux-references
description: Real-world UI reference library (an Obsidian vault) + a general-purpose extraction pipeline. Use when designing, redesigning, or reviewing a UI and you want concrete inspiration from real production sites — screenshots, raw + rendered HTML, CSS, JS, downloaded images, and structured design "teardowns" — for a product category (e.g. restaurant, SaaS, portfolio). Complements ui-ux-pro-max (which gives style/color/typography rules); this gives real examples. Trigger phrases: "reference examples", "inspiration", "what do good <X> sites look like", "show me references", "research UIs", "extract a site", "godly/awwwards/onepagelove".
---

# UI/UX References

A git-synced **Obsidian vault** of real production UI references plus a re-runnable pipeline to
grow it. Each reference is a note with a viewport + full-page screenshot, the **raw served HTML**,
the **rendered DOM**, the page's **CSS** and **JS** (incl. inline), its **downloaded images**, and
a structured design teardown (style, palette, layout, strengths, reusable patterns).

### Paths

This skill ships as **code** inside the `ui-ux-studio` plugin; the **vault is data and lives
outside the plugin** so it survives `/plugin update` and stays git-committable.

```bash
# Skill code (run scripts from here):
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/ui-ux-references}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/ui-ux-references"
```

- **Vault** (open *this folder* in Obsidian; the per-reference **note is the single source of
  truth**): `${UIUX_VAULT:-~/.claude/ui-ux-references-vault}`. The scripts resolve it automatically
  (`$UIUX_VAULT` → a `vault/` beside the code → the stable default), so you don't pass it on the
  command line. In the `claude-skills` checkout the default symlinks to `ui-ux-references/vault/`.

## When to use

- Before designing/redesigning a page for a known category (restaurant, cafe, SaaS, portfolio…).
- When the user asks for "references", "inspiration", or "what good X sites look like".
- Alongside **ui-ux-pro-max**: run its `--design-system` for the rules, then pull matching
  references here for real examples to emulate.

## Use references when designing (the main flow)

1. Query the vault (resolve `$SK` first — see **Paths**):
   ```bash
   python3 "$SK/scripts/query.py" "restaurant warm rustic" -n 4
   ```
   (`--category restaurant`, `--json` for machine output). It returns each match's **note path**
   + screenshot/HTML paths, with tags, palette, and "when to use".
2. **Open the screenshots with the Read tool and actually look at them** — `above-fold.jpg`
   (first impression) and `full.jpg` (full flow).
3. **Read the note** (`<slug>.md`) — its Style / Palette / Typography / Layout / Strengths /
   Notable patterns / When-to-use sections are the distilled lessons.
4. For exact tokens (colors, fonts, spacing) read `assets/css/`; for structure read
   `assets/raw.html` (server markup) vs `assets/rendered.html` (hydrated DOM); for interactions
   skim `assets/js/`.
5. Apply the concrete patterns — adapt to the brand, don't copy 1:1.

## Grow the library (extraction pipeline)

Run on a machine with normal internet (capture drives a real browser; sandboxed/CI envs block
egress to arbitrary sites). It captures **everything from any URL**:

```bash
cd "$SK"                                              # see Paths
node research/discover.cjs restaurant --limit 16     # find candidate live sites (OnePageLove + seeds)
node research/extract.cjs  restaurant                 # full extraction per site -> vault note + assets
node research/extract.cjs  restaurant --url https://a-site.com   # extract ONE specific site (e.g. a Godly find)
```
(Writes go to the external vault, not beside the code — see **Paths**.)

Each extract writes `vault/References/<category>/<slug>/`:
`above-fold.jpg, full.jpg, rendered.html, raw.html, images/ (+manifest), css/ (+manifest),
js/ (+manifest), capture-manifest.json` and creates/updates `<slug>.md` (idempotent — re-running
refreshes capture data but **preserves the teardown prose**).

### Then do the teardown (this is your job, in this skill's voice)

For every note whose teardown sections still say `_(pending teardown)_`: Read its
`assets/above-fold.jpg` + `assets/full.jpg` (and skim `assets/raw.html` + `assets/css/`), then edit
that `<slug>.md` — fill the frontmatter `tags`, `palette` (`"#hex name"`), `heading_font`,
`body_font`, `quality` (1–100) and the body sections **between the `%% TEARDOWN:START/END %%`
markers** (Style, Palette, Typography, Layout sections, Strengths, Weaknesses, Notable patterns,
When to use). Keep frontmatter flat (scalars + inline arrays). Do **not** touch the
`%% CAPTURE:START/END %%` region (it's regenerated).

### Finally, rebuild the index

```bash
node scripts/build-index.cjs     # regenerates vault/_index.json + Indexes/*.md tables
```

## Sources / categories

Edit `sources.json` per category:
- `onePageLoveGenres` — `https://onepagelove.com/genre/<g>` (category-specific).
- `awwwardsCategories` — `https://www.awwwards.com/websites/<c>/` (e.g. `food-beverage`; category-specific, design-forward). Discovery harvests the live-site URLs these galleries link to.
- `godlyHome: true` — Godly's home (broad mix; Godly has no URL-addressable category filter, so it's opt-in).
- `seeds[]` — paste any URL (e.g. a specific Godly/Awwwards find).
Add categories freely (then discover → extract → teardown → build-index). Capture caps (`capture`
block) are generous with a per-site safety ceiling.

## Restricted networks (egress allowlists)

`extract.cjs` is a real headless-browser scraper; the only thing that stops it is the **network**.
Some sandboxes/CI allow outbound to only a few hosts — discovery (galleries) may work while most
live sites are unreachable. Two ways through:
- **Run on a normal network** (your own machine) — everything works, no flags.
- **Route through a proxy / scraping endpoint**: `node research/extract.cjs <cat> --proxy http://host:port`
  (or env `EXTRACT_PROXY` / `HTTPS_PROXY`, plus `EXTRACT_PROXY_USERNAME` / `EXTRACT_PROXY_PASSWORD`).
  Same flag works on `discover.cjs`. This moves the browser's traffic to an allowed channel so it can
  reach sites the local network blocks.
A different scraper won't beat an egress allowlist — only a proxy or a permitted network will.

## Sync (free — no paid Obsidian Sync)

The skill code (this plugin) and the vault both live in the `claude-skills` monorepo, synced via
git + Git LFS (images & JS binaries). Commit from your **monorepo checkout** (NOT the volatile
plugin cache). After growing the library:
```bash
cd <your claude-skills checkout>   # e.g. ~/Desktop/workspace/personal/projects/claude-skills
git add -A && git commit -m "refs: add <category> examples" && git push
```
On another machine: `git pull && git lfs pull`, then point `$UIUX_VAULT` at (or symlink
`~/.claude/ui-ux-references-vault` to) `ui-ux-references/vault/`. Obsidian/Dataview notes: see this
skill's `README.md`.

## Data model

```
vault/References/<category>/<slug>/
  <slug>.md        # the note (frontmatter + teardown) — single source of truth
  assets/
    above-fold.jpg  full.jpg          # look at these
    raw.html  rendered.html           # server markup vs hydrated DOM
    images/ (+images.manifest.json)   # downloaded page images
    css/ (+css.manifest.json)  js/ (+js.manifest.json)
    capture-manifest.json
vault/Indexes/<Category>.md           # MOC (Dataview + static table)
vault/_index.json                     # generated cache for query.py
```

## Integration with ui-ux-pro-max

`bootstrap.sh` adds a pointer to the installed ui-ux-pro-max `SKILL.md` so that skill nudges toward
pulling references here during its design step. Re-run `bash bootstrap.sh` after a ui-ux-pro-max
plugin update.
