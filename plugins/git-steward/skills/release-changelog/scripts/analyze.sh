#!/usr/bin/env bash
# release-changelog analyze.sh — preview a changelog and next version from
# Conventional Commits since the last tag. Read-only. Emits release-changelog/v1.
# Usage: analyze.sh --repo <path>
set -u
repo="."
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" 2>/dev/null || { echo '{"schema":"release-changelog/v1","error":"path not found"}'; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo '{"schema":"release-changelog/v1","error":"not a git repository"}'; exit 0; }

last_tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"
range="HEAD"; [ -n "$last_tag" ] && range="${last_tag}..HEAD"

feats="[]"; fixes="[]"; other="[]"; breaking=false
while IFS= read -r line; do
  [ -n "$line" ] || continue
  case "$line" in *"!:"*|*"BREAKING CHANGE"*) breaking=true ;; esac
  case "$line" in
    feat*) feats="$(jq -c --arg s "$line" '. += [$s]' <<<"$feats")" ;;
    fix*)  fixes="$(jq -c --arg s "$line" '. += [$s]' <<<"$fixes")" ;;
    *)     other="$(jq -c --arg s "$line" '. += [$s]' <<<"$other")" ;;
  esac
done < <(git log "$range" --no-merges --format='%s' 2>/dev/null)

# next version
cur="${last_tag#v}"; [ -z "$cur" ] && cur="0.0.0"
IFS='.' read -r MA MI PA <<<"${cur:-0.0.0}"; MA=${MA:-0}; MI=${MI:-0}; PA=${PA:-0}
nf="$(jq 'length' <<<"$feats")"; nx="$(jq 'length' <<<"$fixes")"
if $breaking && [ -n "$last_tag" ]; then MA=$((MA+1)); MI=0; PA=0; bump=major
elif [ "$nf" -gt 0 ]; then MI=$((MI+1)); PA=0; bump=minor
elif [ "$nx" -gt 0 ]; then PA=$((PA+1)); bump=patch
else bump=none; fi
[ -z "$last_tag" ] && { next="0.1.0"; bump="initial"; } || next="${MA}.${MI}.${PA}"

jq -n --arg repo "$repo" --arg last "${last_tag:-}" --arg next "$next" --arg bump "$bump" \
  --argjson breaking "$breaking" --argjson feats "$feats" --argjson fixes "$fixes" --argjson other "$other" \
  '{schema:"release-changelog/v1", repo:$repo, last_tag:$last, next_version:$next, bump:$bump,
    breaking:$breaking,
    changes:{features:$feats, fixes:$fixes, other:$other},
    summary:{features:($feats|length), fixes:($fixes|length), other:($other|length)}}'
