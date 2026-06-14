#!/usr/bin/env bash
# release-changelog apply.sh — prepend a CHANGELOG.md section and create an
# annotated tag for the computed next version. MUTATING (Tier 2 — tagging). Gated.
# Usage: apply.sh --repo <path> [--tag] --confirm
set -u
repo="."; do_tag=false; confirm=false
while [ $# -gt 0 ]; do case "$1" in
  --repo) repo="$2"; shift 2 ;; --tag) do_tag=true; shift ;;
  --confirm) confirm=true; shift ;; --mode) shift 2 ;; *) shift ;; esac; done
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
a="$(bash "$here/analyze.sh" --repo "$repo")"
cd "$repo" || exit 1
next="$(jq -r '.next_version' <<<"$a")"; bump="$(jq -r '.bump' <<<"$a")"
[ "$bump" = "none" ] && { echo "no releasable changes since last tag."; exit 0; }
today="$(date +%Y-%m-%d)"

section="$(jq -r --arg v "$next" --arg d "$today" '
  "## " + $v + " - " + $d + "\n" +
  (if (.changes.features|length)>0 then "\n### Features\n" + ([.changes.features[]|"- "+.]|join("\n")) + "\n" else "" end) +
  (if (.changes.fixes|length)>0 then "\n### Fixes\n" + ([.changes.fixes[]|"- "+.]|join("\n")) + "\n" else "" end) +
  (if (.changes.other|length)>0 then "\n### Other\n" + ([.changes.other[]|"- "+.]|join("\n")) + "\n" else "" end)
' <<<"$a")"

echo "== release-changelog plan =="
echo "next version: $next ($bump)"
$do_tag && echo "will create annotated tag v$next"
echo "--- CHANGELOG.md section ---"; printf '%s\n' "$section"
if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm to write CHANGELOG.md$( $do_tag && echo ' and tag')."; exit 0; fi

tmp="$(mktemp)"
{ printf '%s\n\n' "$section"; [ -f CHANGELOG.md ] && cat CHANGELOG.md; } > "$tmp"
{ printf '# Changelog\n\n'; cat "$tmp"; } > CHANGELOG.md 2>/dev/null || mv "$tmp" CHANGELOG.md
rm -f "$tmp"
echo "wrote CHANGELOG.md"
if $do_tag; then
  git add CHANGELOG.md 2>/dev/null
  git commit -qm "chore(release): v$next" 2>/dev/null || true
  git tag -a "v$next" -m "Release v$next" && echo "tagged v$next (push with: git push origin v$next)"
fi
