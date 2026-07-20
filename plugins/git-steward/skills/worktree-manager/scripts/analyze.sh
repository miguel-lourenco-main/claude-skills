#!/usr/bin/env bash
# worktree-manager analyze.sh — list git worktrees, flag prunable ones, AND classify each
# worktree's branch against the default branch (removable vs holds-unique-work). Read-only.
# Emits worktree-manager/v2 JSON.
# Usage: analyze.sh --repo <path>
set -u
# Shared read-only content primitives: gs_default_branch, gs_cmp_base, gs_classify_branch_vs_default.
source "$(dirname "${BASH_SOURCE[0]}")/../../../shared/git-content.sh"

repo="."
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" 2>/dev/null || { echo '{"schema":"worktree-manager/v2","error":"path not found"}'; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo '{"schema":"worktree-manager/v2","error":"not a git repository"}'; exit 0; }

remote="$(git remote 2>/dev/null | head -n1)"
default="$(gs_default_branch "$remote")"
cmp_base="$(gs_cmp_base "$remote" "$default")"

# --- pass 1: parse `git worktree list --porcelain` into v1 per-worktree objects ---
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

# --- pass 2: per-worktree removability + branch classification ---
# `git worktree remove` removes the working directory + admin entry only — it NEVER deletes the
# branch or its commits, which stay in the repo. So "removable" means *no UNCOMMITTED work would be
# lost*: it is safe for any clean, non-primary, unlocked worktree, regardless of how its branch
# relates to the default. The branch `classification` is separate CONTEXT — it tells whether, after
# removing the worktree, the branch ITSELF is also disposable (already merged) or worth keeping
# (unique commits). git-history-surgery's worktree precondition uses `removable` to auto-propose a
# gated worktree-remove pre-step, and surfaces dirty worktrees as a genuine user decision.
main_path="$(jq -r '.[0].path // ""' <<<"$wts")"
n="$(jq 'length' <<<"$wts")"; enriched="[]"; i=0
while [ "$i" -lt "$n" ]; do
  e="$(jq -c --argjson i "$i" '.[$i]' <<<"$wts")"
  br="$(jq -r '.branch // ""' <<<"$e")"
  path="$(jq -r '.path // ""' <<<"$e")"
  detached="$(jq -r '.detached // false' <<<"$e")"
  locked="$(jq -r '.locked // false' <<<"$e")"
  short="${br#refs/heads/}"

  # branch classification (context only — is the branch itself redundant?)
  cls="null"
  if [ "$detached" != "true" ] && [ -n "$br" ] && [ -n "$default" ] && [ "$short" != "$default" ]; then
    cls="$(gs_classify_branch_vs_default "$cmp_base" "$br" --diffstat 2>/dev/null || echo null)"
  fi

  # uncommitted changes in this worktree's working dir (the only thing `worktree remove` can lose)
  dirty=false
  [ "$path" != "$main_path" ] && [ -d "$path" ] && [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ] && dirty=true

  removable=false; reason=""
  if [ "$path" = "$main_path" ]; then
    reason="primary worktree (cannot be removed)"
  elif [ "$locked" = "true" ]; then
    reason="locked worktree"
  elif [ "$dirty" = "true" ]; then
    reason="has uncommitted changes — removing would lose them"
  else
    removable=true
    if [ "$cls" != "null" ] && { [ "$(jq -r '.verdict' <<<"$cls")" = "merged-ancestor" ] || [ "$(jq -r '.verdict' <<<"$cls")" = "squash-rebase-redundant" ]; }; then
      reason="safe to remove — branch already merged into ${default}, so the branch is also deletable"
    elif [ "$detached" = "true" ]; then
      reason="safe to remove — detached HEAD (no branch)"
    elif [ -n "$default" ] && [ "$short" = "$default" ]; then
      reason="safe to remove — extra checkout of the default branch"
    elif [ "$cls" != "null" ]; then
      reason="safe to remove — branch '${short}' is kept (it has unique commits)"
    else
      reason="safe to remove — branch is kept"
    fi
  fi

  e="$(jq -c --argjson cls "$cls" --argjson rem "$removable" --argjson dirty "$dirty" --arg reason "$reason" \
    '. + {classification:$cls, removable:$rem, dirty:$dirty, reason:$reason}' <<<"$e")"
  enriched="$(jq -c --argjson e "$e" '. += [$e]' <<<"$enriched")"
  i=$((i+1))
done
wts="$enriched"

prunable="$(jq -c '[.[]|select(.prunable==true)]' <<<"$wts")"
removable="$(jq -c '[.[]|select(.removable==true)]' <<<"$wts")"

jq -n --arg repo "$repo" --arg default "${default:-}" --argjson wts "$wts" \
  --argjson prunable "$prunable" --argjson removable "$removable" \
  '{schema:"worktree-manager/v2", repo:$repo, default_branch:$default, worktrees:$wts,
    summary:{total:($wts|length), prunable:($prunable|length), removable:($removable|length)}}'
