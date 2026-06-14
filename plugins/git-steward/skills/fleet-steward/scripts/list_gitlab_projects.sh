#!/usr/bin/env bash
# list_gitlab_projects.sh — list projects in the authenticated GitLab account.
# Read-only. Emits a JSON array. Requires glab + auth.
#
# Usage: list_gitlab_projects.sh [--per-page 100]
set -u

per=100
while [ $# -gt 0 ]; do case "$1" in --per-page) per="$2"; shift 2 ;; *) shift ;; esac; done

command -v glab >/dev/null 2>&1 || { echo '{"schema":"fleet-gitlab/v1","error":"glab not installed","repos":[]}'; exit 0; }
glab auth status >/dev/null 2>&1 || { echo '{"schema":"fleet-gitlab/v1","error":"glab not authenticated (glab auth login)","repos":[]}'; exit 0; }

# membership=true → projects the user is a member of; paginate via glab api
raw="$(glab api --paginate "projects?membership=true&per_page=${per}&simple=true" 2>/dev/null || echo '[]')"
repos="$(jq -c '[.[] | {name:.path, project:.path_with_namespace, forge:"gitlab",
          remote_url:(.ssh_url_to_repo // .http_url_to_repo), default_branch:(.default_branch // null),
          path:null}]' <<<"$raw" 2>/dev/null || echo '[]')"

jq -n --argjson repos "$repos" '{schema:"fleet-gitlab/v1", source:"gitlab-account", count:($repos|length), repos:$repos}'
