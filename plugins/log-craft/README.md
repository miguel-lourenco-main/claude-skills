# log-craft

Readable, good-looking CI job logs, as one skill.

## Skills

- **ci-log-design** — audit and restyle GitLab CI job logs with text art that carries
  information: fetch real job traces, score them, redesign the log, apply it through the
  shared `ci-log.sh` / `ci-log.mjs` library, and prove the change with before/after scores.

## What is in the skill

| Path | What it is |
|---|---|
| `SKILL.md` | the workflow: collect, audit, design, apply, verify, report |
| `references/taste.md` | the rules for judging a log, bad/good pairs from real jobs, the scoring table |
| `references/gitlab-viewer.md` | what the GitLab job page does with a log, each fact tagged seen / docs / unverified |
| `references/recipes.md` | the vocabulary, title-writing rules, and the YAML wiring |
| `assets/ci-log.sh` | the logging library (POSIX sh: bash, dash, busybox ash) |
| `assets/ci-log.mjs` | the Node mirror |
| `assets/canary.gitlab-ci.yml` | a manual job that shows how a GitLab instance renders the vocabulary |
| `scripts/ci_log_audit.py` | scores a job trace and renders what a reader sees on open |
| `scripts/demo.sh` | prints the whole vocabulary as two fake jobs |

## Why a new skill

A survey of published skills (skills.sh and the common collections, October 2026) found
nothing aimed at CI job logs. The nearest, `tui-design` from hyperb1iss/hyperskills, is
about interactive full-screen apps; the others draw diagrams or figlet banners. None
knows GitLab's section markers, echo behaviour or log limits, none ships a helper
library, and none can check its own result. Two ideas were borrowed: `tui-design`'s rule
to pair every colour with text, and the lint-style checker of
terrylica/cc-skills `ascii-diagram-validator`.

## Scope

GitLab CI only. The taste rules carry over to GitHub Actions, but the library, the
auditor and the viewer notes do not.
