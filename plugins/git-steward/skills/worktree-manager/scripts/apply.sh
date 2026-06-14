#!/usr/bin/env bash
# worktree-manager apply.sh — add/remove/prune git worktrees. MUTATING (Tier 1, gated).
# Usage:
#   apply.sh --repo <path> --prune --confirm
#   apply.sh --repo <path> --remove <worktree-path> --confirm
#   apply.sh --repo <path> --add <new-path> --branch <name> --confirm
set -u
repo="."; prune=false; remove=""; add=""; branch=""; confirm=false
while [ $# -gt 0 ]; do case "$1" in
  --repo) repo="$2"; shift 2 ;; --prune) prune=true; shift ;;
  --remove) remove="$2"; shift 2 ;; --add) add="$2"; shift 2 ;;
  --branch) branch="$2"; shift 2 ;; --confirm) confirm=true; shift ;;
  --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" || exit 1

echo "== worktree-manager plan =="
$prune && echo "  prune stale worktree admin entries (git worktree prune)"
[ -n "$remove" ] && echo "  remove worktree: $remove"
[ -n "$add" ] && echo "  add worktree: $add (branch ${branch:-<new>})"
{ ! $prune && [ -z "$remove" ] && [ -z "$add" ]; } && { echo "nothing to do."; exit 0; }
if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm."; exit 0; fi

$prune && { git worktree prune -v || true; }
[ -n "$remove" ] && { git worktree remove "$remove" && echo "removed $remove" || echo "could not remove $remove (try --force manually if intended)"; }
[ -n "$add" ] && { if [ -n "$branch" ]; then git worktree add "$add" -b "$branch" 2>/dev/null || git worktree add "$add" "$branch"; else git worktree add "$add"; fi && echo "added $add"; }
