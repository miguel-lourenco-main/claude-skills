#!/usr/bin/env bash
# git-repo-health analyze.sh — read-only health snapshot for one repo.
# Emits repo-health/v1 JSON on stdout. NEVER mutates. There is no apply.sh.
#
# Usage: analyze.sh --repo <path> [--stale-days N]
# Uses `set -u` only: a read-only analyzer must tolerate pipelines (e.g. grep with
# no matches) returning non-zero rather than aborting mid-snapshot.
set -u

repo="."
stale_days=90
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --stale-days) stale_days="$2"; shift 2 ;;
    --mode) shift 2 ;;   # accepted for contract uniformity; health is always read-only
    *) shift ;;
  esac
done

cd "$repo" 2>/dev/null || { echo "{\"schema\":\"repo-health/v1\",\"error\":\"path not found: $repo\"}"; exit 0; }
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "{\"schema\":\"repo-health/v1\",\"repo\":\"$repo\",\"error\":\"not a git repository\"}"; exit 0
fi

name="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo "$repo")")"
cur_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"

# default/upstream branch
remote="$(git remote 2>/dev/null | head -n1 || true)"
default_branch="$(git symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null | sed "s#^$remote/##" || true)"
[ -z "$default_branch" ] && for b in main master; do git show-ref --verify --quiet "refs/heads/$b" && { default_branch="$b"; break; }; done

# working-tree cleanliness
dirty_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
untracked="$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')"

# ahead/behind vs upstream of current branch
ahead=0; behind=0; upstream=""
if upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)"; then
  set -- $(git rev-list --left-right --count "${upstream}...HEAD" 2>/dev/null || echo "0 0")
  behind="${1:-0}"; ahead="${2:-0}"
fi

# branch inventory
local_branches="$(git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null | wc -l | tr -d ' ')"
remote_branches="$(git for-each-ref --format='%(refname:short)' refs/remotes 2>/dev/null | grep -v 'HEAD$' | wc -l | tr -d ' ')"
merged_into_default=0
if [ -n "$default_branch" ]; then
  merged_into_default="$(git branch --merged "$default_branch" 2>/dev/null | grep -vE "^\*| ${default_branch}$" | wc -l | tr -d ' ')"
fi

# stale local branches: no commit in <stale_days>
cutoff_epoch=$(( $(date +%s) - stale_days*86400 ))
stale_branches=0
while IFS=$'\t' read -r ts ref; do
  [ -n "$ts" ] || continue
  [ "$ts" -lt "$cutoff_epoch" ] && stale_branches=$((stale_branches+1))
done < <(git for-each-ref --format='%(committerdate:unix)%09%(refname:short)' refs/heads 2>/dev/null)

# activity / dormancy
last_commit_epoch="$(git log -1 --format=%ct 2>/dev/null || echo 0)"
days_since_commit=$(( ( $(date +%s) - last_commit_epoch ) / 86400 ))
[ "$last_commit_epoch" = "0" ] && days_since_commit=-1
commits_90d="$(git log --since='90 days ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"
total_commits="$(git rev-list --count --all 2>/dev/null || echo 0)"
contributors="$(git shortlog -sn --all 2>/dev/null | wc -l | tr -d ' ')"

# largest tracked blobs (top 3, MB)
big_blobs="$(git rev-list --objects --all 2>/dev/null \
  | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' 2>/dev/null \
  | awk '$1=="blob" && $3!="" {print $2"\t"$3}' \
  | sort -rn | head -3 \
  | awk '{mb=$1/1048576; printf "{\"path\":\"%s\",\"mb\":%.2f}\n", $2, mb}' \
  | jq -s . 2>/dev/null || echo '[]')"

# health flags (advisory; remediation pointers, not actions)
flags="$(jq -n \
  --argjson dirty "$dirty_count" --argjson ahead "$ahead" --argjson behind "$behind" \
  --argjson merged "$merged_into_default" --argjson stale "$stale_branches" \
  --argjson dormant "$days_since_commit" --arg sd "$stale_days" \
  '[ (if $dirty>0 then "uncommitted-changes" else empty end),
     (if $ahead>0 then "unpushed-commits" else empty end),
     (if $behind>0 then "behind-upstream" else empty end),
     (if $merged>0 then "merged-branches-prunable" else empty end),
     (if $stale>0 then ("stale-branches>" + $sd + "d") else empty end),
     (if $dormant>180 then "repo-dormant>180d" else empty end) ]')"

jq -n \
  --arg name "$name" --arg repo "$repo" --arg cur "$cur_branch" --arg db "$default_branch" \
  --argjson dirty "$dirty_count" --argjson untracked "$untracked" \
  --argjson ahead "$ahead" --argjson behind "$behind" --arg upstream "${upstream:-}" \
  --argjson local "$local_branches" --argjson remote "$remote_branches" \
  --argjson merged "$merged_into_default" --argjson stale "$stale_branches" --argjson staledays "$stale_days" \
  --argjson dsc "$days_since_commit" --argjson c90 "$commits_90d" \
  --argjson total "$total_commits" --argjson contrib "$contributors" \
  --argjson blobs "$big_blobs" --argjson flags "$flags" \
  '{schema:"repo-health/v1", name:$name, repo:$repo, current_branch:$cur, default_branch:$db,
    worktree:{dirty:$dirty, untracked:$untracked},
    sync:{upstream:$upstream, ahead:$ahead, behind:$behind},
    branches:{local:$local, remote:$remote, merged_into_default:$merged, stale:$stale, stale_days:$staledays},
    activity:{days_since_last_commit:$dsc, commits_last_90d:$c90, total_commits:$total, contributors:$contrib},
    largest_blobs:$blobs, flags:$flags}'
