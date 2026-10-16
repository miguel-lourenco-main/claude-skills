#!/usr/bin/env bash
# branch-cleanup.test.sh — fixture test for git-branch-cleanup's delete safety.
#
# Builds a throwaway repo + bare "remote" under a temp dir, with one local branch per case, then
# checks what analyze.sh classifies, what report.sh offers as a delete checkbox, and what
# apply.sh actually deletes. Nothing outside the temp dir is touched; no network.
#
# The cases that matter most: a branch whose upstream is [gone] but which still carries commits
# the default branch does not have (by ancestry AND by patch-id / tree content) must never be
# queued for deletion, while squash- and rebase-merged branches must still count as merged.
#
# Usage: bash tests/branch-cleanup.test.sh        (exit 0 = all pass)
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
analyze="$root/skills/git-branch-cleanup/scripts/analyze.sh"
apply="$root/skills/git-branch-cleanup/scripts/apply.sh"
report="$root/shared/report.sh"
parse="$root/shared/parse-actions.sh"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/gs-branch-test.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
unset GS_SYNC_MANAGED

fail=0; pass=0
ok()   { pass=$((pass+1)); echo "  ok   $*"; }
bad()  { fail=$((fail+1)); echo "  FAIL $*"; }
check(){ local desc="$1" got="$2" want="$3"; [ "$got" = "$want" ] && ok "$desc" || bad "$desc (got '$got', want '$want')"; }

# ---------- fixture ----------
build_fixture() { # $1 = dir
  local d="$1"
  git init -q --bare -b main "$d/remote.git"
  git init -q -b main "$d/work"
  cd "$d/work" || exit 1
  git remote add origin "$d/remote.git"
  c(){ printf '%s\n' "$2" >> "$1"; git add "$1"; git commit -q -m "$3"; }
  c base.txt "line 1" "chore: base"
  printf 'a\nb\nc\nd\ne\n' > shared.txt; git add shared.txt; git commit -q -m "chore: shared"
  git push -q -u origin main
  git remote set-head origin main >/dev/null

  # A — merged with a merge commit, then deleted upstream (ancestor; [gone])
  git switch -q -c feat/ancestor; c a.txt "a" "feat: a"; git push -q -u origin feat/ancestor
  git switch -q main; git merge -q --no-ff -m "merge a" feat/ancestor

  # B — two commits squash-merged, then main moves on with unrelated work; [gone]
  git switch -q -c feat/squash-multi; c b.txt "b1" "feat: b1"; c b.txt "b2" "feat: b2"
  git push -q -u origin feat/squash-multi
  git switch -q main; git merge -q --squash feat/squash-multi >/dev/null; git commit -q -m "feat: b (squash)"
  c unrelated.txt "u" "chore: unrelated"

  # C — rebase-merged (each commit cherry-picked onto main); [gone]
  git switch -q -c feat/rebased; c r.txt "r1" "feat: r1"; c r.txt "r2" "feat: r2"
  git push -q -u origin feat/rebased
  git switch -q main; c main-only.txt "m" "chore: main moves"
  git cherry-pick "$(git rev-parse feat/rebased~1)" "$(git rev-parse feat/rebased)" >/dev/null

  # E — squash-merged, then main edits the SAME lines again (merge-tree conflicts; patch-id path)
  git switch -q -c feat/squash-edited; sed -i 's/^c$/C-branch/' shared.txt; git commit -q -am "feat: e1"
  sed -i 's/^d$/D-branch/' shared.txt; git commit -q -am "feat: e2"
  git push -q -u origin feat/squash-edited
  git switch -q main; git merge -q --squash feat/squash-edited >/dev/null; git commit -q -m "feat: e (squash)"
  sed -i 's/^C-branch$/C-main/' shared.txt; git commit -q -am "chore: rework e"

  # D — unique, never merged, deleted upstream: MUST NOT be auto-deleted
  git switch -q -c feat/unique-gone main~3; c d.txt "precious" "feat: unmerged work"
  git push -q -u origin feat/unique-gone

  # G — two commits, only ONE squash-merged into main, then deleted upstream: still unique
  git switch -q main; git switch -q -c feat/partial-gone; c g.txt "g1" "feat: g1"
  git push -q -u origin feat/partial-gone
  git switch -q main; git checkout -q feat/partial-gone -- g.txt; git commit -q -m "feat: g1 (squash)"
  git switch -q feat/partial-gone; c g2.txt "g2" "feat: g2 not merged"; git push -q origin feat/partial-gone

  # F — active, unmerged, upstream still there: keep
  git switch -q main; git switch -q -c feat/active; c f.txt "f" "feat: f"; git push -q -u origin feat/active

  git switch -q main; git push -q origin main
  git push -q origin --delete feat/ancestor feat/squash-multi feat/rebased feat/squash-edited feat/unique-gone feat/partial-gone
  git fetch -q --prune origin
  cd - >/dev/null || exit 1
}

build_fixture "$tmp/one"
repo="$tmp/one/work"

echo "== analyze =="
a="$(bash "$analyze" --repo "$repo")"
jq -e . >/dev/null <<<"$a" || { echo "analyze did not emit JSON"; echo "$a"; exit 1; }
cat_of(){ jq -r --arg b "$1" '.candidates[]|select(.branch==$b)|.category' <<<"$a"; }
nd_of(){  jq -r --arg b "$1" '.candidates[]|select(.branch==$b)|(.needs_decision // false)' <<<"$a"; }
mt_of(){  jq -r --arg b "$1" '.candidates[]|select(.branch==$b)|.merge_type' <<<"$a"; }
check "ancestor-merged gone branch is merged"        "$(cat_of feat/ancestor)"       merged
check "squash of 2 commits + main moved on = merged" "$(cat_of feat/squash-multi)/$(mt_of feat/squash-multi)" merged/squash-rebase
check "rebase-merged (cherry-picked) = merged"        "$(cat_of feat/rebased)/$(mt_of feat/rebased)"    merged/squash-rebase
check "squash then lines re-edited on main = merged"  "$(cat_of feat/squash-edited)/$(mt_of feat/squash-edited)" merged/squash-rebase
check "gone with unique commit is gone"               "$(cat_of feat/unique-gone)"    gone
check "gone with unique commit needs a decision"      "$(nd_of feat/unique-gone)"     true
check "partly squash-merged gone branch needs a decision" "$(nd_of feat/partial-gone)" true
check "merged branches do not need a decision"        "$(nd_of feat/squash-multi)"    false
check "active branch is keep"                         "$(cat_of feat/active)"         keep
check "summary.needs_decision counts both"            "$(jq -r '.summary.needs_decision' <<<"$a")" 2
check "summary.prunable excludes them"                "$(jq -r '.summary.prunable' <<<"$a")" 4

echo "== report =="
agg="$(jq -n --argjson bc "$a" --arg repo "$repo" '{schema:"repo-steward/v1", repo:$repo, name:"work", optimize:false, skills:{"git-branch-cleanup":$bc}, attention:{}}')"
md="$(bash "$report" --stdout <<<"$agg")"
deletes="$(grep -o 'op=branch-delete-local [^>]*-->' <<<"$md" | sed 's/.*branch=//; s/-->$//' | sort | tr '\n' ' ')"
check "report queues only the merged branches" "$deletes" "feat/ancestor feat/rebased feat/squash-edited feat/squash-multi "
grep -q 'feat/unique-gone' <<<"$md" && ok "report still mentions the unique gone branch" || bad "report dropped feat/unique-gone entirely"
sed -n '/Branches that need your decision/,/^---/p' <<<"$md" | grep -q '`feat/unique-gone`' && ok "unique gone branch is under 'needs your decision'" || bad "unique gone branch not under a decision note"
# An analysis cached before needs_decision existed (old analyzer: gone + ahead>0) must not be queued either.
legacy="$(jq '.skills["git-branch-cleanup"].candidates |= map(del(.needs_decision, .removable)
  | if .branch=="feat/unique-gone" then .reason="upstream deleted on remote (1 commit(s) not on main)" else . end)' <<<"$agg")"
check "legacy analysis: gone+ahead is not queued" \
  "$(bash "$report" --stdout <<<"$legacy" | grep -c 'op=branch-delete-local [^>]*branch=feat/\(unique\|partial\)-gone-->')" 0
# Simulate a user checking "Select all" on the delete list: nothing unsafe may be selected.
printf '%s\n' "$md" | sed 's/^- \[ \] _\*\*Select all/- [x] _**Select all/' > "$tmp/report.md"
plan="$(bash "$parse" --report "$tmp/report.md")"
check "select-all selects no needs-decision branch" \
  "$(jq -r '[.tier1[]|select(.op=="branch-delete-local")|.branch|select(.=="feat/unique-gone" or .=="feat/partial-gone")]|length' <<<"$plan")" 0

echo "== apply =="
build_fixture "$tmp/two"
repo2="$tmp/two/work"
out="$(bash "$apply" --repo "$repo2" --categories merged,gone --confirm)"
git -C "$repo2" show-ref --verify --quiet refs/heads/feat/unique-gone && ok "--categories gone keeps feat/unique-gone" || bad "--categories gone DELETED feat/unique-gone"
git -C "$repo2" show-ref --verify --quiet refs/heads/feat/partial-gone && ok "--categories gone keeps feat/partial-gone" || bad "--categories gone DELETED feat/partial-gone"
git -C "$repo2" show-ref --verify --quiet refs/heads/feat/squash-multi && bad "squash-merged branch was not deleted" || ok "squash-merged branch deleted"
git -C "$repo2" show-ref --verify --quiet refs/heads/feat/active && ok "active branch kept" || bad "active branch deleted"
out="$(bash "$apply" --repo "$repo2" --branches feat/unique-gone --confirm)"
git -C "$repo2" show-ref --verify --quiet refs/heads/feat/unique-gone && ok "--branches without --allow-unmerged refuses" || bad "--branches deleted unmerged work without --allow-unmerged"
grep -q 'feat/unique-gone: kept' <<<"$out" && ok "refusal is explained" || bad "refusal not explained: $out"
out="$(bash "$apply" --repo "$repo2" --branches feat/unique-gone --allow-unmerged --confirm)"
git -C "$repo2" show-ref --verify --quiet refs/heads/feat/unique-gone && bad "--allow-unmerged did not delete" || ok "--allow-unmerged deletes on explicit request"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
