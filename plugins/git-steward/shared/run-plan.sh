#!/usr/bin/env bash
# run-plan.sh — execute the actions a user selected in an edited findings report.
# Tier-1 (local, recoverable) actions run with --confirm (the user's checkbox is
# the confirmation). Tier-2 (irreversible/outward) actions are NOT auto-run — they
# are printed with the exact gated command to run deliberately.
#
# Usage:
#   run-plan.sh --report <edited.md> [--dry-run]
#   run-plan.sh --plan <execution-plan.json> [--dry-run]
set -u
report=""; plan=""; dry=false
while [ $# -gt 0 ]; do case "$1" in
  --report) report="$2"; shift 2 ;; --plan) plan="$2"; shift 2 ;;
  --dry-run) dry=true; shift ;; *) shift ;; esac; done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills="$here/../skills"
if [ -n "$report" ]; then plan_json="$(bash "$here/parse-actions.sh" --report "$report")"
elif [ -n "$plan" ]; then plan_json="$(cat "$plan")"
else echo "need --report <file> or --plan <json>"; exit 1; fi

n1="$(jq '.tier1|length' <<<"$plan_json")"; n2="$(jq '.tier2|length' <<<"$plan_json")"
echo "== git-steward execution plan =="
echo "selected: $(jq '.count' <<<"$plan_json") action(s) — Tier-1 (auto): $n1 · Tier-2 (manual): $n2"
echo

run() { if $dry; then echo "    [dry-run] $*"; else "$@"; fi; }

# ---------- Tier 1: execute ----------
# branch-delete-local — group branches per repo
for repo in $(jq -r '[.tier1[]|select(.op=="branch-delete-local").repo]|unique[]' <<<"$plan_json"); do
  brs="$(jq -r --arg r "$repo" '[.tier1[]|select(.op=="branch-delete-local" and .repo==$r).branch]|join(",")' <<<"$plan_json")"
  echo "→ branch-delete-local in $repo: $brs"
  run bash "$skills/git-branch-cleanup/scripts/apply.sh" --repo "$repo" --branches "$brs" --confirm
done

# commit-reword — build a reword-file per repo
for repo in $(jq -r '[.tier1[]|select(.op=="commit-reword").repo]|unique[]' <<<"$plan_json"); do
  tmp="$(mktemp)"
  jq -r --arg r "$repo" '.tier1[]|select(.op=="commit-reword" and .repo==$r)|"\(.sha)\t\(.message)"' <<<"$plan_json" > "$tmp"
  echo "→ commit-reword in $repo ($(wc -l <"$tmp") commit(s))"
  run bash "$skills/commit-hygiene/scripts/apply.sh" --repo "$repo" --reword-file "$tmp" --confirm
  $dry && rm -f "$tmp" || true
done

# gitignore-add
for repo in $(jq -r '[.tier1[]|select(.op=="gitignore-add").repo]|unique[]' <<<"$plan_json"); do
  echo "→ gitignore-add in $repo"
  run bash "$skills/gitignore-guard/scripts/apply.sh" --repo "$repo" --confirm
done

# gitignore-untrack — group files per repo
for repo in $(jq -r '[.tier1[]|select(.op=="gitignore-untrack").repo]|unique[]' <<<"$plan_json"); do
  files="$(jq -r --arg r "$repo" '[.tier1[]|select(.op=="gitignore-untrack" and .repo==$r).file]|join(",")' <<<"$plan_json")"
  echo "→ gitignore-untrack in $repo: $files"
  run bash "$skills/gitignore-guard/scripts/apply.sh" --repo "$repo" --files "$files" --no-add --confirm
done

# worktree-prune
for repo in $(jq -r '[.tier1[]|select(.op=="worktree-prune").repo]|unique[]' <<<"$plan_json"); do
  echo "→ worktree-prune in $repo"
  run bash "$skills/worktree-manager/scripts/apply.sh" --repo "$repo" --prune --confirm
done

# deps-bump
for repo in $(jq -r '[.tier1[]|select(.op=="deps-bump").repo]|unique[]' <<<"$plan_json"); do
  echo "→ deps-bump in $repo"
  run bash "$skills/dependency-health/scripts/apply.sh" --repo "$repo" --confirm
done

# ---------- Tier 2: print, do NOT auto-run ----------
if [ "$n2" -gt 0 ]; then
  echo
  echo "== Tier-2 actions (NOT run automatically — irreversible/outward; run each deliberately) =="
  jq -r '.tier2[] |
    if .op=="history-remove-path" then "🔴 history-remove-path \(.repo) — `\(.path)`:\n    bash $CLAUDE_PLUGIN_ROOT/skills/git-history-surgery/scripts/apply.sh --repo \(.repo) --remove-path \(.path) --confirm --i-understand <repo-name>"
    elif .op=="branch-delete-remote" then "🔴 branch-delete-remote \(.repo) — \(.branch):\n    bash $CLAUDE_PLUGIN_ROOT/skills/git-branch-cleanup/scripts/apply.sh --repo \(.repo) --branches \(.branch) --delete-remote --confirm"
    elif .op=="work-item-start" then "🔵 work-item-start \(.repo) — #\(.number):\n    bash $CLAUDE_PLUGIN_ROOT/skills/work-items/scripts/apply.sh --repo \(.repo) --start \(.number) --type <type> --slug <kebab> --confirm"
    elif .op=="work-item-implement" then "🟣 work-item-implement \(.repo) — #\(.numbers // .number) (slug: \(.slug // "?")): agent task — implement on a branch, commit, push, open the MR (Tier-2; confirm this repo before pushing). Not auto-run."
    elif .op=="branch-merge" then "🟢 branch-merge \(.repo) — `\(.branch)` → default: agent task — open a merge request for the branch into the default branch (Tier-2; review before merge, never a direct push to default). Not auto-run."
    elif .op=="pipeline-fix" then "🟠 pipeline-fix \(.repo) — \(.branch): author a fix, then\n    bash $CLAUDE_PLUGIN_ROOT/skills/pipeline-health/scripts/apply.sh --repo \(.repo) --push-and-monitor --confirm"
    elif .op=="release-tag" then "🟡 release-tag \(.repo):\n    bash $CLAUDE_PLUGIN_ROOT/skills/release-changelog/scripts/apply.sh --repo \(.repo) --tag --confirm"
    else "• \(.op) \(.repo)" end' <<<"$plan_json"
fi
echo
$dry && echo "(dry-run — nothing executed)" || echo "Tier-1 actions applied. Tier-2 actions above need explicit confirmation."
