---
name: ci-log-design
description: Audit and restyle GitLab CI job logs so they are readable and interesting, using ASCII/Unicode text art that carries information (title rules, folded steps, failure cards, duration bars, tables, one verdict line) applied through a shared ci-log.sh / ci-log.mjs library. Use when the user says "make the CI logs more readable", "ASCII art logs", "prettier / more interesting job logs", "restyle the pipeline output", "the job log is a wall of text", "I can't find the error in the job log", "audit this job log", "score our CI logs", or "update ci-log.sh". Fetches real job traces, scores them, designs the target log, edits scripts and CI templates, and proves the change with before/after scores. NOT for diagnosing or fixing why a pipeline fails (use git-steward:pipeline-health / pipeline-sentinel), not for interactive terminal apps, and not for GitHub Actions (the taste rules carry over, the tooling does not).
---

# CI log design

A job log is read in three seconds when green and in anger when red. This skill makes
both readings fast: it measures real logs, redesigns them with a small text-art
vocabulary, and applies the design through one shared library so every job looks alike.

**Default mode is read-only** (sections 1 to 3). Editing a repository starts at section 4.
The skill never commits, pushes or triggers a pipeline without the user's say-so.

## 0 · Resolve paths

Everything the skill needs sits beside this file. Scratch output goes to `$OUT`.

```bash
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/ci-log-design}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/ci-log-design"
ls "$SK/scripts/ci_log_audit.py" "$SK/assets/ci-log.sh" || echo "skill assets NOT FOUND"
OUT="${TMPDIR:-/tmp}/ci-log-design"; mkdir -p "$OUT"
command -v glab >/dev/null || echo "no glab: ask the user for raw traces (job page > Show complete raw)"
```

Without `python3` the auditor cannot run: judge by reading traces against
`references/taste.md` and say that no scores were produced.

## 1 · Collect real traces

Judge what the runner actually printed, never what a script looks like it prints. Take
at least one passing and one failing run of each job in scope, the most recent of each.

```bash
P="<group>%2F<project>"          # URL-encoded project path
glab api "projects/$P/jobs?per_page=60" | python3 -c '
import sys, json
seen = set()
for j in json.load(sys.stdin):
    k = (j["name"], j["status"])
    if j["status"] in ("success", "failed") and k not in seen:
        seen.add(k); print(j["id"], j["status"], j["name"], sep="\t")'
glab api "projects/$P/jobs/<job-id>/trace" > "$OUT/<job>_<status>.raw"
```

Find where the output comes from: the shared library (`ci/scripts/lib/ci-log.sh` in the
infra repository or submodule), the CI templates that call it, and the scripts they run.

## 2 · Audit

The score says where a log stands; the render shows what a reader meets on opening it.

```bash
python3 "$SK/scripts/ci_log_audit.py" "$OUT"/*.raw            # score and failed checks per log
python3 "$SK/scripts/ci_log_audit.py" --render "$OUT/<job>_failed.raw"   # folded view
```

Then read `references/taste.md` and answer its human-only questions for each rendered
log. Report a table of job, status, score and the two worst problems, in reader terms
("the error is 600 lines above the end"), not check ids. Stop here if the user asked
only for an audit.

## 3 · Design the target log first

Write the log before writing any code. For each job in scope, draft the full visible
log as plain text, once for the passing run and once for the failing run, using only the
vocabulary in `references/recipes.md`. Check the draft against the ten rules in
`references/taste.md`; the failing draft must end with the cause on the last screen.

Show the user one before/after pair and get agreement before touching more than one
job. A new shape (anything not in the vocabulary) needs a reason tied to data the job
really has; add it to the library, never to a single job.

## 4 · Apply

Change the library first, then the callers, so every job moves together.

1. **Library.** Compare the repository's `ci-log.sh` and `ci-log.mjs` with the copies in
   `$SK/assets/`. Bring the repository copy up to date; keep any function the repository
   added. The assets are the reference implementation, and old calls (`ci_banner`,
   `ci_summary`) keep working.
2. **Callers.** Rewrite templates and scripts to the drafted logs using the wiring in
   `references/recipes.md`: a comment-first multi-line block to load helpers, `ci_run`
   around noisy commands, `ci_finish` in `after_script`. Remove emoji from titles and
   collapse duplicate "done" lines into `ci_kv` facts.
3. **Contracts.** Before editing a script, check whether another program parses its
   stdout. If so, helpers go to stderr and its commands are not wrapped in `ci_run`.

Follow the repository's own agent instructions (for a shared infra repository: branch
placement, consumer propagation). Leave commits and pushes to the user unless asked.

## 5 · Verify

Prove the design locally, then on the runner.

```bash
for s in bash dash "busybox ash"; do                    # the library must behave the same in each
  CI_LOG_LIB=<repo>/ci/scripts/lib/ci-log.sh $s "$SK/scripts/demo.sh" >/dev/null || echo "FAILED under $s"
done
CI_LOG_LIB=<repo>/ci/scripts/lib/ci-log.sh sh "$SK/scripts/demo.sh" --trace fail > "$OUT/demo_fail.raw"
python3 "$SK/scripts/ci_log_audit.py" "$OUT/demo_fail.raw"
NO_COLOR=1 CI_LOG_ASCII=1 sh "$SK/scripts/demo.sh"      # still readable with no colour, no Unicode
```

Local shells are not the runner's. If Docker is available, run the demo in the images
the jobs use; alpine's awk rejected a regex that every local shell accepted.

```bash
for img in alpine:3.20 node:22; do      # the skill dir must be under a path Docker can mount
  docker run --rm -v "$SK:/sk:ro" "$img" sh /sk/scripts/demo.sh >/dev/null || echo "FAILED in $img"
done
```

For a changed script, replay a captured failing output through it (`ci_run x "X" -- sh
-c 'cat captured.txt; exit 1'`) and check that the failure card quotes the real cause.
If the first-error line is a symptom, set `CI_LOG_ERROR_RE` for that job.

A real pipeline run is the only proof of rendering. Ask before pushing a branch. On an
instance not yet checked, include `assets/canary.gitlab-ci.yml`, run its manual job, and
record what the job page shows in `references/gitlab-viewer.md`. Then fetch the new
traces and audit them as in section 2.

At most two redesign rounds per job. If a job still scores under 80 after the second,
report what blocks it (usually tool output that cannot be folded) and stop.

## 6 · Report

Give the user a table of job, score before, score after and visible lines before and
after, plus one rendered failing job. Say which claims rest on a real pipeline run and
which only on local replay, and list anything in `gitlab-viewer.md` still unverified.

## Rules

- **Information first.** Text art that measures nothing is removed, however good it looks.
- **Never hide a failure.** A fold may contain the failing output only if the failure
  card repeats the cause outside it.
- **Do not print secrets.** No `env` dumps, no `set -x` around tokens, no signed URLs.
- **One library.** No job defines its own colours, glyphs or rule characters.
