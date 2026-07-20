#!/usr/bin/env bash
# parse-actions.sh — read an edited findings report and extract the SELECTED actions
# into an execution-plan/v1 JSON. The user's edits ARE the selection. Read-only.
#
# Selection model:
#  - Normally a `- [x]` item carrying a <!--gs ...--> tag is selected; `- [ ]` is skipped.
#  - A list may end with a "select-all" checkbox (<!--gs op=select-all-->). If that box is
#    CHECKED, every item in its group is selected EXCEPT the ones individually checked
#    (checking an item then means EXCLUDE it). If the select-all is unchecked, normal rules
#    apply. Groups are bounded by markdown headings (and by each select-all).
#  - commit-reword items carry an edited message after "→" and before the tag.
#
# Usage: parse-actions.sh --report <file.md>   (or --in <file.md>)
set -u
file=""
while [ $# -gt 0 ]; do case "$1" in --report|--in) file="$2"; shift 2 ;; *) shift ;; esac; done
[ -f "$file" ] || { echo "{\"schema\":\"execution-plan/v1\",\"error\":\"report not found: $file\",\"actions\":[]}"; exit 0; }

actions="[]"          # final selected actions
group="[]"            # current group buffer: [{checked, obj}]
group_all="none"      # none | checked | unchecked

parse_obj() { # $1 = line -> prints the tag object JSON (or empty)
  local line="$1" tag obj k v t msg
  tag="$(sed -n 's/.*<!--gs \(.*\)-->.*/\1/p' <<<"$line")"
  [ -n "$tag" ] || { echo ""; return; }
  obj="{}"; read -ra toks <<<"$tag"
  for t in "${toks[@]}"; do k="${t%%=*}"; v="${t#*=}"; obj="$(jq -c --arg k "$k" --arg v "$v" '.[$k]=$v' <<<"$obj")"; done
  if [ "$(jq -r '.op // ""' <<<"$obj")" = "commit-reword" ]; then
    msg="$(sed -n 's/.*→ *\(.*[^ ]\) *<!--gs.*/\1/p' <<<"$line")"
    obj="$(jq -c --arg m "$msg" '.message=$m' <<<"$obj")"
  fi
  echo "$obj"
}

flush() { # resolve the current group into actions, applying the select-all rule
  local item checked obj sel
  while IFS= read -r item; do
    [ -n "$item" ] || continue
    checked="$(jq -r '.checked' <<<"$item")"; obj="$(jq -c '.obj' <<<"$item")"
    if [ "$group_all" = "checked" ]; then
      [ "$checked" = "true" ] && sel=false || sel=true     # invert: checked = exclude
    else
      [ "$checked" = "true" ] && sel=true || sel=false      # normal: checked = include
    fi
    [ "$sel" = "true" ] && actions="$(jq -c --argjson o "$obj" '. += [$o]' <<<"$actions")"
  done < <(jq -c '.[]' <<<"$group")
  group="[]"; group_all="none"
}

in_fence=0
while IFS= read -r line; do
  case "$line" in '```'*) in_fence=$((1-in_fence)); continue ;; esac  # skip fenced examples
  [ "$in_fence" -eq 1 ] && continue
  case "$line" in "#"*) flush; continue ;; esac          # heading bounds a group
  case "$line" in "- [ ] "*|"- [x] "*|"- [X] "*) : ;; *) continue ;; esac
  case "$line" in *"<!--gs "*"-->"*) : ;; *) continue ;; esac
  checked=false; case "$line" in "- [x] "*|"- [X] "*) checked=true ;; esac
  obj="$(parse_obj "$line")"; [ -n "$obj" ] || continue
  op="$(jq -r '.op // empty' <<<"$obj")"
  if [ "$op" = "select-all" ]; then
    [ "$checked" = "true" ] && group_all="checked" || group_all="unchecked"
    continue
  fi
  group="$(jq -c --argjson c "$checked" --argjson o "$obj" '. += [{checked:$c, obj:$o}]' <<<"$group")"
done < "$file"
flush

jq -n --arg src "$file" --argjson a "$actions" '
  {schema:"execution-plan/v1", source:$src, count:($a|length),
   tier1:[$a[]|select(.op|test("^(branch-delete-local|commit-reword|gitignore-add|gitignore-untrack|worktree-prune|worktree-remove|deps-bump)$"))],
   tier2:[$a[]|select(.op|test("^(history-remove-path|history-redact|branch-delete-remote|branch-merge|work-item-start|work-item-implement|pipeline-fix|release-tag)$"))],
   actions:$a}'
