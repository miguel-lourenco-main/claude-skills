#!/usr/bin/env bash
# repo-consistency analyze.sh — check a repo against a baseline of expected
# project files and report drift (missing / present). Read-only.
# Emits repo-consistency/v1 JSON.
# Usage: analyze.sh --repo <path>
set -u
repo="."
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" 2>/dev/null || { echo '{"schema":"repo-consistency/v1","error":"path not found"}'; exit 0; }

# expected baseline files; a template (in assets/baseline) means apply can create it
checks='[
  {"file":"README.md","has_template":false},
  {"file":"LICENSE","has_template":false},
  {"file":".gitignore","has_template":false},
  {"file":".editorconfig","has_template":true}
]'
# CI presence is satisfied by any of these
ci_present=false
for f in .gitlab-ci.yml .github/workflows; do [ -e "$f" ] && ci_present=true; done

results="$(jq -c '[.[] | . + {present:false}]' <<<"$checks")"
results="$(jq -c '[.[] | .present = false]' <<<"$results")"
i=0
while IFS= read -r f; do
  present=false; [ -e "$f" ] && present=true
  results="$(jq -c --argjson idx "$i" --argjson p "$present" '.[$idx].present=$p' <<<"$results")"
  i=$((i+1))
done < <(jq -r '.[].file' <<<"$checks")

missing="$(jq -c '[.[]|select(.present==false)|.file]' <<<"$results")"
fixable="$(jq -c '[.[]|select(.present==false and .has_template==true)|.file]' <<<"$results")"

jq -n --arg repo "$repo" --argjson checks "$results" --argjson ci "$ci_present" \
  --argjson missing "$missing" --argjson fixable "$fixable" \
  '{schema:"repo-consistency/v1", repo:$repo, files:$checks, ci_present:$ci,
    missing:$missing, auto_fixable:$fixable,
    summary:{missing:($missing|length), auto_fixable:($fixable|length), ci_present:$ci}}'
