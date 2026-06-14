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
last="$(git log -1 --format=%ct 2>/dev/null || echo 0)"
days=$(( ( $(date +%s) - last ) / 86400 )); [ "$last" = "0" ] && days=-1
c90="$(git log --since='90 days ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"
c365="$(git log --since='365 days ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"
total="$(git rev-list --count --all 2>/dev/null || echo 0)"

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
