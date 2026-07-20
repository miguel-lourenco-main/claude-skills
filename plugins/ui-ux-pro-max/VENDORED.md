# Vendored from upstream

- Upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT, © Next Level Builder)
- Vendored commit: `b7e3af80f6e331f6fb456667b82b12cade7c9d35` (upstream plugin version 2.5.0)
- Vendored on: 2026-07-11

What was copied: `LICENSE`, `README.md`, `.claude-plugin/plugin.json`, the exposed skill
`.claude/skills/ui-ux-pro-max/` (SKILL.md + `data`/`scripts` symlinks), and their backing
`src/ui-ux-pro-max/` (data, scripts, templates).

Deliberately excluded: `cli/` (npm CLI), `screenshots/`, `preview/`, `docs/`, upstream's own
`.claude-plugin/marketplace.json`, and the extra `.claude/skills/*` directories that upstream's
plugin.json does not expose.

## To update

```bash
git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git /tmp/upmax
cd /tmp/upmax && git checkout <new-sha-or-tag>
# re-copy the same set of paths over this directory, then update this file's sha/version/date
```
