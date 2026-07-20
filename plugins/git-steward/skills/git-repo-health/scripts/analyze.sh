#!/usr/bin/env bash
# git-repo-health analyze.sh — read-only health snapshot for one repo.
# Emits repo-health/v1 JSON on stdout. NEVER mutates. There is no apply.sh.
#
# Usage: analyze.sh --repo <path> [--stale-days N]
# Uses `set -u` only: a read-only analyzer must tolerate pipelines (e.g. grep with
# no matches) returning non-zero rather than aborting mid-snapshot.
set -u
# Shared read-only content primitives: gs_cmp_base, branch_content_in_default.
source "$(dirname "${BASH_SOURCE[0]}")/../../../shared/git-content.sh"

repo="."
stale_days=90
blob_mb="${GIT_STEWARD_BLOB_MB:-5}"   # recommended max size (MB) for a tracked blob
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --stale-days) stale_days="$2"; shift 2 ;;
    --blob-mb) blob_mb="$2"; shift 2 ;;
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

# Comparison base for merged_into_default below: prefer the freshly-fetched remote-tracking
# default over the LOCAL $default_branch (which `fetch --prune` never fast-forwards), falling
# back to the local NAME when offline/standalone. See gs_cmp_base in shared/git-content.sh.
cmp_base="$(gs_cmp_base "$remote" "$default_branch")"

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
# Count branches whose work is fully in $default_branch. `git branch --merged` only follows
# ANCESTRY, so it misses SQUASH- and REBASE-merged branches — which git-branch-cleanup already
# classifies as "merged" (since 4afb574) via a patch-id / tree-equality test. Reconcile the two
# detectors here so the `merged-branches-prunable` flag and branch-cleanup's prunable count agree
# (they disagreed: repo-health undercounted). Same exclusions as branch-cleanup: default & current
# are protected ("keep"), never merge-candidates. Mirrors branch_content_in_default in that script.
merged_into_default=0
if [ -n "$default_branch" ]; then
  ancestor_merged=" $(git branch --merged "$cmp_base" 2>/dev/null | sed 's/^[* ] *//' | tr '\n' ' ') "
  while IFS= read -r br; do
    [ -n "$br" ] || continue
    [ "$br" = "$default_branch" ] && continue
    [ "$br" = "$cur_branch" ] && continue
    # (a) plain ancestry merge — reachable from $default_branch
    if case "$ancestor_merged" in *" $br "*) true;; *) false;; esac; then
      merged_into_default=$((merged_into_default+1)); continue
    fi
    # (b) squash/rebase merge — ahead of $default_branch yet carrying NO content it lacks.
    #     branch_content_in_default (shared/git-content.sh) runs the same cherry/tree test
    #     git-branch-cleanup uses, keeping the two detectors' counts in agreement.
    br_ahead="$(git rev-list --count "$cmp_base..$br" 2>/dev/null || echo 0)"
    [ "${br_ahead:-0}" -gt 0 ] 2>/dev/null || continue
    if branch_content_in_default "$cmp_base" "$br"; then
      merged_into_default=$((merged_into_default+1))
    fi
  done < <(git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null)
fi

# stale local branches: no commit in <stale_days>
cutoff_epoch=$(( $(date +%s) - stale_days*86400 ))
stale_branches=0
while IFS=$'\t' read -r ts ref; do
  [ -n "$ts" ] || continue
  [ "$ts" -lt "$cutoff_epoch" ] && stale_branches=$((stale_branches+1))
done < <(git for-each-ref --format='%(committerdate:unix)%09%(refname:short)' refs/heads 2>/dev/null)

# activity / dormancy — last commit across ALL refs, not HEAD only. A repo whose default
# branch is idle but with recent work on feature/remote branches is not dormant; HEAD-only
# misfired the `repo-dormant>180d` flag on it. (`--all` is a recency floor: a stale ref can
# only make the repo look more recently active, never falsely older — see stale-repo-triage.)
# These full-history walks (last-commit epoch, --since counts, --all total, contributors) are
# ALSO needed by stale-repo-triage, so under repo-steward they're computed ONCE and shared via
# the $GS_ACTIVITY key=value cache (mirrors $GS_BLOB_LIST). Read the cached value when present;
# self-compute the IDENTICAL command when run standalone (or if the cache is absent/empty).
gs_act() { [ -n "${GS_ACTIVITY:-}" ] && [ -s "$GS_ACTIVITY" ] && sed -n "s/^$1=//p" "$GS_ACTIVITY" | head -1; }
last_commit_epoch="$(gs_act last_epoch)"; [ -n "$last_commit_epoch" ] || last_commit_epoch="$(git log -1 --all --format=%ct 2>/dev/null || echo 0)"
days_since_commit=$(( ( $(date +%s) - last_commit_epoch ) / 86400 ))
[ "$last_commit_epoch" = "0" ] && days_since_commit=-1
# Count via `rev-list --count` instead of `log --oneline | wc -l`: identical commits and
# `--since` semantics, but git counts internally rather than formatting every subject and
# piping to a second process. (rev-list needs an explicit start point — HEAD; `|| echo 0`
# keeps an empty/no-HEAD repo at 0, as wc did.) Mirrors stale-repo-triage's analyze.sh.
commits_90d="$(gs_act c90)"; [ -n "$commits_90d" ] || commits_90d="$(git rev-list --count HEAD --since='90 days ago' 2>/dev/null || echo 0)"
total_commits="$(gs_act total)"; [ -n "$total_commits" ] || total_commits="$(git rev-list --count --all 2>/dev/null || echo 0)"
contributors="$(gs_act contributors)"; [ -n "$contributors" ] || contributors="$(git shortlog -sn --all 2>/dev/null | wc -l | tr -d ' ')"

# Full-history blob enumeration (`<objecttype> <objectsize> <path>`). This walk is the
# dominant cost on repos with deep history / large blobs, and git-history-surgery needs
# the exact same enumeration — so repo-steward computes it ONCE and shares it via the
# $GS_BLOB_LIST cache file. Fall back to self-compute when run standalone (or if the
# cache is empty/missing), keeping this skill independently runnable.
gs_blob_enum() {
  if [ -n "${GS_BLOB_LIST:-}" ] && [ -s "$GS_BLOB_LIST" ]; then
    cat "$GS_BLOB_LIST"
  else
    # Walk OWNED, LIVE history only: local branches + tags. NOT --all — `--all` also walks
    # refs retaining blobs already stripped from real history (stale refs/remotes/* that lag a
    # force-push, git-steward backups under refs/git-steward/backup/*, the stash, other tools'
    # snapshot refs like refs/t3/*), which would be re-reported as still-in-history.
    git rev-list --objects --branches --tags 2>/dev/null \
      | git cat-file --batch-check='%(objectname) %(objecttype) %(objectsize) %(rest)' 2>/dev/null
  fi
}

# largest blobs in owned history (top 3, MB). Note: the --branches --tags walk is
# history-wide, so a blob may be history-only; in_worktree distinguishes "removable now
# by untracking" from "only removable via history rewrite". over_threshold flags blobs
# above the recommended size guideline so the report only nags when it matters.
worktree_files="$(git ls-files 2>/dev/null || true)"
big_blobs="$(gs_blob_enum \
  | awk '$2=="blob" && $4!="" {print $3"\t"$4}' \
  | sort -rn | head -3 \
  | awk '{mb=$1/1048576; printf "%s\t%.2f\n", $2, mb}' \
  | while IFS=$'\t' read -r path mb; do
      inwt=false; printf '%s\n' "$worktree_files" | grep -qxF "$path" && inwt=true
      over=$(awk -v m="$mb" -v t="$blob_mb" 'BEGIN{print (m+0 > t+0) ? "true" : "false"}')
      jq -n --arg p "$path" --argjson mb "$mb" --argjson over "$over" --argjson iw "$inwt" \
        '{path:$p, mb:$mb, over_threshold:$over, in_worktree:$iw}'
    done \
  | jq -s . 2>/dev/null || echo '[]')"

# health flags (advisory; remediation pointers, not actions)
flags="$(jq -n \
  --argjson dirty "$dirty_count" --argjson ahead "$ahead" --argjson behind "$behind" \
  --argjson merged "$merged_into_default" --argjson stale "$stale_branches" \
  --argjson dormant "$days_since_commit" --arg sd "$stale_days" \
  --argjson blobs "$big_blobs" --arg bt "$blob_mb" \
  '[ (if $dirty>0 then "uncommitted-changes" else empty end),
     (if $ahead>0 then "unpushed-commits" else empty end),
     (if $behind>0 then "behind-upstream" else empty end),
     (if $merged>0 then "merged-branches-prunable" else empty end),
     (if $stale>0 then ("stale-branches>" + $sd + "d") else empty end),
     (if ([$blobs[]|select(.over_threshold)]|length)>0 then ("large-blobs>" + $bt + "mb") else empty end),
     (if $dormant>180 then "repo-dormant>180d" else empty end) ]')"

jq -n \
  --arg name "$name" --arg repo "$repo" --arg cur "$cur_branch" --arg db "$default_branch" \
  --argjson dirty "$dirty_count" --argjson untracked "$untracked" \
  --argjson ahead "$ahead" --argjson behind "$behind" --arg upstream "${upstream:-}" \
  --argjson local "$local_branches" --argjson remote "$remote_branches" \
  --argjson merged "$merged_into_default" --argjson stale "$stale_branches" --argjson staledays "$stale_days" \
  --argjson dsc "$days_since_commit" --argjson c90 "$commits_90d" \
  --argjson total "$total_commits" --argjson contrib "$contributors" \
  --argjson blobs "$big_blobs" --argjson flags "$flags" --argjson bt "$blob_mb" \
  '{schema:"repo-health/v1", name:$name, repo:$repo, current_branch:$cur, default_branch:$db,
    worktree:{dirty:$dirty, untracked:$untracked},
    sync:{upstream:$upstream, ahead:$ahead, behind:$behind},
    branches:{local:$local, remote:$remote, merged_into_default:$merged, stale:$stale, stale_days:$staledays},
    activity:{days_since_last_commit:$dsc, commits_last_90d:$c90, total_commits:$total, contributors:$contrib},
    blob_threshold_mb:$bt, largest_blobs:$blobs, flags:$flags}'
