#!/usr/bin/env bash
# gitignore-guard apply.sh — append missing recommended .gitignore entries and
# optionally untrack files that should be ignored. MUTATING (Tier 1, gated).
#
# Usage: apply.sh --repo <path> [--untrack] [--files a,b] [--no-add] --confirm
#   --files a,b   restrict untracking to these specific files (per-item selection)
#   --no-add      skip appending recommended .gitignore entries
set -u
repo="."; untrack=false; confirm=false; only_files=""; do_add=true
while [ $# -gt 0 ]; do case "$1" in
  --repo) repo="$2"; shift 2 ;; --untrack) untrack=true; shift ;;
  --files) only_files="$2"; untrack=true; shift 2 ;; --no-add) do_add=false; shift ;;
  --confirm) confirm=true; shift ;; --mode) shift 2 ;; *) shift ;; esac; done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
a="$(bash "$here/analyze.sh" --repo "$repo")"
cd "$repo" || exit 1
mapfile -t miss < <($do_add && jq -r '.missing_recommended[]' <<<"$a")
if [ -n "$only_files" ]; then
  IFS=',' read -ra bad <<<"$only_files"
else
  mapfile -t bad < <(jq -r '.tracked_should_ignore[]' <<<"$a")
fi

echo "== gitignore-guard plan =="
[ "${#miss[@]}" -gt 0 ] && { echo "append to .gitignore:"; printf '  + %s\n' "${miss[@]}"; }
$untrack && [ "${#bad[@]}" -gt 0 ] && { echo "git rm --cached (keep on disk):"; printf '  - %s\n' "${bad[@]}"; }
{ [ "${#miss[@]}" -eq 0 ] && { ! $untrack || [ "${#bad[@]}" -eq 0 ]; }; } && { echo "nothing to do."; exit 0; }

if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm to apply."; exit 0; fi

if [ "${#miss[@]}" -gt 0 ]; then
  { [ -s .gitignore ] && tail -c1 .gitignore | read -r _ || true; } 2>/dev/null
  printf '\n# added by gitignore-guard\n' >> .gitignore
  printf '%s\n' "${miss[@]}" >> .gitignore
  echo "updated .gitignore (+${#miss[@]})"
fi
if $untrack && [ "${#bad[@]}" -gt 0 ]; then
  printf '%s\0' "${bad[@]}" | xargs -0 git rm --cached -q 2>/dev/null && echo "untracked ${#bad[@]} file(s) (still on disk; commit to finalize)"
fi
