#!/usr/bin/env bash
# commit-hygiene analyze.sh — lint recent commit messages against Conventional
# Commits and gather raw materials for drafting a message for staged changes.
# Read-only. Emits commit-hygiene/v1 JSON.
#
# Usage: analyze.sh --repo <path> [--count N]   (N = recent commits to lint, default 20)
set -u

repo="."; count=20
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --count) count="$2"; shift 2 ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

cd "$repo" 2>/dev/null || { echo "{\"schema\":\"commit-hygiene/v1\",\"error\":\"path not found: $repo\"}"; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "{\"schema\":\"commit-hygiene/v1\",\"repo\":\"$repo\",\"error\":\"not a git repository\"}"; exit 0; }

types='feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert'
# Conventional Commits subject regex: type(optional-scope)(optional !): description
cc_re="^(${types})(\([a-z0-9._/-]+\))?!?: .+"

# --- lint recent commit subjects ---
lint="[]"; bad=0
while IFS=$'\x1f' read -r sha subject; do
  [ -n "$sha" ] || continue
  ok=true
  if ! printf '%s' "$subject" | grep -qE "$cc_re"; then ok=false; bad=$((bad+1)); fi
  lint="$(jq -c --arg sha "$sha" --arg s "$subject" --argjson ok $ok \
    '. += [{sha:$sha, subject:$s, conventional:$ok}]' <<<"$lint")"
done < <(git log -n "$count" --no-merges --format='%h%x1f%s' 2>/dev/null)

# --- un-pushed commits (candidates for reword) ---
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
unpushed="[]"
if [ -n "$upstream" ]; then
  while IFS=$'\x1f' read -r sha subject; do
    [ -n "$sha" ] || continue
    unpushed="$(jq -c --arg sha "$sha" --arg s "$subject" '. += [{sha:$sha, subject:$s}]' <<<"$unpushed")"
  done < <(git log --format='%h%x1f%s' "${upstream}..HEAD" 2>/dev/null)
fi

# --- staged changes: raw materials for drafting a message ---
staged_files="$(git diff --cached --name-only 2>/dev/null | jq -R . | jq -s . 2>/dev/null || echo '[]')"
staged_count="$(jq 'length' <<<"$staged_files")"
read -r ins del < <(git diff --cached --numstat 2>/dev/null | awk '{i+=$1; d+=$2} END{print (i+0)" "(d+0)}')
# crude type heuristic from staged paths (the model refines this)
type_guess="chore"
paths="$(git diff --cached --name-only 2>/dev/null)"
case "$paths" in
  *test*|*spec*) type_guess="test" ;;
  *.md|*docs/*) type_guess="docs" ;;
  *.yml|*.yaml|*ci*|*.github*) type_guess="ci" ;;
esac
[ "$staged_count" -gt 0 ] && grep -qiE 'fix|bug' <<<"$paths" && type_guess="fix"

jq -n --arg repo "$repo" --argjson lint "$lint" --argjson bad "$bad" --argjson count "$count" \
  --arg upstream "${upstream:-}" --argjson unpushed "$unpushed" \
  --argjson staged "$staged_files" --argjson sc "$staged_count" \
  --argjson ins "${ins:-0}" --argjson del "${del:-0}" --arg tg "$type_guess" \
  '{schema:"commit-hygiene/v1", repo:$repo,
    lint:{checked:$count, non_conventional:$bad, commits:$lint},
    unpushed:$unpushed,
    staged:{files:$staged, count:$sc, insertions:$ins, deletions:$del, type_guess:$tg},
    conventional_types:["feat","fix","docs","style","refactor","perf","test","build","ci","chore","revert"]}'
