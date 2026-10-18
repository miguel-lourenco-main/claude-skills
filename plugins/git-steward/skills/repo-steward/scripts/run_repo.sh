#!/usr/bin/env bash
# repo-steward run_repo.sh — run the in-scope atomic skills' analyze.sh on ONE
# repo and aggregate into a single repo-steward/v1 report. Read-only.
# apply mode is orchestrated by the skill (model layer) per SKILL.md, calling
# each atomic apply.sh behind its gate in safe order.
#
# Usage: run_repo.sh --repo <path> [--optimize] [--only a,b,c]
set -u

repo="."; optimize=false; only=""; report=true; report_out=""; sync=true
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --optimize) optimize=true; shift ;;
    --only) only="$2"; shift 2 ;;
    --no-report) report=false; shift ;;
    --report-out) report_out="$2"; shift 2 ;;
    --no-sync) sync=false; shift ;;     # offline / already-synced fast path: skip the network fetch
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills_dir="$(cd "$here/../.." && pwd)"
shared_dir="$(cd "$here/../../../shared" && pwd)"
core=(git-repo-health git-branch-cleanup commit-hygiene git-history-surgery work-items pipeline-health)
opt=(worktree-manager gitignore-guard repo-consistency dependency-health release-changelog stale-repo-triage)

# Reconcile local with the remote ONCE, before any analyze.sh reads git state, so
# every skill below sees one up-to-date view (fetch+prune drops refs for branches
# deleted on the remote; a clean, strictly-behind default branch is fast-forwarded).
# Safe & non-aborting: progress/warnings go to stderr, never to the report. See
# shared/sync-remote.sh for the (offline/dirty/divergent/detached) edge handling.
# stdout (the JSON summary) is discarded so it never enters the report pipeline;
# stderr (human progress) is left intact so the run is transparent.
# --no-sync skips this network fetch for offline / already-synced runs (the fleet
# fan-out runs repos concurrently, so each repo's fetch is already parallelised).
$sync && bash "$shared_dir/sync-remote.sh" --repo "$repo" >/dev/null || true
# Tell the analyzers that the orchestrator OWNS remote sync: it already ran (or, on
# --no-sync, deliberately skipped) one fetch --all --prune for the whole pass. Analyzers
# must therefore NOT make their own per-repo network calls — post-prune those round-trips
# return nothing, and on --no-sync/offline they'd just hang or error. Standalone analyze.sh
# runs (no orchestrator) leave this unset and keep computing live. See git-branch-cleanup.
export GS_SYNC_MANAGED=1

selected=("${core[@]}")
$optimize && selected+=("${opt[@]}")
if [ -n "$only" ]; then IFS=',' read -ra selected <<<"$only"; fi

# Membership test over the finalized skill selection. Gates the shared pre-computations
# below so an `--only` subset that selects no consumer skips the (potentially expensive)
# walk entirely; on the default core pass every consumer is present, so nothing is skipped.
has_skill() { local s; for s in "${selected[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

# Full-history blob enumeration is the dominant cost on big repos, and BOTH
# git-repo-health and git-history-surgery need the IDENTICAL walk. Compute it once
# here into a temp file and share it via $GS_BLOB_LIST so each analyze.sh skips the
# redundant second walk; each self-computes when the cache is absent (standalone),
# so the atomic-skill contract is preserved. Skip the walk when an `--only` subset
# selects NEITHER blob consumer — with no reader the enumeration would be pure waste.
blob_cache=""
if { has_skill git-repo-health || has_skill git-history-surgery; } && blob_cache="$(mktemp 2>/dev/null)"; then
  # Walk OWNED, LIVE history only: local branches + tags. NOT --all. `--all` also walks
  # refs that retain blobs already stripped from real history — and re-reports them as
  # "still in history", re-queuing satisfied strip tasks: stale remote-tracking refs
  # (refs/remotes/*, which lag a force-push until the next fetch), git-steward's own
  # pre-rewrite backups (refs/git-steward/backup/*), the stash, and other tools' snapshot
  # refs (e.g. refs/t3/*). An --all-minus-blocklist can't enumerate every such namespace;
  # positive-selecting --branches --tags reports exactly the history a rewrite would target.
  git -C "$repo" rev-list --objects --branches --tags 2>/dev/null \
    | git -C "$repo" cat-file --batch-check='%(objectname) %(objecttype) %(objectsize) %(rest)' 2>/dev/null \
    > "$blob_cache" 2>/dev/null || :
  export GS_BLOB_LIST="$blob_cache"
fi

# Activity counts (last-commit epoch, recent/total commit counts, contributors) are
# full-history walks (rev-list --count --all + --since) that BOTH git-repo-health and
# stale-repo-triage need — so compute them ONCE here into a key=value cache and share via
# $GS_ACTIVITY (mirrors $GS_BLOB_LIST). Each analyze.sh self-computes when the cache is
# absent (standalone). git-repo-health is core, so this is shared on the default pass;
# stale-repo-triage is optimize-tier (the bigger win, where both walked independently).
# Skip when an `--only` subset selects neither consumer.
act_cache=""
if { has_skill git-repo-health || has_skill stale-repo-triage; } && act_cache="$(mktemp 2>/dev/null)"; then
  {
    printf 'last_epoch=%s\n'   "$(git -C "$repo" log -1 --all --format=%ct 2>/dev/null || echo 0)"
    printf 'c90=%s\n'          "$(git -C "$repo" rev-list --count HEAD --since='90 days ago' 2>/dev/null || echo 0)"
    printf 'c365=%s\n'         "$(git -C "$repo" rev-list --count HEAD --since='365 days ago' 2>/dev/null || echo 0)"
    printf 'total=%s\n'        "$(git -C "$repo" rev-list --count --all 2>/dev/null || echo 0)"
    printf 'contributors=%s\n' "$(git -C "$repo" shortlog -sn --all 2>/dev/null | wc -l | tr -d ' ')"
  } > "$act_cache" 2>/dev/null || :
  export GS_ACTIVITY="$act_cache"
fi
trap 'rm -f "$blob_cache" "$act_cache"' EXIT

# The selected skills share NO state — each only reads git and emits its own JSON — and
# several are network-bound (work-items, pipeline-health, git-branch-cleanup each make
# independent remote calls that otherwise run strictly back-to-back). So run them
# CONCURRENTLY: each worker writes to a temp file keyed by its index, we wait, then
# assemble `results` in the SAME deterministic selected[] order so the repo-steward/v1
# JSON is byte-identical to the old serial path regardless of which finishes first
# (mirrors run_across.sh's order-stable aggregation). The $GS_BLOB_LIST cache is computed
# ABOVE this loop, so concurrent readers are safe.
#
# Concurrency is capped (GS_REPO_JOBS, default 3 — the count of network skills) so on
# LARGE fleets, where repo-level fan-out already saturates the box, intra-repo threads
# don't oversubscribe. The cap only bounds how many run at once; all selected skills
# still complete. GS_FLEET_JOBS (repo-level) semantics are untouched.
sdir="$(mktemp -d)"; trap 'rm -f "$blob_cache" "$act_cache"; rm -rf "$sdir"' EXIT
rjobs="${GS_REPO_JOBS:-3}"; [ "$rjobs" -ge 1 ] 2>/dev/null || rjobs=1
run_skill() {
  local s="$1" outfile="$2" out
  out="$(bash "$skills_dir/$s/scripts/analyze.sh" --repo "$repo" 2>/dev/null || echo '{}')"
  jq -e . >/dev/null 2>&1 <<<"$out" || out='{"error":"analyze produced no valid JSON"}'
  printf '%s' "$out" >"$outfile"
}
declare -a snames sfiles
sidx=0
for s in "${selected[@]}"; do
  [ -f "$skills_dir/$s/scripts/analyze.sh" ] || continue
  snames[$sidx]="$s"; sfiles[$sidx]="$sdir/$sidx.json"
  while [ "$(jobs -rp | wc -l)" -ge "$rjobs" ]; do wait -n 2>/dev/null || break; done
  run_skill "$s" "${sfiles[$sidx]}" &
  sidx=$((sidx+1))
done
wait

# assemble IN SELECTED ORDER (index 0..n-1), never in completion order
results="{}"; i=0
while [ "$i" -lt "$sidx" ]; do
  out="$(cat "${sfiles[$i]}" 2>/dev/null)"
  jq -e . >/dev/null 2>&1 <<<"$out" || out='{"error":"analyze produced no valid JSON"}'
  results="$(jq -c --arg s "${snames[$i]}" --argjson o "$out" '.[$s]=$o' <<<"$results")"
  i=$((i+1))
done

name="$(basename "$(cd "$repo" && git rev-parse --show-toplevel 2>/dev/null || echo "$repo")")"
# roll up cross-skill attention signals
aggregate="$(jq -n --arg repo "$repo" --arg name "$name" --argjson opt "$optimize" --argjson r "$results" '
  {schema:"repo-steward/v1", repo:$repo, name:$name, optimize:$opt, skills:$r,
   attention:{
     health_flags: ($r["git-repo-health"].flags // []),
     # summary.prunable excludes gone branches that still hold unique work (needs_decision).
     prunable_branches: ($r["git-branch-cleanup"].summary.prunable // (($r["git-branch-cleanup"].summary.merged // 0) + ($r["git-branch-cleanup"].summary.gone // 0) + ($r["git-branch-cleanup"].summary.stale // 0))),
     branches_needing_decision: ($r["git-branch-cleanup"].summary.needs_decision // 0),
     non_conventional_commits: ($r["commit-hygiene"].lint.non_conventional // 0),
     secret_findings: ($r["git-history-surgery"].summary.secret_findings // 0),
     big_blobs: ($r["git-history-surgery"].summary.big_blobs // 0),
     open_work_items: ($r["work-items"].counts.total // 0),
     ci_status: ($r["pipeline-health"].overall // "n/a")
   }}')"

# generate the detailed findings document (the decision aid)
report_path=""
if $report; then
  report_path="$(printf '%s' "$aggregate" | bash "$here/../../../shared/report.sh" ${report_out:+--out "$report_out"} 2>/dev/null || true)"
fi
jq --arg rp "$report_path" '. + (if $rp != "" then {report_path:$rp} else {} end)' <<<"$aggregate"
