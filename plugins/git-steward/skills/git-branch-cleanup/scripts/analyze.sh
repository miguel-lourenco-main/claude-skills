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
# Shared read-only content primitives: gs_cmp_base, gs_ahead_behind, branch_content_in_default.
source "$(dirname "${BASH_SOURCE[0]}")/../../../shared/git-content.sh"

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

# Comparison base for the merged-set / ahead-behind / cherry-tree tests below: prefer the
# freshly-fetched remote-tracking default ($remote/$default) over the LOCAL $default (which
# `fetch --prune` never fast-forwards), falling back to the local NAME when offline/standalone.
# See gs_cmp_base in shared/git-content.sh for the full rationale.
cmp_base="$(gs_cmp_base "$remote" "$default")"

cutoff=$(( $(date +%s) - stale_days*86400 ))
merged_set=" $(git branch --merged "$cmp_base" 2>/dev/null | sed 's/^[* ] *//' | tr '\n' ' ') "
# Branches checked out in ANY worktree (including the current one). git refuses to
# delete a worktree-held branch, and it holds active work — so it must never be a
# delete candidate, even when it looks merged/gone. Protect it as keep.
worktree_set=" $(git worktree list --porcelain 2>/dev/null | sed -n 's#^branch refs/heads/##p' | tr '\n' ' ') "

# branch_content_in_default <def> <br> (sourced from shared/git-content.sh): true when every
# change on $br is already in $def, including via a SQUASH or REBASE merge that `git branch
# --merged` can't see. Caller guards with ahead>0, so ancestor (ahead==0) branches never reach it.

# Accumulate one compact JSON object per branch into NDJSON, then slurp once at the
# end (`jq -s`). Appending to a growing array with `jq '. += [...]'` per branch
# re-serializes the WHOLE array every iteration — O(n²) jq work on branch-heavy
# repos. Building each object in isolation keeps it O(n) while preserving jq's safe
# escaping and the for-each-ref ordering.
cand_lines=""
while IFS='|' read -r br track cdate; do
  [ -n "$br" ] || continue
  reason=""; category="keep"; recoverable=true; merge_type=""
  sha="$(git rev-parse --short "$br" 2>/dev/null)"
  # One symmetric-diff count (gs_ahead_behind) instead of two `git rev-list` forks per branch:
  # prints "<behind> <ahead>" (left=on default not br, right=on br not default).
  read -r behind ahead < <(gs_ahead_behind "$cmp_base" "$br")
  ahead="${ahead:-0}"; behind="${behind:-0}"
  if [ "$br" = "$default" ] || [ "$br" = "$current" ]; then
    category="keep"; reason="protected (default/current)"
  elif case "$worktree_set" in *" $br "*) true;; *) false;; esac; then
    category="keep"; reason="protected (checked out in a worktree)"
  elif case "$merged_set" in *" $br "*) true;; *) false;; esac; then
    # ancestor-merge: HEAD of $br is reachable from $default, so `git branch -d` accepts it.
    category="merged"; reason="fully merged into $default"; merge_type="ancestor"
  elif [ "${ahead:-0}" -gt 0 ] 2>/dev/null && branch_content_in_default "$cmp_base" "$br"; then
    # Ahead of $default by commit(s), yet they carry NO content not already in $default —
    # the signature of a squash- or rebase-merge, which `git branch --merged` can't see
    # because it only follows ancestry. Nothing unique would be lost by deleting it.
    # squash/rebase-merge: NOT an ancestor of $default, so `git branch -d` REFUSES it even
    # though its content is verified present — the executor must force (-D) these.
    category="merged"; reason="squash/rebase-merged into $default (no unique changes) — safe to delete"; merge_type="squash-rebase"
  elif [ "$track" = "[gone]" ]; then
    # Upstream deleted on the remote (after fetch --prune). If this branch has NO
    # commits the default branch lacks (ahead==0), it was merged THEN deleted
    # upstream — already merged, safe to delete locally; NOT a re-merge candidate.
    category="gone"
    if [ "${ahead:-0}" -eq 0 ] 2>/dev/null; then
      reason="merged upstream then deleted on remote — safe to delete locally"
    else
      reason="upstream deleted on remote (${ahead} commit(s) not on $default)"
    fi
  elif [ -n "$cdate" ] && [ "$cdate" -lt "$cutoff" ]; then
    category="stale"; reason="no commit in ${stale_days}d"
  else
    category="keep"; reason="active, unmerged"
  fi
  cand_lines+="$(jq -nc --arg br "$br" --arg sha "$sha" --arg cat "$category" --arg reason "$reason" \
    --arg track "$track" --arg mtype "$merge_type" --argjson rec "$recoverable" --argjson ahead "${ahead:-0}" --argjson behind "${behind:-0}" \
    '{branch:$br, sha:$sha, category:$cat, reason:$reason, merge_type:$mtype, upstream_track:$track, recoverable:$rec, ahead:$ahead, behind:$behind}')"$'\n'
done < <(git for-each-ref --format='%(refname:short)|%(upstream:track)|%(committerdate:unix)' refs/heads 2>/dev/null)
cands="$(printf '%s' "$cand_lines" | jq -sc '.')"

# stale remote-tracking refs (server branches already gone) — informational, pruned via `git remote prune`.
# `git remote prune --dry-run` hits the NETWORK. When repo-steward orchestrates the run it has
# already executed `fetch --all --prune` ONCE (exporting GS_SYNC_MANAGED) before any analyzer, so
# post-prune this round-trip returns nothing while still paying a per-repo round-trip — and on a
# --no-sync/offline pass it would hang or error. So skip the live prune under managed sync (the
# fetch --prune already dropped every stale ref → empty is the accurate answer); a STANDALONE
# analyze.sh run (no orchestrator, GS_SYNC_MANAGED unset) still computes it live as before.
remote_prunable="[]"
if [ -n "$remote" ] && [ -z "${GS_SYNC_MANAGED:-}" ]; then
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
