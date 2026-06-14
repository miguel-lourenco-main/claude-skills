#!/usr/bin/env bash
# parse-actions.sh — read an edited findings report and extract the CHECKED
# actions (the `- [x]` items with <!--gs ...--> tags) into an execution-plan/v1
# JSON. Read-only. The user's edits ARE the selection.
#
# Usage: parse-actions.sh --report <file.md>   (or --in <file.md>)
set -u
file=""
while [ $# -gt 0 ]; do case "$1" in --report|--in) file="$2"; shift 2 ;; *) shift ;; esac; done
[ -f "$file" ] || { echo "{\"schema\":\"execution-plan/v1\",\"error\":\"report not found: $file\",\"actions\":[]}"; exit 0; }

actions="[]"
while IFS= read -r line; do
  # only checked items that carry a gs tag
  case "$line" in
    "- [x] "*|"- [X] "*) : ;;
    *) continue ;;
  esac
  case "$line" in *"<!--gs "*"-->"*) : ;; *) continue ;; esac

  tag="$(sed -n 's/.*<!--gs \(.*\)-->.*/\1/p' <<<"$line")"
  [ -n "$tag" ] || continue
  read -ra toks <<<"$tag"
  obj="{}"
  for t in "${toks[@]}"; do
    k="${t%%=*}"; v="${t#*=}"
    obj="$(jq -c --arg k "$k" --arg v "$v" '.[$k]=$v' <<<"$obj")"
  done
  op="$(jq -r '.op // empty' <<<"$obj")"
  [ -n "$op" ] || continue
  # commit-reword carries an edited message after "→" and before the tag
  if [ "$op" = "commit-reword" ]; then
    msg="$(sed -n 's/.*→ *\(.*[^ ]\) *<!--gs.*/\1/p' <<<"$line")"
    obj="$(jq -c --arg m "$msg" '.message=$m' <<<"$obj")"
  fi
  actions="$(jq -c --argjson o "$obj" '. += [$o]' <<<"$actions")"
done < "$file"

jq -n --arg src "$file" --argjson a "$actions" '
  {schema:"execution-plan/v1", source:$src, count:($a|length),
   tier1:[$a[]|select(.op|test("^(branch-delete-local|commit-reword|gitignore-add|gitignore-untrack|worktree-prune|deps-bump)$"))],
   tier2:[$a[]|select(.op|test("^(history-remove-path|history-redact|branch-delete-remote|work-item-start|pipeline-fix|release-tag)$"))],
   actions:$a}'
