#!/usr/bin/env bash
# policy.sh — resolve the user-controlled autofix policy for pipeline-sentinel.
# Read-only except for --init (which writes a default policy the user then edits).
# The policy decides, per failure, whether the sentinel auto-fixes, gates, just
# reports, or escalates. DEFAULT POSTURE IS GATED: nothing pushes without an
# explicit yes unless the user has promoted a cause to "auto".
# Emits sentinel-policy/v1 JSON.
#
# Usage:
#   policy.sh [--root <dir>]                 # load saved policy, else print defaults
#   policy.sh --init [--root <dir>]          # write the default policy file (if absent)
#   policy.sh --root <dir> --set <cause>=<mode>   # promote/demote one cause (auto|gated|report|escalate)
set -u

root="${GS_ROOT:-$HOME/Desktop/personal/projects}"; init=false; set_kv=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    --init) init=true; shift ;;
    --set) set_kv="$2"; shift 2 ;;
    *) shift ;;
  esac
done

store="$root/.git-steward/sentinel-policy.json"

# The default policy. Posture: gated everywhere, report-only on the default
# branch, escalate infra. The user flips a cause to "auto" to let the sentinel
# push that class of fix unattended (never on the default branch).
default_policy() {
  jq -n '{
    schema:"sentinel-policy/v1",
    default_branch_policy:"report",
    branch_scope:"all-non-default",
    causes:{ lint:"gated", build:"gated", hygiene:"gated", test:"gated", unknown:"gated", infra:"escalate" },
    max_attempts:3,
    interval:20,
    max_polls:20,
    require_open_mr:false,
    exclude_repos:[],
    exclude_branch_globs:["main","master","develop","release/*","prod*"]
  }'
}

current() { if [ -f "$store" ]; then cat "$store"; else default_policy; fi; }

if $init; then
  mkdir -p "$root/.git-steward"
  if [ -f "$store" ]; then current | jq '. + {saved:true, path:$p}' --arg p "$store"; exit 0; fi
  default_policy > "$store"
  jq '. + {saved:true, created:true, path:$p}' --arg p "$store" "$store"; exit 0
fi

if [ -n "$set_kv" ]; then
  cause="${set_kv%%=*}"; mode="${set_kv#*=}"
  case "$mode" in auto|gated|report|escalate) : ;; *) echo "{\"error\":\"mode must be auto|gated|report|escalate\"}"; exit 1 ;; esac
  mkdir -p "$root/.git-steward"; current > "$store.tmp"
  jq --arg c "$cause" --arg m "$mode" '.causes[$c]=$m' "$store.tmp" > "$store" && rm -f "$store.tmp"
  jq '. + {saved:true, path:$p}' --arg p "$store" "$store"; exit 0
fi

# default action: emit the effective policy (saved or defaults)
if [ -f "$store" ]; then jq '. + {saved:true, path:$p}' --arg p "$store" "$store"
else default_policy | jq '. + {saved:false}'; fi
