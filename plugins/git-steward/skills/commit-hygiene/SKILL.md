---
name: commit-hygiene
description: This skill should be used when the user asks to "write a commit message", "draft a conventional commit", "lint my commit messages", "check my commits", "fix my commit message", "reword the last commit", "clean up commit messages", or wants Conventional-Commit formatting for staged changes or to reword un-pushed commits. Defaults to read-only linting/drafting; rewording happens only in apply mode behind a confirmation gate, and only for un-pushed commits.
version: 0.1.0
---

# commit-hygiene

Keep commit messages clean and conventional. In analyze mode, lint recent commit subjects against the
Conventional Commits spec and gather the raw materials needed to draft a message for staged changes. In
apply mode, reword **un-pushed** commits only — never rewriting shared history.

`class: core` — runs on every `repo-steward` / `fleet-steward` pass.

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): lint messages, draft a proposed message. No changes. Trigger on "check/lint/
  draft/what message".
- **apply**: reword un-pushed commits. Trigger on "fix/reword/clean up commit messages". Gated by
  `${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md` (Tier 1 — local, recoverable). When ambiguous, analyze.

## Conventional Commits

`type(optional-scope)!: description`, where `type` ∈ feat, fix, docs, style, refactor, perf, test,
build, ci, chore, revert. A `!` or a `BREAKING CHANGE:` footer marks a breaking change. Subject in the
imperative mood, lower-case, no trailing period, ideally ≤ 72 chars.

## How to use

### Analyze
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/commit-hygiene/scripts/analyze.sh --repo <path> [--count 20]
```
Emits `commit-hygiene/v1` JSON: `lint` (which recent subjects are non-conventional), `unpushed` (commits
that can be safely reworded), and `staged` (files, insertions/deletions, a heuristic `type_guess`).

- **Drafting a message:** read the staged files and diff, then compose a Conventional Commit. The
  `type_guess` is only a hint — choose the real type from the actual change (a bug fix is `fix`, a new
  capability is `feat`, etc.). Pick a concise scope from the touched area when one is obvious.
- **Linting:** report which recent commits aren't conventional and suggest corrected subjects.

### Apply (gated, un-pushed only)
Reword HEAD's message:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/commit-hygiene/scripts/apply.sh \
  --repo <path> --amend-head --message "feat(api): add pagination" --confirm
```
Reword several un-pushed commits — write `<short-sha><TAB><new message>` lines to a file, then:
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/commit-hygiene/scripts/apply.sh \
  --repo <path> --reword-file /tmp/reword.map --confirm
```
Without `--confirm`, apply prints the plan and changes nothing — show that to the user first. The script
**refuses** to reword any commit that is already pushed (it would rewrite shared history). The
multi-commit path matches commits by their original subject during a scripted non-interactive rebase.

## Workflow

1. Run analyze; show lint results and/or a drafted message.
2. For rewording, propose the new message(s), run apply **without** `--confirm`, and show the plan.
3. On explicit confirmation, re-run with `--confirm`.

## Additional resources

- **`${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`** — mode inference and the `--optimize` rule.
- **`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`** — why only un-pushed commits are reworded.
