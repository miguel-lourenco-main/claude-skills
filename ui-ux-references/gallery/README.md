# UI Reference Gallery

A simple-but-stunning **client-side** gallery over a `ui-ux-references` vault — OLED-dark masonry of
references with screenshots, palettes, typography, and full design teardowns. No build step, no
bundled data: it reads the vault at runtime.

Design lineage (built via the `ui-ux-director` skill): **Linear** (OLED, elevation-by-gray-steps,
single indigo accent, Inter + mono), **Raycast** (gradient hero, floating controls), and the
**Portfolio Grid** pattern.

## Two data sources (the vault is never shipped with the site)

1. **Local — auto-fetch.** Served from the repo's `ui-ux-references/` root, the vault sits at `/vault`
   and the gallery fetches it directly (`_index.json` + notes + screenshots), parsing the
   `%% TEARDOWN %%` prose in the browser. Override the location with `?vault=<URL>`.
2. **Hosted (GitLab Pages) — user loads it.** The deploy is just the shell (`index.html`, `styles.css`,
   `app.js`) with **no data**. On open, `/vault` 404s, so the gallery shows a *“Load your reference
   vault”* picker — the visitor selects their vault folder (the one containing `_index.json`) and it's
   read entirely client-side (nothing is uploaded).

## Run locally

```bash
cd ui-ux-references && python3 -m http.server 8091
# open http://127.0.0.1:8091/gallery/src/index.html
```
(The `ui-ux-gallery` skill does exactly this.) Any static server rooted at `ui-ux-references/` works,
as long as `/vault/_index.json` is reachable.

## Deploy (GitLab Pages)

The repo-root `.gitlab-ci.yml` `pages` job copies `gallery/src/` → `public/` on the default branch —
no vault, no LFS, no Node. Visitors load their own vault. `public/` is git-ignored.

## What a reference shows

- **Every screenshot.** The card shows the viewport capture (with an `N shots` badge when there are
  more); the detail sheet shows it large plus a thumbnail strip of every capture. Click any of them
  (or focus a thumbnail, move with ←/→/Home/End, press Enter) to open the lightbox: ←/→ step through
  the captures, *Open original* opens the file at full resolution, Esc closes the lightbox only.
  The list comes from the `screenshots` array that `build-index.cjs` writes into `_index.json` (every
  image file at the top level of the reference's `assets/`, viewport first, then full page, then the
  rest A–Z). Indexes built before that field existed fall back to `above_fold` + `full`.
- **The extracted HTML.** A collapsible *Extracted HTML* panel at the bottom of the detail sheet
  shows the stored `raw.html` (served document) and `rendered.html` (post-JS DOM) as read-only,
  syntax-highlighted code, with tabs to switch, a wrap toggle, *Open file*, and *Copy* (copies the
  whole file). Nothing is fetched until the panel is opened; files over 200 KB show the first 200 KB
  with a *show all* button (the extractor caps each file at 3 MB). The panel only appears for files
  listed in the `html` array of `_index.json` (`kind`, `path`, `bytes` — written by `build-index.cjs`
  for files that exist); older indexes fall back to the `raw_html`/`rendered_html` paths and report a
  load error if a file is missing.

## Files

- `src/index.html` · `src/styles.css` · `src/app.js` — the whole app. `app.js` resolves the vault
  from `?vault=` or `/vault`, falls back to the folder picker, and parses notes/teardowns client-side.
