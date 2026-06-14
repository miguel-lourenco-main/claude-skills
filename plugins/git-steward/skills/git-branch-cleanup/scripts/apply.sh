#!/usr/bin/env bash
# git-branch-cleanup apply.sh — delete prunable branches. MUTATING (gated).
# Honors shared/SAFETY.md: default dry-run; deletion requires explicit --confirm.
#
# Usage:
#   apply.sh --repo <path> [--categories merged,gone,stale] [--stale-days N]
#            [--confirm]         # Tier 1: delete the selected LOCAL branches
#            [--prune]           # also `git remote prune` (drop stale local tracking refs)
#            [--delete-remote]   # Tier 2: also delete the matching branches on the remote
#
# With no --confirm, prints the plan and exits without changing anything.
set -u

repo="."; categories="merged,gone"; stale_days=90
confirm=false; prune=false; delete_remote=false
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --categories) categories="$2"; shift 2 ;;
    --stale-days) stale_days="$2"; shift 2 ;;
    --confirm) confirm=true; shift ;;
    --prune) prune=true; shift ;;
    --delete-remote) delete_remote=true; shift ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
analysis="$(bash "$here/analyze.sh" --repo "$repo" --stale-days "$stale_days")"
err="$(jq -r '.error // empty' <<<"$analysis")"
[ -n "$err" ] && { echo "cannot proceed: $err"; exit 1; }

cd "$repo" || exit 1
remote="$(jq -r '.remote' <<<"$analysis")"
default="$(jq -r '.default_branch' <<<"$analysis")"

# selected = candidates whose category is in the requested set
cat_filter="$(printf '%s' "$categories" | jq -R 'split(",")')"
selected="$(jq -c --argjson cats "$cat_filter" '[.candidates[]|select(.category as $c|$cats|index($c))]' <<<"$analysis")"
count="$(jq 'length' <<<"$selected")"

echo "== git-branch-cleanup plan =="
echo "repo: $repo   default: $default   remote: ${remote:-none}"
echo "categories: $categories   selected: $count branch(es)"
jq -r '.[] | "  - \(.branch)  [\(.category)]  \(.reason)"' <<<"$selected"
$prune && echo "  + prune stale remote-tracking refs (git remote prune $remote)"
$delete_remote && echo "  + DELETE matching branches on remote '$remote' (Tier 2, irreversible on server)"

if ! $confirm; then
  echo
  echo "DRY RUN — nothing changed. Re-run with --confirm to delete local branches."
  $delete_remote && echo "Remote deletion also requires --confirm (and is a separate Tier-2 action)."
  exit 0
fi

[ "$count" -eq 0 ] && { echo; echo "Nothing to delete."; exit 0; }

echo; echo "== applying =="
deleted_local="[]"; failed="[]"
while IFS= read -r row; do
  br="$(jq -r '.branch' <<<"$row")"; cat="$(jq -r '.category' <<<"$row")"
  # safety re-check: never touch default/current
  [ "$br" = "$default" ] && continue
  [ "$br" = "$(git rev-parse --abbrev-ref HEAD)" ] && continue
  if [ "$cat" = "merged" ]; then flag="-d"; else flag="-D"; fi   # -d is safe; gone/stale need force
  if git branch "$flag" "$br" >/dev/null 2>&1; then
    echo "  deleted local: $br"
    deleted_local="$(jq -c --arg b "$br" '. += [$b]' <<<"$deleted_local")"
  else
    echo "  FAILED local:  $br"
    failed="$(jq -c --arg b "$br" '. += [$b]' <<<"$failed")"
  fi
done < <(jq -c '.[]' <<<"$selected")

if $prune && [ -n "$remote" ]; then
  echo "  pruning remote-tracking refs for $remote"; git remote prune "$remote" >/dev/null 2>&1 || true
fi

deleted_remote="[]"
if $delete_remote && [ -n "$remote" ]; then
  while IFS= read -r row; do
    br="$(jq -r '.branch' <<<"$row")"
    [ "$br" = "$default" ] && continue
    if git push "$remote" --delete "$br" >/dev/null 2>&1; then
      echo "  deleted remote: $remote/$br"
      deleted_remote="$(jq -c --arg b "$br" '. += [$b]' <<<"$deleted_remote")"
    fi
  done < <(jq -c '.[]' <<<"$selected")
fi

echo
jq -n --argjson dl "$deleted_local" --argjson dr "$deleted_remote" --argjson f "$failed" \
  '{schema:"branch-cleanup-result/v1", deleted_local:$dl, deleted_remote:$dr, failed:$f}'
