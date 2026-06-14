#!/usr/bin/env bash
# work-items analyze.sh — fetch + classify issues/MRs (GitLab) or issues/PRs
# (GitHub) into a ranked task plan. Read-only. Emits work-items/v1 JSON.
#
# Usage: analyze.sh --repo <path> [--project <slug>] [--per-page 100]
set -u

repo="."; project=""; per=100
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --project) project="$2"; shift 2 ;;
    --per-page) per="$2"; shift 2 ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
res="$(bash "$here/../../../shared/resolve-host.sh" --repo "$repo" ${project:+--project "$project"})"
host="$(jq -r '.host' <<<"$res")"; cli="$(jq -r '.cli' <<<"$res")"
proj="$(jq -r '.project' <<<"$res")"; auth="$(jq -r '.auth' <<<"$res")"

emit_unavailable() {
  jq -n --argjson res "$res" --arg reason "$1" \
    '{schema:"work-items/v1", available:false, reason:$reason, resolution:$res, items:[]}'
  exit 0
}

[ "$auth" = "missing" ] && emit_unavailable "forge CLI not authenticated (run: ${cli} auth login)"
case "$cli" in
  glab) : ;;
  gh) command -v gh >/dev/null 2>&1 || emit_unavailable "github repo but gh not installed" ;;
  *)  emit_unavailable "no usable forge CLI for host '$host'" ;;
esac

raw_issues="[]"; raw_changes="[]"
if [ "$cli" = "glab" ]; then
  raw_issues="$(glab issue list -R "$proj" --output json --per-page "$per" 2>/dev/null || echo '[]')"
  raw_changes="$(glab mr list -R "$proj" --output json --per-page "$per" 2>/dev/null || echo '[]')"
  norm_i='[.[] | {kind:"issue", number:.iid, title:.title, state:.state,
            labels:(.labels // []), milestone:(.milestone.title // null),
            assignees:[(.assignees // [])[].username], author:(.author.username // null),
            created_at:.created_at, updated_at:.updated_at, web_url:.web_url,
            draft:false, source_branch:null}]'
  norm_c='[.[] | {kind:"change", number:.iid, title:.title, state:.state,
            labels:(.labels // []), milestone:(.milestone.title // null),
            assignees:[(.assignees // [])[].username], author:(.author.username // null),
            created_at:.created_at, updated_at:.updated_at, web_url:.web_url,
            draft:(.draft // .work_in_progress // false), source_branch:(.source_branch // null)}]'
elif [ "$cli" = "gh" ]; then
  raw_issues="$(gh issue list -R "$proj" --json number,title,state,labels,milestone,assignees,createdAt,updatedAt,url --limit "$per" 2>/dev/null || echo '[]')"
  raw_changes="$(gh pr list -R "$proj" --json number,title,state,labels,milestone,assignees,createdAt,updatedAt,url,isDraft,headRefName,additions,deletions,changedFiles --limit "$per" 2>/dev/null || echo '[]')"
  norm_i='[.[] | {kind:"issue", number:.number, title:.title, state:.state,
            labels:[.labels[].name], milestone:(.milestone.title // null),
            assignees:[.assignees[].login], author:null,
            created_at:.createdAt, updated_at:.updatedAt, web_url:.url, draft:false, source_branch:null}]'
  norm_c='[.[] | {kind:"change", number:.number, title:.title, state:.state,
            labels:[.labels[].name], milestone:(.milestone.title // null),
            assignees:[.assignees[].login], author:null,
            created_at:.createdAt, updated_at:.updatedAt, web_url:.url,
            draft:.isDraft, source_branch:.headRefName,
            additions:.additions, deletions:.deletions, changedFiles:.changedFiles}]'
fi

items_i="$(jq "$norm_i" <<<"$raw_issues" 2>/dev/null || echo '[]')"
items_c="$(jq "$norm_c" <<<"$raw_changes" 2>/dev/null || echo '[]')"

# classify + rank (generic, label-driven; see references/classification.md)
classified="$(jq -n --argjson issues "$items_i" --argjson changes "$items_c" '
  def lc(a): (a // []) | map(ascii_downcase);
  def has(a; words): (lc(a)) as $L | any($L[]; . as $l | any(words[]; . as $w | ($l | test($w))));
  def age(d): if d==null then 0 else ((now - (d|sub("\\.[0-9]+Z$";"Z")|fromdateiso8601))/86400|floor) end;
  ($issues + $changes) | map(
    . as $it | (age(.created_at)) as $age |
    (if has(.labels; ["security|vuln|critical|blocker|p0|severity::critical|priority::critical"]) then "critical"
     elif (has(.labels; ["bug|regression|urgent|important|priority::high|\\bp1\\b"])
           or ((.assignees|length>0) and .milestone!=null)
           or ($age>30 and has(.labels; ["bug"]))) then "high"
     elif (.milestone!=null or has(.labels; ["feature|enhancement|improvement"])) then "medium"
     else "low" end) as $imp |
    (if has(.labels; ["epic|^large$|\\bxl\\b"]) then "large"
     elif has(.labels; ["good.?first|trivial|^small$|\\bxs\\b|chore"]) then "small"
     else "medium" end) as $scope |
    ({critical:0,high:1,medium:2,low:3}[$imp]) as $iw |
    ({small:0,medium:1,large:2}[$scope]) as $sw |
    . + {age_days:$age, importance:$imp, scope:$scope, _rankkey:[$iw,$sw,(-$age)]}
  ) | sort_by(._rankkey) | to_entries | map(.value + {rank:(.key+1)}) | map(del(._rankkey))
')"

jq -n --arg repo "$repo" --argjson res "$res" --argjson items "$classified" '
  {schema:"work-items/v1", available:true, repo:$repo, project:$res.project, host:$res.host,
   counts:{ total:($items|length),
            critical:[$items[]|select(.importance=="critical")]|length,
            high:[$items[]|select(.importance=="high")]|length,
            medium:[$items[]|select(.importance=="medium")]|length,
            low:[$items[]|select(.importance=="low")]|length },
   items:$items}'
