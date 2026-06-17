#!/usr/bin/env bash
# pipeline-health analyze.sh — report CI status, fetch failing job logs, and
# classify the likely failure cause. Read-only. Emits pipeline-health/v1 JSON.
#
# Usage: analyze.sh --repo <path> [--branch <name>] [--deep-max N]
set -u

repo="."; branch=""; deep_max_arg=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --branch) branch="$2"; shift 2 ;;
    --deep-max) deep_max_arg="$2"; shift 2 ;;
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
# pipeline-sentinel raises this to diagnose every failing pipeline in a repo, not just the first few.
case "$deep_max_arg" in ''|*[!0-9]*) : ;; *) DEEP_MAX="$deep_max_arg" ;; esac

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

# --- 2) deep-dive failing branches (bounded): resolve cause + record a diagnosis trail ---
# The trail captures WHAT was tried and the RESULT, so "unknown" is never a dead end.
# Cause priority: GitLab job failure_reason (e.g. ci_quota_exceeded) → log classification
# → config-level diagnosis (0 jobs / yaml errors / no failed job).
deep_n=0; branches_json="[]"; top_cause="none"
proj_enc="$(printf '%s' "$proj" | sed 's#/#%2F#g')"
while IFS= read -r br; do
  bn="$(jq -r '.branch' <<<"$br")"; st="$(jq -r '.status' <<<"$br")"; pid="$(jq -r '.pipeline_id' <<<"$br")"
  cause="null"; failing_jobs="[]"; diag="[]"; resolved=""
  if { [ "$st" = "failed" ] || [ "$st" = "failure" ]; } && [ "$deep_n" -lt "$DEEP_MAX" ]; then
    deep_n=$((deep_n+1))
    if [ "$cli" = "glab" ]; then
      jobs_raw="$(glab api "projects/$proj_enc/pipelines/$pid/jobs" 2>/dev/null || echo '[]')"
      jq -e 'type=="array"' >/dev/null 2>&1 <<<"$jobs_raw" || jobs_raw='[]'
      jobs_n="$(jq 'length' <<<"$jobs_raw")"; failed_n="$(jq '[.[]|select(.status=="failed")]|length' <<<"$jobs_raw")"
      diag="$(jq -c --argjson n "$jobs_n" --argjson f "$failed_n" --arg pid "$pid" \
        '. += ["fetched jobs for pipeline \($pid) → \($n) job(s), \($f) failed"]' <<<"$diag")"
      while IFS= read -r job; do
        jn="$(jq -r '.name' <<<"$job")"; jid="$(jq -r '.id' <<<"$job")"; jfr="$(jq -r '.failure_reason // ""' <<<"$job")"
        log="$(glab ci trace -R "$proj" "$jid" 2>/dev/null | tail -40 || true)"; c=""
        if [ -n "$jfr" ] && [ "$jfr" != "script_failure" ] && [ "$jfr" != "unknown_failure" ]; then
          c="$jfr"
          diag="$(jq -c --arg j "$jn" --arg fr "$jfr" '. += ["job `\($j)`: GitLab failure_reason = \($fr) (jobs did not run normally — infra/quota, not your code)"]' <<<"$diag")"
        elif [ -n "$log" ]; then
          c="$(classify "$jn" "$log")"
          diag="$(jq -c --arg j "$jn" --arg c "$c" '. += ["job `\($j)`: read trace (last 40 lines) → classified as **\($c)**"]' <<<"$diag")"
        else
          c="script-failure"
          diag="$(jq -c --arg j "$jn" --arg fr "${jfr:-none}" '. += ["job `\($j)`: failure_reason=\($fr); trace empty/unavailable → cause not determinable from logs"]' <<<"$diag")"
        fi
        ex="$(printf '%s' "$log" | tail -8)"
        failing_jobs="$(jq -c --arg n "$jn" --arg fr "$jfr" --arg c "$c" --arg ex "$ex" \
          '. += [{name:$n, status:"failed", failure_reason:$fr, cause:$c, log_excerpt:$ex}]' <<<"$failing_jobs")"
      done < <(jq -c '.[]|select(.status=="failed")' <<<"$jobs_raw")
      if [ "$failed_n" -gt 0 ]; then
        resolved="$(jq -r '([.[].cause]|group_by(.)|max_by(length)|.[0]) // "unknown"' <<<"$failing_jobs")"
        diag="$(jq -c --arg r "$resolved" '. += ["result: dominant cause across failed jobs = **\($r)**"]' <<<"$diag")"
      elif [ "$jobs_n" -eq 0 ]; then
        pdetail="$(glab api "projects/$proj_enc/pipelines/$pid" 2>/dev/null || echo '{}')"
        yerr="$(jq -r '.yaml_errors // ""' <<<"$pdetail")"
        diag="$(jq -c --arg y "${yerr:-none}" '. += ["pipeline has 0 jobs; checked CI config → yaml_errors: \($y)"]' <<<"$diag")"
        if [ -n "$yerr" ]; then resolved="invalid-ci-config"
          diag="$(jq -c '. += ["result: .gitlab-ci.yml is invalid (see yaml_errors) — no pipeline could be built"]' <<<"$diag")"
        else resolved="empty-pipeline"
          diag="$(jq -c '. += ["result: failed with no jobs and no yaml errors — `workflow:`/`rules:` produced nothing on this ref, or it is a parent of a trigger/child pipeline. Not a job failure; check .gitlab-ci.yml rules for this branch."]' <<<"$diag")"
        fi
      else
        resolved="no-failed-job"
        diag="$(jq -c --argjson n "$jobs_n" '. += ["pipeline failed but none of its \($n) job(s) is marked failed → likely a blocked/manual/canceled stage or a downstream trigger, not a script error"]' <<<"$diag")"
      fi
    else # gh
      rv="$(gh run view "$pid" -R "$proj" --json jobs 2>/dev/null || echo '{}')"
      failedlog="$(gh run view "$pid" -R "$proj" --log-failed 2>/dev/null | tail -40 || true)"
      failing_jobs="$(jq -c --arg log "$failedlog" '[.jobs[]? | select(.conclusion=="failure") |
          {name, status:.conclusion, failure_reason:"", cause:"script-failure", log_excerpt:($log|.[-400:])}]' <<<"$rv" 2>/dev/null || echo '[]')"
      resolved="$(jq -r '([.[].cause]|group_by(.)|max_by(length)|.[0]) // "unknown"' <<<"$failing_jobs")"
      diag="$(jq -c --arg r "$resolved" '. += ["GitHub: viewed run jobs + --log-failed → \($r)"]' <<<"$diag")"
    fi
    [ -z "$resolved" ] && resolved="unknown"
    cause="$(jq -cn --arg c "$resolved" '$c')"
    [ "$top_cause" = "none" ] && top_cause="$resolved"
  fi
  branches_json="$(jq -c --argjson br "$br" --argjson cause "$cause" --argjson fj "$failing_jobs" --argjson dg "$diag" \
    '. += [$br + {likely_cause:$cause, failing_jobs:$fj, diagnosis:$dg}]' <<<"$branches_json")"
done < <(jq -c '.[]' <<<"$real")

n_failing="$(jq '[.[]|select(.status=="failed" or .status=="failure")]|length' <<<"$branches_json")"

jq -n --argjson res "$res" --arg b "$branch" --arg db "$default_branch" --arg overall "$overall" \
  --argjson branches "$branches_json" --argjson mr "$mr_pipelines" \
  --argjson scanned "$(jq 'length' <<<"$pipes")" --argjson nfail "$n_failing" --arg tc "$top_cause" \
  '{schema:"pipeline-health/v1", available:true, project:$res.project, branch:$b, default_branch:$db,
    overall:$overall, scanned:$scanned, branches_failing:$nfail,
    branches:$branches, mr_pipelines:$mr, likely_cause:$tc,
    agent_fixable:( $tc as $c | ($c=="lint" or $c=="build" or $c=="hygiene" or $c=="test") )}'
