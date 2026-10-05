# Recipes: the vocabulary and how to wire it

Everything here is produced by `assets/ci-log.sh` (shell) or `assets/ci-log.mjs` (node).
Run `sh scripts/demo.sh` to see all of it in a terminal.

## The vocabulary

| Shape | Call | Use it for | Do not use it for |
|---|---|---|---|
| Header | `ci_header "Deploy · production" "scripts/deploy.sh production"` | once, at the top of a job | each step |
| Folded step | `ci_run build "Build" -- pnpm build` | any command with more than a few lines of output | `cd`, `export`, or a command whose stdout is piped onward |
| Section | `ci_section_start id "Title"` … `ci_section_end id` | several commands that form one phase | wrapping a single status line |
| Status line | `ci_ok` `ci_warn` `ci_fail` `ci_info` `ci_step` | one outcome or one fact | narrating every command |
| Key-value | `ci_kv url "https://…"` | facts a reader copies: url, id, version, commit | sentences |
| Bar | `ci_bar coverage 63 100` | one value against a limit: coverage, budget, quota | values with no meaningful maximum |
| Table | `printf 'a\tb\n1\t2\n' \| ci_table` | three or more rows of comparable values | two values (use `ci_kv`) |
| Finish | `ci_finish "Build"` | once, last thing in the job | mid-job progress |

```
━━ Deploy · production ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   scripts/vercel-deploy-ci.sh production
    environment      production
    commit           8d79723b  fix(vercel): promote production domains
> Install vercel@54.2.0
> Pull project settings
> Wait for the deployment to be READY
  ! build cache was empty, this deploy was a cold build
    url              https://example-hc912echy.vercel.app
    bundle budget    ████████████████▍░░░  412 / 500 kB
    route       size     first load
    ──────────  ───────  ──────────
    /           5.2 kB   101 kB
    /jobs/[id]  18.9 kB  134 kB

── Summary ───────────────────────────────────────────────────────────────────
  ✓ Install vercel@54.2.0                █████████████▎             2s
  ✓ Pull project settings                ██████▋                    1s
  ✓ Wait for the deployment to be READY  ████████████████████       3s
━━ ✓ PASSED · Deploy production · 6s ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

(`>` marks a collapsed section header as the page shows it.)

Writing rules for titles and messages:

- Titles name the thing, in a few words, without emoji: "Install dependencies", not
  "🧰 Toolchain — corepack + pnpm install (bounded, retried)". Keep them under 44 cells.
- Keys are lowercase ASCII, up to 16 characters. Table cells that must align are ASCII.
- A status line states the outcome, not the activity: "42 tests passed", not "Tests done".
- Put a value that the reader will copy on a `ci_kv` line of its own.

## Shapes the library does not have

Add one only when a job has the data for it, and add it to the library, not to the job.

- **Tree** for a set of artifacts or packages: `├── ` `└── ` `│   ` (ASCII: `|-- ` `` `-- ``).
- **Sparkline** for a short series such as per-shard durations: `▁▂▃▄▅▆▇█`.
- **Step counter** `[3/7]` in a section title when the number of phases is fixed.
- **Diffstat row** `src/app.ts | 12 ++++++------` for changed-files reports.

## Wiring a GitLab job

Load the library in a block whose first line is a comment. GitLab echoes only that line.

```yaml
.ci_log:
  before_script:
    - |
      # load log helpers
      if [ -f infra/ci/scripts/lib/ci-log.sh ]; then . infra/ci/scripts/lib/ci-log.sh
      elif [ -f ci/scripts/lib/ci-log.sh ]; then . ci/scripts/lib/ci-log.sh
      else for f in ci_header ci_banner ci_section_start ci_section_end ci_step ci_ok ci_warn ci_fail ci_info ci_kv ci_bar ci_table ci_hr ci_finish ci_finish_on_exit ci_summary ci_summary_end; do eval "$f(){ :; }"; done
           ci_run() { shift 2; [ "$1" = "--" ] && shift; "$@"; }
      fi
```

The fallback keeps a job working when the library is missing: every helper becomes a
no-op, except `ci_run`, which must still run its command.

Fold each noisy command, and let the job end with the verdict.

```yaml
build_job:
  extends: .ci_log
  script:
    - |
      # build
      ci_header "Build" "pnpm build"
      ci_run toolchain "Install dependencies" -- pnpm install --frozen-lockfile
      ci_run build "Build" -- pnpm build
  after_script:
    - |
      # summary
      . infra/ci/scripts/lib/ci-log.sh 2>/dev/null && ci_finish "Build"
```

`ci_run` returns the command's exit code, so the job stops at the first failure and the
failure card is the last thing printed before the summary. `after_script` runs on pass
and on fail, and `ci_finish` reads `$CI_JOB_STATUS` there.

Where a job cannot have its own `after_script`, arm the verdict from the script instead
(works in bash, dash and ash; confirm once on the runner image in use):

```yaml
  script:
    - |
      # build
      ci_finish_on_exit "Build"
      ci_run build "Build" -- pnpm build
```

## Scripts with a machine-readable stdout

A script whose stdout is parsed by another program must send every helper line to
stderr. GitLab shows both streams.

```sh
CI_LOG_STREAM=stderr; export CI_LOG_STREAM
. "$(cd "$(dirname "$0")" && pwd)/lib/ci-log.sh"
```

```js
import { createCiLog } from './lib/ci-log.mjs';
const log = createCiLog({ stream: process.stderr });
```

Do not wrap such a script's own contract-producing command in `ci_run`: it merges stderr
into stdout.

## Forcing colour in tools

Tools drop colour when stdout is not a terminal. Inside `ci_run` their output is folded
anyway, so only force colour where the reader will expand it often (test reporters):
`FORCE_COLOR=1` for node tools, `--color=always` for cargo, pytest and git.
