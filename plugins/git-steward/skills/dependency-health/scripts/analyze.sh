#!/usr/bin/env bash
# dependency-health analyze.sh — detect package managers and report outdated /
# vulnerable dependencies. Read-only, best-effort with timeouts. Emits
# dependency-health/v1 JSON.
# Usage: analyze.sh --repo <path>
set -u
repo="."
while [ $# -gt 0 ]; do case "$1" in --repo) repo="$2"; shift 2 ;; --mode) shift 2 ;; *) shift ;; esac; done
cd "$repo" 2>/dev/null || { echo '{"schema":"dependency-health/v1","error":"path not found"}'; exit 0; }

ecosystems="[]"
add() { ecosystems="$(jq -c --argjson e "$1" '. += [$e]' <<<"$ecosystems")"; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- Node ---
if [ -f package.json ]; then
  mgr="npm"; [ -f pnpm-lock.yaml ] && mgr="pnpm"; [ -f bun.lockb ] && mgr="bun"
  outdated=-1; vulns=-1
  case "$mgr" in
    pnpm) have pnpm && { outdated="$(timeout 40 pnpm outdated --format json 2>/dev/null | jq 'length' 2>/dev/null || echo -1)"; vulns="$(timeout 40 pnpm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.total // -1' 2>/dev/null || echo -1)"; } ;;
    npm)  have npm  && { outdated="$(timeout 40 npm outdated --json 2>/dev/null | jq 'length' 2>/dev/null || echo -1)"; vulns="$(timeout 40 npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.total // -1' 2>/dev/null || echo -1)"; } ;;
    bun)  : ;;
  esac
  add "$(jq -n --arg m "$mgr" --argjson o "${outdated:--1}" --argjson v "${vulns:--1}" '{ecosystem:"node", manager:$m, outdated:$o, vulnerabilities:$v}')"
fi

# --- Rust ---
if [ -f Cargo.toml ]; then
  outdated=-1
  have cargo-outdated && outdated="$(timeout 60 cargo outdated --format json 2>/dev/null | jq '[.dependencies[]?|select(.project!=.latest)]|length' 2>/dev/null || echo -1)"
  add "$(jq -n --argjson o "${outdated:--1}" '{ecosystem:"rust", manager:"cargo", outdated:$o, vulnerabilities:-1}')"
fi

# --- Python ---
if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  outdated=-1
  have pip && outdated="$(timeout 40 pip list --outdated --format=json 2>/dev/null | jq 'length' 2>/dev/null || echo -1)"
  add "$(jq -n --argjson o "${outdated:--1}" '{ecosystem:"python", manager:"pip", outdated:$o, vulnerabilities:-1}')"
fi

jq -n --arg repo "$repo" --argjson eco "$ecosystems" \
  '{schema:"dependency-health/v1", repo:$repo, ecosystems:$eco,
    note:"counts of -1 mean the tool was unavailable or timed out",
    summary:{ecosystems:($eco|length),
      total_outdated:([$eco[].outdated|select(.>=0)]|add // 0),
      total_vulnerabilities:([$eco[].vulnerabilities|select(.>=0)]|add // 0)}}'
