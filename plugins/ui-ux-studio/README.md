# ui-ux-studio

A UI/UX design plugin for Claude Code. It bundles the skills you own and composes with the
external open-source rules skill, so all of UI design installs/updates from the one `claude-skills`
marketplace.

## Skills

- **ui-ux-director** (`skills/ui-ux-director/`) — the orchestrator. Decides when a task needs
  real-world inspiration, queries the reference library, judges whether what comes back is enough,
  and grows the library (discover + extract) when it isn't — then designs. It delegates rules to
  `ui-ux-pro-max` and examples/extraction to `ui-ux-references`; it never reimplements either.
- **ui-ux-references** (`skills/ui-ux-references/`) — the real-production-UI example library +
  extraction pipeline. Its **code** lives here; its **238 MB Git-LFS vault is data and stays
  OUTSIDE the plugin** (at `claude-skills/ui-ux-references/vault/`) so it survives `/plugin update`
  and stays committable. Scripts resolve the vault as `$UIUX_VAULT` → a `vault/` beside the code →
  `~/.claude/ui-ux-references-vault` (symlinked to the monorepo vault by `bootstrap.sh`).

## How it composes

```
ui-ux-director  (this plugin — the WHEN/HOW workflow)
   ├─ delegates RULES    → ui-ux-pro-max     (external OSS plugin, referenced by the marketplace)
   └─ delegates EXAMPLES → ui-ux-references  (bundled here once moved)
```

`ui-ux-pro-max` stays an externally-referenced plugin so it updates straight from upstream. The
director resolves the references skill at `${CLAUDE_PLUGIN_ROOT}/skills/ui-ux-references` with a
fallback to `~/.claude/skills/ui-ux-references`, so it works before and after the move.

## Status

- ✅ Code moved into this plugin; vault externalized; scripts/docs updated; `bootstrap.sh` wires the
  external vault + (from a checkout) the personal-skills symlink.
- ⬜ Marketplace wiring: add `ui-ux-studio` (`./plugins/ui-ux-studio`) and `ui-ux-pro-max`
  (external `url` source, pinned sha) to `.claude-plugin/marketplace.json`, bump the marketplace
  version, push, then `/plugin update`.
