#!/usr/bin/env bash
# git-content.sh — read-only branch/content analysis primitives. SOURCE this; do not execute.
#
# Pure functions, LOCALS ONLY — no globals, no temp files — so this is safe to source inside
# repo-steward's concurrent per-repo workers (run_repo.sh runs analyzers in parallel). Every
# function assumes the CWD is already inside the target repo (callers `cd` first), matching the
# analyze.sh scripts that use them. Nothing here ever mutates the repo.
#
# Source it BASH_SOURCE-relative (NOT $CLAUDE_PLUGIN_ROOT, which is unset under the sidecar and
# standalone runs):
#   source "$(dirname "${BASH_SOURCE[0]}")/../../../shared/git-content.sh"   # from skills/*/scripts/
#   source "$(dirname "${BASH_SOURCE[0]}")/git-content.sh"                    # from shared/

# gs_default_branch <remote> -> prints the default branch short name. Resolution order:
#   origin/HEAD target → local `main`/`master` if present → empty.
# For NEW consumers (worktree-manager, inspect.sh). The existing analyzers keep their own
# resolution because they differ on the no-default fallback (branch-cleanup falls back to the
# current branch; repo-health leaves it empty).
gs_default_branch() {
  local remote="$1" d="" b
  d="$(git symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null | sed "s#^$remote/##")"
  if [ -z "$d" ]; then
    for b in main master; do git show-ref --verify --quiet "refs/heads/$b" && { d="$b"; break; }; done
  fi
  printf '%s' "$d"
}

# gs_cmp_base <remote> <default> -> prints the comparison base ref for the merged / ahead-behind /
# content tests. Prefer the freshly-fetched remote-tracking default ($remote/$default) over the
# LOCAL $default: sync-remote.sh's `git fetch --all --prune` advances origin/$default but NEVER
# fast-forwards the local branch, so comparing against local main undercounts merged branches.
# Fall back to the local $default NAME when there is no remote or the remote-tracking ref is
# absent (offline / standalone / no origin/HEAD).
gs_cmp_base() {
  local remote="$1" default="$2"
  if [ -n "$remote" ] && [ -n "$default" ] && git show-ref --verify --quiet "refs/remotes/$remote/$default"; then
    printf '%s/%s' "$remote" "$default"
  else
    printf '%s' "$default"
  fi
}

# gs_ahead_behind <cmp_base> <ref> -> prints "<behind> <ahead>" (left=on cmp_base not ref,
# right=on ref not cmp_base) via ONE symmetric-diff count — half the subprocesses of two
# `git rev-list` forks. Empty / bad refs degrade to "0 0".
gs_ahead_behind() {
  git rev-list --left-right --count "$1...$2" 2>/dev/null || echo "0 0"
}

# branch_content_in_default <def> <br> -> exit 0 iff every change on <br> is already present in
# <def>, even when the work landed via a SQUASH or REBASE merge — which `git branch --merged`
# cannot see because it only follows ancestry. Two write-free, patch-id-based tests; either match
# means deleting <br> would lose nothing:
#   (a) `git cherry` finds an equivalent patch in <def> for EVERY commit on <br> (rebase-merge,
#       cherry-pick, plain merge) — correct even when <def> has advanced past the branch.
#   (b) <br>'s tree is byte-identical to <def>'s — a squash-merge <def> hasn't built on yet.
# Caller should guard with ahead>0 (an ahead==0 branch is already an ancestor — a "merged" hit).
branch_content_in_default() {
  local def="$1" br="$2"
  [ -z "$(git cherry "$def" "$br" 2>/dev/null | grep '^+')" ] && return 0
  git diff --quiet "$def" "$br" 2>/dev/null
}

# gs_diffstat <base> <ref> -> prints "<files> <insertions> <deletions>" for base...ref. Binary
# files (numstat "-") count as a changed file with 0 line deltas. Cost-gate at the call site
# (only invoke when ahead>0) — this walks a real diff.
gs_diffstat() {
  git diff --numstat "$1...$2" 2>/dev/null | awk '
    { files++; if ($1 != "-") ins += $1; if ($2 != "-") del += $2 }
    END { printf "%d %d %d", files+0, ins+0, del+0 }'
}

# gs_classify_branch_vs_default <cmp_base> <branch> [--track <T>] [--diffstat] -> one compact JSON
# verdict object on stdout. Read-only. For NEW consumers (worktree-manager v2, inspect.sh); encodes
# the same content ladder git-branch-cleanup uses, content-only (no age/protection policy):
#   {verdict, ahead, behind, merge_type, removable, reason, diffstat}
# verdict ∈ merged-ancestor | squash-rebase-redundant | gone | diverged | unique-work
#   merged-ancestor          ahead==0 (tip reachable from cmp_base) — git branch -d safe; removable
#   squash-rebase-redundant  ahead>0 but content already in cmp_base — needs -D; removable
#   gone                     upstream [gone] with unique commits — not removable without a decision
#   diverged                 ahead>0 AND behind>0 — not removable
#   unique-work              ahead>0, not behind — not removable
gs_classify_branch_vs_default() {
  local cmp_base="$1" br="$2"; shift 2
  local track="" want_diffstat=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --track) track="$2"; shift 2 ;;
      --diffstat) want_diffstat=true; shift ;;
      *) shift ;;
    esac
  done

  local behind ahead
  read -r behind ahead < <(gs_ahead_behind "$cmp_base" "$br")
  behind="${behind:-0}"; ahead="${ahead:-0}"

  local verdict merge_type="" removable=false reason=""
  if [ "$ahead" -eq 0 ] 2>/dev/null; then
    verdict="merged-ancestor"; merge_type="ancestor"; removable=true
    reason="fully merged into the default branch"
  elif branch_content_in_default "$cmp_base" "$br"; then
    verdict="squash-rebase-redundant"; merge_type="squash-rebase"; removable=true
    reason="squash/rebase-merged into the default branch (no unique changes)"
  elif [ "$track" = "[gone]" ]; then
    verdict="gone"; removable=false
    reason="upstream deleted on remote (${ahead} commit(s) not in the default branch)"
  elif [ "${behind:-0}" -gt 0 ] 2>/dev/null; then
    verdict="diverged"; removable=false
    reason="${ahead} commit(s) ahead, ${behind} behind the default branch"
  else
    verdict="unique-work"; removable=false
    reason="${ahead} commit(s) not in the default branch"
  fi

  local ds_json="null"
  if $want_diffstat && [ "${ahead:-0}" -gt 0 ] 2>/dev/null; then
    local f i d
    read -r f i d < <(gs_diffstat "$cmp_base" "$br")
    ds_json="$(jq -nc --argjson f "${f:-0}" --argjson i "${i:-0}" --argjson d "${d:-0}" \
      '{files:$f, insertions:$i, deletions:$d}')"
  fi

  jq -nc --arg v "$verdict" --argjson ahead "${ahead:-0}" --argjson behind "${behind:-0}" \
    --arg mt "$merge_type" --argjson rem "$removable" --arg reason "$reason" --argjson ds "$ds_json" \
    '{verdict:$v, ahead:$ahead, behind:$behind, merge_type:$mt, removable:$rem, reason:$reason, diffstat:$ds}'
}
