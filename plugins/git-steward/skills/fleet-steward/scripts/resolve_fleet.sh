#!/usr/bin/env bash
# resolve_fleet.sh — produce the final fleet list from a source choice and an
# optional exclusion list, and persist it to <root>/.git-steward/fleet.json.
# Read-only except for writing the saved-fleet file. Emits fleet/v1 JSON.
#
# Usage:
#   resolve_fleet.sh --source workspace|gitlab|both [--root <dir>] [--exclude a,b,c] [--save]
#   resolve_fleet.sh --load [--root <dir>]      # re-emit the saved fleet, if any
set -u

root="${GS_ROOT:-$HOME/Desktop/personal/projects}"; source="workspace"; exclude=""; save=false; load=false
while [ $# -gt 0 ]; do
  case "$1" in
    --source) source="$2"; shift 2 ;;
    --root) root="$2"; shift 2 ;;
    --exclude) exclude="$2"; shift 2 ;;
    --save) save=true; shift ;;
    --load) load=true; shift ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
store="$root/.git-steward/fleet.json"

if $load; then
  [ -f "$store" ] && cat "$store" || echo '{"schema":"fleet/v1","saved":false,"repos":[]}'
  exit 0
fi

ws="$(bash "$here/discover_repos.sh" --root "$root" 2>/dev/null || echo '{"repos":[]}')"
gl='{"repos":[]}'
if [ "$source" = "gitlab" ] || [ "$source" = "both" ]; then
  gl="$(bash "$here/list_gitlab_projects.sh" 2>/dev/null || echo '{"repos":[]}')"
fi

# normalize a comparable project key from a slug/url
case "$source" in
  workspace) merged="$(jq -c '.repos' <<<"$ws")" ;;
  gitlab)    merged="$(jq -c '.repos' <<<"$gl")" ;;
  both)
    # intersection: workspace repos whose project slug matches a gitlab project slug
    merged="$(jq -c -n --argjson w "$(jq -c '.repos' <<<"$ws")" --argjson g "$(jq -c '.repos' <<<"$gl")" '
      ($g | map(.project)) as $gp
      | [ $w[] | select(.project as $p | $gp | index($p)) ]')" ;;
  *) merged='[]' ;;
esac

# apply exclusions (by name or project slug)
exc_json="$(printf '%s' "$exclude" | jq -R 'split(",")|map(select(length>0))')"
included="$(jq -c --argjson exc "$exc_json" '[.[] | select((.name as $n | $exc|index($n))==null and (.project as $p | $exc|index($p))==null)]' <<<"$merged")"
excluded="$(jq -c --argjson exc "$exc_json" '[.[] | select((.name as $n | $exc|index($n))!=null or (.project as $p | $exc|index($p))!=null)]' <<<"$merged")"

result="$(jq -n --arg source "$source" --arg root "$root" --argjson inc "$included" --argjson exc "$excluded" \
  '{schema:"fleet/v1", saved:false, source:$source, root:$root,
    included:$inc, excluded:$exc, count:($inc|length)}')"

if $save; then
  mkdir -p "$root/.git-steward"
  jq '.saved=true' <<<"$result" > "$store"
  result="$(jq '.saved=true' <<<"$result")"
fi
printf '%s\n' "$result"
