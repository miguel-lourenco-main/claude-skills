#!/usr/bin/env bash
# git-history-surgery analyze.sh — detect committed secrets and oversized blobs.
# Read-only. Emits history-surgery/v1 JSON. Prefers gitleaks/trufflehog if present,
# else uses git-native pattern matching. Detection only — removal is apply.sh.
#
# Usage: analyze.sh --repo <path> [--top N] [--min-mb 5]
set -u

# Resolve our scripts dir to an ABSOLUTE path now, BEFORE any `cd "$repo"` — the blockers block
# below invokes the sibling worktree-manager analyzer, and a BASH_SOURCE-relative path would no
# longer resolve once we've cd'd into the target repo.
HS_SKILLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

repo="."; top=10; min_mb=5
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --top) top="$2"; shift 2 ;;
    --min-mb) min_mb="$2"; shift 2 ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

cd "$repo" 2>/dev/null || { echo "{\"schema\":\"history-surgery/v1\",\"error\":\"path not found\"}"; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "{\"schema\":\"history-surgery/v1\",\"repo\":\"$repo\",\"error\":\"not a git repository\"}"; exit 0; }

have() { command -v "$1" >/dev/null 2>&1 && echo true || echo false; }
tool_gitleaks="$(have gitleaks)"; tool_trufflehog="$(have trufflehog)"
tool_filterrepo="$(have git-filter-repo)"; tool_bfg="$(have bfg)"

# Full-history blob enumeration (`<oid> <type> <size> <path>` per object). This walk is the
# dominant cost on big repos, and BOTH the secret scan (git-native path) and the oversized-blob
# detector below consume it — so repo-steward computes it ONCE and shares it via the $GS_BLOB_LIST
# cache file. Fall back to self-compute when run standalone (or if the cache is empty/missing),
# keeping this skill independently runnable. Defined up here so the secret scan can reuse it.
gs_blob_enum() {
  if [ -n "${GS_BLOB_LIST:-}" ] && [ -s "$GS_BLOB_LIST" ]; then
    cat "$GS_BLOB_LIST"
  else
    # Walk OWNED, LIVE history only: local branches + tags. NOT --all. `--all` also walks
    # refs that retain blobs already stripped from real history (re-reporting them as "still
    # in history"): stale remote-tracking refs (refs/remotes/*, which lag a force-push until
    # the next fetch), git-steward's pre-rewrite backups (refs/git-steward/backup/*), the
    # stash, and other tools' snapshot refs (e.g. refs/t3/*). Positive-selecting --branches
    # --tags reports exactly the history a rewrite would target — an --all-minus-blocklist
    # could never enumerate every such snapshot namespace.
    git rev-list --objects --branches --tags 2>/dev/null \
      | git cat-file --batch-check='%(objectname) %(objecttype) %(objectsize) %(rest)' 2>/dev/null
  fi
}

# --- secret detection ---
secrets="[]"; secret_method="git-native"

# Generated / vendored / lockfile / docs / i18n / test paths: secret matches here are NEVER
# real credentials (build artifacts, dependency caches, example snippets, translation strings,
# test fixtures). Both the gitleaks path and the git-native full-history blob scan filter every
# candidate through is_excluded_path() below so these can't reach the count or the dashboard.
# (The git-native path used to pass `:(exclude)` pathspecs to `git grep`; the full-history blob
# scan applies the SAME exclusions via this single regex on each blob's path instead.)
excluded_path_re='(^|/)(node_modules|\.vite|dist|build|\.next|out|coverage|vendor|\.yarn|locales|i18n|translations|lang|tests|test|__tests__|__mocks__|e2e|fixtures)/|\.min\.js$|\.map$|\.(test|spec)\.[a-z0-9]+$|(-lock\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|(^|/)supabase/config\.toml$|(^|/)(references|docs)/.*\.md$'
is_excluded_path() { printf '%s' "$1" | grep -qiE "$excluded_path_re"; }

# Drop obvious FALSE POSITIVES so they never reach the count or the dashboard: documentation
# EXAMPLE keys (AWS canonical AKIAIOSFODNN7EXAMPLE etc.), UI markup (data-/aria- attributes,
# `*-password`/token attrs), values loaded from env/config (not hardcoded), and placeholder/
# dictionary values with no entropy. Applied to ALL rules.
is_secret_false_positive() {
  local line="$1"
  # documentation example token (case-sensitive EXAMPLE — the AWS/docs convention)
  printf '%s' "$line" | grep -qE 'EXAMPLE' && return 0
  # Supabase local/demo JWTs are PUBLIC and byte-identical across every install — their
  # payload is {"iss":"supabase-demo",...} → base64url prefix `eyJpc3MiOiJzdXBhYmFzZS1kZW1v`.
  # Catches BOTH the demo anon and demo service_role keys. Never a real exposure.
  printf '%s' "$line" | grep -qE 'eyJpc3MiOiJzdXBhYmFzZS1kZW1v' && return 0
  # Public-by-design client config: framework PUBLIC_ envs (shipped to the browser) and
  # anon / publishable keys are meant to be exposed — not secrets.
  printf '%s' "$line" | grep -qiE '(next_public_|vite_|expo_public_|react_app_|public_)[a-z0-9_]+|anon[_-]?key|publishable[_-]?key' && return 0
  # value comes from env/config interpolation, not a hardcoded credential
  printf '%s' "$line" | grep -qiE 'process\.env|import\.meta|os\.(getenv|environ)|system\.getenv|getenv\(|\$\{|<%|\{\{|@env|process\.argv|\bENV\[' && return 0
  # HTML/markup attribute: data-*, aria-*, or a kebab-cased *-password/token/secret/key
  printf '%s' "$line" | grep -qiE '(^|[^a-z])(data|aria)-|[a-z]+-(password|passwd|token|secret|key)([^a-z]|$)' && return 0
  # the quoted value is a placeholder or a plain dictionary word (no entropy)
  printf '%s' "$line" | grep -qiE "[:=][[:space:]]*[\"'](<[^\"'>]*>|password|passwd|secret|token|key|username|user|email|true|false|null|none|undefined|example|sample|dummy|changeme|placeholder|enabled|disabled|your[_-][a-z]+|x{3,}|\\.\\.\\.)[\"']" && return 0
  return 1
}

if [ "$tool_gitleaks" = "true" ]; then
  secret_method="gitleaks"
  gl="$(gitleaks detect --no-banner --report-format json --report-path /dev/stdout 2>/dev/null || echo '[]')"
  # Filter excluded paths and EXAMPLE/docs matches out of the gitleaks findings too.
  secrets="$(jq -c --arg ex "$excluded_path_re" '
    [ .[]?
      | {rule:(.RuleID // .Description), file:.File, commit:(.Commit // null), line:(.StartLine // null), _m:((.Match // "") + " " + (.Secret // ""))}
      | select(((.file // "") | test($ex; "i")) | not)
      | select((._m | test("EXAMPLE")) | not)
      | del(._m) ]' <<<"$gl" 2>/dev/null || echo '[]')"
else
  # git-native FULL-HISTORY secret scan. With no external scanner we no longer grep HEAD only —
  # a secret committed and LATER REMOVED lives only in a historical blob, which is precisely the
  # false-negative class this skill exists to catch (the old `git grep HEAD` missed it entirely).
  # We walk every text blob in OWNED history and grep each body for the same shapes. The blob
  # enumeration is ALREADY cached by repo-steward in $GS_BLOB_LIST (`oid type size path` per
  # object), so this adds one streamed cat-file pass over those blobs at near-zero extra cost;
  # gs_blob_enum() self-computes (--branches --tags, never --all) when run standalone.
  declare -A patt=(
    [aws-access-key]='AKIA[0-9A-Z]{16}'
    [private-key]='-----BEGIN [A-Z ]*PRIVATE KEY-----'
    [slack-token]='xox[baprs]-[0-9A-Za-z-]{10,}'
    [google-api-key]='AIza[0-9A-Za-z_-]{35}'
    [generic-secret]='(api[_-]?key|secret|token|password|passwd|access[_-]?key)["'"'"']?\s*[:=]\s*["'"'"'][^"'"'"']{8,}'
  )
  # One alternation over all rule patterns: fast-rejects the vast majority of blobs (no candidate
  # shape) with a single grep before any per-rule attribution or cat-file provenance lookup.
  combined=""
  for rule in "${!patt[@]}"; do combined="${combined:+$combined|}(${patt[$rule]})"; done
  blob_max_bytes=$(( 1024 * 1024 ))   # skip blobs >1MB: credentials are tiny; big blobs are slow to grep
  per_rule_cap=50                      # bound findings per rule — applied AFTER false-positive filtering
  declare -A rule_count=()
  # Accumulate one compact JSON object per match into NDJSON, then slurp once (`jq -s`) after the
  # walk. Re-running `jq '. += [...]'` per match re-serialized the whole growing array every time
  # — O(n²) on secret-heavy repos. Building each object in isolation keeps it O(n).
  secret_lines=""
  # Pre-filter the enum to unique, size-capped blob lines (awk: dedupe by oid, strip the first
  # three fixed fields to recover a path that may contain spaces) so the bash loop only iterates
  # real candidates, not every object in history.
  while IFS=$'\t' read -r oid opath; do
    [ -n "$oid" ] || continue
    is_excluded_path "$opath" && continue
    content="$(git cat-file -p "$oid" 2>/dev/null)"
    [ -n "$content" ] || continue
    printf '%s' "$content" | grep -qIE -e "$combined" || continue
    # Resolve the blob's provenance (commit + path) ONCE, lazily — only for blobs that actually
    # matched. Reuses the big-blob block's --find-object approach; first (newest) hit is enough.
    resolved=""; rc=""; rp=""
    for rule in "${!patt[@]}"; do
      [ "${rule_count[$rule]:-0}" -ge "$per_rule_cap" ] && continue
      while IFS=: read -r ln rest; do
        [ -n "$ln" ] || continue
        is_secret_false_positive "$rest" && continue
        [ "${rule_count[$rule]:-0}" -ge "$per_rule_cap" ] && break
        if [ -z "$resolved" ]; then
          resolved="$(git log --branches --tags --find-object="$oid" --no-abbrev --raw --pretty=format:'commit %H' 2>/dev/null \
            | awk -v o="$oid" '/^commit /{c=$2} /^:/ && ($3==o || $4==o){print c"\t"$NF; exit}')"
          rc="${resolved%%$'\t'*}"; rp="${resolved#*$'\t'}"
          [ "$rp" = "$resolved" ] && rp=""      # no tab in output => unresolved
          [ -n "$rp" ] || rp="$opath"           # fall back to the enum path
          resolved="${resolved:-done}"          # mark resolved even when the lookup was empty
        fi
        secret_lines+="$(jq -nc --arg r "$rule" --arg f "$rp" --arg c "$rc" --arg l "$ln" \
          '{rule:$r, file:$f, commit:($c|select(length>0)//null), line:($l|tonumber? // null)}')"$'\n'
        rule_count[$rule]=$(( ${rule_count[$rule]:-0} + 1 ))
      done < <(printf '%s' "$content" | grep -nIE -e "${patt[$rule]}" 2>/dev/null)
    done
  done < <(gs_blob_enum | awk -v max="$blob_max_bytes" \
            '$2=="blob" && $3+0>0 && $3+0<=max && !seen[$1]++ { p=$0; sub(/^([^ ]+ ){3}/,"",p); print $1"\t"p }')
  secrets="$(printf '%s' "$secret_lines" | jq -sc '.')"
fi
# tracked sensitive files
sensitive_files="$(git ls-files 2>/dev/null | grep -iE '(^|/)(\.env(\..*)?$|.*\.pem$|.*\.p12$|id_rsa$|.*\.keystore$)' | jq -R . | jq -s . 2>/dev/null || echo '[]')"

# --- oversized blobs across all history --- (reuses gs_blob_enum, defined above)
min_bytes=$(( min_mb * 1048576 ))
# `git rev-list --objects` lists each blob OID ONCE, under a SINGLE path — so a blob
# reachable under sibling paths is reported (and would be stripped) under only one of them and
# SURVIVES the rewrite under the others. Take the top-N oversized OIDs, then resolve EVERY path
# each one ever lived at (git log --find-object) and emit one item per (oid,path) pair, so an
# apply that strips each reported path removes the blob completely.
big_oids="$(gs_blob_enum \
  | awk -v m="$min_bytes" '$2=="blob" && $3+0>=m && $4!="" {print $3"\t"$1"\t"$4}' \
  | sort -rn | awk -F'\t' '!seen[$2]++' | head -"$top")"
big_blobs="$(
  printf '%s\n' "$big_oids" | while IFS=$'\t' read -r bytes oid epath; do
    [ -n "$oid" ] || continue
    mb="$(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/1048576}')"
    # Exact paths only: match the blob OID on either side of each raw diff (incl. both sides of
    # a rename/copy). Merge commits aren't diffed by `git log --raw` by default, so no `::`
    # combined-format lines reach the filter. Fall back to the single enum path if none resolve.
    paths="$(git log --branches --tags --find-object="$oid" --raw --no-abbrev --pretty=format: 2>/dev/null \
      | awk -v o="$oid" '/^:/ && ($3==o || $4==o) { print $NF; if ($5 ~ /^[RC]/ && NF>=7) print $(NF-1) }' \
      | sort -u)"
    [ -n "$paths" ] || paths="$epath"
    printf '%s\n' "$paths" | while IFS= read -r p; do
      [ -n "$p" ] || continue
      jq -n --arg p "$p" --argjson mb "$mb" --argjson bytes "$bytes" --arg oid "$oid" \
        '{path:$p, mb:$mb, bytes:$bytes, oid:$oid}'
    done
  done | jq -s 'sort_by(-.bytes)' 2>/dev/null || echo '[]')"

# --- rewrite preconditions surfaced as blockers[] (visible at analyze/plan time, not only when
# apply.sh refuses). Only computed when there is actually something to strip (a secret, a tracked
# sensitive file, or an oversized blob) — otherwise no rewrite is contemplated and blockers=[].
# A history rewrite orphans every OTHER linked worktree, refuses on a dirty tree, and needs a
# rewrite tool. We reuse worktree-manager/v2's per-worktree removability (clean → auto-remediable
# Tier-1 worktree-remove pre-step; dirty/locked → a genuine user decision). ---
blockers="[]"
has_candidate="$(jq -n --argjson s "$secrets" --argjson sf "$sensitive_files" --argjson b "$big_blobs" \
  '(($s|length)>0) or (($sf|length)>0) or (($b|length)>0)')"
if [ "$has_candidate" = "true" ]; then
  # cwd is already the repo root (cd "$repo" above), so probe worktrees with --repo . using the
  # absolute skills dir captured before the cd.
  wt_json="$(bash "$HS_SKILLS_DIR/worktree-manager/scripts/analyze.sh" --repo . 2>/dev/null || echo '{"worktrees":[]}')"
  root_dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$tool_filterrepo" = "true" ] || [ "$tool_bfg" = "true" ]; then rewrite_ready=true; else rewrite_ready=false; fi
  blockers="$(jq -n --argjson wt "$wt_json" --argjson rootdirty "${root_dirty:-0}" --argjson ready "$rewrite_ready" '
    [ # worktree blocker — entries after the first are the linked (non-primary) worktrees
      ( (($wt.worktrees // [])[1:]) as $extra
        | if ($extra|length) > 0 then
            ([ $extra[] | select(.removable==true) ]) as $rm
            | ([ $extra[] | select(.removable!=true) ]) as $blocked
            | { id:"history-worktrees", severity:"error",
                kind:(if ($blocked|length)>0 then "needs-decision" else "auto-remediable" end),
                action:"history-remove-path",
                title:("\($extra|length) linked worktree(s) would be orphaned by a history rewrite"),
                message:("A history rewrite rewrites every commit, orphaning other linked worktrees. Removing a worktree keeps its branch and commits (only uncommitted changes are lost). "
                  + (if ($rm|length)>0 then "\($rm|length) can be removed safely first. " else "" end)
                  + (if ($blocked|length)>0 then "\($blocked|length) hold uncommitted work or are locked — commit/stash or decide before proceeding." else "" end)),
                auto_remediable:(($blocked|length)==0),
                recommended_steps:[ $rm[] | {op:"worktree-remove", tier:1, params:{path:.path, branch:(.branch//"")}} ],
                facts_needed:[ $extra[] | {fact:"worktree", path:.path, branch:(.branch//""), removable:.removable, dirty:(.dirty//false), branch_verdict:(.classification.verdict//null)} ],
                depends_on:[] }
          else empty end ),
      ( if $rootdirty>0 then
          { id:"history-dirty-tree", severity:"error", kind:"needs-decision", action:"history-remove-path",
            title:"working tree is dirty",
            message:"git-filter-repo refuses to run on a dirty tree and the rewrite would lose uncommitted changes. Commit or stash them first.",
            auto_remediable:false, recommended_steps:[], facts_needed:[{fact:"dirty_paths", count:$rootdirty}], depends_on:[] }
        else empty end ),
      ( if ($ready|not) then
          { id:"history-no-tool", severity:"error", kind:"hard-stop", action:"history-remove-path",
            title:"no history-rewrite tool installed",
            message:"history rewriting requires git-filter-repo or BFG; neither is installed. Install one (e.g. pipx install git-filter-repo), then retry.",
            auto_remediable:false, recommended_steps:[], facts_needed:[{fact:"git_filter_repo", value:false},{fact:"bfg", value:false}], depends_on:[] }
        else empty end )
    ]')"
fi

jq -n --arg repo "$repo" --argjson secrets "$secrets" --arg sm "$secret_method" \
  --argjson sens "$sensitive_files" --argjson blobs "$big_blobs" --argjson minmb "$min_mb" \
  --argjson gl "$tool_gitleaks" --argjson th "$tool_trufflehog" --argjson fr "$tool_filterrepo" --argjson bfg "$tool_bfg" \
  --argjson blockers "$blockers" \
  '{schema:"history-surgery/v1", repo:$repo,
    secret_scan:{method:$sm, findings:$secrets, sensitive_tracked_files:$sens,
      note:(if $sm=="git-native" then "full-history blob scan (git-native pattern match; install gitleaks/trufflehog for entropy detection + more rules)" else "full scan" end)},
    large_blobs:{min_mb:$minmb, items:$blobs},
    tools:{gitleaks:$gl, trufflehog:$th, git_filter_repo:$fr, bfg:$bfg,
      rewrite_ready:($fr or $bfg)},
    blockers:$blockers,
    summary:{secret_findings:($secrets|length), sensitive_files:($sens|length), big_blobs:($blobs|length),
      blockers:($blockers|length)}}'
