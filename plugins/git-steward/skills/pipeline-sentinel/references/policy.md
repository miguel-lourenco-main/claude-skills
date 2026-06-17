# pipeline-sentinel — autofix policy & decision model

The sentinel never decides on a whim what to push. Every failing pipeline is mapped to exactly one
**decision** by a user-controlled policy. **The default posture is gated** — nothing is pushed without
an explicit yes until the user promotes a cause to `auto`.

## The four decisions

| Decision | Meaning | Pushes? |
|---|---|---|
| `auto` | policy authorized an unattended fix for this cause, on a non-default branch | yes, after authoring + within retry budget |
| `gated` | a fix may be authored, but the push needs an explicit confirmation (Tier 2) | only on a yes |
| `report` | surfaced only — default branch, or a branch matched by an exclude glob | never |
| `escalate` | not agent-fixable (infra / quota / runner) — a human must act | never |

## Decision function (what `sweep.sh` computes)

For each failing pipeline:

1. **Default branch** → `default_branch_policy` (default `report`). The default branch is on the
   `SAFETY.md` never-touch list; it is *never* auto-pushed. Fix it via an MR/branch instead.
2. **Excluded branch** (matches a `exclude_branch_globs` entry) → `report`.
3. **Cause `infra`** → `causes.infra` (default `escalate`).
4. **Otherwise** → `causes[<cause>]`, defaulting to `gated`.

Causes come from `pipeline-health`'s taxonomy: `lint`, `build`, `hygiene`, `test`, `infra`, `unknown`
(see `../../pipeline-health/references/failure-taxonomy.md`).

## The policy file

`<root>/.git-steward/sentinel-policy.json` (`sentinel-policy/v1`). Created by `policy.sh --init`; the
user owns it. Defaults:

```json
{
  "schema": "sentinel-policy/v1",
  "default_branch_policy": "report",
  "branch_scope": "all-non-default",
  "causes": { "lint":"gated", "build":"gated", "hygiene":"gated",
              "test":"gated", "unknown":"gated", "infra":"escalate" },
  "max_attempts": 3,
  "interval": 20,
  "max_polls": 20,
  "require_open_mr": false,
  "exclude_repos": [],
  "exclude_branch_globs": ["main","master","develop","release/*","prod*"]
}
```

- **Full control, per item type.** Flip any cause to `auto`/`gated`/`report`/`escalate`. e.g.
  `bash policy.sh --root <root> --set lint=auto` lets lint fixes push unattended everywhere (except the
  default branch, which `default_branch_policy` still guards).
- **`branch_scope`** — `all-non-default` (every branch but default) or `mr-only` (only branches with an
  open MR; best-effort, needs forge MR data).
- **`exclude_repos` / `exclude_branch_globs`** — carved out entirely; their failures are `report` only.
- **`max_attempts` / signature dedup** — inherited from the `pipeline-health` fix loop; a repeating
  failure signature stops retries so the sentinel never burns CI in a loop.

## Why gated-by-default

Auto-pushing fixes across an entire fleet is high blast-radius. The safe baseline is: diagnose
everything, fix nothing without a yes. The user opts into autonomy one cause at a time, once they trust
the sentinel on that class — which is exactly the "auto-fix with an allowlist" posture.
