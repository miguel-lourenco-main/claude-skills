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
default_branch="$(jq -r '.default_branch // ""' <<<"$res")"
cd "$repo" 2>/dev/null || { echo "{\"schema\":\"pipeline-health/v1\",\"error\":\"path not found\"}"; exit 0; }
cur_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ -z "$branch" ] && branch="$cur_branch"
[ -z "$default_branch" ] && default_branch="$branch"

unavail() { jq -n --argjson res "$res" --arg b "$branch" --arg r "$1" \
  '{schema:"pipeline-health/v1", available:false, reason:$r, branch:$b, resolution:$res}'; exit 0; }
[ "$auth" = "missing" ] && unavail "forge CLI not authenticated"
case "$cli" in
  glab|gh) : ;;
  *) unavail "no usable forge CLI for host '$(jq -r '.host' <<<"$res")' (CI needs glab or gh)" ;;
esac

DEEP_MAX=3   # cap on how many failing pipelines we pull job logs for, to bound API calls

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

# --- 1) list recent pipelines across ALL branches (one call) ---
if [ "$cli" = "glab" ]; then
  raw="$(glab ci list -R "$proj" -F json 2>/dev/null || echo '[]')"
  jq -e 'type=="array"' >/dev/null 2>&1 <<<"$raw" || raw='[]'
  pipes="$(jq -c '[ .[] | {ref, status, id, web_url, created_at} ]' <<<"$raw")"
else # gh
  command -v gh >/dev/null 2>&1 || unavail "github repo but gh not installed"
  raw="$(gh run list -R "$proj" --json databaseId,status,conclusion,headBranch,url,createdAt --limit 50 2>/dev/null || echo '[]')"
  jq -e 'type=="array"' >/dev/null 2>&1 <<<"$raw" || raw='[]'
  pipes="$(jq -c '[ .[] | {ref:.headBranch, status:(.conclusion // .status), id:(.databaseId|tostring), web_url:.url, created_at:.createdAt} ]' <<<"$raw")"
fi
[ "$(jq 'length' <<<"$pipes")" = "0" ] && unavail "no pipelines found for project '$proj'"

# latest pipeline per ref; split real branches from merge-request refs
latest="$(jq -c 'group_by(.ref) | map(max_by(.created_at))' <<<"$pipes")"
mr_pipelines="$(jq -c '[ .[] | select(.ref|startswith("refs/merge-requests/")) | {ref, status, pipeline_id:(.id|tostring), web_url} ] | sort_by(.ref)' <<<"$latest")"
real="$(jq -c --arg db "$default_branch" --arg cur "$branch" '
  [ .[] | select((.ref|startswith("refs/merge-requests/"))|not)
        | {branch:.ref, status, pipeline_id:(.id|tostring), web_url,
           is_default:(.ref==$db), is_current:(.ref==$cur)} ]
  | sort_by([(if .is_default then 0 else 1 end), (if .is_current then 0 else 1 end), .branch])' <<<"$latest")"

# headline status = default branch, else current, else first
overall="$(jq -r --arg db "$default_branch" --arg cur "$branch" '
  ([.[]|select(.branch==$db)]|first) // ([.[]|select(.branch==$cur)]|first) // .[0] | .status // "unknown"' <<<"$real")"

# --- 2) deep-dive failing branches (bounded) to attach cause + job excerpts ---
deep_n=0; branches_json="[]"; top_cause="none"
while IFS= read -r br; do
  bn="$(jq -r '.branch' <<<"$br")"; st="$(jq -r '.status' <<<"$br")"
  cause="null"; failing_jobs="[]"
  if { [ "$st" = "failed" ] || [ "$st" = "failure" ]; } && [ "$deep_n" -lt "$DEEP_MAX" ]; then
    deep_n=$((deep_n+1))
    if [ "$cli" = "glab" ]; then
      # fetch jobs by pipeline id (ci get -b can resolve to the wrong/MR pipeline)
      proj_enc="$(printf '%s' "$proj" | sed 's#/#%2F#g')"
      pid="$(jq -r '.pipeline_id' <<<"$br")"
      jobs_basic="$(glab api "projects/$proj_enc/pipelines/$pid/jobs" 2>/dev/null | jq -c '[.[]?|{name,status,stage,id}]' 2>/dev/null || echo '[]')"
      while IFS= read -r job; do
        jn="$(jq -r '.name' <<<"$job")"; js="$(jq -r '.status' <<<"$job")"; jid="$(jq -r '.id' <<<"$job")"
        [ "$js" = "failed" ] || continue
        log="$(glab ci trace -R "$proj" "$jid" 2>/dev/null | tail -40 || true)"
        c="$(classify "$jn" "$log")"; ex="$(printf '%s' "$log" | tail -8)"
        failing_jobs="$(jq -c --arg n "$jn" --arg s "${js:-failed}" --arg c "$c" --arg ex "$ex" \
          '. += [{name:$n, status:$s, cause:$c, log_excerpt:$ex}]' <<<"$failing_jobs")"
      done < <(jq -c '.[]' <<<"$jobs_basic")
    else # gh
      rv="$(gh run view "$(jq -r '.pipeline_id' <<<"$br")" -R "$proj" --json jobs 2>/dev/null || echo '{}')"
      failedlog="$(gh run view "$(jq -r '.pipeline_id' <<<"$br")" -R "$proj" --log-failed 2>/dev/null | tail -40 || true)"
      failing_jobs="$(jq -c --arg log "$failedlog" '[.jobs[]? | select(.conclusion=="failure") |
          {name, status:.conclusion, cause:null, log_excerpt:($log|.[-400:])}]' <<<"$rv" 2>/dev/null || echo '[]')"
    fi
    cause="\"$(jq -r '[.[].cause|select(.!=null)] | (group_by(.)|max_by(length)|.[0]) // "unknown"' <<<"$failing_jobs" 2>/dev/null || echo unknown)\""
    [ "$top_cause" = "none" ] && top_cause="$(jq -r . <<<"$cause" 2>/dev/null || echo none)"
  fi
  branches_json="$(jq -c --argjson br "$br" --argjson cause "$cause" --argjson fj "$failing_jobs" \
    '. += [$br + {likely_cause:$cause, failing_jobs:$fj}]' <<<"$branches_json")"
done < <(jq -c '.[]' <<<"$real")

n_failing="$(jq '[.[]|select(.status=="failed" or .status=="failure")]|length' <<<"$branches_json")"

jq -n --argjson res "$res" --arg b "$branch" --arg db "$default_branch" --arg overall "$overall" \
  --argjson branches "$branches_json" --argjson mr "$mr_pipelines" \
  --argjson scanned "$(jq 'length' <<<"$pipes")" --argjson nfail "$n_failing" --arg tc "$top_cause" \
  '{schema:"pipeline-health/v1", available:true, project:$res.project, branch:$b, default_branch:$db,
    overall:$overall, scanned:$scanned, branches_failing:$nfail,
    branches:$branches, mr_pipelines:$mr, likely_cause:$tc,
    agent_fixable:( $tc as $c | ($c=="lint" or $c=="build" or $c=="hygiene" or $c=="test") )}'
