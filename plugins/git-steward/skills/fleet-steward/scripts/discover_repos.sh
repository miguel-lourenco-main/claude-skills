#!/usr/bin/env bash
# discover_repos.sh — find local git repos under a root and classify each repo's
# forge from its remote URL. Read-only. Emits a JSON array.
#
# Usage: discover_repos.sh [--root <dir>] [--max-depth N]
set -u

root="/home/migaloco/Desktop/personal/projects"; max_depth=2
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    --max-depth) max_depth="$2"; shift 2 ;;
    *) shift ;;
  esac
done

out="[]"
while IFS= read -r gitdir; do
  d="$(dirname "$gitdir")"
  url="$(git -C "$d" remote get-url origin 2>/dev/null || git -C "$d" remote get-url "$(git -C "$d" remote 2>/dev/null | head -1)" 2>/dev/null || true)"
  host=""; case "$url" in *@*:*) host="${url#*@}"; host="${host%%:*}";; *://*) host="${url#*://}"; host="${host#*@}"; host="${host%%/*}";; esac
  case "$host" in gitlab*-*) host=gitlab.com;; github*-*) host=github.com;; esac
  forge=unknown; case "$host" in gitlab*) forge=gitlab;; github.com) forge=github;; esac
  slug=""; if [ -n "$url" ]; then p="$url"; case "$url" in *@*:*) p="${url#*:}";; *://*) p="${url#*://}"; p="${p#*/}";; esac; slug="${p%.git}"; fi
  out="$(jq -c --arg path "$d" --arg name "$(basename "$d")" --arg forge "$forge" --arg slug "$slug" --arg url "$url" \
    '. += [{path:$path, name:$name, forge:$forge, project:$slug, remote_url:$url}]' <<<"$out")"
done < <(find "$root" -maxdepth "$max_depth" -type d -name .git 2>/dev/null | sort)

jq -n --arg root "$root" --argjson repos "$out" \
  '{schema:"fleet-discover/v1", source:"workspace", root:$root, count:($repos|length), repos:$repos}'
