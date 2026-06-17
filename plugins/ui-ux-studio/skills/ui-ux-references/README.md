# ui-ux-references

A reusable, git-synced library of real-world UI references + a general-purpose extraction pipeline.
Companion to `ui-ux-pro-max`: that one gives *rules* (style/color/type), this one gives *real
examples* — screenshots, **raw + rendered HTML, CSS, JS, downloaded images**, and a structured
design teardown per reference.

References are stored as an **Obsidian vault** (the note is the single source of truth). This skill
ships as **code** inside the `ui-ux-studio` plugin; the **vault is data and lives outside the
plugin** (so it survives `/plugin update`). Scripts resolve it as `$UIUX_VAULT` → a `vault/` beside
the code → `~/.claude/ui-ux-references-vault` (which in the monorepo checkout symlinks to
`ui-ux-references/vault/`). All in the `claude-skills` monorepo, synced via git + Git LFS.

## Daily use (find references while designing)

```bash
python3 scripts/query.py "restaurant warm rustic" -n 4
python3 scripts/query.py "dark fine dining" --category restaurant --json
```
Open the returned screenshots + note (`<slug>.md`); read `assets/css/` + `raw.html` for exact
tokens. See `SKILL.md` for the full flow.

## Grow the library (any URL → full capture)

```bash
node research/discover.cjs restaurant --limit 16     # candidate live sites
node research/extract.cjs  restaurant                 # capture each (screenshots, raw/rendered HTML, images, css, js)
node research/extract.cjs  restaurant --url https://a-site.com   # one specific site (e.g. a Godly find)
# then fill the teardown sections in each new vault note (LLM step — see SKILL.md), then:
node scripts/build-index.cjs
```

> Extraction drives a real browser and needs normal internet — sandboxed/CI environments often
> block egress to arbitrary sites. Discovery, indexing, query, and Obsidian work offline.

## Open in Obsidian

Open `vault/` in Obsidian. Enable the **Dataview** plugin when prompted (the `Indexes/` MOCs use it;
static fallback tables also work without it).

## Scripts

| Command | What |
|---|---|
| `node research/discover.cjs <cat>` | find candidate URLs → `research/candidates.<cat>.json` |
| `node research/extract.cjs <cat> [--url U]` | capture everything → `vault/References/<cat>/<slug>/` + note |
| `node scripts/build-index.cjs` | regenerate `vault/_index.json` + `vault/Indexes/*` tables |
| `python3 scripts/query.py "<q>"` | search the vault (used while designing) |
| `bash bootstrap.sh` | deps + Chromium + Git LFS + index + wire ui-ux-pro-max |

## Capture caps

`sources.json` → `capture` block (images/css/js byte + count caps, per-site safety ceiling,
tracker denylist). Defaults are generous (sync-everything via LFS); tune as needed.

## Sync

Code + vault both live in the `claude-skills` monorepo. Commit from your **checkout** (not the
plugin cache): `cd <claude-skills checkout> && git add -A && git commit && git push`; elsewhere
`git pull && git lfs pull`, then point `$UIUX_VAULT` at (or symlink `~/.claude/ui-ux-references-vault`
to) `ui-ux-references/vault/`.
