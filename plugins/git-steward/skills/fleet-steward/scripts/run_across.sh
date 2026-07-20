#!/usr/bin/env bash
# run_across.sh — read-only fan-out: run repo-steward analyze across the resolved
# fleet and aggregate into one fleet-steward/v1 report (repo × attention).
# For MUTATING fleet runs the skill dispatches one sub-agent per repo instead
# (see SKILL.md); this script is the cheap read-only path.
#
# Usage: run_across.sh [--root <dir>] [--optimize]   # uses saved fleet, else workspace
set -u

root="${GS_ROOT:-$HOME/Desktop/personal/projects}"; optimize=false; only=""; repos_arg=""; sync=true
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    --optimize) optimize=true; shift ;;
    --only) only="$2"; shift 2 ;;       # analyze only this subset of skills (csv), passed to run_repo --only
    --repos) repos_arg="$2"; shift 2 ;; # one-off: analyze ONLY these repo paths (csv), bypassing the saved fleet
    --no-sync) sync=false; shift ;;     # offline / already-synced fast path: skip the per-repo network fetch
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_steward="$here/../../repo-steward/scripts/run_repo.sh"

# repo set: explicit --repos (one-off, non-persistent), else the saved fleet, else workspace discovery
if [ -n "$repos_arg" ]; then
  repos="$(printf '%s' "$repos_arg" | jq -R 'split(",") | map(select(length>0) | {path:., name:(.|sub("/$";"")|split("/")|last)})')"
else
  fleet="$(bash "$here/resolve_fleet.sh" --load --root "$root")"
  if [ "$(jq -r '.saved // false' <<<"$fleet")" != "true" ]; then
    fleet="$(bash "$here/resolve_fleet.sh" --source workspace --root "$root")"
  fi
  repos="$(jq -c '.included // .repos // []' <<<"$fleet")"
fi

opt_flag=""; $optimize && opt_flag="--optimize"
only_flag=""; [ -n "$only" ] && only_flag="--only $only"
sync_flag=""; $sync || sync_flag="--no-sync"
reports_dir="$root/.git-steward/reports"; mkdir -p "$reports_dir" 2>/dev/null || reports_dir="$(mktemp -d)"
stamp="$(date +%Y%m%d-%H%M%S)"

# Analyze each repo in its OWN repo-steward/v1 JSON. Repos are fully independent and
# read-only, so we fan them out concurrently with a bounded worker pool (nproc-capped,
# overridable via GS_FLEET_JOBS) instead of one-at-a-time. CRITICAL: each worker writes
# to a temp file keyed by its FLEET INDEX, and we aggregate strictly in that order below
# — so the repos[] array and the rendered report are byte-identical to the old serial
# path regardless of which repo finishes first. No per-repo report files are written —
# report.sh --fleet renders everything into one document.
tmpd="$(mktemp -d)"; trap 'rm -rf "$tmpd"' EXIT
jobs_max="${GS_FLEET_JOBS:-$(nproc 2>/dev/null || echo 4)}"
[ "$jobs_max" -ge 1 ] 2>/dev/null || jobs_max=1

# one repo → its result temp file (placeholder rows preserved exactly as before)
run_one() {
  local r="$1" outfile="$2" path name rep
  path="$(jq -r '.path' <<<"$r")"; name="$(jq -r '.name' <<<"$r")"
  if [ -z "$path" ] || [ "$path" = "null" ]; then
    jq -cn --arg n "$name" '{name:$n, skipped:"not cloned locally"}' >"$outfile"
    return
  fi
  rep="$(bash "$repo_steward" --repo "$path" $opt_flag $only_flag $sync_flag --no-report 2>/dev/null || echo '{}')"
  jq -e .schema >/dev/null 2>&1 <<<"$rep" || rep="$(jq -cn --arg n "$name" --arg p "$path" '{name:$n, repo:$p, skipped:"analyze failed"}')"
  printf '%s' "$rep" >"$outfile"
}

idx=0; declare -a entries outfiles
while IFS= read -r r; do
  outfiles[$idx]="$tmpd/repo-$idx.json"; entries[$idx]="$r"
  # throttle to jobs_max concurrent workers
  while [ "$(jobs -rp | wc -l)" -ge "$jobs_max" ]; do wait -n 2>/dev/null || break; done
  run_one "$r" "${outfiles[$idx]}" &
  idx=$((idx+1))
done < <(jq -c '.[]' <<<"$repos")
wait

# aggregate IN FLEET ORDER (index 0..n-1), never in completion order
agg="[]"; i=0
while [ "$i" -lt "$idx" ]; do
  rep="$(cat "${outfiles[$i]}" 2>/dev/null)"
  jq -e . >/dev/null 2>&1 <<<"$rep" || rep="$(jq -cn --arg n "$(jq -r '.name' <<<"${entries[$i]}")" '{name:$n, skipped:"analyze failed"}')"
  agg="$(jq -c --argjson o "$rep" '. += [$o]' <<<"$agg")"
  i=$((i+1))
done

# NB: feed the accumulated rows via stdin, not `--argjson rows "$agg"`. A single
# argv string can't exceed MAX_ARG_STRLEN (128 KB on Linux), so a large fleet
# aggregate made jq die with "Argument list too long" and silently zeroed the report.
# Each run is a RECORD identified by $stamp (its fleet_id); stamp every repo with that id + the
# analyzed-at time so the canonical can track which record each repo's data came from.
gen="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
result="$(printf '%s' "$agg" | jq --arg root "$root" --argjson opt "$optimize" --arg fid "$stamp" --arg gen "$gen" '
  (map(. + {fleet_id:$fid, analyzed_at:$gen})) as $rows |
  {schema:"fleet-steward/v1", root:$root, optimize:$opt, fleet_id:$fid, generated_at:$gen, repo_count:($rows|length),
   totals:{
     repos_with_secrets: [$rows[]|select((.attention.secret_findings // 0)>0)]|length,
     repos_with_prunable_branches: [$rows[]|select((.attention.prunable_branches // 0)>0)]|length,
     repos_ci_failing: [$rows[]|select(.attention.ci_status=="failed")]|length,
     total_open_work_items: ([$rows[].attention.open_work_items // 0]|add // 0)
   },
   repos:$rows}')"

# Persist the per-run RECORD JSON (the inspectable "fleet record", id=$stamp) beside its snapshot
# markdown — durable, queryable data, not just rendered prose.
record_json="$reports_dir/${stamp}-fleet.json"
printf '%s' "$result" > "$record_json" 2>/dev/null || true

# Snapshot markdown for this run (the agent may author prose regions into it downstream).
report="$(printf '%s' "$result" | bash "$here/../../../shared/report.sh" --fleet --out "$reports_dir/${stamp}-fleet.md" 2>/dev/null || true)"

# Merge this record into the CANONICAL fleet.json (data source of truth) and re-render canonical
# fleet.md. A scoped re-analyze (subset of repos) updates only those repos in the canonical.
canonical=""
[ -f "$record_json" ] && canonical="$(bash "$here/../../../shared/merge-fleet.sh" --record "$record_json" --reports-dir "$reports_dir" 2>/dev/null || true)"

jq --arg idx "$report" --arg rec "$record_json" --arg canon "$canonical" \
  '. + {fleet_report:$idx, record_json:$rec, canonical_report:$canon}' <<<"$result"
