# ui-ux-studio

A UI/UX design plugin for Claude Code. It bundles the skills you own and composes with the
external open-source rules skill, so all of UI design installs/updates from the one `claude-skills`
marketplace.

## Skills

- **ui-ux-director** (`skills/ui-ux-director/`) — the orchestrator. Decides when a task needs
  real-world inspiration, queries the reference library, judges whether what comes back is enough,
  and grows the library (discover + extract) when it isn't — then designs. Its **variations mode**
  builds the same brief as several complete variants (one taste skill or pro-max style direction
  per variant, built in isolation) plus a compare page, so you choose a direction instead of
  committing blind. It delegates rules to `ui-ux-pro-max` and examples/extraction to
  `ui-ux-references`; it never reimplements either.
- **ui-ux-references** (`skills/ui-ux-references/`) — the real-production-UI example library +
  extraction pipeline. Its **code** lives here; its **238 MB Git-LFS vault is data and stays
  OUTSIDE the plugin** (at `claude-skills/ui-ux-references/vault/`) so it survives `/plugin update`
  and stays committable. Scripts resolve the vault as `$UIUX_VAULT` → a `vault/` beside the code →
  `~/.claude/ui-ux-references-vault` (symlinked to the monorepo vault by `bootstrap.sh`).
- **ui-ux-gallery** (`skills/ui-ux-gallery/`) — builds and serves the static **Reference Gallery**
  (OLED-dark, browse screenshots/palettes/typography/teardowns) so a human can review the library in
  a browser. The gallery source lives in the monorepo at `ui-ux-references/gallery/` (beside the
  vault + Pages CI); the skill resolves it via the repo root and runs `build.mjs` + a local server.
- **style-tweaker** (`skills/style-tweaker/`) — injects a live, dev-only sidebar into the website
  being built: controls (fonts with a lazy-loaded roster, colors, spacing, radius, shadows, plus
  app-specific component knobs) bound to CSS custom properties, so changes restyle the page in real
  time. Snapshot A/B comparison, localStorage persistence, and a Copy-CSS export to make the chosen
  values permanent. Ships a tested self-contained `assets/tweak-panel.js` the agent configures per app.

## How it composes

```
ui-ux-director  (this plugin — the WHEN/HOW workflow)
   ├─ delegates RULES    → ui-ux-pro-max     (external OSS plugin, referenced by the marketplace)
   ├─ delegates EXAMPLES → ui-ux-references  (bundled here once moved)
   ├─ variations mode    → N isolated variants, one taste skill / style direction each + compare page
   └─ fine-tuning        → style-tweaker     (live token sidebar in the running app)
```

`ui-ux-pro-max` stays an externally-referenced plugin so it updates straight from upstream. The
director resolves the references skill at `${CLAUDE_PLUGIN_ROOT}/skills/ui-ux-references` with a
fallback to `~/.claude/skills/ui-ux-references`, so it works before and after the move.

## Status

- ✅ Code moved into this plugin; vault externalized; scripts/docs updated; `bootstrap.sh` wires the
  external vault + (from a checkout) the personal-skills symlink.
- ✅ Marketplace wiring: `ui-ux-studio` (`./plugins/ui-ux-studio`) and `ui-ux-pro-max` (vendored
  at `./plugins/ui-ux-pro-max` — see its `VENDORED.md` for the upstream sha and update steps) are
  both registered in `.claude-plugin/marketplace.json`.
