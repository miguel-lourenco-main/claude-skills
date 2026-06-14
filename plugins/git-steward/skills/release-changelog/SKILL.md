---
name: release-changelog
description: This skill should be used when the user asks to "generate a changelog", "what's the next version", "cut a release", "bump the version", "tag a release", or "summarize changes since the last tag". Analyze previews the changelog and computed semver bump from Conventional Commits; apply writes CHANGELOG.md and optionally tags. Optimize-tier — runs in a fleet/repo pass only with --optimize, or standalone on request.
version: 0.1.0
---

# release-changelog

Derive the next version and a changelog from Conventional Commits since the last tag. Composes with
`commit-hygiene` (clean commits make a clean changelog).

`class: optimize` — included in `repo-steward`/`fleet-steward` only with `--optimize`; always usable on
its own.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): preview `next_version`, `bump`, and grouped changes. Read-only.
- **apply**: prepend a `CHANGELOG.md` section and (with `--tag`) create an annotated tag (Tier 2 — tags
  are typically pushed).

## Versioning

From commits since the last tag: a breaking change (`!` or `BREAKING CHANGE`) → **major**; any `feat` →
**minor**; any `fix` → **patch**; otherwise no release. With no existing tag, the first version is
`0.1.0`.

## Use

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/release-changelog/scripts/analyze.sh --repo <path>
bash ${CLAUDE_PLUGIN_ROOT}/skills/release-changelog/scripts/apply.sh --repo <path> [--tag] --confirm
```
`apply` without `--confirm` prints the proposed section. With `--tag` it commits the changelog and
creates `vX.Y.Z`; pushing the tag is a separate manual step (`git push origin vX.Y.Z`).
