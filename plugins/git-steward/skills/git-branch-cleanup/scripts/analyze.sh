#!/usr/bin/env bash
# git-branch-cleanup analyze.sh — classify prunable branches. Read-only.
# Emits branch-cleanup/v1 JSON on stdout. NEVER deletes.
#
# Usage: analyze.sh --repo <path> [--stale-days N]
# Categories per local branch: merged | gone | stale | keep
#   merged = fully merged into the default branch
#   gone   = upstream tracking branch was deleted on the remote
#   stale  = no commit in <stale-days> (default 90), not merged/gone
#   keep   = default branch, current branch, or active & unmerged
set -u

repo="."; stale_days=90
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --stale-days) stale_days="$2"; shift 2 ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

cd "$repo" 2>/dev/null || { echo "{\"schema\":\"branch-cleanup/v1\",\"error\":\"path not found: $repo\"}"; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "{\"schema\":\"branch-cleanup/v1\",\"repo\":\"$repo\",\"error\":\"not a git repository\"}"; exit 0; }

name="$(basename "$(git rev-parse --show-toplevel)")"
current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
remote="$(git remote 2>/dev/null | head -n1)"
default="$(git symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null | sed "s#^$remote/##")"
[ -z "$default" ] && for b in main master; do git show-ref --verify --quiet "refs/heads/$b" && { default="$b"; break; }; done
[ -z "$default" ] && default="$current"

cutoff=$(( $(date +%s) - stale_days*86400 ))
merged_set=" $(git branch --merged "$default" 2>/dev/null | sed 's/^[* ] *//' | tr '\n' ' ') "

cands="[]"
while IFS='|' read -r br track cdate; do
  [ -n "$br" ] || continue
  reason=""; category="keep"; recoverable=true
  sha="$(git rev-parse --short "$br" 2>/dev/null)"
  ahead="$(git rev-list --count "$default..$br" 2>/dev/null || echo 0)"
  behind="$(git rev-list --count "$br..$default" 2>/dev/null || echo 0)"
  if [ "$br" = "$default" ] || [ "$br" = "$current" ]; then
    category="keep"; reason="protected (default/current)"
  elif case "$merged_set" in *" $br "*) true;; *) false;; esac; then
    category="merged"; reason="fully merged into $default"
  elif [ "$track" = "[gone]" ]; then
    category="gone"; reason="upstream deleted on remote"
  elif [ -n "$cdate" ] && [ "$cdate" -lt "$cutoff" ]; then
    category="stale"; reason="no commit in ${stale_days}d"
  else
    category="keep"; reason="active, unmerged"
  fi
  cands="$(jq -c --arg br "$br" --arg sha "$sha" --arg cat "$category" --arg reason "$reason" \
    --arg track "$track" --argjson rec "$recoverable" --argjson ahead "${ahead:-0}" --argjson behind "${behind:-0}" \
    '. += [{branch:$br, sha:$sha, category:$cat, reason:$reason, upstream_track:$track, recoverable:$rec, ahead:$ahead, behind:$behind}]' <<<"$cands")"
done < <(git for-each-ref --format='%(refname:short)|%(upstream:track)|%(committerdate:unix)' refs/heads 2>/dev/null)

# stale remote-tracking refs (server branches already gone) — informational, pruned via `git remote prune`
remote_prunable="[]"
if [ -n "$remote" ]; then
  remote_prunable="$(git remote prune "$remote" --dry-run 2>/dev/null \
    | sed -n 's/.* would prune \(.*\)/\1/p' | jq -R . | jq -s . 2>/dev/null || echo '[]')"
fi

jq -n --arg name "$name" --arg repo "$repo" --arg default "$default" --arg current "$current" \
  --arg remote "${remote:-}" --argjson staledays "$stale_days" \
  --argjson cands "$cands" --argjson remote_prunable "$remote_prunable" \
  '{schema:"branch-cleanup/v1", name:$name, repo:$repo, default_branch:$default, current_branch:$current,
    remote:$remote, stale_days:$staledays,
    candidates:$cands,
    summary:{ merged:[$cands[]|select(.category=="merged")]|length,
              gone:[$cands[]|select(.category=="gone")]|length,
              stale:[$cands[]|select(.category=="stale")]|length,
              keep:[$cands[]|select(.category=="keep")]|length },
    remote_prunable:$remote_prunable}'
