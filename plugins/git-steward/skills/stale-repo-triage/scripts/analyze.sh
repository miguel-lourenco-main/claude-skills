#!/usr/bin/env bash
# stale-repo-triage analyze.sh — classify a repo's dormancy/activity. Read-only.
# No apply (recommends archive/cleanup). Emits stale-repo-triage/v1 JSON.
# Usage: analyze.sh --repo <path>
set -u
repo="."
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" 2>/dev/null || { echo '{"schema":"stale-repo-triage/v1","error":"path not found"}'; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo '{"schema":"stale-repo-triage/v1","error":"not a git repository"}'; exit 0; }

name="$(basename "$(git rev-parse --show-toplevel)")"
# Last activity across ALL refs, not HEAD only: a repo whose default branch is idle but
# which has recent work on feature/remote branches is NOT dormant. HEAD-only here
# misclassified such repos as dormant/abandoned. (`--all` is correct for a recency floor —
# unlike the blob walk, a stale ref can only make the repo look OLDER, never falsely newer.)
# These full-history walks are ALSO computed by git-repo-health; under repo-steward they're
# computed ONCE and shared via the $GS_ACTIVITY key=value cache (mirrors $GS_BLOB_LIST). Read
# the cached value when present; self-compute the IDENTICAL command when run standalone.
gs_act() { [ -n "${GS_ACTIVITY:-}" ] && [ -s "$GS_ACTIVITY" ] && sed -n "s/^$1=//p" "$GS_ACTIVITY" | head -1; }
last="$(gs_act last_epoch)"; [ -n "$last" ] || last="$(git log -1 --all --format=%ct 2>/dev/null || echo 0)"
days=$(( ( $(date +%s) - last ) / 86400 )); [ "$last" = "0" ] && days=-1
# Count via rev-list --count instead of `log --oneline | wc -l`: same commits, same
# `--since` date semantics, but git counts internally rather than formatting every
# commit subject and piping to a second process. (rev-list needs an explicit start
# point — HEAD; the `|| echo 0` keeps an empty/no-HEAD repo at 0, as wc did.)
c90="$(gs_act c90)"; [ -n "$c90" ] || c90="$(git rev-list --count HEAD --since='90 days ago' 2>/dev/null || echo 0)"
c365="$(gs_act c365)"; [ -n "$c365" ] || c365="$(git rev-list --count HEAD --since='365 days ago' 2>/dev/null || echo 0)"
total="$(gs_act total)"; [ -n "$total" ] || total="$(git rev-list --count --all 2>/dev/null || echo 0)"

if   [ "$days" -lt 0 ]; then tier="empty"; rec="no commits — consider removing"
elif [ "$days" -le 30 ]; then tier="active"; rec="actively developed"
elif [ "$days" -le 90 ]; then tier="slowing"; rec="slowing down — keep an eye on it"
elif [ "$days" -le 365 ]; then tier="dormant"; rec="dormant — consider archiving if not needed"
else tier="abandoned"; rec="abandoned (>1y) — strong candidate to archive or delete"
fi

jq -n --arg repo "$repo" --arg name "$name" --argjson days "$days" --argjson c90 "$c90" \
  --argjson c365 "$c365" --argjson total "$total" --arg tier "$tier" --arg rec "$rec" \
  '{schema:"stale-repo-triage/v1", repo:$repo, name:$name,
    days_since_last_commit:$days, commits_last_90d:$c90, commits_last_365d:$c365, total_commits:$total,
    tier:$tier, recommendation:$rec}'
