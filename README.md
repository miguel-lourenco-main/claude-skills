# claude-skills

A single git monorepo for my personal Claude Code skills (cross-project, git-synced — the remote
is the single source of truth). Personal **skills** are self-contained folders under
`~/.claude/skills/<name>/` (where Claude Code discovers them); larger multi-skill **plugins** live
under `plugins/<name>/` and are installed via this repo's marketplace manifest
(`.claude-plugin/marketplace.json`).

## Skills here

- **ui-ux-references/** — real-world UI reference library + research/extraction pipeline, with a
  self-contained **Obsidian vault** at `ui-ux-references/vault/`. See its `SKILL.md` / `README.md`.

> `graphify/` is also present in `~/.claude/skills/` but is **externally version-managed** (its own
> installer/updater) and is intentionally **gitignored** here — not part of this repo.

## Plugins here

- **plugins/git-steward/** — stackable multi-repo git cleanup plugin (14 skills + 3 commands):
  branch/commit/history hygiene, repo health, work-item triage, CI pipeline health, plus an
  optimize tier, composed by `repo-steward` (one repo) and `fleet-steward` (the whole fleet). See
  `plugins/git-steward/README.md`.

Plugins are **not** loaded via the `~/.claude/skills/` clone — they are registered as a marketplace.
This repo's `.claude-plugin/marketplace.json` lists them. Register the marketplace once (per machine):

```jsonc
// ~/.claude/settings.json
{
  "extraKnownMarketplaces": {
    "claude-skills": { "source": { "source": "git", "url": "<REMOTE_URL>" } }
  },
  "enabledPlugins": { "git-steward@claude-skills": true }
}
```

Claude then clones the marketplace into `~/.claude/plugins/marketplaces/claude-skills/` and loads the
plugin (so `${CLAUDE_PLUGIN_ROOT}` resolves correctly). Update with `git pull` here + the plugin
marketplace refresh.

## Git LFS

Heavy reference binaries (screenshots, captured images, JS bundles under
`ui-ux-references/vault/`) are stored via **Git LFS** (see `.gitattributes`). No paid Obsidian Sync
is used — plain git + LFS syncs everything for free.

## Set up on a new machine

```bash
git lfs install                                  # once per machine
git clone <REMOTE_URL> ~/.claude/skills          # into the skills dir Claude reads from
cd ~/.claude/skills && git lfs pull              # fetch the LFS binaries
# per-skill setup:
cd ui-ux-references && bash bootstrap.sh          # deps + chromium + build index + wire ui-ux-pro-max
# open the vault in Obsidian: ~/.claude/skills/ui-ux-references/vault  (install Dataview when prompted)
```

If `~/.claude/skills/` already exists with externally-installed skills (e.g. graphify), clone into a
temp dir and move `.git` + tracked files in, or `git init` + `git remote add` + `git fetch` +
`git checkout -f main` inside the existing dir (graphify is gitignored, so it won't conflict).

## Sync

```bash
git add -A && git commit -m "…" && git push      # any machine
git pull && git lfs pull                          # the others
```
