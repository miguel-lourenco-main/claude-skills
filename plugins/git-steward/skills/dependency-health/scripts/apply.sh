#!/usr/bin/env bash
# dependency-health apply.sh — bump dependencies within policy. MUTATING (Tier 1, gated).
# Default policy: minor/patch updates only (safe). Use --major to allow majors.
# Usage: apply.sh --repo <path> [--major] --confirm
set -u
repo="."; major=false; confirm=false
while [ $# -gt 0 ]; do case "$1" in
  --repo) repo="$2"; shift 2 ;; --major) major=true; shift ;;
  --confirm) confirm=true; shift ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" || exit 1
have() { command -v "$1" >/dev/null 2>&1; }

mgr=""
if [ -f package.json ]; then mgr="npm"; [ -f pnpm-lock.yaml ] && mgr="pnpm"; fi
[ -z "$mgr" ] && { echo "no supported package manager detected (node only for now)"; exit 0; }

echo "== dependency-health bump plan =="
echo "manager: $mgr   policy: $([ "$major" = true ] && echo 'allow major' || echo 'minor/patch only')"
echo "lockfile and package manifests will be updated; review the diff before committing."
if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm to update."; exit 0; fi

case "$mgr" in
  pnpm) if $major; then pnpm update --latest; else pnpm update; fi ;;
  npm)  npm update ;;
esac
echo "dependencies updated. Review 'git diff', run tests, then commit."
