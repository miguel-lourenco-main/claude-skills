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

## Files

- `src/index.html` · `src/styles.css` · `src/app.js` — the whole app. `app.js` resolves the vault
  from `?vault=` or `/vault`, falls back to the folder picker, and parses notes/teardowns client-side.
