#!/usr/bin/env bash
# repo-steward run_repo.sh — run the in-scope atomic skills' analyze.sh on ONE
# repo and aggregate into a single repo-steward/v1 report. Read-only.
# apply mode is orchestrated by the skill (model layer) per SKILL.md, calling
# each atomic apply.sh behind its gate in safe order.
#
# Usage: run_repo.sh --repo <path> [--optimize] [--only a,b,c]
set -u

repo="."; optimize=false; only=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --optimize) optimize=true; shift ;;
    --only) only="$2"; shift 2 ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

skills_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
core=(git-repo-health git-branch-cleanup commit-hygiene git-history-surgery work-items pipeline-health)
opt=(worktree-manager gitignore-guard repo-consistency dependency-health release-changelog stale-repo-triage)

selected=("${core[@]}")
$optimize && selected+=("${opt[@]}")
if [ -n "$only" ]; then IFS=',' read -ra selected <<<"$only"; fi

results="{}"
for s in "${selected[@]}"; do
  az="$skills_dir/$s/scripts/analyze.sh"
  [ -f "$az" ] || continue
  out="$(bash "$az" --repo "$repo" 2>/dev/null || echo '{}')"
  jq -e . >/dev/null 2>&1 <<<"$out" || out='{"error":"analyze produced no valid JSON"}'
  results="$(jq -c --arg s "$s" --argjson o "$out" '.[$s]=$o' <<<"$results")"
done

name="$(basename "$(cd "$repo" && git rev-parse --show-toplevel 2>/dev/null || echo "$repo")")"
# roll up cross-skill attention signals
jq -n --arg repo "$repo" --arg name "$name" --argjson opt "$optimize" --argjson r "$results" '
  {schema:"repo-steward/v1", repo:$repo, name:$name, optimize:$opt, skills:$r,
   attention:{
     health_flags: ($r["git-repo-health"].flags // []),
     prunable_branches: ((($r["git-branch-cleanup"].summary.merged // 0) + ($r["git-branch-cleanup"].summary.gone // 0) + ($r["git-branch-cleanup"].summary.stale // 0))),
     non_conventional_commits: ($r["commit-hygiene"].lint.non_conventional // 0),
     secret_findings: ($r["git-history-surgery"].summary.secret_findings // 0),
     big_blobs: ($r["git-history-surgery"].summary.big_blobs // 0),
     open_work_items: ($r["work-items"].counts.total // 0),
     ci_status: ($r["pipeline-health"].overall // "n/a")
   }}'
