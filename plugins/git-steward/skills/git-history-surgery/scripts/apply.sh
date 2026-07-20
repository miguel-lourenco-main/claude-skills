#!/usr/bin/env bash
# git-history-surgery apply.sh — rewrite history to remove paths/secrets.
# MUTATING + IRREVERSIBLE (Tier 2). Honors shared/SAFETY.md.
#
# REQUIRES git-filter-repo or BFG. NEVER hand-rolls history rewriting. If neither
# is installed it refuses and prints install instructions.
#
# Always before rewriting (on --confirm): create a backup ref AND a mirror clone.
# Force-push is a SEPARATE opt-in step printed at the end, never performed here.
#
# Usage:
#   apply.sh --repo <path> --remove-path <pathspec> [--remove-path ...] --confirm --i-understand <repo-name>
#   apply.sh --repo <path> --replace-text <file>     --confirm --i-understand <repo-name>
set -u

repo="."; confirm=false; understand=""; replace_text=""
declare -a remove_paths=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --remove-path) remove_paths+=("$2"); shift 2 ;;
    --replace-text) replace_text="$2"; shift 2 ;;
    --confirm) confirm=true; shift ;;
    --i-understand) understand="$2"; shift 2 ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

cd "$repo" || exit 1
git rev-parse --git-dir >/dev/null 2>&1 || { echo "not a git repository: $repo"; exit 1; }
name="$(basename "$(git rev-parse --show-toplevel)")"

have() { command -v "$1" >/dev/null 2>&1; }
if ! have git-filter-repo && ! have bfg; then
  cat <<EOF
REFUSED: history rewriting requires git-filter-repo or BFG, and neither is installed.
Hand-rolling history rewrites is unsafe, so this skill will not do it.

Install one, then re-run:
  • git-filter-repo (recommended):  pipx install git-filter-repo   # or: pip install git-filter-repo
  • BFG Repo-Cleaner:               download bfg.jar from https://rtyley.github.io/bfg-repo-cleaner/

Analyze still works without these — it just won't perform the removal.
EOF
  exit 2
fi

# --- plan ---
echo "== git-history-surgery plan (Tier 2, IRREVERSIBLE) =="
echo "repo: $repo ($name)"
[ "${#remove_paths[@]}" -gt 0 ] && printf '  remove path from ALL history: %s\n' "${remove_paths[@]}"
[ -n "$replace_text" ] && echo "  redact text per rules in: $replace_text"
echo "  a backup ref + mirror clone will be created first; force-push is a separate manual step."

if ! $confirm; then
  echo; echo "DRY RUN — nothing changed. To proceed, re-run with: --confirm --i-understand $name"
  exit 0
fi
if [ "$understand" != "$name" ]; then
  echo; echo "REFUSED: Tier-2 confirmation requires --i-understand $name (you passed '${understand:-}')."
  exit 1
fi
if [ "${#remove_paths[@]}" -eq 0 ] && [ -z "$replace_text" ]; then
  echo "nothing to do: pass --remove-path and/or --replace-text"; exit 1
fi

# --- preconditions: linked worktrees + dirty tree (git-filter-repo cannot handle either) ---
# filter-repo rewrites every commit, leaving any OTHER linked worktree pointing at commits
# that no longer exist (orphaned HEAD). It also refuses to run on a dirty tree, and any
# uncommitted work would be lost in the rewrite. Refuse early with an actionable message
# rather than orphaning worktrees or aborting mid-rewrite.
wt_count="$(git worktree list --porcelain 2>/dev/null | grep -c '^worktree ')"
if [ "${wt_count:-1}" -gt 1 ]; then
  echo
  echo "REFUSED: $name has $wt_count linked worktrees. A history rewrite would orphan the"
  echo "other worktree(s) — their HEADs would point at rewritten-away commits. Remove the"
  echo "extra worktrees first (git worktree remove <path>), then re-run:"
  git worktree list
  exit 1
fi
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo
  echo "REFUSED: working tree is dirty. git-filter-repo refuses to run on a dirty tree, and"
  echo "uncommitted changes would be lost by the rewrite. Commit or stash them, then re-run."
  exit 1
fi

# --- mandatory backups (shared/SAFETY.md) ---
ts="$(date +%Y%m%d-%H%M%S)"
backup_ref="refs/git-steward/backup/$ts"
git update-ref "$backup_ref" HEAD
backup_dir="$(git rev-parse --show-toplevel)/.git-steward-backups"
mkdir -p "$backup_dir"
mirror="$backup_dir/${name}-${ts}.git"
git clone --mirror -q . "$mirror" && echo "backup: ref $backup_ref + mirror $mirror"

# --- rewrite ---
ok=false
if have git-filter-repo; then
  args=(); for p in "${remove_paths[@]}"; do args+=(--path "$p"); done
  [ "${#remove_paths[@]}" -gt 0 ] && args+=(--invert-paths)
  [ -n "$replace_text" ] && args+=(--replace-text "$replace_text")
  if git filter-repo "${args[@]}" --force; then ok=true; fi
elif have bfg; then
  for p in "${remove_paths[@]}"; do bfg --delete-files "$(basename "$p")" . && ok=true; done
  [ -n "$replace_text" ] && { bfg --replace-text "$replace_text" . && ok=true; }
  git reflog expire --expire=now --all && git gc --prune=now --aggressive >/dev/null 2>&1
fi

if $ok; then
  echo
  echo "History rewritten. Verify, then force-push as a SEPARATE deliberate step:"
  echo "    git push --force-with-lease --all && git push --force-with-lease --tags"
  echo "Restore if needed:  git clone $mirror restored.git"
  jq -n --arg ref "$backup_ref" --arg mirror "$mirror" \
    '{schema:"history-surgery-result/v1", status:"rewritten", backup_ref:$ref, mirror:$mirror, force_push_pending:true}'
else
  echo "REWRITE FAILED — your repo is unchanged on disk except the backup ref. Restore from $mirror if needed."
  exit 1
fi
