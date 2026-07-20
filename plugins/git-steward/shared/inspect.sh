#!/usr/bin/env bash
# inspect.sh — the git-steward READ-ONLY facts toolbox. One dispatcher, many probes.
#
# The agent calls these ad hoc to gather static facts before forming a judgment (see
# PROBES.md). Every probe is read-only and safe to run at any time — none ever mutates the
# repo. Output is a compact `probe/<name>/v1` JSON envelope on stdout.
#
#   bash inspect.sh <probe> [--repo <path>] [probe args]
#   bash inspect.sh --list        # human-readable catalog
#   bash inspect.sh --manifest    # machine catalog (JSON) — how the agent discovers probes
#
# Probes: worktrees · branch-classify · branch-merged · tree-status · merge-base · file-diff ·
#         upstream · ci-status · secret-context
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills="$here/../skills"
source "$here/git-content.sh"

err() { jq -nc --arg p "$1" --arg e "$2" '{schema:("probe/"+$p+"/v1"), error:$e}'; exit 0; }

# ---- shared arg parse: pull --repo out, leave the rest in $@ ----
probe="${1:-}"; shift || true
repo="."
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
set -- "${args[@]:-}"

# ---- catalog ----
MANIFEST='{
  "schema":"probe-manifest/v1",
  "probes":[
    {"name":"worktrees","summary":"List worktrees, each branch classified vs the default (removable vs unique work).","inputs":["--repo"],"output_schema":"worktree-manager/v2","derived_from":"worktree-manager/analyze.sh"},
    {"name":"branch-classify","summary":"Classify a branch (or --all) against the default: merged-ancestor|squash-rebase-redundant|gone|diverged|unique-work, with ahead/behind + diffstat.","inputs":["--repo","--branch <b>|--all"],"output_schema":"probe/branch-classify/v1","derived_from":"git-content.sh"},
    {"name":"branch-merged","summary":"True/false: is a branch fully integrated into the default (incl. squash/rebase merges)? Returns the full verdict too.","inputs":["--repo","<branch>"],"output_schema":"probe/branch-merged/v1","derived_from":"git-content.sh"},
    {"name":"tree-status","summary":"Working-tree cleanliness: dirty/untracked counts + the changed/untracked path lists.","inputs":["--repo"],"output_schema":"probe/tree-status/v1","derived_from":"git status"},
    {"name":"merge-base","summary":"Merge-base of two refs + ahead/behind + is-ancestor.","inputs":["--repo","--a <ref>","--b <ref>"],"output_schema":"probe/merge-base/v1","derived_from":"git merge-base"},
    {"name":"file-diff","summary":"Diffstat (files/insertions/deletions) + per-file numstat between two refs.","inputs":["--repo","--base <ref>","--ref <ref>"],"output_schema":"probe/file-diff/v1","derived_from":"git-content.sh"},
    {"name":"upstream","summary":"The upstream tracking ref of a branch + ahead/behind + gone status.","inputs":["--repo","<branch>"],"output_schema":"probe/upstream/v1","derived_from":"git for-each-ref"},
    {"name":"ci-status","summary":"CI / pipeline health for the repo (delegates to pipeline-health analyze).","inputs":["--repo"],"output_schema":"pipeline-health/v1","derived_from":"pipeline-health/analyze.sh"},
    {"name":"secret-context","summary":"Secret + oversized-blob scan over owned history (delegates to history-surgery analyze).","inputs":["--repo"],"output_schema":"history-surgery/v1","derived_from":"git-history-surgery/analyze.sh"}
  ]
}'

case "$probe" in
  --manifest) printf '%s\n' "$MANIFEST" | jq -c .; exit 0 ;;
  --list)
    printf '%s\n' "$MANIFEST" | jq -r '.probes[] | "  \(.name)\t— \(.summary)"' ; exit 0 ;;
  ""|-h|--help)
    echo "usage: inspect.sh <probe> [--repo <path>] [args]   (--list / --manifest for the catalog)"; exit 0 ;;
esac

cd "$repo" 2>/dev/null || err "$probe" "path not found: $repo"
git rev-parse --git-dir >/dev/null 2>&1 || err "$probe" "not a git repository: $repo"

remote="$(git remote 2>/dev/null | head -n1)"
default="$(gs_default_branch "$remote")"
cmp_base="$(gs_cmp_base "$remote" "$default")"

# small helpers for --flag parsing within a probe
flagval() { local want="$1"; shift; while [ $# -gt 0 ]; do [ "$1" = "$want" ] && { printf '%s' "${2:-}"; return; }; shift; done; }
hasflag() { local want="$1"; shift; for a in "$@"; do [ "$a" = "$want" ] && return 0; done; return 1; }

case "$probe" in
  worktrees)
    bash "$skills/worktree-manager/scripts/analyze.sh" --repo "$repo" ;;

  ci-status)
    bash "$skills/pipeline-health/scripts/analyze.sh" --repo "$repo" 2>/dev/null \
      || err "$probe" "pipeline-health analyze unavailable" ;;

  secret-context)
    bash "$skills/git-history-surgery/scripts/analyze.sh" --repo "$repo" 2>/dev/null \
      || err "$probe" "history-surgery analyze unavailable" ;;

  branch-classify)
    if hasflag --all "$@"; then
      out="[]"
      while IFS='|' read -r br track; do
        [ -n "$br" ] || continue
        cls="$(gs_classify_branch_vs_default "$cmp_base" "$br" --track "$track" --diffstat)"
        out="$(jq -c --arg b "$br" --argjson c "$cls" '. += [($c + {branch:$b})]' <<<"$out")"
      done < <(git for-each-ref --format='%(refname:short)|%(upstream:track)' refs/heads 2>/dev/null)
      jq -nc --arg db "$default" --argjson b "$out" '{schema:"probe/branch-classify/v1", default_branch:$db, branches:$b}'
    else
      br="$(flagval --branch "$@")"
      [ -n "$br" ] || err "$probe" "need --branch <name> or --all"
      track="$(git for-each-ref --format='%(upstream:track)' "refs/heads/$br" 2>/dev/null)"
      cls="$(gs_classify_branch_vs_default "$cmp_base" "$br" --track "$track" --diffstat)"
      jq -nc --arg db "$default" --arg b "$br" --argjson c "$cls" \
        '{schema:"probe/branch-classify/v1", default_branch:$db} + ($c + {branch:$b})'
    fi ;;

  branch-merged)
    br="${1:-$(flagval --branch "$@")}"
    [ -n "$br" ] && [ "$br" != "--branch" ] || err "$probe" "need a branch name"
    git show-ref --verify --quiet "refs/heads/$br" || err "$probe" "no such branch: $br"
    track="$(git for-each-ref --format='%(upstream:track)' "refs/heads/$br" 2>/dev/null)"
    cls="$(gs_classify_branch_vs_default "$cmp_base" "$br" --track "$track" --diffstat)"
    jq -nc --arg db "$default" --arg b "$br" --argjson c "$cls" \
      '{schema:"probe/branch-merged/v1", default_branch:$db, branch:$b,
        merged:($c.removable), verdict:$c.verdict, classification:$c}' ;;

  tree-status)
    dirty="$(git status --porcelain 2>/dev/null)"
    dlist="$(printf '%s\n' "$dirty" | sed '/^$/d' | jq -R . | jq -sc .)"
    ulist="$(git ls-files --others --exclude-standard 2>/dev/null | jq -R . | jq -sc .)"
    jq -nc --argjson d "$dlist" --argjson u "$ulist" \
      '{schema:"probe/tree-status/v1",
        dirty_count:($d|length), untracked_count:($u|length),
        changes:$d, untracked:$u, clean:(($d|length)==0)}' ;;

  merge-base)
    a="$(flagval --a "$@")"; b="$(flagval --b "$@")"
    [ -n "$a" ] && [ -n "$b" ] || err "$probe" "need --a <ref> --b <ref>"
    mb="$(git merge-base "$a" "$b" 2>/dev/null)"
    read -r bbehind babehead < <(gs_ahead_behind "$a" "$b")
    isanc=false; git merge-base --is-ancestor "$a" "$b" 2>/dev/null && isanc=true
    jq -nc --arg a "$a" --arg b "$b" --arg mb "$mb" \
      --argjson ahead "${babehead:-0}" --argjson behind "${bbehind:-0}" --argjson anc "$isanc" \
      '{schema:"probe/merge-base/v1", a:$a, b:$b, merge_base:$mb,
        b_ahead_of_a:$ahead, b_behind_a:$behind, a_is_ancestor_of_b:$anc}' ;;

  file-diff)
    base="$(flagval --base "$@")"; ref="$(flagval --ref "$@")"
    [ -n "$base" ] && [ -n "$ref" ] || err "$probe" "need --base <ref> --ref <ref>"
    read -r f i d < <(gs_diffstat "$base" "$ref")
    files="$(git diff --numstat "$base...$ref" 2>/dev/null \
      | awk '{ins=($1=="-"?null:$1); del=($2=="-"?null:$2); printf "{\"path\":\"%s\",\"insertions\":%s,\"deletions\":%s}\n", $3, ($1=="-"?"null":$1), ($2=="-"?"null":$2)}' \
      | jq -sc .)"
    jq -nc --arg base "$base" --arg ref "$ref" --argjson f "${f:-0}" --argjson i "${i:-0}" --argjson d "${d:-0}" --argjson files "${files:-[]}" \
      '{schema:"probe/file-diff/v1", base:$base, ref:$ref,
        files:$f, insertions:$i, deletions:$d, by_file:$files}' ;;

  upstream)
    br="${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
    [ "$br" = "--branch" ] && br="$(flagval --branch "$@")"
    git show-ref --verify --quiet "refs/heads/$br" || err "$probe" "no such branch: $br"
    up="$(git for-each-ref --format='%(upstream:short)' "refs/heads/$br" 2>/dev/null)"
    track="$(git for-each-ref --format='%(upstream:track)' "refs/heads/$br" 2>/dev/null)"
    gone=false; [ "$track" = "[gone]" ] && gone=true
    ahead=0; behind=0
    if [ -n "$up" ]; then read -r behind ahead < <(gs_ahead_behind "$up" "$br"); fi
    jq -nc --arg b "$br" --arg up "$up" --argjson gone "$gone" \
      --argjson ahead "${ahead:-0}" --argjson behind "${behind:-0}" \
      '{schema:"probe/upstream/v1", branch:$b, upstream:$up, has_upstream:($up!=""),
        gone:$gone, ahead:$ahead, behind:$behind}' ;;

  *) err "$probe" "unknown probe: $probe (try --list)" ;;
esac
