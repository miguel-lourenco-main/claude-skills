#!/usr/bin/env bash
# resolve-host.sh — deterministic forge detection for git-steward.
# Emits a host-resolution/v1 JSON object on stdout. See shared/FORGE.md.
#
# Usage: resolve-host.sh [--repo <path>] [--remote <name>] [--project <slug>]
# Read-only. Never mutates. Never proceeds past detection.
set -euo pipefail

repo="."
remote="origin"
project=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --remote) remote="$2"; shift 2 ;;
    --project) project="$2"; shift 2 ;;
    *) shift ;;
  esac
done

warnings=()
add_warn() { warnings+=("$1"); }

cd "$repo" 2>/dev/null || { add_warn "repo path not found: $repo"; }

# --- remote URL ---
url=""
if git rev-parse --git-dir >/dev/null 2>&1; then
  url="$(git remote get-url "$remote" 2>/dev/null || true)"
  if [ -z "$url" ]; then
    # fall back to the first remote, if any
    first="$(git remote 2>/dev/null | head -n1 || true)"
    [ -n "$first" ] && { remote="$first"; url="$(git remote get-url "$first" 2>/dev/null || true)"; }
  fi
else
  add_warn "not a git repository"
fi

# --- normalize host from URL, stripping SSH host aliases ---
# Handles: git@gitlab.com-personal:group/name.git , ssh://git@host/..., https://host/...
host_raw=""
case "$url" in
  *@*:*)   host_raw="${url#*@}"; host_raw="${host_raw%%:*}" ;;        # scp-style
  *://*)   host_raw="${url#*://}"; host_raw="${host_raw#*@}"; host_raw="${host_raw%%/*}" ;;
esac
# Strip an SSH config alias suffix like "gitlab.com-personal" -> "gitlab.com".
# Keep the registrable host: <name>.<tld> ; drop trailing "-anything".
host="$host_raw"
case "$host_raw" in
  gitlab.*-*) host="gitlab.com" ;;
  github.*-*) host="github.com" ;;
  *-*)
    # generic: cut at first dash that follows a dotted host
    if printf '%s' "$host_raw" | grep -q '\.'; then host="${host_raw%%-*}"; fi
    ;;
esac
[ "$host" != "$host_raw" ] && [ -n "$host_raw" ] && add_warn "normalized SSH alias $host_raw -> $host"

forge="unknown"
case "$host" in
  gitlab*) forge="gitlab" ;;
  github.com) forge="github" ;;
  "") add_warn "no remote URL; local-only repo" ;;
  *) add_warn "unrecognized host: $host" ;;
esac

# --- project slug from URL path, if not provided ---
if [ -z "$project" ] && [ -n "$url" ]; then
  path="$url"
  case "$url" in
    *@*:*) path="${url#*:}" ;;
    *://*) path="${url#*://}"; path="${path#*/}" ;;
  esac
  project="${path%.git}"
fi

# --- pick CLI + auth ---
cli="none"; auth="ok"
case "$forge" in
  gitlab)
    if command -v glab >/dev/null 2>&1; then
      cli="glab"
      glab auth status >/dev/null 2>&1 || { auth="missing"; add_warn "glab not authenticated (glab auth login)"; }
    else add_warn "gitlab repo but glab not installed"; fi ;;
  github)
    if command -v gh >/dev/null 2>&1; then
      cli="gh"
      gh auth status >/dev/null 2>&1 || { auth="missing"; add_warn "gh not authenticated (gh auth login)"; }
    else add_warn "github repo but gh not installed; git-native read-only only"; fi ;;
esac

# --- default branch ---
default_branch=""
if git rev-parse --git-dir >/dev/null 2>&1; then
  default_branch="$(git symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null | sed "s#^$remote/##" || true)"
  [ -z "$default_branch" ] && default_branch="$(git config --get init.defaultBranch 2>/dev/null || true)"
  [ -z "$default_branch" ] && { for b in main master; do git show-ref --verify --quiet "refs/heads/$b" && { default_branch="$b"; break; }; done; }
fi

# --- emit JSON ---
warn_json="$(printf '%s\n' "${warnings[@]:-}" | grep -v '^$' | jq -R . 2>/dev/null | jq -s . 2>/dev/null || echo '[]')"
jq -n \
  --arg host "$forge" --arg cli "$cli" --arg project "$project" \
  --arg remote "$remote" --arg db "$default_branch" --arg auth "$auth" \
  --argjson warnings "${warn_json:-[]}" \
  '{schema:"host-resolution/v1", host:$host, cli:$cli, project:$project,
    remote:$remote, default_branch:$db, auth:$auth, warnings:$warnings}'
