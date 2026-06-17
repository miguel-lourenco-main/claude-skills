#!/usr/bin/env bash
# sweep.sh — one fleet-wide CI sweep: enumerate EVERY pipeline in EVERY repo of
# the resolved fleet, diagnose failures (via pipeline-health), and stamp each
# failing pipeline with a policy DECISION (auto | gated | report | escalate).
# Read-only — it never pushes. Emits pipeline-sentinel/v1 JSON and writes one
# consolidated markdown report. The autofix loop itself is driven by the skill
# (model authors the fix; pipeline-health apply.sh pushes+monitors, gated).
#
# Usage:
#   sweep.sh [--root <dir>] [--deep-max N] [--quiet]
#     --deep-max N : per-repo cap on failing pipelines to pull logs for (default 10).
set -u

root="${GS_ROOT:-$HOME/Desktop/personal/projects}"; deep_max=10; quiet=false
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    --deep-max) deep_max="$2"; shift 2 ;;
    --quiet) quiet=true; shift ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ph_analyze="$here/../../pipeline-health/scripts/analyze.sh"
fleet_resolve="$here/../../fleet-steward/scripts/resolve_fleet.sh"
log() { $quiet || printf '%s\n' "$1" >&2; }

# --- policy (user-controlled; defaults to gated) ---
policy="$(bash "$here/policy.sh" --root "$root")"
dbp="$(jq -r '.default_branch_policy // "report"' <<<"$policy")"
scope="$(jq -r '.branch_scope // "all-non-default"' <<<"$policy")"
excl_repos="$(jq -c '.exclude_repos // []' <<<"$policy")"
excl_globs="$(jq -c '.exclude_branch_globs // []' <<<"$policy")"

# --- fleet (saved, else workspace discovery) ---
fleet="$(bash "$fleet_resolve" --load --root "$root")"
if [ "$(jq -r '.saved // false' <<<"$fleet")" != "true" ]; then
  fleet="$(bash "$fleet_resolve" --source workspace --root "$root")"
fi
repos="$(jq -c '.included // .repos // []' <<<"$fleet")"

glob_match() { # $1=branch ; returns 0 if it matches any exclude glob
  local b="$1" g
  while IFS= read -r g; do [ -z "$g" ] && continue; case "$b" in $g) return 0;; esac; done \
    < <(jq -r '.[]' <<<"$excl_globs")
  return 1
}

# policy_key(cause) — map a raw cause (incl. GitLab failure_reasons like
# ci_quota_exceeded, runner_system_failure) onto a policy bucket: the four code
# causes pass through; anything infra/quota/runner/timeout buckets to "infra"
# (escalate by default, never a code fix); everything else is "unknown".
policy_key() {
  local c; c="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  case "$c" in
    lint|build|hygiene|test) echo "$c"; return ;;
    infra|*quota*|*runner*|*system_failure*|*scheduler*|*stuck*|*timeout*|*data_integrity*) echo infra; return ;;
    *) echo unknown ;;
  esac
}

reports_dir="$root/.git-steward/reports"; mkdir -p "$reports_dir" 2>/dev/null || reports_dir="$(mktemp -d)"
stamp="$(date +%Y%m%d-%H%M%S)"

agg="[]"
n_repos=0
while IFS= read -r r; do
  name="$(jq -r '.name' <<<"$r")"; path="$(jq -r '.path // ""' <<<"$r")"
  # repo-level exclusion
  if jq -e --arg n "$name" '.[]|select(.==$n)' >/dev/null 2>&1 <<<"$excl_repos"; then
    agg="$(jq -c --arg n "$name" '. += [{name:$n, skipped:"excluded by policy"}]' <<<"$agg")"; continue
  fi
  if [ -z "$path" ] || [ "$path" = "null" ]; then
    agg="$(jq -c --arg n "$name" '. += [{name:$n, skipped:"not cloned locally"}]' <<<"$agg")"; continue
  fi
  log "sweeping $name …"
  a="$(bash "$ph_analyze" --repo "$path" --deep-max "$deep_max" 2>/dev/null || echo '{}')"
  if [ "$(jq -r '.available // false' <<<"$a")" != "true" ]; then
    reason="$(jq -r '.reason // "unavailable"' <<<"$a")"
    agg="$(jq -c --arg n "$name" --arg p "$path" --arg why "$reason" \
      '. += [{name:$n, repo:$p, available:false, reason:$why}]' <<<"$agg")"
    n_repos=$((n_repos+1)); continue
  fi
  proj="$(jq -r '.project // ""' <<<"$a")"; db="$(jq -r '.default_branch // ""' <<<"$a")"
  overall="$(jq -r '.overall // "unknown"' <<<"$a")"

  # build per-branch pipeline rows with a decision
  rows="[]"
  while IFS= read -r br; do
    bn="$(jq -r '.branch' <<<"$br")"; st="$(jq -r '.status' <<<"$br")"
    is_def="$(jq -r '.is_default' <<<"$br")"; fix="$(jq -r '.agent_fixable // false' <<<"$br")"
    cause="$(jq -r '(.likely_cause // "unknown") | if type=="string" then . else tostring end' <<<"$br")"
    [ "$cause" = "null" ] && cause="unknown"
    excluded=false; { glob_match "$bn" && [ "$is_def" != "true" ]; } && excluded=true
    decision="ok"
    if [ "$st" = "failed" ] || [ "$st" = "failure" ]; then
      if [ "$is_def" = "true" ]; then decision="$dbp"
      elif [ "$excluded" = "true" ]; then decision="report"
      else
        key="$(policy_key "$cause")"
        if [ "$key" = "infra" ]; then decision="$(jq -r '.causes.infra // "escalate"' <<<"$policy")"
        else decision="$(jq -r --arg c "$key" '.causes[$c] // "gated"' <<<"$policy")"
        fi
      fi
    fi
    kind="branch"; [ "$is_def" = "true" ] && kind="default"
    rows="$(jq -c --arg b "$bn" --arg s "$st" --arg k "$kind" --arg c "$cause" \
      --argjson def "$([ "$is_def" = true ] && echo true || echo false)" \
      --argjson fx "$([ "$fix" = true ] && echo true || echo false)" \
      --arg dec "$decision" --argjson jobs "$(jq -c '.failing_jobs // []' <<<"$br")" \
      --arg url "$(jq -r '.web_url // ""' <<<"$br")" \
      '. += [{branch:$b, kind:$k, status:$s, is_default:$def, cause:$c, agent_fixable:$fx,
              decision:$dec, failing_jobs:$jobs, web_url:$url}]' <<<"$rows")"
  done < <(jq -c '.branches[]?' <<<"$a")

  # merge-request pipelines (status only; no per-cause deep-dive from analyze)
  mr="$(jq -c '[.mr_pipelines[]? | {ref, status, web_url}]' <<<"$a")"

  agg="$(jq -c --arg n "$name" --arg p "$path" --arg proj "$proj" --arg db "$db" --arg ov "$overall" \
    --argjson rows "$rows" --argjson mr "$mr" \
    '. += [{name:$n, repo:$p, project:$proj, available:true, default_branch:$db, overall:$ov,
            pipelines:$rows, mr_pipelines:$mr}]' <<<"$agg")"
  n_repos=$((n_repos+1))
done < <(jq -c '.[]' <<<"$repos")

# --- totals across the fleet ---
result="$(jq -n --arg root "$root" --arg stamp "$stamp" --argjson policy "$policy" \
  --argjson scope "\"$scope\"" --argjson repos "$agg" '
  ([$repos[].pipelines[]?]) as $all |
  {schema:"pipeline-sentinel/v1", scanned_at:$stamp, root:$root, branch_scope:$scope,
   policy:$policy,
   totals:{
     repos_scanned: ([$repos[]|select(.available==true)]|length),
     repos_unavailable: ([$repos[]|select(.available==false)]|length),
     pipelines_failing: ([$all[]|select(.status=="failed" or .status=="failure")]|length),
     auto:    ([$all[]|select(.decision=="auto")]|length),
     gated:   ([$all[]|select(.decision=="gated")]|length),
     report:  ([$all[]|select(.decision=="report")]|length),
     escalate:([$all[]|select(.decision=="escalate")]|length)
   },
   repos:$repos}')"

# --- render the consolidated markdown report ---
report="$reports_dir/${stamp}-sentinel.md"
{
  echo "# Pipeline Sentinel — fleet CI sweep ($stamp)"
  echo
  echo "<!-- ps:meta scanned_at=$stamp scope=$scope -->"
  echo
  echo "## How to use this report"
  echo
  echo "- **Decision** column tells you what the sentinel will do with each failing pipeline:"
  echo "  - **auto** — policy authorized an unattended fix on this branch. Pre-checked below."
  echo "  - **gated** — a fix can be authored, but the push needs your explicit yes (Tier 2)."
  echo "  - **report** — surfaced only; never auto-pushed (default branch, or an excluded branch)."
  echo "  - **escalate** — not agent-fixable (infra/quota); needs a human."
  echo "- Tick the boxes under **Actions** for the fixes you want run, then tell me to execute."
  echo "- Change the posture any time: edit \`.git-steward/sentinel-policy.json\` or say e.g. \"auto-fix lint everywhere\"."
  echo
  # totals
  jq -r '.totals | "## Fleet totals\n\n- Repos scanned: \(.repos_scanned) (\(.repos_unavailable) unavailable)\n- Failing pipelines: \(.pipelines_failing)\n- Decisions — auto: \(.auto) · gated: \(.gated) · report-only: \(.report) · escalate: \(.escalate)\n"' <<<"$result"
  echo "## Failing pipelines"
  echo
  # per-repo failing tables
  jq -r '.repos[] | select(.available==true) |
    ([.pipelines[]? | select(.status=="failed" or .status=="failure")]) as $f |
    if ($f|length)>0 then
      "### \(.name)  ·  `\(.project)`\n\n| Branch | Kind | Cause | Decision | Failing jobs |\n|---|---|---|---|---|\n" +
      ([$f[] | "| `\(.branch)` | \(.kind) | \(.cause) | **\(.decision)** | \([.failing_jobs[]?.name]|join(", ")) |"]|join("\n")) + "\n"
    else empty end' <<<"$result"
  # unavailable repos
  un="$(jq -r '[.repos[]|select(.available==false)]' <<<"$result")"
  if [ "$(jq 'length' <<<"$un")" != "0" ]; then
    echo "### Unavailable (no forge / not authenticated / not cloned)"
    echo
    jq -r '.[] | "- **\(.name)** — \(.reason // .skipped // "unavailable")"' <<<"$un"
    echo
  fi
  echo "## Actions"
  echo
  echo "Each item runs the diagnose → fix → push → monitor loop (bounded retries) in that repo, on that branch. The default branch is never pushed."
  echo
  # actionable items: auto (pre-checked) and gated (unchecked). report/escalate are not actions.
  acts="$(jq -c '[.repos[]? | .name as $n | .pipelines[]? | select(.decision=="auto" or .decision=="gated") | {repo:$n, branch:.branch, cause:.cause, decision:.decision}]' <<<"$result")"
  if [ "$(jq 'length' <<<"$acts")" = "0" ]; then
    echo "_No actionable failures — nothing to fix, or everything is report-only/escalated._"
  else
    jq -r '.[] | (if .decision=="auto" then "- [x]" else "- [ ]" end) +
      " **Fix `\(.branch)` in \(.repo)** (\(.cause)" + (if .decision=="auto" then ", auto" else "" end) + ")" +
      " <!--ps op=pipeline-fix repo=\(.repo) branch=\(.branch) cause=\(.cause) decision=\(.decision)-->"' <<<"$acts"
    # select-all helper when 2+ gated items
    ng="$(jq '[.[]|select(.decision=="gated")]|length' <<<"$acts")"
    [ "$ng" -ge 2 ] && echo "- [ ] _**Select all gated fixes above**_ <!--ps op=select-all-->"
  fi
  echo
  # escalations
  esc="$(jq -c '[.repos[]? | .name as $n | .pipelines[]? | select(.decision=="escalate") | {repo:$n, branch:.branch, cause:.cause}]' <<<"$result")"
  if [ "$(jq 'length' <<<"$esc")" != "0" ]; then
    echo "## Escalations (human needed)"
    echo
    jq -r '.[] | "- **\(.repo)** / `\(.branch)` — \(.cause) (infra/quota: not agent-fixable)"' <<<"$esc"
    echo
  fi
  # default-branch alerts
  dba="$(jq -c '[.repos[]? | .name as $n | .pipelines[]? | select(.is_default==true and (.status=="failed" or .status=="failure")) | {repo:$n, branch:.branch, cause:.cause}]' <<<"$result")"
  if [ "$(jq 'length' <<<"$dba")" != "0" ]; then
    echo "## ⚠️ Default-branch failures (report-only — never auto-pushed)"
    echo
    jq -r '.[] | "- **\(.repo)** / `\(.branch)` is RED (\(.cause)). Fix via an MR/branch, not a direct push."' <<<"$dba"
    echo
  fi
} > "$report" 2>/dev/null

jq --arg rp "$report" '. + {report:$rp}' <<<"$result"
