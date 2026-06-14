---
name: repo-consistency
description: This skill should be used when the user asks to "check repo consistency", "enforce a standard structure", "do all my repos have a README/LICENSE/.editorconfig/CI", "find missing project files", or "standardize my repos". Analyze reports which baseline files are missing across a repo (or fleet); apply creates the ones with templates. Optimize-tier — runs in a fleet/repo pass only with --optimize, or standalone on request.
version: 0.1.0
---

# repo-consistency

Check a repository against a baseline of expected project files (README, LICENSE, `.gitignore`,
`.editorconfig`, CI config) and report drift. Apply creates the missing files that have safe generic
templates; files needing real content (README, LICENSE) are flagged for the user, not auto-generated.

`class: optimize` — included in `repo-steward`/`fleet-steward` only with `--optimize`; always usable on
its own. Across the fleet it answers "do all my repos have X" — fills the consistent-structure gap.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): report `missing` and `auto_fixable` baseline files + `ci_present`. Read-only.
- **apply**: create the `auto_fixable` files from `assets/baseline/` (Tier 1, gated).

## Use

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/repo-consistency/scripts/analyze.sh --repo <path>
bash ${CLAUDE_PLUGIN_ROOT}/skills/repo-consistency/scripts/apply.sh --repo <path> --confirm
```
`apply` without `--confirm` prints the plan. Only files with a template under `assets/baseline/` (e.g.
`.editorconfig`) are created; extend the baseline by adding files there and entries in the analyze
check list.

## Notes

v1 is presence-based. Content-drift detection (comparing an existing file against the baseline) is a
natural extension — add a diff step in `analyze.sh` and surface the delta.
