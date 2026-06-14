#!/usr/bin/env bash
# report.sh — turn a repo-steward/v1 analyze aggregate into a detailed,
# human-readable Markdown findings document so the user can make an informed
# decision about what to apply. Read-only.
#
# Usage:
#   report.sh --in <repo-steward.json> [--out <file.md>]
#   <produces JSON on stdin> | report.sh [--out <file.md>]
# Prints the written file path on stdout. With --stdout, prints the Markdown.
set -u

in=""; out=""; to_stdout=false
while [ $# -gt 0 ]; do
  case "$1" in
    --in) in="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --stdout) to_stdout=true; shift ;;
    *) shift ;;
  esac
done

json="$( [ -n "$in" ] && cat "$in" || cat )"
jq -e . >/dev/null 2>&1 <<<"$json" || { echo "report.sh: input is not valid JSON" >&2; exit 1; }

name="$(jq -r '.name // "repo"' <<<"$json")"
repo="$(jq -r '.repo // "."' <<<"$json")"
optimize="$(jq -r '.optimize // false' <<<"$json")"
ts="$(date '+%Y-%m-%d %H:%M:%S %Z')"
g(){ jq -r "$1 // empty" <<<"$json" 2>/dev/null; }   # scalar getter
lines(){ jq -r "$1" <<<"$json" 2>/dev/null; }         # multi-line getter

# resolve default output path
if [ -z "$out" ] && ! $to_stdout; then
  dir="$repo/.git-steward/reports"; mkdir -p "$dir" 2>/dev/null || dir="$(mktemp -d)"
  out="$dir/$(date +%Y%m%d-%H%M%S)-${name}.md"
fi

emit() {
cat <<HDR
# git-steward findings — $name

- **Repository:** \`$repo\`
- **Generated:** $ts
- **Mode:** analyze (read-only — nothing was changed) · **optimize tier:** $optimize

> This document summarizes everything the analyze phase found, with the exact remediation for each
> item, so you can decide what (if anything) to apply. No command below runs until you approve it.

## At a glance

| Dimension | Finding |
|---|---|
| Health flags | $(g '.attention.health_flags | join(", ") | select(.!="")' || echo "none") |
| Prunable branches | $(g '.attention.prunable_branches') |
| Non-conventional commits | $(g '.attention.non_conventional_commits') |
| Secret findings | $(g '.attention.secret_findings') |
| Large blobs | $(g '.attention.big_blobs') |
| Open work items | $(g '.attention.open_work_items') |
| CI status | $(g '.attention.ci_status') |
HDR

# ---- Health ----
echo; echo "## Repository health"
if [ "$(g '.skills["git-repo-health"].schema')" = "repo-health/v1" ]; then
  echo "- Default branch: \`$(g '.skills["git-repo-health"].default_branch')\` · current: \`$(g '.skills["git-repo-health"].current_branch')\`"
  echo "- Working tree: $(g '.skills["git-repo-health"].worktree.dirty') dirty, $(g '.skills["git-repo-health"].worktree.untracked') untracked"
  echo "- Sync: $(g '.skills["git-repo-health"].sync.ahead') ahead / $(g '.skills["git-repo-health"].sync.behind') behind upstream"
  echo "- Branches: $(g '.skills["git-repo-health"].branches.local') local, $(g '.skills["git-repo-health"].branches.remote') remote, $(g '.skills["git-repo-health"].branches.merged_into_default') merged, $(g '.skills["git-repo-health"].branches.stale') stale"
  echo "- Activity: last commit $(g '.skills["git-repo-health"].activity.days_since_last_commit')d ago · $(g '.skills["git-repo-health"].activity.commits_last_90d') commits/90d · $(g '.skills["git-repo-health"].activity.total_commits') total · $(g '.skills["git-repo-health"].activity.contributors') contributors"
  blobs="$(lines '.skills["git-repo-health"].largest_blobs[]? | "  - `\(.path)` — \(.mb) MB"')"
  [ -n "$blobs" ] && { echo "- Largest tracked blobs:"; echo "$blobs"; }
  flags="$(lines '.skills["git-repo-health"].flags[]? | "  - " + .')"
  [ -n "$flags" ] && { echo "- Flags:"; echo "$flags"; }
else echo "_health data unavailable_"; fi

# ---- Branches ----
echo; echo "## Branches (git-branch-cleanup)"
bc='.skills["git-branch-cleanup"]'
if [ "$(g "$bc.schema")" = "branch-cleanup/v1" ]; then
  echo "Merged: $(g "$bc.summary.merged") · gone: $(g "$bc.summary.gone") · stale: $(g "$bc.summary.stale") · keep: $(g "$bc.summary.keep")"
  cand="$(lines "$bc"'.candidates[]? | select(.category!="keep") | "- `\(.branch)` — **\(.category)** — \(.reason)"')"
  if [ -n "$cand" ]; then echo; echo "Prunable candidates:"; echo "$cand"; else echo; echo "_No prunable branches._"; fi
else echo "_branch data unavailable_"; fi

# ---- Commit hygiene ----
echo; echo "## Commit hygiene"
ch='.skills["commit-hygiene"]'
if [ "$(g "$ch.schema")" = "commit-hygiene/v1" ]; then
  echo "Non-conventional in last $(g "$ch.lint.checked"): **$(g "$ch.lint.non_conventional")** · un-pushed (rewordable): $(g "$ch.unpushed | length")"
  bad="$(lines "$ch"'.lint.commits[]? | select(.conventional==false) | "- `\(.sha)` \(.subject)"')"
  [ -n "$bad" ] && { echo; echo "Non-conventional subjects:"; echo "$bad"; }
else echo "_commit data unavailable_"; fi

# ---- History surgery ----
echo; echo "## Secrets & history (git-history-surgery)"
hs='.skills["git-history-surgery"]'
if [ "$(g "$hs.schema")" = "history-surgery/v1" ]; then
  echo "Secret findings: **$(g "$hs.summary.secret_findings")** · sensitive tracked files: $(g "$hs.summary.sensitive_files") · large blobs: $(g "$hs.summary.big_blobs") · rewrite tool ready: $(g "$hs.tools.rewrite_ready")"
  echo "_Scan method: $(g "$hs.secret_scan.method") — $(g "$hs.secret_scan.note")_"
  sec="$(lines "$hs"'.secret_scan.findings[]? | "- **\(.rule)** in `\(.file)`" + (if .line then " (line \(.line))" else "" end)')"
  [ -n "$sec" ] && { echo; echo "⚠️ Potential secrets:"; echo "$sec"; echo; echo "> Rewriting history does **not** un-leak a secret — rotate/revoke the credential as well."; }
  bb="$(lines "$hs"'.large_blobs.items[]? | "- `\(.path)` — \(.mb) MB"')"
  [ -n "$bb" ] && { echo; echo "Large blobs in history:"; echo "$bb"; }
else echo "_history scan unavailable_"; fi

# ---- Work items ----
echo; echo "## Work items"
wi='.skills["work-items"]'
if [ "$(g "$wi.available")" = "true" ]; then
  echo "Open: $(g "$wi.counts.total") (critical $(g "$wi.counts.critical") · high $(g "$wi.counts.high") · medium $(g "$wi.counts.medium") · low $(g "$wi.counts.low"))"
  top="$(lines "$wi"'.items[:8][]? | "- #\(.rank) [\(.importance)/\(.scope)] \(.title) — \(.web_url)"')"
  [ -n "$top" ] && { echo; echo "Top of the ranked plan:"; echo "$top"; }
else echo "_$(g "$wi.reason" || echo "work items unavailable")_"; fi

# ---- Pipeline ----
echo; echo "## CI / pipeline health"
ph='.skills["pipeline-health"]'
if [ "$(g "$ph.available")" = "true" ]; then
  echo "Branch \`$(g "$ph.branch")\`: overall **$(g "$ph.overall")** · likely cause: $(g "$ph.likely_cause") · agent-fixable: $(g "$ph.agent_fixable")"
  fail="$(lines "$ph"'.failing[]? | "- `\(.name)` — \(.cause // "?")"')"
  [ -n "$fail" ] && { echo; echo "Failing jobs:"; echo "$fail"; }
else echo "_$(g "$ph.reason" || echo "pipeline data unavailable")_"; fi

# ---- Optimize tier ----
if [ "$optimize" = "true" ]; then
  echo; echo "## Optimize tier"
  echo "- .gitignore: $(g '.skills["gitignore-guard"].summary.tracked_to_untrack' || echo 0) tracked-should-ignore, $(g '.skills["gitignore-guard"].summary.missing_entries' || echo 0) missing entries"
  echo "- Worktrees: $(g '.skills["worktree-manager"].summary.total' || echo 0) total, $(g '.skills["worktree-manager"].summary.prunable' || echo 0) prunable"
  echo "- Dependencies: $(g '.skills["dependency-health"].summary.total_outdated' || echo 0) outdated, $(g '.skills["dependency-health"].summary.total_vulnerabilities' || echo 0) vulnerabilities"
  echo "- Consistency: $(g '.skills["repo-consistency"].summary.missing' || echo 0) baseline files missing"
  echo "- Release: next version $(g '.skills["release-changelog"].next_version' || echo "n/a") ($(g '.skills["release-changelog"].bump' || echo "n/a"))"
  echo "- Dormancy: $(g '.skills["stale-repo-triage"].tier' || echo "n/a") — $(g '.skills["stale-repo-triage"].recommendation' || echo "")"
fi

# ---- Decision aid ----
echo; echo "## Recommended next steps (prioritized)"
echo "Each step is gated — it shows a plan and waits for your confirmation before changing anything."
echo
{
  s_sec="$(g "$hs.summary.secret_findings")"; [ "${s_sec:-0}" -gt 0 ] 2>/dev/null && echo "1. 🔴 **Secrets in the repo** — rotate/revoke the credentials, then \`git-history-surgery\` (apply) to purge them. Rewrite tool ready: $(g "$hs.tools.rewrite_ready")."
  s_ci="$(g "$ph.overall")"; [ "$s_ci" = "failed" ] && echo "2. 🟠 **CI failing** ($(g "$ph.likely_cause")) — \`pipeline-health\` (fix) to diagnose, fix, push, and monitor."
  s_pr="$(g '.attention.prunable_branches')"; [ "${s_pr:-0}" -gt 0 ] 2>/dev/null && echo "3. 🟡 **$s_pr prunable branch(es)** — \`git-branch-cleanup\` (apply) to remove merged/gone/stale branches."
  s_cm="$(g '.attention.non_conventional_commits')"; [ "${s_cm:-0}" -gt 0 ] 2>/dev/null && echo "4. 🟡 **$s_cm non-conventional commit(s)** — \`commit-hygiene\` (apply) to reword un-pushed commits."
  s_bb="$(g "$hs.summary.big_blobs")"; [ "${s_bb:-0}" -gt 0 ] 2>/dev/null && echo "5. 🟡 **$s_bb large blob(s)** — \`git-history-surgery\` to strip them, \`gitignore-guard\` to stop re-committing."
  s_wi="$(g '.attention.open_work_items')"; [ "${s_wi:-0}" -gt 0 ] 2>/dev/null && echo "6. 🔵 **$s_wi open work item(s)** — \`work-items\` to start the top of the ranked plan."
  echo
  echo "Run everything gated in one pass: \`/git-cleanup $name\` (core) or \`/git-optimize $name\` (core + optimize)."
}

echo; echo "---"; echo "_Generated by git-steward · schema $(g '.schema')_"
}

if $to_stdout; then emit; else emit > "$out"; echo "$out"; fi
