#!/usr/bin/env bash
# run_across.sh — read-only fan-out: run repo-steward analyze across the resolved
# fleet and aggregate into one fleet-steward/v1 report (repo × attention).
# For MUTATING fleet runs the skill dispatches one sub-agent per repo instead
# (see SKILL.md); this script is the cheap read-only path.
#
# Usage: run_across.sh [--root <dir>] [--optimize]   # uses saved fleet, else workspace
set -u

root="/home/migaloco/Desktop/personal/projects"; optimize=false
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
  # each repo writes its own detailed findings document into the fleet reports dir
  rep="$(bash "$repo_steward" --repo "$path" $opt_flag --report-out "$reports_dir/${stamp}-${name}.md" 2>/dev/null || echo '{}')"
  att="$(jq -c '.attention // {}' <<<"$rep")"
  rpath="$(jq -r '.report_path // ""' <<<"$rep")"
  agg="$(jq -c --arg n "$name" --arg p "$path" --arg rp "$rpath" --argjson a "$att" '. += [{name:$n, path:$p, attention:$a, report:$rp}]' <<<"$agg")"
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

# fleet index document: summary table + links to each per-repo report
index="$reports_dir/${stamp}-fleet.md"
{
  echo "# git-steward fleet findings"
  echo
  echo "- **Root:** \`$root\` · **Repos:** $(jq -r '.repo_count' <<<"$result") · **optimize tier:** $optimize"
  echo "- **Generated:** $(date '+%Y-%m-%d %H:%M:%S %Z') · mode: analyze (read-only)"
  echo
  echo "## Fleet totals"
  echo "- Repos with secrets: **$(jq -r '.totals.repos_with_secrets' <<<"$result")**"
  echo "- Repos with prunable branches: $(jq -r '.totals.repos_with_prunable_branches' <<<"$result")"
  echo "- Repos with failing CI: $(jq -r '.totals.repos_ci_failing' <<<"$result")"
  echo "- Total open work items: $(jq -r '.totals.total_open_work_items' <<<"$result")"
  echo
  echo "## Repos (most-flagged first)"
  echo
  echo "| Repo | Secrets | Branches | Commits | Blobs | CI | Work items | Detail |"
  echo "|---|---|---|---|---|---|---|---|"
  jq -r '.repos
    | sort_by( -( ((.attention.secret_findings // 0) * 1000)
                + ((if .attention.ci_status=="failed" then 1 else 0 end) * 500)
                + ((.attention.prunable_branches // 0) * 10)
                + (.attention.non_conventional_commits // 0)
                + (.attention.big_blobs // 0) ) )
    | .[]
    | "| \(.name) | \(.attention.secret_findings // (if .skipped then "—" else 0 end)) | \(.attention.prunable_branches // 0) | \(.attention.non_conventional_commits // 0) | \(.attention.big_blobs // 0) | \(.attention.ci_status // "n/a") | \(.attention.open_work_items // 0) | \(if .report != "" and .report != null then "[report](\(.report))" else (.skipped // "—") end) |"' <<<"$result"
  echo
  echo "Per-repo documents are linked above. Apply gated cleanup with \`/git-cleanup fleet\` or \`/git-optimize fleet\`."
} > "$index"

jq --arg idx "$index" '. + {fleet_report:$idx}' <<<"$result"
