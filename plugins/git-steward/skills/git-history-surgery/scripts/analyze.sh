#!/usr/bin/env bash
# git-history-surgery analyze.sh — detect committed secrets and oversized blobs.
# Read-only. Emits history-surgery/v1 JSON. Prefers gitleaks/trufflehog if present,
# else uses git-native pattern matching. Detection only — removal is apply.sh.
#
# Usage: analyze.sh --repo <path> [--top N] [--min-mb 5]
set -u

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

# --- secret detection ---
secrets="[]"; secret_method="git-native"
if [ "$tool_gitleaks" = "true" ]; then
  secret_method="gitleaks"
  gl="$(gitleaks detect --no-banner --report-format json --report-path /dev/stdout 2>/dev/null || echo '[]')"
  secrets="$(jq -c '[.[]? | {rule:(.RuleID // .Description), file:.File, commit:(.Commit // null), line:(.StartLine // null)}]' <<<"$gl" 2>/dev/null || echo '[]')"
else
  # git-native: scan tracked files in the working tree for common secret shapes.
  # Note: a thorough FULL-HISTORY scan needs gitleaks/trufflehog (reported in tools.note).
  declare -A patt=(
    [aws-access-key]='AKIA[0-9A-Z]{16}'
    [private-key]='-----BEGIN [A-Z ]*PRIVATE KEY-----'
    [slack-token]='xox[baprs]-[0-9A-Za-z-]{10,}'
    [google-api-key]='AIza[0-9A-Za-z_-]{35}'
    [generic-secret]='(api[_-]?key|secret|token|password|passwd|access[_-]?key)["'"'"']?\s*[:=]\s*["'"'"'][^"'"'"']{8,}'
  )
  for rule in "${!patt[@]}"; do
    while IFS=: read -r f ln _; do
      [ -n "$f" ] || continue
      secrets="$(jq -c --arg r "$rule" --arg f "$f" --arg l "$ln" \
        '. += [{rule:$r, file:$f, commit:null, line:($l|tonumber? // null)}]' <<<"$secrets")"
    done < <(git grep -nIE "${patt[$rule]}" HEAD -- 2>/dev/null | sed 's/^HEAD://' | head -50)
  done
fi
# tracked sensitive files
sensitive_files="$(git ls-files 2>/dev/null | grep -iE '(^|/)(\.env(\..*)?$|.*\.pem$|.*\.p12$|id_rsa$|.*\.keystore$)' | jq -R . | jq -s . 2>/dev/null || echo '[]')"

# --- oversized blobs across all history ---
min_bytes=$(( min_mb * 1048576 ))
big_blobs="$(git rev-list --objects --all 2>/dev/null \
  | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' 2>/dev/null \
  | awk -v m="$min_bytes" '$1=="blob" && $2+0>=m && $3!="" {print $2"\t"$3}' \
  | sort -rn | head -"$top" \
  | awk '{mb=$1/1048576; printf "{\"path\":\"%s\",\"mb\":%.2f,\"bytes\":%d}\n",$2,mb,$1}' \
  | jq -s . 2>/dev/null || echo '[]')"

jq -n --arg repo "$repo" --argjson secrets "$secrets" --arg sm "$secret_method" \
  --argjson sens "$sensitive_files" --argjson blobs "$big_blobs" --argjson minmb "$min_mb" \
  --argjson gl "$tool_gitleaks" --argjson th "$tool_trufflehog" --argjson fr "$tool_filterrepo" --argjson bfg "$tool_bfg" \
  '{schema:"history-surgery/v1", repo:$repo,
    secret_scan:{method:$sm, findings:$secrets, sensitive_tracked_files:$sens,
      note:(if $sm=="git-native" then "working-tree scan only; install gitleaks/trufflehog for full-history detection" else "full scan" end)},
    large_blobs:{min_mb:$minmb, items:$blobs},
    tools:{gitleaks:$gl, trufflehog:$th, git_filter_repo:$fr, bfg:$bfg,
      rewrite_ready:($fr or $bfg)},
    summary:{secret_findings:($secrets|length), sensitive_files:($sens|length), big_blobs:($blobs|length)}}'
