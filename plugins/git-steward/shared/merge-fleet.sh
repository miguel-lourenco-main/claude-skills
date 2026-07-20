#!/usr/bin/env bash
# merge-fleet.sh — merge a per-run fleet RECORD into the CANONICAL fleet.json (the data source of
# truth), then re-render the canonical fleet.md from it. Reads/writes only under the reports dir.
#
# fleet.json is authoritative; fleet.md is a projection of it. A FULL analyze replaces every repo;
# a SCOPED re-analyze (a record holding only a subset of repos) updates only those repos' entries
# and leaves the rest of the canonical intact — so the canonical always reflects each repo's latest
# analysis, stamped with the fleet_id it came from. Identity is the repo path (.repo), falling back
# to .name.
#
# Usage: merge-fleet.sh --record <record-fleet.json> [--reports-dir <dir>] [--no-render]
set -u
record=""; dir=""; render=true
while [ $# -gt 0 ]; do case "$1" in
  --record) record="$2"; shift 2 ;;
  --reports-dir) dir="$2"; shift 2 ;;
  --no-render) render=false; shift ;;
  *) shift ;;
esac; done

[ -f "$record" ] || { echo "merge-fleet: record not found: $record" >&2; exit 1; }
[ -n "$dir" ] || dir="$(cd "$(dirname "$record")" && pwd)"
mkdir -p "$dir" 2>/dev/null || true
canon="$dir/fleet.json"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

jq -e '.repos' "$record" >/dev/null 2>&1 || { echo "merge-fleet: record has no .repos: $record" >&2; exit 1; }

# A valid, non-empty existing canonical is the merge base; otherwise start from an empty one.
# CRITICAL: read both the record and the base from FILES via --slurpfile, never `--argjson <bigvar>`.
# A fleet record is easily >128 KB, and a single argv string can't exceed MAX_ARG_STRLEN (128 KB on
# Linux) — passing it on the command line dies with "Argument list too long" and zeroes the canonical.
base_file="$canon"
if ! { [ -s "$canon" ] && jq -e '.repos' "$canon" >/dev/null 2>&1; }; then
  base_file="$(mktemp)"; jq -nc '{schema:"fleet-steward/v1", canonical:true, repos:[]}' > "$base_file"
  cleanup_base=true
fi

# Replace every repo present in the record (matched by identity), keep the rest, recompute totals.
tmp_out="$(mktemp)"
jq -n --slurpfile recA "$record" --slurpfile baseA "$base_file" '
  def ident: (.repo // .name // "");
  ($recA[0]) as $rec | ($baseA[0]) as $base
  | ($rec.repos // []) as $new
  | ($new | map(ident)) as $ids
  | { schema: "fleet-steward/v1", canonical: true,
      root: ($rec.root // $base.root // "."),
      optimize: ($rec.optimize // $base.optimize // false),
      updated_at: ($rec.generated_at // $base.updated_at),
      last_fleet_id: ($rec.fleet_id // $base.last_fleet_id),
      repos: (((($base.repos // []) | map(select((ident) as $i | ($ids | index($i)) == null))) + $new)
              | sort_by(.name // .repo // "")) }
  | .repo_count = (.repos | length)
  | .totals = {
      repos_with_secrets: [.repos[]|select((.attention.secret_findings // 0)>0)]|length,
      repos_with_prunable_branches: [.repos[]|select((.attention.prunable_branches // 0)>0)]|length,
      repos_ci_failing: [.repos[]|select(.attention.ci_status=="failed")]|length,
      total_open_work_items: ([.repos[].attention.open_work_items // 0]|add // 0)
    }
' > "$tmp_out"
[ "${cleanup_base:-false}" = true ] && rm -f "$base_file"

# Only overwrite the canonical when the merge actually produced valid JSON — never clobber a good
# canonical with an empty/failed result.
if [ -s "$tmp_out" ] && jq -e '.repos' "$tmp_out" >/dev/null 2>&1; then
  mv "$tmp_out" "$canon"
else
  rm -f "$tmp_out"
  echo "merge-fleet: merge produced no valid output; canonical left unchanged" >&2
  exit 1
fi

if $render; then
  bash "$here/report.sh" --fleet --in "$canon" --out "$dir/fleet.md" >/dev/null 2>&1 || true
fi
printf '%s\n' "$canon"
