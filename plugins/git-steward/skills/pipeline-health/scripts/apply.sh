#!/usr/bin/env bash
# pipeline-health apply.sh — push the current branch (after a fix the agent
# authored) and MONITOR the resulting pipeline until it terminates. One cycle
# per call; the skill's loop handles retry budget + signature dedup.
# MUTATING + OUTWARD (Tier 2). Honors shared/SAFETY.md. Never pushes default branch.
#
# Usage:
#   apply.sh --repo <path> --push-and-monitor [--interval 20] [--max-polls 20] --confirm
#   apply.sh --repo <path> --monitor-only    [--branch <name>] [--interval 20] [--max-polls 20]
set -u

repo="."; branch=""; interval=20; max_polls=20
push=false; monitor_only=false; confirm=false
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --branch) branch="$2"; shift 2 ;;
    --interval) interval="$2"; shift 2 ;;
    --max-polls) max_polls="$2"; shift 2 ;;
    --push-and-monitor) push=true; shift ;;
    --monitor-only) monitor_only=true; shift ;;
    --confirm) confirm=true; shift ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
res="$(bash "$here/../../../shared/resolve-host.sh" --repo "$repo")"
cli="$(jq -r '.cli' <<<"$res")"; proj="$(jq -r '.project' <<<"$res")"
default="$(jq -r '.default_branch' <<<"$res")"; auth="$(jq -r '.auth' <<<"$res")"
cd "$repo" || exit 1
[ -z "$branch" ] && branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$auth" = "missing" ] && { echo "REFUSED: $cli not authenticated."; exit 1; }

terminal() { case "$1" in success|failed|canceled|skipped|manual) return 0;; *) return 1;; esac; }

poll() { # echoes final status of latest pipeline for $branch
  local i=0 st
  while [ "$i" -lt "$max_polls" ]; do
    if [ "$cli" = "glab" ]; then
      st="$(glab ci get -R "$proj" -b "$branch" -F json 2>/dev/null | jq -r '.status // "unknown"')"
    else
      local id; id="$(gh run list -R "$proj" -b "$branch" --json databaseId --limit 1 2>/dev/null | jq -r '.[0].databaseId // ""')"
      [ -n "$id" ] && { gh run watch "$id" -R "$proj" --exit-status >/dev/null 2>&1 && echo success && return 0 || { echo failed; return 0; }; }
      st="unknown"
    fi
    terminal "$st" && { echo "$st"; return 0; }
    i=$((i+1)); sleep "$interval"
  done
  echo "timeout"
}

if $push; then
  if [ "$branch" = "$default" ]; then echo "REFUSED: refusing to push the default branch ($default)."; exit 1; fi
  ahead="$(git rev-list --count "@{upstream}..HEAD" 2>/dev/null || git rev-list --count HEAD)"
  echo "== pipeline-health push-and-monitor plan =="
  echo "repo: $repo   branch: $branch   commits to push: ${ahead:-?}"
  echo "then poll the new pipeline every ${interval}s up to ${max_polls}× (~$((interval*max_polls/60)) min)"
  if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm to push and monitor (Tier 2)."; exit 0; fi
  git push >/dev/null 2>&1 || git push -u origin "$branch" >/dev/null 2>&1 || { echo "push failed"; exit 1; }
  echo "pushed. monitoring…"
  final="$(poll)"
elif $monitor_only; then
  echo "monitoring $branch (no push)…"
  final="$(poll)"
else
  echo "nothing to do: pass --push-and-monitor or --monitor-only"; exit 0
fi

sig=""
if [ "$final" = "failed" ]; then
  a="$(bash "$here/analyze.sh" --repo "$repo" --branch "$branch" 2>/dev/null)"
  sig="$(jq -r '.likely_cause + ":" + ([.failing[].name]|sort|join(","))' <<<"$a" 2>/dev/null || echo "failed")"
fi
jq -n --arg b "$branch" --arg final "$final" --arg sig "$sig" \
  '{schema:"pipeline-monitor-result/v1", branch:$b, final_status:$final, failure_signature:$sig,
    passed:($final=="success")}'
