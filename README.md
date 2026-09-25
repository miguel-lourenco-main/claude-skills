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
- **plugins/marketing-presentations/** — HTML presentations, decks and report pages that feel
  like high-end marketing/landing pages: content → visual script → single-file scroll page, with
  `extract <url>` to grow the knowledge base from a reference site. Principles and numbers were
  validated by three award-site extract→blind-clone→evaluate cycles (8.3–8.6/10); 1.1.0 adds
  what a page inside an existing brand world needs beyond craft — an object, a stage the
  reader's hand moves, a boot state, recorded-visitor verification — from three juried takes
  on a real product landing. See `plugins/marketing-presentations/README.md`.
- **plugins/web-design-guides/** — a `web-designer` agent plus four knowledge skills
  (site architecture & navigation, marketing-page conversion, web UI foundations, brand identity
  basics) distilled from Lovable's public web-design guides — 291 triaged, 47 kept, every rule
  paraphrased and source-tagged; each skill is a short rule set + an index of per-guide notes
  loaded only on demand. See `plugins/web-design-guides/README.md`.
- **plugins/context-checkpoint/** — deliberate context compaction: a `UserPromptSubmit` hook that
  reads the live context size from the session transcript and, every 15% of the window, after a
  cold-cache pause, or on a task-boundary prompt, makes the model decide in one line whether to
  keep or compact — on relevance and freshness of what is in context, not its size. Ships a
  `--status` reading and a skill with the criteria and the measurements behind them. See
  `plugins/context-checkpoint/README.md`.

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
