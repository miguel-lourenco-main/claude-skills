#!/usr/bin/env bash
# repo-consistency apply.sh — create missing baseline files for which a template
# exists. MUTATING (Tier 1, gated). Files needing user content (README/LICENSE)
# are reported, not auto-generated.
# Usage: apply.sh --repo <path> --confirm
set -u
repo="."; confirm=false
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --confirm) confirm=true; shift ;; --mode) shift 2 ;; *) shift ;; esac; done
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
baseline="$here/../assets/baseline"
a="$(bash "$here/analyze.sh" --repo "$repo")"
cd "$repo" || exit 1

mapfile -t fixable < <(jq -r '.auto_fixable[]' <<<"$a")
mapfile -t missing < <(jq -r '.missing[]' <<<"$a")

echo "== repo-consistency plan =="
[ "${#fixable[@]}" -gt 0 ] && { echo "create from baseline templates:"; printf '  + %s\n' "${fixable[@]}"; }
manual=(); for m in "${missing[@]}"; do case " ${fixable[*]} " in *" $m "*) : ;; *) manual+=("$m") ;; esac; done
[ "${#manual[@]}" -gt 0 ] && { echo "missing but need your content (not auto-created):"; printf '  ? %s\n' "${manual[@]}"; }
[ "${#fixable[@]}" -eq 0 ] && { echo "nothing to auto-create."; exit 0; }

if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm to create the templated files."; exit 0; fi
for f in "${fixable[@]}"; do
  if [ -f "$baseline/$f" ]; then cp "$baseline/$f" "$f" && echo "created $f"; fi
done
echo "done. Review and commit."
