# MODES — analyze vs apply, and the `--optimize` flag

Every git-steward skill runs in one of two **modes** and respects one optional **flag**. This file is
the single source of truth; skills reference it instead of redefining the rules. Read it whenever the
user's intent is ambiguous.

## The two modes

- **analyze** (default, read-only) — inspect and report. Never mutates a repo, never pushes, never
  deletes. Produces a findings report plus a versioned JSON record. This is what runs when intent is
  unclear.
- **apply** (mutating) — performs the change (delete branches, reword commits, rewrite history, push,
  open MRs/PRs, write files). Always gated by `SAFETY.md`.

### Inferring the mode from the prompt

Map the user's verbs to a mode. **Analyze** verbs: show, list, audit, review, check, inspect, report,
status, find, scan, diagnose, "what would", "which", "how many", "is it", dry-run. **Apply** verbs:
clean up, prune, delete, remove, purge, apply, rewrite, fix, strip, force, bump, write, tag, push,
"make it", "do it", "go ahead".

**Tie-breaker: when no verb clearly maps, or the prompt mixes both, default to analyze** and offer to
apply. Mutations must never happen by accident — a surprised user is a failed run.

### The script contract

Every skill's scripts accept `--mode analyze|apply` (default `analyze`). The skill body infers the mode
from the prompt (using the table above) and passes the flag explicitly. This keeps natural-language
inference in the model layer and makes the mutating behavior deterministic and testable at the script
layer. Analyze scripts must be side-effect free; apply scripts must honor `SAFETY.md` gates.

## The `--optimize` flag (core vs optimize skills)

Tier-1 skills have a **class**, declared in each `SKILL.md` body as `class: core` or `class: optimize`:

- **core** — directly serve git cleanup (branches, commit/history hygiene, repo health, work-items,
  CI). Run on **every** `repo-steward` / `fleet-steward` pass.
- **optimize** — good-to-have tidiness that is **not critical** to the codebase (worktrees, `.gitignore`
  audit, cross-repo consistency, dependency freshness, changelogs, stale-repo triage). Run **only** when
  optimization is requested.

`repo-steward` and `fleet-steward` include optimize-tier skills in a pass **only** when `--optimize` is
set — either the literal flag, or inferred from cues like "optimize", "full sweep", "deep clean", "also
tidy everything", "the works". The boundary is a default, not a lock: naming an optimize skill directly
("audit my .gitignore") runs it standalone regardless of the flag.

## Quick reference

| Situation | Mode | Optimize |
|---|---|---|
| "show me stale branches across my repos" | analyze | off |
| "clean up merged branches in edgenchat" | apply | off |
| "full sweep and fix everything in t3code" | apply | on |
| "what would a deep clean change here?" | analyze | on |
| ambiguous / no clear verb | **analyze** | off |
