#!/usr/bin/env bash
# sync-remote.sh — reconcile ONE repo's local state with its remote BEFORE any
# per-repo analysis runs, so every downstream skill reads one unified, up-to-date
# view (instead of stale/contradictory local-only state).
#
# What it does, in order:
#   1. git fetch --all --prune --tags  (prune drops local remote-tracking refs for
#      branches deleted on the remote — the key fix for "merged+deleted upstream").
#   2. resolve the default branch from the remote (origin/HEAD), falling back to
#      git symbolic-ref / main / master.
#   3. ONLY if the working tree is clean AND the local default branch is strictly
#      BEHIND its upstream (no divergence), fast-forward it (merge --ff-only).
#      Dirty tree, divergence, detached HEAD, or no upstream → skipped, logged why.
#
# Never destructive: never resets, never forces, never discards local work, and
# never aborts the caller — on any failure it logs a warning to stderr and the
# caller continues with whatever local state exists (offline-safe).
#
# Human-readable progress goes to STDERR (so it never pollutes the JSON/report
# pipeline). A compact sync-remote/v1 JSON summary is printed to STDOUT.
#
# Usage (standalone):  sync-remote.sh --repo <path>
# Usage (sourced):     source sync-remote.sh ; gs_sync_remote <path>   # logs only
set -u

# gs_sync_remote <repo-path>
# Logs to stderr, returns 0 always. Echoes nothing to stdout (use the standalone
# entrypoint below if you want the JSON summary). Designed to be sourced by a
# runner that just wants the side effect (a reconciled repo) before analysis.
gs_sync_remote() {
  local repo="${1:-.}"
  local action="none" reason="" default="" remote="" fetched=false ffd=false

  ( cd "$repo" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1 ) || {
    echo "[sync] $repo: not a git repository — skipping sync." >&2
    printf '%s' '{"schema":"sync-remote/v1","action":"skipped","reason":"not a git repository"}'
    return 0
  }

  # Everything below runs inside the repo; use a subshell so we never change the
  # caller's cwd and a failure can't leave us elsewhere.
  local summary
  summary="$(
    cd "$repo" || exit 0
    action="none"; reason=""; ffd=false; fetched=false

    remote="$(git remote 2>/dev/null | head -n1)"
    if [ -z "$remote" ]; then
      echo "[sync] no remote configured — analyzing local state only." >&2
      reason="no remote"; action="local-only"
    else
      # 1) fetch + prune + tags. Resilient: offline / auth failure must not abort.
      if git fetch --all --prune --tags --quiet 2>/dev/null; then
        fetched=true
        echo "[sync] fetched & pruned '$remote' (remote-tracking refs reconciled)." >&2
      else
        echo "[sync] WARN: fetch from '$remote' failed (offline?) — continuing with local state." >&2
        reason="fetch failed"; action="local-only"
      fi
    fi

    # 2) determine the default branch from the remote, then fall back.
    default="$(git symbolic-ref --quiet --short "refs/remotes/$remote/HEAD" 2>/dev/null | sed "s#^$remote/##")"
    if [ -z "$default" ] && [ -n "$remote" ]; then
      # ask the server explicitly (works even if origin/HEAD wasn't set locally)
      default="$(git remote show "$remote" 2>/dev/null | sed -n 's/.*HEAD branch: //p' | head -n1)"
    fi
    [ -z "$default" ] && for b in main master; do
      git show-ref --verify --quiet "refs/heads/$b" && { default="$b"; break; }
    done

    # 3) fast-forward the local default branch IFF clean tree + strictly behind.
    if [ "$action" != "local-only" ] && [ -n "$default" ]; then
      if git show-ref --verify --quiet "refs/heads/$default"; then
        local cur dirty upstream ahead behind
        cur="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
        dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
        upstream="$(git rev-parse --abbrev-ref --symbolic-full-name "$default@{upstream}" 2>/dev/null || true)"
        if [ -z "$upstream" ]; then
          reason="default '$default' has no upstream"; action="no-ff"
          echo "[sync] '$default' has no upstream — not fast-forwarding." >&2
        elif [ "$cur" != "$default" ]; then
          # don't switch branches; only ff the default when it's checked out.
          # (A non-checked-out branch can still be advanced safely with update-ref
          #  when it's strictly behind, but to stay maximally conservative we skip.)
          reason="default '$default' not checked out (current: '$cur')"; action="no-ff"
          echo "[sync] '$default' not checked out (on '$cur') — not fast-forwarding the working tree." >&2
        elif [ "${dirty:-0}" -gt 0 ] 2>/dev/null; then
          reason="working tree dirty"; action="no-ff"
          echo "[sync] working tree dirty — not fast-forwarding '$default' (no local work touched)." >&2
        else
          ahead="$(git rev-list --count "$upstream..$default" 2>/dev/null || echo 0)"
          behind="$(git rev-list --count "$default..$upstream" 2>/dev/null || echo 0)"
          if [ "${behind:-0}" -gt 0 ] 2>/dev/null && [ "${ahead:-0}" -eq 0 ] 2>/dev/null; then
            if git merge --ff-only "$upstream" --quiet 2>/dev/null; then
              ffd=true; action="fast-forwarded"
              echo "[sync] fast-forwarded '$default' to '$upstream' (was $behind behind)." >&2
            else
              reason="ff-only merge failed"; action="no-ff"
              echo "[sync] WARN: ff-only merge of '$default' failed — leaving it untouched." >&2
            fi
          elif [ "${ahead:-0}" -gt 0 ] 2>/dev/null; then
            reason="diverged (${ahead} ahead / ${behind} behind)"; action="no-ff"
            echo "[sync] '$default' has diverged ($ahead ahead / $behind behind) — not fast-forwarding." >&2
          else
            reason="up to date"; action="up-to-date"
            echo "[sync] '$default' already up to date with '$upstream'." >&2
          fi
        fi
      else
        reason="no local '$default' branch"; action="no-ff"
      fi
    fi

    jq -n --arg action "$action" --arg reason "$reason" --arg default "$default" \
      --arg remote "$remote" --argjson fetched "$fetched" --argjson ffd "$ffd" \
      '{schema:"sync-remote/v1", action:$action, reason:$reason,
        default_branch:$default, remote:$remote, fetched:$fetched, fast_forwarded:$ffd}' \
      2>/dev/null || printf '%s' '{"schema":"sync-remote/v1","action":"unknown"}'
  )"
  printf '%s' "$summary"
  return 0
}

# Standalone entrypoint: parse --repo, run the sync, print the JSON summary.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  repo="."
  while [ $# -gt 0 ]; do
    case "$1" in
      --repo) repo="$2"; shift 2 ;;
      --mode) shift 2 ;;   # accepted for contract uniformity; sync is reconcile-only
      *) shift ;;
    esac
  done
  gs_sync_remote "$repo"
  echo
fi
