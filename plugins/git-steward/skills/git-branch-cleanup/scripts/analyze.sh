#!/usr/bin/env bash
# git-branch-cleanup analyze.sh — classify prunable branches. Read-only.
# Emits branch-cleanup/v1 JSON on stdout. NEVER deletes.
#
# Usage: analyze.sh --repo <path> [--stale-days N]
# Categories per local branch: merged | gone | stale | keep
#   merged = fully merged into the default branch — by ancestry, or by content (squash/rebase-merge)
#   gone   = upstream deleted on the remote AND still carries unique commits: needs_decision=true,
#            never auto-queued (a gone branch with nothing unique is reported as merged)
#   stale  = no commit in <stale-days> (default 90), not merged/gone
#   keep   = default branch, current branch, worktree-held, or active & unmerged
set -u
# Shared read-only content primitives: gs_cmp_base, gs_ahead_behind, gs_classify_branch_vs_default.
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

# Comparison base for the ancestry / ahead-behind / content tests below: prefer the
# freshly-fetched remote-tracking default ($remote/$default) over the LOCAL $default (which
# `fetch --prune` never fast-forwards), falling back to the local NAME when offline/standalone.
# See gs_cmp_base in shared/git-content.sh for the full rationale.
cmp_base="$(gs_cmp_base "$remote" "$default")"

cutoff=$(( $(date +%s) - stale_days*86400 ))
# Branches checked out in ANY worktree (including the current one). git refuses to
# delete a worktree-held branch, and it holds active work — so it must never be a
# delete candidate, even when it looks merged/gone. Protect it as keep.
worktree_set=" $(git worktree list --porcelain 2>/dev/null | sed -n 's#^branch refs/heads/##p' | tr '\n' ' ') "

# Content verdicts come from ONE ladder, gs_classify_branch_vs_default (shared/git-content.sh),
# the same one worktree-manager and inspect.sh use, so the paths cannot drift apart again. It
# answers "would deleting this lose anything?" by ancestry first, then by patch-id / tree content
# (rebase-merge, cherry-pick, squash-merge — see branch_content_in_default). This script only adds
# policy on top: protection (default/current/worktree) and age (stale).
#
# needs_decision=true marks a branch that is NOT protected and NOT verified redundant but would
# otherwise look prunable — today, an upstream-[gone] branch that still carries unique commits.
# Upstream deletion says nothing about whether the work landed (an MR can be closed unmerged, or a
# remote branch deleted by hand), so such a branch is reported, never queued: report.sh renders
# it under "needs your decision" and apply.sh refuses it unless --allow-unmerged names it.

# Accumulate one compact JSON object per branch into NDJSON, then slurp once at the
# end (`jq -s`). Appending to a growing array with `jq '. += [...]'` per branch
# re-serializes the WHOLE array every iteration — O(n²) jq work on branch-heavy
# repos. Building each object in isolation keeps it O(n) while preserving jq's safe
# escaping and the for-each-ref ordering.
cand_lines=""
while IFS='|' read -r br track cdate; do
  [ -n "$br" ] || continue
  reason=""; category="keep"; recoverable=true; merge_type=""; removable=false; needs_decision=false
  sha="$(git rev-parse --short "$br" 2>/dev/null)"
  if [ "$br" = "$default" ] || [ "$br" = "$current" ] \
     || case "$worktree_set" in *" $br "*) true;; *) false;; esac; then
    # Protected: no content verdict needed, only the counts the report shows.
    read -r behind ahead < <(gs_ahead_behind "$cmp_base" "$br")
    category="keep"
    if [ "$br" = "$default" ] || [ "$br" = "$current" ]; then reason="protected (default/current)"
    else reason="protected (checked out in a worktree)"; fi
  else
    # '|' not a tab: IFS whitespace would collapse the empty merge_type field.
    IFS='|' read -r verdict ahead behind merge_type removable < <(
      gs_classify_branch_vs_default "$cmp_base" "$br" --track "$track" \
        | jq -r '[.verdict, .ahead, .behind, .merge_type, .removable] | map(tostring) | join("|")')
    gone_note=""; [ "$track" = "[gone]" ] && gone_note=" (upstream deleted on remote)"
    case "$verdict" in
      merged-ancestor)
        # tip reachable from the default branch, so `git branch -d` accepts it.
        category="merged"; reason="fully merged into $default$gone_note" ;;
      squash-rebase-redundant)
        # Ahead by commit(s) that carry NO content not already in $default (squash/rebase-merge).
        # NOT an ancestor, so `git branch -d` REFUSES it — the executor must force (-D) these.
        category="merged"; reason="squash/rebase-merged into $default (no unique changes)$gone_note — safe to delete" ;;
      gone)
        category="gone"; needs_decision=true
        reason="upstream deleted on remote, but ${ahead} commit(s) are not in $default (no ancestry, patch-id or tree match) — unique work, needs your decision" ;;
      *)
        if [ -n "$cdate" ] && [ "$cdate" -lt "$cutoff" ]; then
          category="stale"; reason="no commit in ${stale_days}d"
        else
          category="keep"; reason="active, unmerged"
        fi ;;
    esac
  fi
  ahead="${ahead:-0}"; behind="${behind:-0}"
  case "$removable" in true) ;; *) removable=false ;; esac
  cand_lines+="$(jq -nc --arg br "$br" --arg sha "$sha" --arg cat "$category" --arg reason "$reason" \
    --arg track "$track" --arg mtype "$merge_type" --argjson rec "$recoverable" --argjson ahead "$ahead" --argjson behind "$behind" \
    --argjson rem "$removable" --argjson nd "$needs_decision" \
    '{branch:$br, sha:$sha, category:$cat, reason:$reason, merge_type:$mtype, upstream_track:$track, recoverable:$rec,
      removable:$rem, needs_decision:$nd, ahead:$ahead, behind:$behind}')"$'\n'
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
              keep:[$cands[]|select(.category=="keep")]|length,
              needs_decision:[$cands[]|select(.needs_decision==true)]|length,
              prunable:[$cands[]|select(.category!="keep" and .needs_decision!=true)]|length },
    remote_prunable:$remote_prunable}'
