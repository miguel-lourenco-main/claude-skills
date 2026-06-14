# FORGE — GitLab / GitHub abstraction with pure-git fallback

A thin capability layer so skills work across forges and degrade gracefully when a CLI is missing.
Skills reference this file; the shared resolver `scripts/resolve-host.sh` (bundled in skills that need
it) implements the detection deterministically.

## Capabilities needed (the only forge-specific operations)

| Neutral concept | GitLab (`glab`) | GitHub (`gh`) | Pure-git fallback |
|---|---|---|---|
| default branch | `glab api projects/:id` → `default_branch` | `gh repo view --json defaultBranchRef` | `git symbolic-ref refs/remotes/origin/HEAD` |
| is branch merged | MR state via `glab mr list` | PR state via `gh pr list` | `git branch --merged`, `git cherry` |
| list work items | `glab issue/mr list` | `gh issue/pr list` | — (no fallback; report unavailable) |
| CI status | `glab ci status/list/view` | `gh run list/view/watch` | — (no fallback; report unavailable) |

Read-only git operations (branch classification, health, history scan, blob listing) need **no forge at
all** and always work.

## Forge detection (resolver order)

1. Honor an explicit `--repo <path>` / `--project <slug>` argument if given.
2. `git remote get-url <remote>` (default `origin`) → parse the host **after normalizing SSH host
   aliases**. A user `~/.ssh/config` alias like `gitlab.com-personal` must be stripped to its real host
   (`gitlab.com`) before forge selection — otherwise CLI auto-detection fails. Map host → forge:
   `gitlab.*` → gitlab, `github.com` → github, else unknown.
3. Probe CLI availability (`command -v glab` / `command -v gh`) and pick the CLI matching the forge.
4. Auth check (`glab auth status` / `gh auth status`). On failure, emit `auth: "missing"` and never
   proceed to apply/execute.

## Output contract (`host-resolution/v1`)

```json
{ "schema": "host-resolution/v1", "host": "gitlab|github|unknown",
  "cli": "glab|gh|none", "project": "group/name", "remote": "origin",
  "default_branch": "main", "auth": "ok|missing", "warnings": [] }
```

## Degradation rules

- **GitLab-first**: `glab` is installed and most repos are GitLab — prefer it.
- **`gh` absent**: GitHub repos still work for read-only git ops via raw git. Forge-specific GitHub
  actions (work-items, CI, merged-state) report that `gh` + `gh auth login` are required, and the skill
  continues with whatever git-native data it can produce.
- **No remote**: `host: unknown`, `cli: none` — local-only repo; report and skip forge operations.
- **Multiple remotes**: default to `origin`; if several forges are present, note the assumption and
  proceed read-only against the first resolvable one.
- Always pass an explicit `--repo`/`-R <slug>` to `glab`/`gh` so they never rely on broken URL
  auto-detection (critical for the SSH-alias case).
