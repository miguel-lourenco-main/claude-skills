#!/usr/bin/env bash
# run_across.sh — read-only fan-out: run repo-steward analyze across the resolved
# fleet and aggregate into one fleet-steward/v1 report (repo × attention).
# For MUTATING fleet runs the skill dispatches one sub-agent per repo instead
# (see SKILL.md); this script is the cheap read-only path.
#
# Usage: run_across.sh [--root <dir>] [--optimize]   # uses saved fleet, else workspace
set -u

root="${GS_ROOT:-$HOME/Desktop/personal/projects}"; optimize=false
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    --optimize) optimize=true; shift ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_steward="$here/../../repo-steward/scripts/run_repo.sh"

# prefer a saved fleet; fall back to workspace discovery
fleet="$(bash "$here/resolve_fleet.sh" --load --root "$root")"
if [ "$(jq -r '.saved // false' <<<"$fleet")" != "true" ]; then
  fleet="$(bash "$here/resolve_fleet.sh" --source workspace --root "$root")"
fi
repos="$(jq -c '.included // .repos // []' <<<"$fleet")"

opt_flag=""; $optimize && opt_flag="--optimize"
reports_dir="$root/.git-steward/reports"; mkdir -p "$reports_dir" 2>/dev/null || reports_dir="$(mktemp -d)"
stamp="$(date +%Y%m%d-%H%M%S)"
agg="[]"
while IFS= read -r r; do
  path="$(jq -r '.path' <<<"$r")"; name="$(jq -r '.name' <<<"$r")"
  [ -n "$path" ] && [ "$path" != "null" ] || { agg="$(jq -c --arg n "$name" '. += [{name:$n, skipped:"not cloned locally"}]' <<<"$agg")"; continue; }
  # capture each repo's FULL repo-steward/v1 JSON (skills + attention); no per-repo
  # files are written — report.sh --fleet renders everything into one document.
  rep="$(bash "$repo_steward" --repo "$path" $opt_flag --no-report 2>/dev/null || echo '{}')"
  jq -e .schema >/dev/null 2>&1 <<<"$rep" || rep="$(jq -n --arg n "$name" --arg p "$path" '{name:$n, repo:$p, skipped:"analyze failed"}')"
  agg="$(jq -c --argjson o "$rep" '. += [$o]' <<<"$agg")"
done < <(jq -c '.[]' <<<"$repos")

result="$(jq -n --arg root "$root" --argjson opt "$optimize" --argjson rows "$agg" '
  {schema:"fleet-steward/v1", root:$root, optimize:$opt, repo_count:($rows|length),
   totals:{
     repos_with_secrets: [$rows[]|select((.attention.secret_findings // 0)>0)]|length,
     repos_with_prunable_branches: [$rows[]|select((.attention.prunable_branches // 0)>0)]|length,
     repos_ci_failing: [$rows[]|select(.attention.ci_status=="failed")]|length,
     total_open_work_items: ([$rows[].attention.open_work_items // 0]|add // 0)
   },
   repos:$rows}')"

# one consolidated findings document for the whole fleet
report="$(printf '%s' "$result" | bash "$here/../../../shared/report.sh" --fleet --out "$reports_dir/${stamp}-fleet.md" 2>/dev/null || true)"

jq --arg idx "$report" '. + {fleet_report:$idx}' <<<"$result"
