---
name: gitignore-guard
description: This skill should be used when the user asks to "audit my .gitignore", "fix my gitignore", "I committed node_modules/build artifacts", "stop tracking generated files", "untrack files that should be ignored", or "what shouldn't be in git". It reports tracked files that should be ignored and missing .gitignore entries; in apply mode it updates .gitignore and untracks those files. Optimize-tier — runs in a fleet/repo pass only with --optimize, or standalone on request.
version: 0.1.0
---

# gitignore-guard

Keep generated and sensitive files out of git. Analyze reports tracked files that match common
ignore patterns and recommends missing `.gitignore` entries for the detected stack. Apply updates
`.gitignore` and untracks those files (keeping them on disk).

`class: optimize` — included in `repo-steward`/`fleet-steward` only with `--optimize`; always usable on
its own.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): report tracked-but-should-ignore files and missing entries. Read-only.
- **apply**: append missing entries to `.gitignore` and `git rm --cached` the offending files (Tier 1).

## Use

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/gitignore-guard/scripts/analyze.sh --repo <path>
bash ${CLAUDE_PLUGIN_ROOT}/skills/gitignore-guard/scripts/apply.sh --repo <path> [--untrack] --confirm
```
`analyze` emits `gitignore-guard/v1` (`tracked_should_ignore`, `missing_recommended`). `apply` without
`--confirm` prints the plan. `--untrack` also runs `git rm --cached` (files stay on disk; commit to
finalize). Pairs with `git-history-surgery` when a file must also be purged from past history.

## Notes

Stack detection: `package.json` → node patterns; `Cargo.toml` → `target/`; Python files/`pyproject.toml`
→ `__pycache__/`, `.venv/`. `.env` and `.DS_Store` are always recommended. Review recommendations before
applying — a repo may legitimately track something that matches a pattern.
