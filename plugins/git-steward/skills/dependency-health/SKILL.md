---
name: dependency-health
description: This skill should be used when the user asks to "check for outdated dependencies", "are my deps up to date", "any vulnerable packages", "audit dependencies", "update my packages", or "bump dependencies". Analyze reports outdated/vulnerable deps per ecosystem (node/rust/python); apply bumps within a minor/patch policy. Optimize-tier — runs in a fleet/repo pass only with --optimize, or standalone on request.
version: 0.1.0
---

# dependency-health

Report outdated and vulnerable dependencies, and optionally bump them. Detects node (`npm`/`pnpm`),
rust (`cargo`), and python (`pip`) ecosystems and runs each tool best-effort with timeouts.

`class: optimize` — included in `repo-steward`/`fleet-steward` only with `--optimize`; always usable on
its own.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): report `outdated` and `vulnerabilities` counts per ecosystem. Read-only. A
  count of `-1` means the tool was unavailable or timed out.
- **apply**: bump dependencies. Default policy is **minor/patch only**; `--major` allows majors (Tier 1).

## Use

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/dependency-health/scripts/analyze.sh --repo <path>
bash ${CLAUDE_PLUGIN_ROOT}/skills/dependency-health/scripts/apply.sh --repo <path> [--major] --confirm
```
`analyze` emits `dependency-health/v1`. `apply` without `--confirm` prints the plan. After bumping,
always review the diff and run tests before committing — dependency updates can break builds.

## Notes

Node bumping is implemented (`pnpm update` / `npm update`); rust/python bumping is analyze-only for now.
Audit data comes from `npm/pnpm audit`; for richer scanning, the analyze output flags what to install.
