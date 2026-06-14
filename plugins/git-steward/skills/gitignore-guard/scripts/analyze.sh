#!/usr/bin/env bash
# gitignore-guard analyze.sh — find tracked files that should be ignored and
# gaps in .gitignore. Read-only. Emits gitignore-guard/v1 JSON.
#
# Usage: analyze.sh --repo <path>
set -u
repo="."
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" 2>/dev/null || { echo '{"schema":"gitignore-guard/v1","error":"path not found"}'; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo '{"schema":"gitignore-guard/v1","error":"not a git repository"}'; exit 0; }

# patterns of files that almost always should be ignored
should_ignore_re='(^|/)(node_modules/|dist/|build/|target/|\.next/|coverage/|__pycache__/|\.venv/|venv/|\.DS_Store$|.*\.log$|.*\.tmp$|\.env(\..*)?$|.*\.pyc$|.*\.class$)'
tracked_bad="$(git ls-files 2>/dev/null | grep -E "$should_ignore_re" | head -100 | jq -R . | jq -s . 2>/dev/null || echo '[]')"

has_gitignore=false; [ -f .gitignore ] && has_gitignore=true
# recommend entries by detected stack
recs=()
[ -f package.json ] && recs+=("node_modules/" "dist/" "build/" ".next/" "coverage/" "*.log")
{ [ -f Cargo.toml ] && recs+=("target/"); }
{ ls *.py >/dev/null 2>&1 || [ -f pyproject.toml ] || [ -f requirements.txt ]; } && recs+=("__pycache__/" "*.pyc" ".venv/")
recs+=(".env" ".DS_Store")
missing="[]"
for e in "${recs[@]}"; do
  if ! $has_gitignore || ! grep -qxF "$e" .gitignore 2>/dev/null; then
    missing="$(jq -c --arg e "$e" '. += [$e]' <<<"$missing")"
  fi
done
missing="$(jq 'unique' <<<"$missing")"

jq -n --arg repo "$repo" --argjson hg "$has_gitignore" --argjson bad "$tracked_bad" --argjson missing "$missing" \
  '{schema:"gitignore-guard/v1", repo:$repo, has_gitignore:$hg,
    tracked_should_ignore:$bad, missing_recommended:$missing,
    summary:{tracked_to_untrack:($bad|length), missing_entries:($missing|length)}}'
