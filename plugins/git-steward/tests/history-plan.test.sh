#!/usr/bin/env bash
# history-plan.test.sh — fixture test for history-rewrite PLAN generation (nothing is rewritten).
#
# Checks that git-history-surgery analyze emits one item per path (not one per blob version),
# marks a still-tracked regenerable artifact as "untrack + ignore first", that report.sh renders
# that routing, and that run-plan.sh prints ONE batched apply.sh command per repo for several
# selected history-remove-path items. Temp dir only; no network; apply.sh is never run.
#
# Usage: bash tests/history-plan.test.sh        (exit 0 = all pass)
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
analyze="$root/skills/git-history-surgery/scripts/analyze.sh"
report="$root/shared/report.sh"
runplan="$root/shared/run-plan.sh"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/gs-history-test.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
unset GS_BLOB_LIST

fail=0; pass=0
ok()   { pass=$((pass+1)); echo "  ok   $*"; }
bad()  { fail=$((fail+1)); echo "  FAIL $*"; }
check(){ local desc="$1" got="$2" want="$3"; [ "$got" = "$want" ] && ok "$desc" || bad "$desc (got '$got', want '$want')"; }

repo="$tmp/work"
git init -q -b main "$repo"; cd "$repo" || exit 1
echo base > README; git add README; git commit -q -m "chore: base"
# The same regenerable artifact rewritten three times, each version > 1 MB: three blob OIDs, one path.
for i in 1 2 3; do head -c 1300000 /dev/urandom > tsconfig.tsbuildinfo; git add tsconfig.tsbuildinfo; git commit -q -m "build: $i"; done
# A real asset committed once and deleted: history-only.
head -c 1200000 /dev/urandom > "video intro.bin"; git add "video intro.bin"; git commit -q -m "feat: video"
git rm -q "video intro.bin"; git commit -q -m "chore: drop video"
cd - >/dev/null || exit 1

echo "== analyze =="
a="$(bash "$analyze" --repo "$repo" --min-mb 1)"
jq -e . >/dev/null <<<"$a" || { echo "analyze did not emit JSON"; echo "$a"; exit 1; }
check "one item per path"                    "$(jq '[.large_blobs.items[]|select(.path=="tsconfig.tsbuildinfo")]|length' <<<"$a")" 1
check "versions counted"                     "$(jq -r '.large_blobs.items[]|select(.path=="tsconfig.tsbuildinfo")|.versions' <<<"$a")" 3
check "tracked regenerable -> untrack first" "$(jq -r '.large_blobs.items[]|select(.path=="tsconfig.tsbuildinfo")|.first_step' <<<"$a")" untrack-and-ignore
check "history-only asset not tracked"       "$(jq -r '.large_blobs.items[]|select(.path=="video intro.bin")|"\(.tracked)/\(.first_step)"' <<<"$a")" false/null
check "summary.big_blobs counts paths"       "$(jq -r '.summary.big_blobs' <<<"$a")" 2

echo "== report =="
agg="$(jq -n --argjson hs "$a" --arg repo "$repo" '{schema:"repo-steward/v1", repo:$repo, name:"work", optimize:false, skills:{"git-history-surgery":$hs}, attention:{}}')"
md="$(bash "$report" --stdout <<<"$agg")"
hist="$(sed -n '/### History cleanup/,/^> _No strip/p' <<<"$md")"
check "tsbuildinfo listed once in History cleanup" "$(grep -c '^- `tsconfig.tsbuildinfo`' <<<"$hist")" 1
grep '^- `tsconfig.tsbuildinfo`' <<<"$hist" | grep -q 'untrack + `.gitignore` it first' && ok "report leads with untrack + ignore" || bad "report does not route the artifact to untrack first"

echo "== run-plan (batched Tier-2 print) =="
cat > "$tmp/plan.json" <<JSON
{"schema":"execution-plan/v1","count":4,"tier1":[],
 "tier2":[{"op":"history-remove-path","repo":"$repo","path":"tsconfig.tsbuildinfo"},
          {"op":"history-remove-path","repo":"$repo","path":"video intro.bin"},
          {"op":"history-remove-path","repo":"$repo","path":"tsconfig.tsbuildinfo"},
          {"op":"history-remove-path","repo":"/elsewhere/other","path":"big.iso"}],
 "actions":[]}
JSON
out="$(bash "$runplan" --plan "$tmp/plan.json" --dry-run)"
check "one apply.sh command per repo"  "$(grep -c 'git-history-surgery/scripts/apply.sh' <<<"$out")" 2
line="$(grep "apply.sh --repo '$repo'" <<<"$out")"
check "duplicate path collapsed"        "$(grep -o -- '--remove-path' <<<"$line" | wc -l | tr -d ' ')" 2
grep -q -- "--remove-path 'video intro.bin'" <<<"$line" && ok "paths with spaces are quoted" || bad "path with a space not quoted: $line"

echo "== run-plan (nothing selected) =="
echo '{"schema":"execution-plan/v1","count":0,"tier1":[],"tier2":[],"actions":[]}' > "$tmp/empty.json"
out="$(bash "$runplan" --plan "$tmp/empty.json")"
grep -q 'Nothing selected' <<<"$out" && ok "empty selection says nothing was applied" || bad "empty selection message: $out"
grep -q 'Tier-1 actions applied' <<<"$out" && bad "empty selection claims Tier-1 ran" || ok "empty selection does not claim Tier-1 ran"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
