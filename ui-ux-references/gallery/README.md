# UI Reference Gallery

A simple-but-stunning static gallery over the `ui-ux-references` vault — for humans to browse
and analyze the references we've discovered/extracted. OLED-dark, masonry grid, per-reference
detail with screenshots, palette, typography, and the full design teardown.

Design lineage (built with the `ui-ux-director` skill): **Linear** (elevation-by-gray-steps,
single indigo accent, Inter + mono), **Raycast** (gradient light-streak hero, floating bordered
controls), and the **Portfolio Grid** pattern (visuals-first masonry, category filter).

## How it works

It's a **build-time bake**, not a runtime reader — so it deploys to GitLab Pages with no server
or filesystem access:

```
vault (_index.json + notes + screenshots)
        │  build.mjs
        ▼
public/  ├─ index.html · styles.css · app.js   (the gallery, vanilla — no framework/deps)
         ├─ data.json                          (structured records + parsed teardowns)
         └─ shots/<slug>/{above-fold,full}.jpg (only the 2 screenshots per ref, ~4–5 MB total)
```

`build.mjs` reads structured fields from `_index.json` and parses the `%% TEARDOWN %%` prose out
of each note's `.md`.

## Build & preview locally

```bash
node ui-ux-references/gallery/build.mjs     # writes ./public (vault resolved automatically)
cd public && python3 -m http.server 8091    # open http://127.0.0.1:8091
```

Vault resolution matches the skill: `$UIUX_VAULT` → `ui-ux-references/vault` (in the checkout) →
`~/.claude/ui-ux-references-vault`. Override the output dir with `OUT=…`.

## Deploy (GitLab Pages)

The repo-root `.gitlab-ci.yml` has a `pages` job that, on the default branch, runs `git lfs pull`
(to fetch the vault screenshots), builds `public/`, and publishes it. It only rebuilds when the
gallery or the vault changes. Add new references with the `ui-ux-references` pipeline, commit them,
and the next push redeploys the gallery.

`public/` is generated and git-ignored — never commit it; CI rebuilds it from the vault.
