#!/usr/bin/env bash
# work-items apply.sh — start work on an item: create a branch and a DRAFT
# MR/PR. MUTATING + OUTWARD (Tier 2). Honors shared/SAFETY.md.
#
# Usage: apply.sh --repo <path> --start <number> --type <feat|fix|...> --slug <kebab>
#                 [--title "<MR title>"] [--confirm]
# Without --confirm, prints the plan and exits.
set -u

repo="."; number=""; type="feat"; slug=""; title=""; confirm=false
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --start) number="$2"; shift 2 ;;
    --type) type="$2"; shift 2 ;;
    --slug) slug="$2"; shift 2 ;;
    --title) title="$2"; shift 2 ;;
    --confirm) confirm=true; shift ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
res="$(bash "$here/../../../shared/resolve-host.sh" --repo "$repo")"
cli="$(jq -r '.cli' <<<"$res")"; proj="$(jq -r '.project' <<<"$res")"
default="$(jq -r '.default_branch' <<<"$res")"; auth="$(jq -r '.auth' <<<"$res")"
[ "$auth" = "missing" ] && { echo "REFUSED: $cli not authenticated."; exit 1; }
[ -z "$number" ] && { echo "need --start <item-number>"; exit 1; }
[ -z "$slug" ] && { echo "need --slug <kebab-summary>"; exit 1; }
branch="${type}/${number}-${slug}"
[ -z "$title" ] && title="${type}: ${slug//-/ } (#${number})"

cd "$repo" || exit 1
dirty="$(git status --porcelain | wc -l | tr -d ' ')"

echo "== work-items start plan =="
echo "project: $proj   item: #$number"
echo "branch:  $branch  (from $default)"
echo "draft:   $cli MR/PR titled \"$title\""
[ "$dirty" -gt 0 ] && echo "WARNING: working tree has $dirty uncommitted change(s)."

if ! $confirm; then
  echo; echo "DRY RUN — nothing created. Re-run with --confirm (Tier 2: pushes a branch and opens a draft)."
  exit 0
fi

git fetch -q origin "$default" 2>/dev/null || true
git switch -c "$branch" "origin/$default" 2>/dev/null || git switch -c "$branch" || { echo "could not create branch"; exit 1; }
git push -u origin "$branch" >/dev/null 2>&1 || { echo "could not push branch"; exit 1; }

case "$cli" in
  glab) glab mr create -R "$proj" --source-branch "$branch" --target-branch "$default" \
          --title "Draft: $title" --description "Closes #${number}" --draft --yes >/dev/null 2>&1 \
          && echo "opened draft MR for $branch" || echo "branch pushed; MR creation failed (open manually)" ;;
  gh)   gh pr create -R "$proj" --head "$branch" --base "$default" \
          --title "$title" --body "Closes #${number}" --draft >/dev/null 2>&1 \
          && echo "opened draft PR for $branch" || echo "branch pushed; PR creation failed (open manually)" ;;
esac
