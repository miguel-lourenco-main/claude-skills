#!/usr/bin/env bash
# worktree-manager analyze.sh — list git worktrees and flag prunable/stale ones.
# Read-only. Emits worktree-manager/v1 JSON.
# Usage: analyze.sh --repo <path>
set -u
repo="."
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" 2>/dev/null || { echo '{"schema":"worktree-manager/v1","error":"path not found"}'; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo '{"schema":"worktree-manager/v1","error":"not a git repository"}'; exit 0; }

wts="[]"; cur="{}"
while IFS= read -r line; do
  case "$line" in
    worktree\ *) [ "$cur" != "{}" ] && wts="$(jq -c --argjson c "$cur" '. += [$c]' <<<"$wts")"; cur="$(jq -n --arg p "${line#worktree }" '{path:$p}')" ;;
    branch\ *) cur="$(jq -c --arg b "${line#branch }" '.branch=$b' <<<"$cur")" ;;
    HEAD\ *) cur="$(jq -c --arg h "${line#HEAD }" '.head=$h' <<<"$cur")" ;;
    detached) cur="$(jq -c '.detached=true' <<<"$cur")" ;;
    locked*) cur="$(jq -c '.locked=true' <<<"$cur")" ;;
    prunable*) cur="$(jq -c --arg r "${line#prunable }" '.prunable=true|.prunable_reason=$r' <<<"$cur")" ;;
  esac
done < <(git worktree list --porcelain 2>/dev/null)
[ "$cur" != "{}" ] && wts="$(jq -c --argjson c "$cur" '. += [$c]' <<<"$wts")"

prunable="$(jq -c '[.[]|select(.prunable==true)]' <<<"$wts")"

jq -n --arg repo "$repo" --argjson wts "$wts" --argjson prunable "$prunable" \
  '{schema:"worktree-manager/v1", repo:$repo, worktrees:$wts,
    summary:{total:($wts|length), prunable:($prunable|length)}}'
