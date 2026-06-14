# git-steward

A stackable Claude Code plugin for cleaning up and maintaining many git repositories. Every skill is
usable on its own, and they stack from a single operation → a whole repo → the whole fleet.

## Install

```bash
# from the parent directory of this folder
claude --plugin-dir ./git-steward
```
Or add it to a marketplace and `/plugin install git-steward`.

## The stack

- **Tier 1 — atomic skills** (each independently usable):
  - **core** (always run in a pass): `git-repo-health`, `git-branch-cleanup`, `commit-hygiene`,
    `git-history-surgery`, `work-items`, `pipeline-health`
  - **optimize** (only with `--optimize`): `worktree-manager`, `gitignore-guard`, `repo-consistency`,
    `dependency-health`, `release-changelog`, `stale-repo-triage`
- **Tier 2 — `repo-steward`**: runs the in-scope skills on one repo and aggregates.
- **Tier 3 — `fleet-steward`**: resolves a repo fleet and runs `repo-steward` across it.

## Two modes (every skill)

- **analyze** (default, read-only) — inspect and report; never mutates.
- **apply** (mutating) — performs changes behind confirmation gates.

Mode is inferred from your wording ("show/audit" → analyze; "clean up/fix" → apply); when ambiguous it
defaults to analyze. See `shared/MODES.md`. Destructive operations follow `shared/SAFETY.md` (dry-run
first, tiered confirmations, backups before history rewrites, never the default/current branch). Forge
access (GitLab `glab` / GitHub `gh`) with SSH-alias normalization and pure-git fallback is in
`shared/FORGE.md`.

## Findings reports — editable & executable

Every analyze pass at the repo/fleet level writes a detailed Markdown **findings document** under
`<repo|root>/.git-steward/reports/` (built by `shared/report.sh`): an at-a-glance table, per-dimension
detail, and an **Actions checklist**. Fleet runs also produce a severity-sorted index linking every
per-repo report. Paths are returned as `report_path` (repo) / `fleet_report` (fleet).

The Actions section is an **editable checklist** — one machine-tagged checkbox per specific item (each
branch, file, commit, work item). Edit it to choose exactly what to run (`- [x]` = do, `- [ ]` = skip;
edit reword messages after `→`), then execute only your selection:

```bash
bash shared/run-plan.sh --report <report.md>     # --dry-run to preview
```

`shared/parse-actions.sh` turns your edits into an `execution-plan/v1`; `run-plan.sh` applies **Tier-1**
items (local/recoverable) with confirmation-by-checkbox and **defers Tier-2** items (🔴 irreversible /
outward) by printing their exact gated commands. Reports/backups live under `.git-steward/`, which
`gitignore-guard` recommends ignoring.

## Commands

- `/git-audit [target] [--optimize]` — read-only audit (analyze) of a repo or the fleet.
- `/git-cleanup [target]` — core cleanup (apply), gated.
- `/git-optimize [target]` — full sweep: core + optimize (apply), gated.

## Composable primitives

Each atomic skill exposes `scripts/analyze.sh --repo <path>` (read-only, versioned JSON) and — where it
mutates — `scripts/apply.sh --repo <path> … --confirm` (dry-run until confirmed). Higher tiers call these
same scripts, so behaviour is consistent and testable.

## Optional external tools (auto-detected; pure-git fallbacks otherwise)

`git-trim`, `gitleaks`/`trufflehog` (secret detection), `git-filter-repo`/BFG (**required** for history
rewriting — never hand-rolled), `git-quick-stats`. The plugin works without them; history rewrite is the
one apply path that refuses and prints install instructions when the tool is absent.
