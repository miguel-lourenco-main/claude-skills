#!/usr/bin/env bash
# pipeline-health analyze.sh — report CI status, fetch failing job logs, and
# classify the likely failure cause. Read-only. Emits pipeline-health/v1 JSON.
#
# Usage: analyze.sh --repo <path> [--branch <name>]
set -u

repo="."; branch=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --branch) branch="$2"; shift 2 ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
res="$(bash "$here/../../../shared/resolve-host.sh" --repo "$repo")"
cli="$(jq -r '.cli' <<<"$res")"; proj="$(jq -r '.project' <<<"$res")"; auth="$(jq -r '.auth' <<<"$res")"
cd "$repo" 2>/dev/null || { echo "{\"schema\":\"pipeline-health/v1\",\"error\":\"path not found\"}"; exit 0; }
[ -z "$branch" ] && branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"

unavail() { jq -n --argjson res "$res" --arg b "$branch" --arg r "$1" \
  '{schema:"pipeline-health/v1", available:false, reason:$r, branch:$b, resolution:$res}'; exit 0; }
[ "$auth" = "missing" ] && unavail "forge CLI not authenticated"
case "$cli" in
  glab|gh) : ;;
  *) unavail "no usable forge CLI for host '$(jq -r '.host' <<<"$res")' (CI needs glab or gh)" ;;
esac

# classify a failure cause from job name + log text
classify() { # $1=jobname $2=logtext -> cause
  local n; n="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"; local l; l="$(printf '%s' "$2" | tr 'A-Z' 'a-z')"
  case "$l" in
    *"no space left"*|*"connection refused"*|*"could not resolve host"*|*"image pull"*|*"runner system failure"*|*"timed out"*)
      echo infra; return ;;
  esac
  case "$n$l" in
    *fmt*|*lint*|*prettier*|*eslint*|*rustfmt*|*"would reformat"*|*typecheck*|*tsc*) echo lint ;;
    *test*|*spec*|*assert*|*panicked*|*"failures:"*) echo test ;;
    *build*|*compile*|*"error["*|*"cannot find"*|*"compilation failed"*) echo build ;;
    *hygiene*|*"conflict marker"*) echo hygiene ;;
    *) echo unknown ;;
  esac
}

jobs_json="[]"; status="unknown"; pid=""; web=""
if [ "$cli" = "glab" ]; then
  pj="$(glab ci get -R "$proj" -b "$branch" -F json 2>/dev/null || echo '')"
  [ -z "$pj" ] && unavail "no pipeline found for branch '$branch'"
  status="$(jq -r '.status // "unknown"' <<<"$pj")"
  pid="$(jq -r '.id // ""' <<<"$pj")"; web="$(jq -r '.web_url // ""' <<<"$pj")"
  jobs_basic="$(jq -c '[.jobs[]? | {name,status,stage,id}]' <<<"$pj" 2>/dev/null || echo '[]')"
  jobs_json="[]"
  while IFS= read -r job; do
    jn="$(jq -r '.name' <<<"$job")"; js="$(jq -r '.status' <<<"$job")"; jid="$(jq -r '.id' <<<"$job")"
    cause="null"; excerpt=""
    if [ "$js" = "failed" ]; then
      log="$(glab ci trace -R "$proj" "$jid" 2>/dev/null | tail -40 || true)"
      [ -z "$log" ] && log="$(glab ci trace -R "$proj" -b "$branch" -j "$jn" 2>/dev/null | tail -40 || true)"
      cause="\"$(classify "$jn" "$log")\""
      excerpt="$(printf '%s' "$log" | tail -8)"
    fi
    jobs_json="$(jq -c --argjson job "$job" --argjson cause "$cause" --arg ex "$excerpt" \
      '. += [$job + {cause:$cause, log_excerpt:$ex}]' <<<"$jobs_json")"
  done < <(jq -c '.[]' <<<"$jobs_basic")
elif [ "$cli" = "gh" ]; then
  command -v gh >/dev/null 2>&1 || unavail "github repo but gh not installed"
  rl="$(gh run list -R "$proj" -b "$branch" --json databaseId,status,conclusion,workflowName --limit 1 2>/dev/null || echo '[]')"
  [ "$(jq 'length' <<<"$rl")" = "0" ] && unavail "no workflow runs for branch '$branch'"
  pid="$(jq -r '.[0].databaseId' <<<"$rl")"; status="$(jq -r '.[0].conclusion // .[0].status' <<<"$rl")"
  rv="$(gh run view "$pid" -R "$proj" --json jobs 2>/dev/null || echo '{}')"
  failedlog="$(gh run view "$pid" -R "$proj" --log-failed 2>/dev/null | tail -40 || true)"
  jobs_json="$(jq -c --arg log "$failedlog" '[.jobs[]? | {name, status:.conclusion, stage:null, id:.databaseId,
      cause:null, log_excerpt:(if .conclusion=="failure" then ($log|.[-400:]) else "" end)}]' <<<"$rv" 2>/dev/null || echo '[]')"
fi

failing="$(jq -c '[.[]|select(.status=="failed" or .status=="failure")]' <<<"$jobs_json")"
overall="$(jq -r 'if (.[]|select(.status=="failed" or .status=="failure")) then "failed" else empty end' <<<"$jobs_json" | head -1)"
[ -z "$overall" ] && overall="$status"
# dominant cause among failing jobs
top_cause="$(jq -r '[.[].cause|select(.!=null)] | (group_by(.)|max_by(length)|.[0]) // "none"' <<<"$failing" 2>/dev/null || echo none)"

jq -n --argjson res "$res" --arg b "$branch" --arg status "$status" --arg overall "$overall" \
  --arg pid "$pid" --arg web "$web" --argjson jobs "$jobs_json" --argjson failing "$failing" --arg tc "$top_cause" \
  '{schema:"pipeline-health/v1", available:true, project:$res.project, branch:$b,
    pipeline_id:$pid, web_url:$web, status:$status, overall:$overall,
    jobs:$jobs, failing:$failing, likely_cause:$tc,
    agent_fixable:( $tc as $c | ($c=="lint" or $c=="build" or $c=="hygiene" or $c=="test") )}'
