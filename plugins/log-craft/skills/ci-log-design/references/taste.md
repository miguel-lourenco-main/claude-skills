# Taste: judging a CI job log

A job log has two readers. One glances at a green job for three seconds. The other
arrives at a red job, annoyed, and needs the cause. Every rule below serves one of them.
Text art earns its place only when it carries information a plain line cannot: structure,
proportion, or where to look.

## The rules, in priority order

1. **The failure lands last.** GitLab opens a job page scrolled to the bottom. The last
   screen (about 40 lines) of a failed job must say what failed, the command, the exit
   code, and the first error line. Nothing decorative follows it.
2. **Quiet success.** A step that worked gets one line, or none beyond its folded section
   header. Tool output nobody reads when it works (installs, pulls, builds) goes inside a
   collapsed section. Aim for a passing job that fits on one screen when opened.
3. **One verdict, one place.** The last line states the outcome, the job and the total
   time. Do not print three different "done" lines from three layers of scripts.
4. **Art must measure something.** A bar shows a share or a duration. A rule separates two
   things. A table aligns comparable values. A figlet banner, a mascot or a box around a
   single sentence measures nothing and pushes content off the screen.
5. **Colour repeats a glyph or a word, never replaces it.** The log must read the same
   through `NO_COLOR=1`, in the raw download, and in a grep result. Green, yellow and red
   mean pass, attention and fail; cyan is structure; dim is detail. No other meanings.
6. **Single-cell glyphs only.** `✓ ✖ → · ━ ─ ┄ █ ░` hold their column in a monospace
   font. Emoji do not: the browser draws them from a fallback font of another width, and
   whether a symbol such as `⚠` becomes an emoji depends on the reader's fonts. Use `!`.
7. **No side borders.** Rules go above and below content, never down its sides. A `│` on
   every line breaks copy-paste and grep, and the right edge drifts as soon as a value is
   longer than expected.
8. **Lines stay under 100 cells; nothing visible over 120.** Long values (URLs, hashes)
   get their own `key value` line instead of sitting inside a sentence.
9. **One vocabulary across every job.** Header, section, status line, key-value, summary:
   the same shapes in every repository, so the eye learns where to look once. This is why
   the shapes live in a shared library and not in each script.
10. **Cost counts.** Decoration lines stay under 8% of what is visible. No spinner or
    redrawn progress bar: a log is not a terminal and stores every frame. The runner
    truncates a log at 4 MB and cuts the end, which is where the verdict is.

## Bad and good, from real jobs

**A failed build.** Before: 608 visible lines, the cause 41 lines into the build output, then 550
lines of traces, ending in a line that only says something exited 1.

```
    at <unknown> ([next]/internal/font/google/archivo_narrow_8236660f.module.css:79:8)
    at <unknown> (https://nextjs.org/docs/messages/module-not-found)
 ELIFECYCLE  Command failed with exit code 1.
```

After: the same output folded, and the last screen is the diagnosis.

```
> Build
  ✖ Build failed · exit 1 · 1m 29s
    command          pnpm build
    full output      expand "Build" above
  ┄┄ first error · line 41 of 592 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
    > Build error occurred
    Error: Turbopack build failed with 9 errors:
    [next]/internal/font/google/archivo_narrow_8236660f.module.css:7:8
    Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
  ┄┄ last lines ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
     ELIFECYCLE  Command failed with exit code 1.

── Summary ───────────────────────────────────────────────────────────────────
  ✓ Install dependencies  ████▌                     20s
  ✖ Build                 ████████████████████   1m 29s
━━ ✖ FAILED · Build · exit 1 · 1m 49s ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

(The card is the library's real output for that build log, shortened here; the durations
are the original job's.)

**A header.** Before: six lines, an emoji, and the title nowhere near the rule.

```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚀 Vercel Deploy — production
  scripts/vercel-deploy-ci.sh production
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```

After: three lines, the title set into the rule.

```

━━ Deploy · production ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   scripts/vercel-deploy-ci.sh production
```

**Echoed helper calls.** GitLab prints each `script:` line before running it, so a helper
call shows up twice, and one 350-character bootstrap line opens every job.

```
$ if [ -f infra/ci/scripts/lib/ci-log.sh ]; then . infra/ci/scripts/lib/ci-log.sh; elif [ -f ci/scripts/lib/…
$ ci_ok "Production deploy complete"
  ✓ Production deploy complete
```

After: a multi-line YAML block is echoed as its first line only, so the first line is a
short comment that names the step (see `recipes.md`).

```
$ # deploy to production # collapsed multi-line command
```

**Three endings.** `✓ Vercel deploy command finished…`, `✓ Build finished after 242s…`,
`✓ Production is serving … after 243s total.`, `✓ Production deploy complete`. Keep the
facts as `ci_kv` lines (url, deployment id) and let the verdict line say it once.

## Scoring

`scripts/ci_log_audit.py` measures what can be measured, on the part of the log the
repository controls (the `step_script` and `after_script` runner sections).

| Check | Weight | Passes when |
|---|---|---|
| failure-lands-last | 20 | a failed job has a failure line in its last 40 visible lines |
| noise-folded | 15 | at most 80 visible lines, or at least 60% of lines inside collapsed sections |
| summary | 12 | the job ends with a summary or verdict |
| width | 10 | no visible line over 120 cells |
| echo | 10 | echoed commands are at most 15% of visible lines, none over 120 cells |
| decoration | 8 | rule-only lines are at most 8% of visible lines |
| sections-balanced | 8 | every `section_start` has its `section_end` |
| blank | 5 | blank lines are at most 15% of visible lines |
| sections-used | 5 | a log longer than a screen uses collapsible sections |
| glyph-width | 4 | at most two visible lines carry emoji or wide glyphs |
| status-vocabulary | 3 | outcomes use status-glyph lines |

80 or more is good, 60 to 79 is usable, below 60 needs a redesign. A failed job that
misses `failure-lands-last` needs a redesign whatever its total.

The script cannot judge these. Read the `--render` output and answer each one:

- Is the first error shown the real cause, or a symptom further down the chain?
- Does every bar, table and rule carry information, or could it be deleted unnoticed?
- With colour stripped, is every status still told by a glyph or a word?
- Are titles written for a reader who does not know the script (what, not how)?
- Does any line expose a token, a full environment dump, or a signed URL?
- Would two jobs from different repositories look like siblings?

## Sources

Rules 1, 3, 5 and 10 follow the Command Line Interface Guidelines (https://clig.dev:
put the most important information at the end, no animation when output is not a
terminal, never colour alone) and https://no-color.org. Rule 6 and the viewer limits
are in `gitlab-viewer.md`. The reference outputs studied for vocabulary: cargo
(fixed-width verb column), pytest (titled rules), Homebrew (`==>` headers), systemd
(`[ OK ]` status column), rustc and elm (diagnostics that quote the source and point at
it), git diffstat (proportional bars), Docker BuildKit plain progress (step ids with
durations).
