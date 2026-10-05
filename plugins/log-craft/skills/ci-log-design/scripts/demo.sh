#!/bin/sh
# demo.sh — print the whole visual language of ci-log.sh, as two fake jobs.
#
#   sh demo.sh                 colors + collapsible markers, for a real terminal
#   sh demo.sh --trace pass    a runner-shaped trace of the passing job (feed to ci_log_audit.py)
#   sh demo.sh --trace fail    same for the failing job
#   CI_LOG_LIB=path/to/ci-log.sh sh demo.sh     try another copy of the library
#
# Works under sh, dash, bash and busybox ash; run it under each to check a change.
HERE="$(cd "$(dirname "$0")" && pwd)"
LIB="${CI_LOG_LIB:-$HERE/../assets/ci-log.sh}"

noisy() {    # stand-in for an installer: lots of output nobody reads when it works
  i=1; while [ "$i" -le "${1:-40}" ]; do echo "  fetched package-$i@1.$i.0"; i=$((i + 1)); done
  sleep "${2:-1}"
}

broken_build() {
  noisy 60 2
  echo "./app/error.tsx:7:8"
  echo "Module not found: Can't resolve '@next/font/google/target.css'"
  echo "   5 | import { cn } from '@/lib/utils'"
  echo ">  7 | import { Archivo_Narrow } from 'next/font/google'"
  echo "https://nextjs.org/docs/messages/module-not-found"
  i=1; while [ "$i" -le 80 ]; do echo "    at <unknown> ([next]/internal/font/google/archivo.module.css:$i:8)"; i=$((i + 1)); done
  echo " ELIFECYCLE  Command failed with exit code 1."
  return 1
}

job_pass() (
  CI_LOG_STATE="$(mktemp -d)"; export CI_LOG_STATE; unset CI_LOG_SH_LOADED
  . "$LIB"
  ci_header "Deploy ${CI_LOG_G_SEP} production" "scripts/vercel-deploy-ci.sh production"
  ci_kv environment production
  ci_kv commit "8d79723b  fix(vercel): promote production domains"
  ci_run vercel_cli "Install vercel@54.2.0" -- noisy 40 2
  ci_run vercel_pull "Pull project settings" -- noisy 8 1
  ci_section_start vercel_ready "Wait for the deployment to be READY"
  ci_info "state: INITIALIZING (1s)"; sleep 3; ci_info "state: READY (4s)"
  ci_section_end vercel_ready
  ci_warn "build cache was empty, this deploy was a cold build"
  ci_kv url "https://example-hc912echy.vercel.app"
  ci_bar "bundle budget" 412 500 "412 / 500 kB"
  printf 'route\tsize\tfirst load\n/\t5.2 kB\t101 kB\n/jobs/[id]\t18.9 kB\t134 kB\n/settings\t2.1 kB\t98 kB\n' | ci_table
  ci_finish "Deploy production" 0
  rm -rf "$CI_LOG_STATE"
)

job_fail() (
  CI_LOG_STATE="$(mktemp -d)"; export CI_LOG_STATE; unset CI_LOG_SH_LOADED
  . "$LIB"
  ci_header "Build" "pnpm build"
  ci_run toolchain "Toolchain: corepack + pnpm install" -- noisy 30 1
  ci_run build "Build" -- broken_build
  rc=$?
  ci_finish "Build" "$rc"
  rm -rf "$CI_LOG_STATE"
  return "$rc"
)

if [ "${1:-}" = "--trace" ]; then
  # Frame the job the way gitlab-runner does, so the auditor sees a real shape.
  GITLAB_CI=true; export GITLAB_CI
  t="$(date +%s)"
  printf 'section_start:%s:step_script\r\033[0KExecuting "step_script" stage of the job script\n' "$t"
  echo '$ # run the job # collapsed multi-line command'
  if [ "${2:-pass}" = "fail" ]; then job_fail; rc=$?; else job_pass; rc=$?; fi
  printf 'section_end:%s:step_script\r\033[0K\n' "$(date +%s)"
  if [ "$rc" = 0 ]; then echo "Job succeeded"; else echo "ERROR: Job failed: exit code $rc"; fi
  exit 0
fi

job_pass
echo
job_fail || :
