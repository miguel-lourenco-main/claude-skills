#!/usr/bin/env bash
# watch.sh — print the three ways to run the sentinel continuously, filled in
# for this machine. It does NOT install anything itself; it hands the user (and
# the model) the exact invocations so monitoring stays selectable and explicit.
# Emits sentinel-watch/v1 JSON with ready-to-use commands.
#
# Usage: watch.sh [--root <dir>] [--interval-min 15]
set -u

root="${GS_ROOT:-$HOME/Desktop/personal/projects}"; interval_min=15
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    --interval-min) interval_min="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# cron expression: every <interval_min> minutes
if [ "$interval_min" -ge 60 ] 2>/dev/null; then cron="0 */$((interval_min/60)) * * *"; else cron="*/$interval_min * * * *"; fi

jq -n --arg root "$root" --argjson im "$interval_min" --arg cron "$cron" '{
  schema:"sentinel-watch/v1",
  root:$root,
  interval_minutes:$im,
  modes:{
    oneshot:{
      what:"a single fleet sweep right now",
      how:"invoke the pipeline-sentinel skill (analyze)"
    },
    loop:{
      what:"re-sweep on an interval while this session is open; stops when you close it",
      how:("/loop " + ($im|tostring) + "m  re-run the pipeline-sentinel sweep and execute any auto-policy fixes")
    },
    cron:{
      what:"always-on monitoring independent of any session (scheduled cloud agent)",
      cron_expr:$cron,
      agent_prompt:"Run a pipeline-sentinel fleet sweep. Auto-fix only causes whose policy is \"auto\" (never the default branch); for everything else, post the report. If nothing is failing, do nothing.",
      how:"use the `schedule` skill (or CronCreate) with the cron_expr and agent_prompt above"
    }
  }
}'
