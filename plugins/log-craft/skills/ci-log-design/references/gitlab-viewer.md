# What the GitLab job page does with a log

Each fact is tagged: **[seen]** observed in real traces from the user's runner,
**[docs]** stated in GitLab documentation, **[unverified]** believed but not confirmed.
Run `assets/canary.gitlab-ci.yml` once on a new GitLab instance or runner to settle the
unverified ones, then update the tags here.

## Sections

- **[docs]** A collapsible section is two marker lines. `\e[0K` erases the marker so only
  the title shows; the two timestamps give the header its duration badge.

  ```
  printf '\033[0Ksection_start:%s:%s[collapsed=true]\r\033[0K%s\n' "$(date +%s)" my_id "Title"
  printf '\033[0Ksection_end:%s:%s\r\033[0K\n' "$(date +%s)" my_id
  ```
  https://docs.gitlab.com/ci/jobs/job_logs/
- **[seen]** Ids made of letters, digits and `_` work. **[unverified]** `.` and `-` in
  ids, nested sections, and what happens when an id is reused. `ci_finish` keys its
  timeline on the id, so keep ids unique within a job.
- **[seen]** The runner wraps the job in its own sections: `prepare_executor`,
  `prepare_script`, `get_sources`, `restore_cache`, `step_script`, `after_script`,
  `archive_cache`, `upload_artifacts_on_success`, `cleanup_file_variables`. Only
  `step_script` and `after_script` hold output a repository controls.
- **[seen]** Nested sections and `-`-free ids pass through a real pipeline intact (canary
  on gitlab.com, runner 19.3.0, October 2026). How the page draws the nesting was not
  inspected.
- **[unverified]** The page opens scrolled to the end of the log.

## Echoed commands

- **[seen]** Every `script:` entry is printed as `$ <command>` before it runs. A
  multi-line entry is printed as its first line plus ` # collapsed multi-line command`.
  This is the lever against echo noise: start a block with a short comment line.
- **[seen]** `before_script` and `script` run in one shell, so functions sourced in
  `before_script` exist in `script`. **[docs]** `after_script` is a new shell: source the
  library again there. `$CI_JOB_STATUS` (`success`, `failed`, `canceled`) exists only in
  `after_script`.
- **[seen]** An `EXIT` trap set in `script` fires when the job fails, also on alpine's
  `sh`, so `ci_finish_on_exit` works. A sourced library in `after_script` finds the same
  state directory (`/tmp/ci-log-$CI_JOB_ID`) on the docker executor.
- **[seen]** Lines printed by the runner itself at the top of `step_script` ("Using
  docker image sha256:…") are long and cannot be changed.

## Colour and glyphs

- **[docs]** The 16 base colours and the 256-colour palette render; the page maps them
  to its own theme. https://gitlab.com/gitlab-org/gitlab/-/merge_requests/161461
- **[seen]** Bold, dim, and the colours 31, 32, 33 and 36 are emitted in every job today.
  How the page draws dim has not been inspected: keep dim for detail a reader can lose.
- **[unverified]** Truecolor, italic, underline. Do not depend on them.
- **[unverified]** Box-drawing (U+2500 block), block elements (U+2580 block) and
  `✓ ✖ → ·` are one cell wide in the page font. Emoji are not, and symbols with an emoji
  form (`⚠ ⚙ ⏳`) may be drawn as colour emoji depending on the reader's fonts.
- **[unverified]** stdout is not a terminal in a job, so tools switch colour off unless told
  otherwise (`FORCE_COLOR=1`, `--color=always`). **[docs]** `GITLAB_CI=true` and `CI=true` are set.

## Size and time

- **[docs]** A runner truncates a log at `output_limit`, 4 MB by default, and drops the
  end. https://docs.gitlab.com/runner/configuration/advanced-configuration/
- **[seen]** Raw traces from this runner carry a timestamp and stream prefix on every
  line (`2026-10-05T08:28:22.069574Z 01O `, with `+` marking a continuation). The page
  hides them. Never print your own timestamps.
- **[docs]** `\r` returns to the start of the line. A redrawn progress bar is stored
  frame by frame in the raw log.

## Reading a trace

```bash
glab api "projects/<group>%2F<project>/jobs?per_page=40"        # job ids, names, statuses
glab api "projects/<group>%2F<project>/jobs/<job-id>/trace" > job.raw
```

`ci_log_audit.py` understands the prefix, the continuation flag, section markers, ANSI
codes and `\r`, and reports on the authored part only.
