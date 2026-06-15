#!/usr/bin/env bash
# report.sh — turn a repo-steward/v1 analyze aggregate into a detailed,
# human-readable Markdown findings document so the user can make an informed
# decision about what to apply. Read-only.
#
# Single repo:
#   report.sh --in <repo-steward.json> [--out <file.md>]
#   <repo-steward JSON on stdin> | report.sh [--out <file.md>]
# Whole fleet (one consolidated file):
#   report.sh --fleet --in <fleet-steward.json> [--out <file.md>]
#   <fleet-steward JSON on stdin> | report.sh --fleet [--out <file.md>]
# Prints the written file path on stdout. With --stdout, prints the Markdown.
set -u

in=""; out=""; to_stdout=false; fleet=false
while [ $# -gt 0 ]; do
  case "$1" in
    --in) in="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --stdout) to_stdout=true; shift ;;
    --fleet) fleet=true; shift ;;
    *) shift ;;
  esac
done

json="$( [ -n "$in" ] && cat "$in" || cat )"
jq -e . >/dev/null 2>&1 <<<"$json" || { echo "report.sh: input is not valid JSON" >&2; exit 1; }

ts="$(date '+%Y-%m-%d %H:%M:%S %Z')"

# RJSON holds the repo object currently being rendered; g/lines read it.
RJSON=""
g(){ jq -r "$1 // empty" <<<"$RJSON" 2>/dev/null; }   # scalar getter
lines(){ jq -r "$1" <<<"$RJSON" 2>/dev/null; }         # multi-line getter

# render_repo <repo-steward-json> [heading-base]
# heading-base is a literal markdown prefix ("" for top-level, "#" to demote one
# level when embedding many repos in a single fleet document). FLEET_MODE=true
# suppresses the per-repo "Work items — start" action block (the synthesized
# fleet task plan replaces it).
render_repo() {
  RJSON="$1"
  local hb="${2:-}"
  local name repo optimize
  name="$(jq -r '.name // "repo"' <<<"$RJSON")"
  repo="$(jq -r '.repo // "."' <<<"$RJSON")"
  optimize="$(jq -r '.optimize // false' <<<"$RJSON")"

cat <<HDR
${hb}# git-steward findings — $name

- **Repository:** \`$repo\`
- **Generated:** $ts
- **Mode:** analyze (read-only — nothing was changed) · **optimize tier:** $optimize

> This document summarizes everything the analyze phase found, with the exact remediation for each
> item, so you can decide what (if anything) to apply. No command below runs until you approve it.

${hb}## At a glance

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
echo; echo "${hb}## Repository health"
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
echo; echo "${hb}## Branches (git-branch-cleanup)"
bc='.skills["git-branch-cleanup"]'
if [ "$(g "$bc.schema")" = "branch-cleanup/v1" ]; then
  echo "Merged: $(g "$bc.summary.merged") · gone: $(g "$bc.summary.gone") · stale: $(g "$bc.summary.stale") · keep: $(g "$bc.summary.keep")"
  cand="$(lines "$bc"'.candidates[]? | select(.category!="keep") | "- `\(.branch)` — **\(.category)** — \(.reason)"')"
  if [ -n "$cand" ]; then echo; echo "Prunable candidates:"; echo "$cand"; else echo; echo "_No prunable branches._"; fi
else echo "_branch data unavailable_"; fi

# ---- Commit hygiene ----
echo; echo "${hb}## Commit hygiene"
ch='.skills["commit-hygiene"]'
if [ "$(g "$ch.schema")" = "commit-hygiene/v1" ]; then
  echo "Non-conventional in last $(g "$ch.lint.checked"): **$(g "$ch.lint.non_conventional")** · un-pushed (rewordable): $(g "$ch.unpushed | length")"
  bad="$(lines "$ch"'.lint.commits[]? | select(.conventional==false) | "- `\(.sha)` \(.subject)"')"
  [ -n "$bad" ] && { echo; echo "Non-conventional subjects:"; echo "$bad"; }
else echo "_commit data unavailable_"; fi

# ---- History surgery ----
echo; echo "${hb}## Secrets & history (git-history-surgery)"
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
echo; echo "${hb}## Work items"
wi='.skills["work-items"]'
if [ "$(g "$wi.available")" = "true" ]; then
  echo "Open: $(g "$wi.counts.total") (critical $(g "$wi.counts.critical") · high $(g "$wi.counts.high") · medium $(g "$wi.counts.medium") · low $(g "$wi.counts.low"))"
  top="$(lines "$wi"'.items[:8][]? | "- #\(.rank) [\(.importance)/\(.scope)] \(.title) — \(.web_url)"')"
  [ -n "$top" ] && { echo; echo "Top of the ranked plan:"; echo "$top"; }
else echo "_$(g "$wi.reason" || echo "work items unavailable")_"; fi

# ---- Pipeline ----
echo; echo "${hb}## CI / pipeline health"
ph='.skills["pipeline-health"]'
if [ "$(g "$ph.available")" = "true" ]; then
  echo "Branch \`$(g "$ph.branch")\`: overall **$(g "$ph.overall")** · likely cause: $(g "$ph.likely_cause") · agent-fixable: $(g "$ph.agent_fixable")"
  fail="$(lines "$ph"'.failing[]? | "- `\(.name)` — \(.cause // "?")"')"
  [ -n "$fail" ] && { echo; echo "Failing jobs:"; echo "$fail"; }
else echo "_$(g "$ph.reason" || echo "pipeline data unavailable")_"; fi

# ---- Optimize tier ----
if [ "$optimize" = "true" ]; then
  echo; echo "${hb}## Optimize tier"
  echo "- .gitignore: $(g '.skills["gitignore-guard"].summary.tracked_to_untrack' || echo 0) tracked-should-ignore, $(g '.skills["gitignore-guard"].summary.missing_entries' || echo 0) missing entries"
  echo "- Worktrees: $(g '.skills["worktree-manager"].summary.total' || echo 0) total, $(g '.skills["worktree-manager"].summary.prunable' || echo 0) prunable"
  echo "- Dependencies: $(g '.skills["dependency-health"].summary.total_outdated' || echo 0) outdated, $(g '.skills["dependency-health"].summary.total_vulnerabilities' || echo 0) vulnerabilities"
  echo "- Consistency: $(g '.skills["repo-consistency"].summary.missing' || echo 0) baseline files missing"
  echo "- Release: next version $(g '.skills["release-changelog"].next_version' || echo "n/a") ($(g '.skills["release-changelog"].bump' || echo "n/a"))"
  echo "- Dormancy: $(g '.skills["stale-repo-triage"].tier' || echo "n/a") — $(g '.skills["stale-repo-triage"].recommendation' || echo "")"
fi

# ---- Actions checklist (editable decision aid) ----
echo; echo "${hb}## Actions — edit this list, then tell me to execute it"
cat <<'HOWTO'
Check the boxes for what you want done (`- [x]` = do it, `- [ ]` = skip; delete a line to skip too).
For rewords, edit the message after the `→`. Then say: **"execute the checked actions in this report"**.
Tier-1 items (local, recoverable) run once selected; Tier-2 items (🔴 irreversible/outward) are still
confirmed individually before running. The `<!--gs ...-->` tags are how I map a checkbox to an action —
leave them intact.
HOWTO

# Branches (Tier 1, local)
br_items="$(lines "$bc"'.candidates[]? | select(.category!="keep") | "- [ ] Delete branch `\(.branch)` (\(.category): \(.reason)) <!--gs op=branch-delete-local repo=REPO branch=\(.branch)-->"')"
[ -n "$br_items" ] && { echo; echo "${hb}### Branches — delete (local, recoverable via reflog)"; echo "${br_items//REPO/$repo}"; }

# Commit rewords (Tier 1, un-pushed only)
cm_items="$(lines "$ch"'.unpushed[]? | "- [ ] Reword `\(.sha)` \(.subject) → EDIT-MESSAGE-HERE <!--gs op=commit-reword repo=REPO sha=\(.sha)-->"')"
[ -n "$cm_items" ] && { echo; echo "${hb}### Commit messages — reword (un-pushed only; edit text after →)"; echo "${cm_items//REPO/$repo}"; }

# .gitignore (Tier 1)
gg_missing="$(g '.skills["gitignore-guard"].summary.missing_entries' || echo 0)"
gg_un="$(lines '.skills["gitignore-guard"].tracked_should_ignore[]? | "- [ ] Untrack `\(.)` (keep on disk) <!--gs op=gitignore-untrack repo=REPO file=\(.)-->"')"
if { [ "${gg_missing:-0}" -gt 0 ] 2>/dev/null; } || [ -n "$gg_un" ]; then
  echo; echo "${hb}### .gitignore (Tier 1)"
  [ "${gg_missing:-0}" -gt 0 ] 2>/dev/null && echo "- [ ] Add $gg_missing recommended .gitignore entries <!--gs op=gitignore-add repo=$repo-->"
  [ -n "$gg_un" ] && echo "${gg_un//REPO/$repo}"
fi

# Worktrees / deps (optimize, Tier 1)
if [ "$optimize" = "true" ]; then
  wt_prune="$(g '.skills["worktree-manager"].summary.prunable' || echo 0)"
  [ "${wt_prune:-0}" -gt 0 ] 2>/dev/null && { echo; echo "${hb}### Worktrees (Tier 1)"; echo "- [ ] Prune $wt_prune stale worktree(s) <!--gs op=worktree-prune repo=$repo-->"; }
  dep_out="$(g '.skills["dependency-health"].summary.total_outdated' || echo 0)"
  [ "${dep_out:-0}" -gt 0 ] 2>/dev/null && { echo; echo "${hb}### Dependencies (Tier 1)"; echo "- [ ] Bump $dep_out outdated dep(s) (minor/patch) <!--gs op=deps-bump repo=$repo-->"; }
fi

# History / secrets (Tier 2, irreversible)
# files to offer for removal = sensitive tracked files + files containing detected secrets (deduped)
hs_files="$(jq -r "($hs.secret_scan.sensitive_tracked_files // []) + ([$hs.secret_scan.findings[]?.file]) | unique[]?" <<<"$RJSON" 2>/dev/null)"
hs_items=""
[ -n "$hs_files" ] && hs_items="$(while IFS= read -r f; do [ -n "$f" ] && echo "- [ ] 🔴 Remove \`$f\` from ALL history (then rotate the secret) <!--gs op=history-remove-path repo=$repo path=$f-->"; done <<<"$hs_files")"
hs_blobs="$(lines "$hs"'.large_blobs.items[]? | "- [ ] 🔴 Strip `\(.path)` (\(.mb) MB) from ALL history <!--gs op=history-remove-path repo=REPO path=\(.path)-->"')"
if [ -n "$hs_items$hs_blobs" ]; then
  echo; echo "${hb}### Secrets & history (🔴 Tier 2 — irreversible; also rotate any leaked credential)"
  echo "_Rewrite tool ready: $(g "$hs.tools.rewrite_ready"). Removing a file purges it from every commit._"
  [ -n "$hs_items" ] && echo "$hs_items"
  [ -n "$hs_blobs" ] && echo "${hs_blobs//REPO/$repo}"
fi

# Work items (Tier 2, outward). In fleet mode the synthesized task plan (above) drives implementation
# instead, so this per-repo "start" block is suppressed to avoid two competing lists.
if [ "${FLEET_MODE:-false}" != "true" ]; then
  wi_items="$(lines "$wi"'.items[:8][]? | "- [ ] Start #\(.number) [\(.importance)/\(.scope)] \(.title) <!--gs op=work-item-start repo=REPO number=\(.number)-->"')"
  [ -n "$wi_items" ] && { echo; echo "${hb}### Work items — start (Tier 2, opens a branch + draft MR/PR)"; echo "${wi_items//REPO/$repo}"; }
fi

# CI (Tier 2, outward)
if [ "$(g "$ph.overall")" = "failed" ]; then
  echo; echo "${hb}### CI — fix & monitor (Tier 2, pushes)"
  echo "- [ ] Fix & monitor CI on \`$(g "$ph.branch")\` (cause: $(g "$ph.likely_cause")) <!--gs op=pipeline-fix repo=$repo branch=$(g "$ph.branch")-->"
fi

echo; echo "> After editing, run everything checked with: \`bash \${CLAUDE_PLUGIN_ROOT}/shared/run-plan.sh --report <this-file>\`"
echo "> or just tell me \"execute the checked actions\". One-shot gated pass instead: \`/git-cleanup $name\` / \`/git-optimize $name\`."

echo; echo "---"; echo "_Generated by git-steward · schema $(g '.schema')_"
}

# emit_repo: single-repo document (unchanged top-level behaviour).
emit_repo() { render_repo "$json" ""; }

# emit_fleet: one consolidated document for a fleet-steward/v1 aggregate.
emit_fleet() {
  local fjson="$json" root opt count
  root="$(jq -r '.root // "."' <<<"$fjson")"
  opt="$(jq -r '.optimize // false' <<<"$fjson")"
  count="$(jq -r '.repo_count // (.repos|length)' <<<"$fjson")"

  echo "# git-steward fleet findings"
  echo
  echo "- **Root:** \`$root\` · **Repos:** $count · **optimize tier:** $opt"
  echo "- **Generated:** $ts · mode: analyze (read-only — nothing was changed)"
  echo
  echo "> One consolidated report for the whole fleet. Below: fleet totals, a synthesized work-item task"
  echo "> plan, and a full findings + Actions section per repo. Check boxes (or fill the task plan), then"
  echo "> tell me to execute the checked items."
  echo
  echo "## Fleet totals"
  echo "- Repos with secrets: **$(jq -r '.totals.repos_with_secrets // 0' <<<"$fjson")**"
  echo "- Repos with prunable branches: $(jq -r '.totals.repos_with_prunable_branches // 0' <<<"$fjson")"
  echo "- Repos with failing CI: $(jq -r '.totals.repos_ci_failing // 0' <<<"$fjson")"
  echo "- Total open work items: $(jq -r '.totals.total_open_work_items // 0' <<<"$fjson")"
  echo
  echo "## Repos (most-flagged first)"
  echo
  echo "| Repo | Secrets | Branches | Commits | Blobs | CI | Work items |"
  echo "|---|---|---|---|---|---|---|"
  jq -r '.repos
    | sort_by( -( ((.attention.secret_findings // 0) * 1000)
                + ((if .attention.ci_status=="failed" then 1 else 0 end) * 500)
                + ((.attention.prunable_branches // 0) * 10)
                + (.attention.non_conventional_commits // 0)
                + (.attention.big_blobs // 0) ) )
    | .[]
    | "| \(.name) | \(.attention.secret_findings // (if .skipped then "—" else 0 end)) | \(.attention.prunable_branches // 0) | \(.attention.non_conventional_commits // 0) | \(.attention.big_blobs // 0) | \(.attention.ci_status // "n/a") | \(.attention.open_work_items // 0) |"' <<<"$fjson"

  # ---- Work-item task plan region (agent-authored) ----
  echo
  echo "## Work Items — Task Plan"
  echo "<!-- gs:task-plan-start -->"
  echo "_Replace this region with the grouped, deduped task plan. Group related items into one task and"
  echo "collapse duplicates. Tag each actionable task so it can be executed:_"
  echo "_\`- [ ] <task> <!--gs op=work-item-implement repo=<name> numbers=<n,m> slug=<kebab>-->\`_"
  echo "_(\`numbers\` = the work-item number(s) the task subsumes; checking it = implement → commit → push → open MR, Tier-2.)_"
  echo
  echo "### Cross-repo themes"
  echo "_Groups of related items spanning more than one repo — note any overlap/duplication._"
  echo
  echo "### Per-repo task groups"
  local raw
  raw="$(jq -r '.repos[]
    | select((.skills["work-items"].items // []) | length > 0)
    | "\n#### \(.name)\n" + ([ .skills["work-items"].items[]
        | "- #\(.number) [\(.importance)/\(.scope)] \(.title) — \(.web_url)" ] | join("\n"))' <<<"$fjson" 2>/dev/null)"
  if [ -n "$raw" ]; then
    echo "_Raw ranked items per repo (group/dedupe these into tagged tasks):_"
    echo "$raw"
  else
    echo "_No open work items across the fleet._"
  fi
  echo "<!-- gs:task-plan-end -->"

  # ---- Per-repo findings + actions (headings demoted one level) ----
  FLEET_MODE=true
  while IFS= read -r r; do
    echo; echo "---"; echo
    if [ "$(jq -r 'has("skills")' <<<"$r")" = "true" ]; then
      render_repo "$r" "#"
    else
      echo "## $(jq -r '.name // "repo"' <<<"$r") — skipped"
      echo; echo "_$(jq -r '.skipped // "no data"' <<<"$r")_"
    fi
  done < <(jq -c '.repos[]' <<<"$fjson")
}

# resolve default output path + dispatch
if $fleet; then
  name="fleet"
  root="$(jq -r '.root // "."' <<<"$json")"
  if [ -z "$out" ] && ! $to_stdout; then
    dir="$root/.git-steward/reports"; mkdir -p "$dir" 2>/dev/null || dir="$(mktemp -d)"
    out="$dir/$(date +%Y%m%d-%H%M%S)-${name}.md"
  fi
  if $to_stdout; then emit_fleet; else emit_fleet > "$out"; echo "$out"; fi
else
  name="$(jq -r '.name // "repo"' <<<"$json")"
  repo="$(jq -r '.repo // "."' <<<"$json")"
  if [ -z "$out" ] && ! $to_stdout; then
    dir="$repo/.git-steward/reports"; mkdir -p "$dir" 2>/dev/null || dir="$(mktemp -d)"
    out="$dir/$(date +%Y%m%d-%H%M%S)-${name}.md"
  fi
  if $to_stdout; then emit_repo; else emit_repo > "$out"; echo "$out"; fi
fi
