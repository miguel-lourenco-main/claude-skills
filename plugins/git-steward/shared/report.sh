#!/usr/bin/env bash
# report.sh — turn a repo-steward/v1 (single repo) or fleet-steward/v1 (whole
# fleet) analyze aggregate into a detailed, self-explaining Markdown decision
# document. Read-only. The instructions and glossary appear once; each repo gets
# a findings section with bulleted, evidenced actions plus an agent-authored
# "Analysis & tasks" region.
#
# Single repo:  report.sh --in <repo-steward.json> [--out <file.md>] | --stdout
# Whole fleet:  report.sh --fleet --in <fleet-steward.json> [--out <file.md>] | --stdout
# Prints the written file path on stdout (or the Markdown with --stdout).
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
# selall: emit a "select all" checkbox for a list when it has >=2 selectable items.
# When the user checks it, parse-actions selects every item in the group EXCEPT the
# ones individually checked (a checked item then means "exclude me").
selall(){ local n; n="$(grep -c '^- \[' <<<"${1:-}" 2>/dev/null || echo 0)"
  [ "${n:-0}" -ge 2 ] && { echo "- [ ] _**Select all of the above** — then tick individual items to EXCLUDE them_ <!--gs op=select-all-->"; }; }

# ---- one-time orientation (emitted once per document) ----
emit_howto() {
cat <<'HOWTO'
## 🧭 How to use this report

> **Read-only analysis — nothing was changed.** Decide what to act on, then tell me to do it.

- **Actions** (per repo) and **work-item tasks** are checkboxes: `- [x]` = do it, `- [ ]` = skip (deleting the line also skips it).
- A list may end with **_Select all of the above_**. Tick it to queue the **whole list**; then tick individual items to **exclude** them — with select-all on, a checked item means "skip this one" (i.e. "all except these"). Leave it unticked for normal per-item selection.
- Each item carries *Why* (rationale), *Risk* (tier + reversibility), and *Source* (the evidence it's based on) so nothing is a black box.
- **Tier 1** = local & recoverable (branch deletes, rewords, `.gitignore`). **Tier 2** 🔴 = outward or irreversible (history rewrite, remote pushes, opening MRs) — each is confirmed again before it runs.
- Leave the `<!--gs ...-->` tags intact; they map a checkbox to an action. For rewords, edit the message after the `→`.
- When ready, say **"execute the checked items"**, or run `bash ${CLAUDE_PLUGIN_ROOT}/shared/run-plan.sh --report <this-file>`.
- Unfamiliar terms (non-conventional commits, prunable branches, big blobs, working-tree vs history secret scan, tiers) are defined in the **Glossary** at the end.
HOWTO
}

emit_glossary() {
cat <<'GLOSS'
## 📖 Glossary

**How this file is organized.** Top: fleet totals, a severity-sorted repo table, and cross-repo themes. Then one section per repo — *Analysis & tasks* (agent summary + this repo's work-item tasks), *Repository health*, *Branches*, *Commit hygiene*, *Secrets & history*, *CI / pipeline health*, and *Actions*. This glossary is last.

- **Prunable branch** — a local branch that is merged into the default branch, whose upstream is gone, or that has been stale past the threshold; safe to delete.
- **Non-conventional commit** — a commit whose subject does not follow Conventional Commits (`type(scope): summary`, e.g. `feat:`, `fix:`, `chore:`). Can be reworded while still un-pushed.
- **Secret finding (working-tree scan)** — a regex match for something secret-shaped in the **current** files. The built-in `git-native` scanner does **not** read history, so each finding's `commit` is *unknown* and a match can be a false positive (e.g. a value loaded from an env file). Full-history detection needs `gitleaks`/`trufflehog`. The per-repo *Analysis* traces provenance where possible.
- **Big blob / large tracked blob** — a large file object in the repository. `in worktree` = still a current file (untrack/`.gitignore` it to stop tracking going forward); `history-only` = exists only in past commits (removable only by a history rewrite). Flagged when over the size guideline (default 5 MB).
- **Tier 1 / Tier 2** — Tier 1 actions are local and reversible; Tier 2 (🔴) are outward or irreversible and gated by a second confirmation. Removing a secret/file from history rewrites every commit and does **not** un-leak the credential — rotate it too.
- **CI / pipeline status** — per branch, the result of that branch's latest pipeline. `refs/merge-requests/*` are MR pipelines, counted separately from real branches.
- **MR** — GitLab Merge Request (GitHub: Pull Request).
- **Select all of the above** — a checkbox at the end of a list. Checked = act on the whole list; any item you *also* check is then treated as an **exclusion** ("all except these"). Unchecked = normal (only the items you tick run).
GLOSS
}

# ---- per-repo header (title + metadata) ----
repo_header() {
  RJSON="$1"; local hb="${2:-}"
  local name repo optimize
  name="$(jq -r '.name // "repo"' <<<"$RJSON")"
  repo="$(jq -r '.repo // "."' <<<"$RJSON")"
  optimize="$(jq -r '.optimize // false' <<<"$RJSON")"
  echo "${hb}# 📦 $name"
  echo
  echo "> \`$repo\`  ·  analyze (read-only)  ·  optimize tier: $optimize"
}

# ---- per-repo body (at-a-glance, analysis region, dimensions, actions) ----
render_repo_body() {
  RJSON="$1"; local hb="${2:-}"
  local name repo optimize
  name="$(jq -r '.name // "repo"' <<<"$RJSON")"
  repo="$(jq -r '.repo // "."' <<<"$RJSON")"
  optimize="$(jq -r '.optimize // false' <<<"$RJSON")"

  echo; echo "${hb}## 📊 At a glance"; echo
  echo
  echo "| Dimension | Finding |"
  echo "|---|---|"
  echo "| Health flags | $(g '.attention.health_flags | join(", ") | select(.!="")' || echo "none") |"
  echo "| Prunable branches | $(g '.attention.prunable_branches') |"
  echo "| Non-conventional commits | $(g '.attention.non_conventional_commits') |"
  echo "| Secret findings (working-tree) | $(g '.attention.secret_findings') |"
  echo "| Large blobs | $(g '.attention.big_blobs') |"
  echo "| Open work items | $(g '.attention.open_work_items') |"
  echo "| CI status (headline) | $(g '.attention.ci_status') |"

  # ---- Analysis & tasks (agent-authored region) ----
  local secn blobn cifail summary wi_raw
  secn="$(g '.attention.secret_findings')"; [ -z "$secn" ] && secn=0
  blobn="$(lines '[.skills["git-repo-health"].largest_blobs[]?|select(.over_threshold)]|length')"; [ -z "$blobn" ] && blobn=0
  cifail="$(lines '[.skills["pipeline-health"].branches[]?|select(.status=="failed" or .status=="failure")]|length')"; [ -z "$cifail" ] && cifail=0
  echo; echo "${hb}## 🧭 Analysis & tasks"; echo
  echo "<!-- gs:repo:${name}-start -->"
  echo "_Agent fills this in: explain notable findings (mention false-positive secrets only in aggregate), judge blob cleanability, assess active branches for merge-vs-variant, and turn this repo's open work items into validated tasks. Put a blank line before every bullet list so it renders. Raw material below._"
  echo
  echo "**Notable findings to explain:** ${secn} secret match(es) · ${blobn} blob(s) over the size guideline · ${cifail} branch(es) with failing CI."
  echo
  echo "**Open work items** — first **validate** each against branches / recent commits / the relevant code (already implemented? still valid?), then group/dedupe into tasks. Write each as a short checkbox line carrying the tag, with \`*Items:*\`, \`*Why:*\`, \`*How:*\` sub-bullets (blank line before the list):"
  echo
  echo '```'
  echo "- [ ] **<task title>** <!--gs op=work-item-implement repo=${name} numbers=<n,m> slug=<kebab>-->"
  echo "  - *Items:* #<n>, #<m>"
  echo "  - *Why:* <why these belong together / the goal>"
  echo "  - *How:* <concrete steps grounded in the code you read — which files/components, the approach>"
  echo "- [ ] _**Select all of the above**_ <!--gs op=select-all-->   ← end the Tasks list with this when there are 2+ tasks"
  echo '```'
  echo
  wi_raw="$(lines '.skills["work-items"].items[]? | "- #\(.number) [\(.importance)/\(.scope)] \(.title) — \(.web_url)"')"
  if [ -n "$wi_raw" ]; then echo "$wi_raw"; else echo "_none open._"; fi
  echo "<!-- gs:repo:${name}-end -->"

  # ---- Health ----
  echo; echo "${hb}## 🩺 Repository health"; echo
  if [ "$(g '.skills["git-repo-health"].schema')" = "repo-health/v1" ]; then
    echo "- Default branch: \`$(g '.skills["git-repo-health"].default_branch')\` · current: \`$(g '.skills["git-repo-health"].current_branch')\`"
    echo "- Working tree: $(g '.skills["git-repo-health"].worktree.dirty') dirty, $(g '.skills["git-repo-health"].worktree.untracked') untracked"
    echo "- Sync: $(g '.skills["git-repo-health"].sync.ahead') ahead / $(g '.skills["git-repo-health"].sync.behind') behind upstream"
    echo "- Branches: $(g '.skills["git-repo-health"].branches.local') local, $(g '.skills["git-repo-health"].branches.remote') remote, $(g '.skills["git-repo-health"].branches.merged_into_default') merged, $(g '.skills["git-repo-health"].branches.stale') stale"
    echo "- Activity: last commit $(g '.skills["git-repo-health"].activity.days_since_last_commit')d ago · $(g '.skills["git-repo-health"].activity.commits_last_90d') commits/90d · $(g '.skills["git-repo-health"].activity.total_commits') total · $(g '.skills["git-repo-health"].activity.contributors') contributors"
    local bt over under
    bt="$(g '.skills["git-repo-health"].blob_threshold_mb')"; [ -z "$bt" ] && bt=5
    over="$(lines '.skills["git-repo-health"].largest_blobs[]? | select(.over_threshold) | "  - `\(.path)` — \(.mb) MB — " + (if .in_worktree then "in worktree (untrack/.gitignore to stop tracking)" else "history-only (removable only via history rewrite)" end)')"
    if [ -n "$over" ]; then
      echo "- ⚠️ Largest tracked blobs over the ${bt} MB guideline (see Analysis for cleanability):"; echo "$over"
    else
      under="$(lines '.skills["git-repo-health"].largest_blobs[0]? | "\(.mb) MB (`\(.path)`)"')"
      [ -n "$under" ] && echo "- Largest blob: $under — under the ${bt} MB guideline; no action."
    fi
    local flags
    flags="$(lines '.skills["git-repo-health"].flags[]? | "  - " + .')"
    [ -n "$flags" ] && { echo "- Flags:"; echo "$flags"; }
  else echo "_health data unavailable_"; fi

  # ---- Branches ----
  echo; echo "${hb}## 🌿 Branches"; echo
  local bc='.skills["git-branch-cleanup"]'
  if [ "$(g "$bc.schema")" = "branch-cleanup/v1" ]; then
    echo "Merged: $(g "$bc.summary.merged") · gone: $(g "$bc.summary.gone") · stale: $(g "$bc.summary.stale") · keep: $(g "$bc.summary.keep")"
    local cand active
    cand="$(lines "$bc"'.candidates[]? | select(.category!="keep") | "- `\(.branch)` — **\(.category)** — \(.reason)"')"
    if [ -n "$cand" ]; then echo; echo "Prunable candidates:"; echo; echo "$cand"; else echo; echo "_No prunable branches._"; fi
    active="$(lines "$bc"'.candidates[]? | select(.category=="keep" and .reason=="active, unmerged" and (.ahead//0)>0) | "- `\(.branch)` — \(.ahead) ahead / \(.behind) behind default — assess for merge vs variant (see Analysis & tasks)"')"
    [ -n "$active" ] && { echo; echo "Active / unmerged branches (merge candidates):"; echo; echo "$active"; }
  else echo "_branch data unavailable_"; fi

  # ---- Commit hygiene ----
  echo; echo "${hb}## 📝 Commit hygiene"; echo
  local ch='.skills["commit-hygiene"]'
  if [ "$(g "$ch.schema")" = "commit-hygiene/v1" ]; then
    echo "Non-conventional in last $(g "$ch.lint.checked"): **$(g "$ch.lint.non_conventional")** · un-pushed (rewordable): $(g "$ch.unpushed | length")"
    local bad
    bad="$(lines "$ch"'.lint.commits[]? | select(.conventional==false) | "- `\(.sha)` \(.subject)"')"
    [ -n "$bad" ] && { echo; echo "Non-conventional subjects:"; echo; echo "$bad"; }
  else echo "_commit data unavailable_"; fi

  # ---- History surgery / secrets ----
  echo; echo "${hb}## 🔑 Secrets & history"; echo
  local hs='.skills["git-history-surgery"]'
  if [ "$(g "$hs.schema")" = "history-surgery/v1" ]; then
    echo "Secret findings: **$(g "$hs.summary.secret_findings")** · sensitive tracked files: $(g "$hs.summary.sensitive_files") · large blobs: $(g "$hs.summary.big_blobs") · rewrite tool ready: $(g "$hs.tools.rewrite_ready")"
    local secn
    secn="$(g "$hs.summary.secret_findings")"; [ -z "$secn" ] && secn=0
    if [ "${secn:-0}" -gt 0 ] 2>/dev/null; then
      echo
      echo "> ⚠️ $secn working-tree regex match(es) (scan method **$(g "$hs.secret_scan.method")**, no history). Verdict in **Analysis & tasks** — most are false positives (env interpolation, i18n, test fixtures); only real secrets get an action."
    fi
    local bb
    bb="$(lines "$hs"'.large_blobs.items[]? | "- `\(.path)` — \(.mb) MB"')"
    [ -n "$bb" ] && { echo; echo "Large blobs in history:"; echo; echo "$bb"; }
  else echo "_history scan unavailable_"; fi

  # ---- Pipeline (all branches) ----
  echo; echo "${hb}## 🚦 CI / pipeline health"; echo
  local ph='.skills["pipeline-health"]'
  if [ "$(g "$ph.available")" = "true" ]; then
    echo "Headline (default \`$(g "$ph.default_branch")\`): **$(g "$ph.overall")** · scanned $(g "$ph.scanned") pipeline(s) · $(g "$ph.branches_failing") branch(es) failing · likely cause: $(g "$ph.likely_cause") · agent-fixable: $(lines "$ph.agent_fixable")"
    echo
    echo "| Branch | Status | Pipeline |"
    echo "|---|---|---|"
    lines "$ph"'.branches[]? | "| `\(.branch)`\((if .is_default then " (default)" else "" end) + (if .is_current then " (current)" else "" end)) | \(.status) | \(if .web_url != "" and .web_url != null then "[link](\(.web_url))" else "—" end) |"'
    local mrn fjobs
    mrn="$(g "$ph.mr_pipelines | length")"
    [ "${mrn:-0}" != "0" ] && echo && echo "_+ $mrn merge-request pipeline(s) (not shown above)._"
    fdiag="$(lines "$ph"'.branches[]? | select(.status=="failed" or .status=="failure")
      | "- `\(.branch)` — cause: **\(.likely_cause // "unknown")**"
        + ([.diagnosis[]? | "\n  - " + .] | join(""))
        + ([.failing_jobs[]? | select((.log_excerpt // "") != "") | .log_excerpt]
           | if length > 0 then "\n  - log: " + (.[0] | gsub("\\[[0-9;?]*[A-Za-z]";"") | gsub("[\r\n]+";" ⏎ ") | gsub("  +";" ") | .[0:240]) else "" end)')"
    [ -n "$fdiag" ] && { echo; echo "Why the failing pipeline(s) failed (what was checked, and the result):"; echo; echo "$fdiag"; }
  else
    echo "_CI unavailable: $(g "$ph.reason" || echo "pipeline data unavailable")._"
    local host hauth
    host="$(g "$ph.resolution.host")"; hauth="$(g "$ph.resolution.auth")"
    [ -n "$host" ] && echo "_(host: $host · CLI auth: ${hauth:-unknown})_"
  fi

  # ---- Optimize tier ----
  if [ "$optimize" = "true" ]; then
    echo; echo "${hb}## ✨ Optimize tier"; echo
    echo "- .gitignore: $(g '.skills["gitignore-guard"].summary.tracked_to_untrack' || echo 0) tracked-should-ignore, $(g '.skills["gitignore-guard"].summary.missing_entries' || echo 0) missing entries"
    echo "- Worktrees: $(g '.skills["worktree-manager"].summary.total' || echo 0) total, $(g '.skills["worktree-manager"].summary.prunable' || echo 0) prunable"
    echo "- Dependencies: $(g '.skills["dependency-health"].summary.total_outdated' || echo 0) outdated, $(g '.skills["dependency-health"].summary.total_vulnerabilities' || echo 0) vulnerabilities"
    echo "- Consistency: $(g '.skills["repo-consistency"].summary.missing' || echo 0) baseline files missing"
    echo "- Release: next version $(g '.skills["release-changelog"].next_version' || echo "n/a") ($(g '.skills["release-changelog"].bump' || echo "n/a"))"
    echo "- Dormancy: $(g '.skills["stale-repo-triage"].tier' || echo "n/a") — $(g '.skills["stale-repo-triage"].recommendation' || echo "")"
  fi

  # ---- Actions (bulleted, each with Why / Risk / Source) ----
  echo; echo "---"; echo; echo "${hb}## ✅ Actions"; echo
  echo "> Check an item to queue it (or use _Select all_ at the bottom of a list). Each carries *Why / Risk / Source*; see **How to use this report** at the top."
  echo
  local any=false

  # Branches (Tier 1)
  local br
  br="$(lines "$bc"'.candidates[]? | select(.category!="keep") |
    "- [ ] **Delete branch `\(.branch)`** <!--gs op=branch-delete-local repo=REPO branch=\(.branch)-->\n  - *Why:* \(.category) — \(.reason); redundant locally.\n  - *Risk:* Tier 1 · reversible (restore via `git reflog`).\n  - *Source:* git-branch-cleanup classified it `\(.category)`."')"
  if [ -n "$br" ]; then any=true; echo; echo "${hb}### Branches — delete (Tier 1, local)"; printf '%s\n' "${br//REPO/$repo}"; selall "${br//REPO/$repo}"; fi

  # Commit rewords (Tier 1)
  local cm
  cm="$(lines "$ch"'.unpushed[]? |
    "- [ ] **Reword `\(.sha)`** \(.subject) → EDIT-MESSAGE-HERE <!--gs op=commit-reword repo=REPO sha=\(.sha)-->\n  - *Why:* non-conventional subject; reword for a clean, lintable history.\n  - *Risk:* Tier 1 · safe (un-pushed only — rewrites the local message).\n  - *Source:* commit-hygiene: un-pushed commit `\(.sha)`."')"
  if [ -n "$cm" ]; then any=true; echo; echo "${hb}### Commit messages — reword (Tier 1, un-pushed; edit text after →)"; printf '%s\n' "${cm//REPO/$repo}"; selall "${cm//REPO/$repo}"; fi

  # .gitignore (Tier 1, optimize)
  local gg_missing gg_un
  gg_missing="$(g '.skills["gitignore-guard"].summary.missing_entries' || echo 0)"
  gg_un="$(lines '.skills["gitignore-guard"].tracked_should_ignore[]? |
    "- [ ] **Untrack `\(.)`** (keep on disk) <!--gs op=gitignore-untrack repo=REPO file=\(.)-->\n  - *Why:* tracked but should be ignored (build/generated artifact).\n  - *Risk:* Tier 1 · safe (removes from index, keeps the file).\n  - *Source:* gitignore-guard: tracked-should-ignore."')"
  if { [ "${gg_missing:-0}" -gt 0 ] 2>/dev/null; } || [ -n "$gg_un" ]; then
    any=true; echo; echo "${hb}### .gitignore (Tier 1)"
    [ "${gg_missing:-0}" -gt 0 ] 2>/dev/null && { echo "- [ ] **Add $gg_missing recommended .gitignore entries** <!--gs op=gitignore-add repo=$repo-->"; echo "  - *Why:* keep build/artifact files out of git."; echo "  - *Risk:* Tier 1 · safe (edits .gitignore only)."; echo "  - *Source:* gitignore-guard: $gg_missing missing entries."; }
    [ -n "$gg_un" ] && printf '%s\n' "${gg_un//REPO/$repo}"
  fi

  # Worktrees / deps (Tier 1, optimize)
  if [ "$optimize" = "true" ]; then
    local wt_prune dep_out
    wt_prune="$(g '.skills["worktree-manager"].summary.prunable' || echo 0)"
    if [ "${wt_prune:-0}" -gt 0 ] 2>/dev/null; then any=true; echo; echo "${hb}### Worktrees (Tier 1)"; echo "- [ ] **Prune $wt_prune stale worktree(s)** <!--gs op=worktree-prune repo=$repo-->"; echo "  - *Why:* free leftover linked worktrees."; echo "  - *Risk:* Tier 1 · safe (removes worktree links, not your branches)."; echo "  - *Source:* worktree-manager: $wt_prune prunable."; fi
    dep_out="$(g '.skills["dependency-health"].summary.total_outdated' || echo 0)"
    if [ "${dep_out:-0}" -gt 0 ] 2>/dev/null; then any=true; echo; echo "${hb}### Dependencies (Tier 1)"; echo "- [ ] **Bump $dep_out outdated dep(s)** (minor/patch) <!--gs op=deps-bump repo=$repo-->"; echo "  - *Why:* stay current within a safe minor/patch policy."; echo "  - *Risk:* Tier 1 · recoverable (lockfile change; review the diff)."; echo "  - *Source:* dependency-health: $dep_out outdated."; fi
  fi

  # History / secrets (Tier 2)
  # NOTE: unvalidated working-tree secret matches do NOT auto-emit history-remove actions — that
  # judgement (real-vs-false-positive) is the agent's, in the per-repo region. Only a CONFIRMED secret
  # gets a history-remove checkbox, authored by the agent (see SKILL "Annotate"). The script emits only
  # objective, size-based large-blob strips here.
  local hs_blobs
  hs_blobs="$(lines "$hs"'.large_blobs.items[]? |
    "- [ ] 🔴 **Strip `\(.path)` (\(.mb) MB) from ALL history** <!--gs op=history-remove-path repo=REPO path=\(.path)-->\n  - *Why:* shrink the repo by removing a large blob from every commit.\n  - *Risk:* 🔴 Tier 2 · IRREVERSIBLE (history rewrite; backup taken first).\n  - *Source:* git-history-surgery: \(.mb) MB blob in history."')"
  if [ -n "$hs_blobs" ]; then
    any=true; echo; echo "${hb}### Secrets & history (🔴 Tier 2 — irreversible)"
    printf '%s\n' "${hs_blobs//REPO/$repo}"
    selall "${hs_blobs//REPO/$repo}"
  fi

  # CI fix (Tier 2) — one per failing real branch
  local ci_items
  ci_items="$(lines "$ph"'.branches[]? | select(.status=="failed" or .status=="failure") |
    "- [ ] **Fix & monitor CI on `\(.branch)`** <!--gs op=pipeline-fix repo=REPO branch=\(.branch)-->\n  - *Why:* pipeline failing (cause: \(.likely_cause // "unknown")).\n  - *Risk:* Tier 2 · pushes commits and monitors; never the default branch unless asked.\n  - *Source:* pipeline-health: branch `\(.branch)` latest pipeline failed."')"
  if [ -n "$ci_items" ]; then any=true; echo; echo "${hb}### CI — fix & monitor (Tier 2, pushes)"; printf '%s\n' "${ci_items//REPO/$repo}"; selall "${ci_items//REPO/$repo}"; fi

  $any || { echo; echo "> _No mechanical actions — see **Analysis & tasks** for work-item tasks._"; }
}

# ---- single-repo document ----
emit_repo() {
  repo_header "$json" ""
  echo
  emit_howto
  render_repo_body "$json" ""
  echo; echo "---"; echo
  emit_glossary
  echo; echo "_Generated by git-steward · schema $(jq -r '.schema' <<<"$json")_"
}

# ---- fleet document (one consolidated file) ----
emit_fleet() {
  local fjson="$json" root opt count
  root="$(jq -r '.root // "."' <<<"$fjson")"
  opt="$(jq -r '.optimize // false' <<<"$fjson")"
  count="$(jq -r '.repo_count // (.repos|length)' <<<"$fjson")"

  echo "# 🛠️ git-steward — fleet findings"
  echo
  echo "> **Root:** \`$root\`  ·  **Repos:** $count  ·  **optimize tier:** $opt"
  echo ">"
  echo "> **Generated:** $ts  ·  analyze (read-only — nothing was changed)"
  echo
  emit_howto

  echo; echo "## 📊 Fleet totals"; echo
  echo "- Repos with secrets: **$(jq -r '.totals.repos_with_secrets // 0' <<<"$fjson")**"
  echo "- Repos with prunable branches: $(jq -r '.totals.repos_with_prunable_branches // 0' <<<"$fjson")"
  echo "- Repos with failing CI: $(jq -r '.totals.repos_ci_failing // 0' <<<"$fjson")"
  echo "- Total open work items: $(jq -r '.totals.total_open_work_items // 0' <<<"$fjson")"
  echo
  echo "---"; echo; echo "## 🗂️ Repos (most-flagged first)"
  echo
  echo "| Repo | Secrets | Prunable Branches | Commits | Blobs | CI | Work items |"
  echo "|---|---|---|---|---|---|---|"
  jq -r '.repos
    | sort_by( -( ((.attention.secret_findings // 0) * 1000)
                + ((if .attention.ci_status=="failed" then 1 else 0 end) * 500)
                + ((.attention.prunable_branches // 0) * 10)
                + (.attention.non_conventional_commits // 0)
                + (.attention.big_blobs // 0) ) )
    | .[]
    | "| \(.name) | \(.attention.secret_findings // (if .skipped then "—" else 0 end)) | \(.attention.prunable_branches // 0) | \(.attention.non_conventional_commits // 0) | \(.attention.big_blobs // 0) | \(.attention.ci_status // "n/a") | \(.attention.open_work_items // 0) |"' <<<"$fjson"

  echo
  echo "---"; echo; echo "## 🔗 Cross-repo themes"; echo
  echo "<!-- gs:themes-start -->"
  echo "_Agent fills this in: groups of related work items spanning more than one repo (note overlap/duplication). Per-repo tasks live in each repo's **Analysis & tasks** section below._"
  echo "<!-- gs:themes-end -->"

  while IFS= read -r r; do
    echo; echo "---"; echo
    if [ "$(jq -r 'has("skills")' <<<"$r")" = "true" ]; then
      repo_header "$r" "#"
      render_repo_body "$r" "#"
    else
      echo "## $(jq -r '.name // "repo"' <<<"$r") — skipped"
      echo; echo "_$(jq -r '.skipped // "no data"' <<<"$r")_"
    fi
  done < <(jq -c '.repos[]' <<<"$fjson")

  echo; echo "---"; echo
  emit_glossary
}

# ---- dispatch ----
if $fleet; then
  root="$(jq -r '.root // "."' <<<"$json")"
  if [ -z "$out" ] && ! $to_stdout; then
    dir="$root/.git-steward/reports"; mkdir -p "$dir" 2>/dev/null || dir="$(mktemp -d)"
    out="$dir/$(date +%Y%m%d-%H%M%S)-fleet.md"
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
