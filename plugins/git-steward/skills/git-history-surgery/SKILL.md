---
name: git-history-surgery
description: This skill should be used when the user asks to "remove a secret from git history", "purge a file from history", "strip a large file from the repo", "the repo has a leaked API key/password committed", "scan for committed secrets", "shrink my git history", or "rewrite history to delete X". Defaults to read-only detection (secrets + oversized blobs); the actual rewrite happens only in apply mode, requires git-filter-repo or BFG, takes a backup first, and gates force-push as a separate step.
version: 0.1.0
---

# git-history-surgery

Find and remove secrets and oversized files from git history. In analyze mode, detect committed secrets
and large blobs. In apply mode, rewrite history to purge them — safely, with a mandatory backup, using
a real rewrite tool (never a hand-rolled one).

`class: core` — runs on every `repo-steward` / `fleet-steward` pass (analyze side). **This is the most
dangerous skill; treat apply with maximum care.**

## Modes (see `${CLAUDE_PLUGIN_ROOT}/shared/MODES.md`)

- **analyze** (default): scan for secrets and oversized blobs and report them. No changes. Trigger on
  "scan/audit for secrets, find large files, check history".
- **apply**: rewrite history to remove a path or redact a secret. Trigger on "remove/purge/strip X from
  history". Gated at the highest level (`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`, Tier 2). When
  ambiguous, analyze.

## How to use

### Analyze
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-history-surgery/scripts/analyze.sh --repo <path> [--min-mb 5] [--top 10]
```
Emits `history-surgery/v1` JSON: `secret_scan` (findings with file/commit/line; uses `gitleaks` when
present, else a working-tree pattern scan — note the limitation), `large_blobs` over `--min-mb`, and a
`tools` block with `rewrite_ready`. Report findings and, crucially, whether a rewrite tool is available.

**Detection ≠ removal.** The git-native scan only covers the working tree; for thorough full-history
secret detection, recommend installing `gitleaks` or `trufflehog`. Removal always needs a rewrite tool.

### Apply (gated, irreversible)
Requires `git-filter-repo` or BFG. If neither is installed, apply **refuses** and prints install
instructions rather than performing a risky homegrown rewrite.

```bash
# remove a path from all history:
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-history-surgery/scripts/apply.sh \
  --repo <path> --remove-path secrets.env --confirm --i-understand <repo-name>

# redact secret strings (a replace-text rules file, one rule per line):
bash ${CLAUDE_PLUGIN_ROOT}/skills/git-history-surgery/scripts/apply.sh \
  --repo <path> --replace-text rules.txt --confirm --i-understand <repo-name>
```

The Tier-2 gate requires **both** `--confirm` and `--i-understand <repo-name>` (typing the repo name).
Before rewriting, the script creates a backup ref (`refs/git-steward/backup/<ts>`) and a full mirror
clone under `.git-steward-backups/`. **Force-push is never done automatically** — the script prints the
`git push --force-with-lease` command for the user to run deliberately.

## Workflow

1. Analyze; present secrets + large blobs and whether a rewrite tool exists.
2. If removal is wanted and no tool is installed, stop and give install instructions (analyze-only).
3. Decide exactly what to remove (paths and/or a replace-text rules file). For a leaked credential,
   rewriting history does **not** un-leak it — also tell the user to rotate/revoke the secret.
4. Run apply **without** `--confirm` to show the plan; get explicit confirmation naming the repo.
5. Run apply with `--confirm --i-understand <repo-name>`; verify; then force-push as a separate step.
6. Pair with `gitignore-guard` so the purged files aren't re-committed.

## Additional resources

- **`references/rewrite-playbook.md`** — git-filter-repo / BFG recipes, replace-text format, backup &
  restore, and the `history-surgery/v1` schema.
- **`${CLAUDE_PLUGIN_ROOT}/shared/SAFETY.md`** — the backup-before-rewrite protocol and gates.
