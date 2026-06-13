# UI/UX References — Obsidian vault

This folder **is an Obsidian vault**. Open *this folder* (`ui-ux-references/vault/`) in Obsidian.

- When prompted, enable the **Dataview** community plugin — the `Indexes/` maps-of-content use it.
  (Static fallback tables are written into each index too, so they also work without Dataview.)
- Each reference is a note at `References/<category>/<slug>/<slug>.md`, with its screenshots, raw +
  rendered HTML, CSS, JS, and downloaded images in the sibling `assets/` folder.
- The note's YAML frontmatter (tags, palette, quality, fonts…) is the structured data; the body is
  the design teardown. The note is the single source of truth; `_index.json` is a generated cache
  used by the skill's `query.py`.

Start here: [[Indexes/_All References]].

Captured/extracted by the `ui-ux-references` skill (`research/extract.cjs`). To grow the library
see `../README.md`.
