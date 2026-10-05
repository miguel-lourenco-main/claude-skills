# ci-log.sh — shared report-style logging for GitLab CI job logs.
#
# POSIX sh (runs on busybox/alpine ash, dash and bash). Source it, don't execute it:
#   . "$(cd "$(dirname "$0")" && pwd)/lib/ci-log.sh"
#
# Defines the visual language for every job log once:
#   ci_header <title> [subtitle]               one-line job title set in a rule
#   ci_run <id> <title> -- <cmd...>            run a noisy command folded in a collapsed section;
#                                              silent on success, failure card on failure
#   ci_section_start <id> <title> [expanded]   GitLab collapsible section (collapsed by default)
#   ci_section_end <id> [exit-code]            must pair with the start id ([a-zA-Z0-9_.-] only)
#   ci_step <msg>                              "  → msg"   (bold)
#   ci_ok <msg>                                "  ✓ msg"   (green)
#   ci_warn <msg>                              "  ! msg"   (yellow)
#   ci_fail <msg>                              "  ✖ msg"   (red)
#   ci_info <msg>                              "  · msg"   (dim)
#   ci_kv <key> <value>                        aligned dim key column (ASCII keys)
#   ci_bar <label> <value> <max> [text]        one proportional bar: coverage, quota, share
#   ci_table                                   aligned table from TSV on stdin, first row = header
#   ci_hr                                      dim horizontal rule
#   ci_finish [title] [exit-code]              end-of-job block: where the time went, then the
#                                              verdict as the last line
#   ci_finish_on_exit [title]                  arm ci_finish on shell exit (bash/ash/dash)
#   ci_banner, ci_summary, ci_summary_end      kept for older callers
#
# Behavior toggles:
#   NO_COLOR=<any>         disable ANSI colors (sections still work)
#   CI_LOG_ASCII=1         7-bit glyphs only ( ok / x / -> / # bars )
#   CI_LOG_WIDTH=<n>       rule width in cells (default 78)
#   CI_LOG_STREAM=stderr   route ALL helper output to stderr (for scripts whose
#                          stdout is a machine-readable contract; GitLab renders
#                          both streams in the job log)
#   CI_LOG_ERROR_RE=<ere>  what counts as the first error line in a failure card

if [ -n "${CI_LOG_SH_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
CI_LOG_SH_LOADED=1

# Color on when a CI viewer or a terminal will render it; never when NO_COLOR is set.
_ci_color=0
if [ -z "${NO_COLOR:-}" ]; then
  if [ -n "${GITLAB_CI:-}${GITHUB_ACTIONS:-}" ] || [ -t 1 ]; then _ci_color=1; fi
  case "${FORCE_COLOR:-0}${CLICOLOR_FORCE:-0}" in 00) ;; *) _ci_color=1 ;; esac
fi
if [ "$_ci_color" = 1 ]; then
  CI_LOG_RESET="$(printf '\033[0m')"
  CI_LOG_BOLD="$(printf '\033[1m')"
  CI_LOG_DIM="$(printf '\033[2m')"
  CI_LOG_RED="$(printf '\033[31m')"
  CI_LOG_GREEN="$(printf '\033[32m')"
  CI_LOG_YELLOW="$(printf '\033[33m')"
  CI_LOG_CYAN="$(printf '\033[36m')"
else
  CI_LOG_RESET='' CI_LOG_BOLD='' CI_LOG_DIM='' CI_LOG_RED='' CI_LOG_GREEN='' CI_LOG_YELLOW='' CI_LOG_CYAN=''
fi
export CI_LOG_RESET CI_LOG_BOLD CI_LOG_DIM CI_LOG_RED CI_LOG_GREEN CI_LOG_YELLOW CI_LOG_CYAN

# One glyph set, chosen once. Every glyph is a single cell in a monospace font;
# emoji are not, which is why none appear here.
if [ -n "${CI_LOG_ASCII:-}" ]; then
  CI_LOG_G_OK='ok' CI_LOG_G_FAIL='x' CI_LOG_G_WARN='!' CI_LOG_G_STEP='->' CI_LOG_G_INFO='-'
  CI_LOG_G_HEAVY='=' CI_LOG_G_LIGHT='-' CI_LOG_G_DOT='.' CI_LOG_G_SEP='|'
  CI_LOG_G_BAR='#' CI_LOG_G_TRACK='.' CI_LOG_G_EIGHTHS=''
else
  CI_LOG_G_OK='✓' CI_LOG_G_FAIL='✖' CI_LOG_G_WARN='!' CI_LOG_G_STEP='→' CI_LOG_G_INFO='·'
  CI_LOG_G_HEAVY='━' CI_LOG_G_LIGHT='─' CI_LOG_G_DOT='┄' CI_LOG_G_SEP='·'
  CI_LOG_G_BAR='█' CI_LOG_G_TRACK='░' CI_LOG_G_EIGHTHS='▏▎▍▌▋▊▉'
fi
CI_LOG_WIDTH="${CI_LOG_WIDTH:-78}"
export CI_LOG_G_OK CI_LOG_G_FAIL CI_LOG_G_WARN CI_LOG_G_STEP CI_LOG_G_INFO CI_LOG_G_HEAVY \
  CI_LOG_G_LIGHT CI_LOG_G_DOT CI_LOG_G_SEP CI_LOG_G_BAR CI_LOG_G_TRACK CI_LOG_G_EIGHTHS CI_LOG_WIDTH

# Per-job state: section open/close events and captured command output. Exported
# so child scripts and after_script (a separate shell) append to the same job.
if [ -z "${CI_LOG_STATE:-}" ]; then
  CI_LOG_STATE="${TMPDIR:-/tmp}/ci-log-${CI_JOB_ID:-$$}"
  export CI_LOG_STATE
fi
if mkdir -p "$CI_LOG_STATE" 2>/dev/null; then
  [ -f "$CI_LOG_STATE/events.tsv" ] || printf 'begin\t%s\n' "$(date +%s)" >"$CI_LOG_STATE/events.tsv"
else
  CI_LOG_STATE=''
fi

_ci_event() {
  [ -n "$CI_LOG_STATE" ] || return 0
  printf '%s\t%s\t%s\t%s\n' "$1" "$(date +%s)" "$2" "$(printf '%s' "${3:-}" | tr '\t\n' '  ')" \
    >>"$CI_LOG_STATE/events.tsv" 2>/dev/null || :
}

# Single output gates; honor CI_LOG_STREAM=stderr. Color vars hold rendered
# escape bytes already, so plain %s is correct (and never mangles messages).
_ci_out() {
  if [ "${CI_LOG_STREAM:-stdout}" = "stderr" ]; then
    printf '%s\n' "$*" >&2
  else
    printf '%s\n' "$*"
  fi
}

_ci_pipe() {
  if [ "${CI_LOG_STREAM:-stdout}" = "stderr" ]; then cat >&2; else cat; fi
}

# Character count that is right in any locale (dash and busybox count bytes).
_ci_len() {
  _CI_S="$1" awk 'BEGIN { s = ENVIRON["_CI_S"]; if (length("é") == 2) gsub(/[\200-\277]/, "", s); print length(s) }'
}

_ci_rep() {
  [ "$2" -gt 0 ] 2>/dev/null || return 0
  printf '%*s' "$2" '' | sed "s/ /$1/g"
}

# "<indent>━━ text ━━━━━" filled to CI_LOG_WIDTH:  _ci_rule <char> <text> <color> [indent]
_ci_rule() {
  _clr_n=$(( CI_LOG_WIDTH - $(_ci_len "${4:-}$2") - 4 ))
  [ "$_clr_n" -ge 3 ] || _clr_n=3
  _ci_out "${4:-}$3$1$1 $2 $(_ci_rep "$1" "$_clr_n")${CI_LOG_RESET}"
}

# GitLab collapsible-section magic. \033[0K clears the line so the marker
# itself never renders; the timestamp pair gives the section a duration badge.
ci_section_start() {
  _cls_id="${1:?section id required}"
  _cls_title="${2:-$1}"
  _cls_collapsed='[collapsed=true]'
  if [ "${3:-}" = "expanded" ]; then
    _cls_collapsed=''
  fi
  _ci_event open "$_cls_id" "$_cls_title"
  printf '\033[0Ksection_start:%s:%s%s\r\033[0K%s%s%s\n' \
    "$(date +%s)" "$_cls_id" "$_cls_collapsed" \
    "${CI_LOG_BOLD}${CI_LOG_CYAN}" "$_cls_title" "$CI_LOG_RESET" | _ci_pipe
}

ci_section_end() {
  _cle_id="${1:?section id required}"
  _ci_event close "$_cle_id" "${2:-0}"
  printf '\033[0Ksection_end:%s:%s\r\033[0K\n' "$(date +%s)" "$_cle_id" | _ci_pipe
}

ci_header() {
  _ci_out ""
  _ci_rule "$CI_LOG_G_HEAVY" "${1:-}" "${CI_LOG_BOLD}${CI_LOG_CYAN}"
  if [ -n "${2:-}" ]; then
    _ci_out "${CI_LOG_DIM}   $2${CI_LOG_RESET}"
  fi
}

ci_banner() { ci_header "$@"; }

ci_hr() {
  _ci_out "${CI_LOG_DIM}$(_ci_rep "$CI_LOG_G_LIGHT" "$CI_LOG_WIDTH")${CI_LOG_RESET}"
}

ci_step() { _ci_out "  ${CI_LOG_BOLD}${CI_LOG_G_STEP} $*${CI_LOG_RESET}"; }
ci_ok()   { _ci_out "  ${CI_LOG_GREEN}${CI_LOG_G_OK}${CI_LOG_RESET} $*"; }
ci_warn() { _ci_out "  ${CI_LOG_YELLOW}${CI_LOG_G_WARN}${CI_LOG_RESET} $*"; }
ci_fail() { _ci_out "  ${CI_LOG_RED}${CI_LOG_G_FAIL} $*${CI_LOG_RESET}"; }
ci_info() { _ci_out "  ${CI_LOG_DIM}${CI_LOG_G_INFO} $*${CI_LOG_RESET}"; }

# Aligned key/value detail line:  "    key              value"
ci_kv() {
  _clk_key="${1:-}"
  shift 2>/dev/null || true
  _ci_out "$(printf '    %s%-16s%s %s' "$CI_LOG_DIM" "$_clk_key" "$CI_LOG_RESET" "$*")"
}

# "    coverage         ████████████▌░░░░░░░  63%"  — value against max, 20 cells.
ci_bar() {
  awk -v label="${1:-}" -v v="${2:-0}" -v max="${3:-100}" -v text="${4:-}" 'BEGIN {
    if (max <= 0) max = 1
    if (v < 0) v = 0
    if (v > max) v = max
    cells = v / max * 20; full = int(cells); frac = int((cells - full) * 8)
    for (i = 0; i < full; i++) bar = bar ENVIRON["CI_LOG_G_BAR"]
    used = full
    if (frac > 0 && ENVIRON["CI_LOG_G_EIGHTHS"] != "") {
      n = split(ENVIRON["CI_LOG_G_EIGHTHS"], e8, ""); per = n / 7
      part = ""; for (i = (frac - 1) * per + 1; i <= frac * per; i++) part = part e8[i]
      bar = bar part; used++
    }
    for (i = used; i < 20; i++) track = track ENVIRON["CI_LOG_G_TRACK"]
    if (text == "") text = sprintf("%3d%%", v / max * 100 + 0.5)
    printf "    %s%-16s%s %s%s%s%s  %s\n", ENVIRON["CI_LOG_DIM"], label, ENVIRON["CI_LOG_RESET"], bar, ENVIRON["CI_LOG_DIM"], track, ENVIRON["CI_LOG_RESET"], text
  }' | _ci_pipe
}

# Aligned table from tab-separated stdin. First row is the header; columns that
# hold only numbers are right-aligned.
ci_table() {
  awk -F '\t' '
    function w(s) { if (bytes) gsub(/[\200-\277]/, "", s); return length(s) }
    function pad(s, n, right,   p, k) { p = ""; for (k = n - w(s); k > 0; k--) p = p " "; return right ? p s : s p }
    BEGIN { bytes = (length("é") == 2) }
    { rows = NR
      if (NF > cols) cols = NF
      for (i = 1; i <= NF; i++) {
        cell[NR, i] = $i
        if (w($i) > width[i]) width[i] = w($i)
        if (NR > 1 && $i !~ /^[-+]?[0-9][0-9.,]*[%a-zA-Z]*$/) text[i] = 1
      }
    }
    END {
      E["d"] = ENVIRON["CI_LOG_DIM"]; E["r"] = ENVIRON["CI_LOG_RESET"]
      for (r = 1; r <= rows; r++) {
        line = "   "
        for (i = 1; i <= cols; i++) line = line " " pad(cell[r, i], width[i], !text[i]) " "
        sub(/ +$/, "", line)
        print (r == 1 ? E["d"] line E["r"] : line)
        if (r == 1) {
          line = "   "
          for (i = 1; i <= cols; i++) {
            seg = ""; for (k = 0; k < width[i]; k++) seg = seg ENVIRON["CI_LOG_G_LIGHT"]
            line = line " " seg " "
          }
          sub(/ +$/, "", line)
          print E["d"] line E["r"]
        }
      }
    }' | _ci_pipe
}

# Run a noisy command folded inside a collapsed section and keep quiet when it
# works. When it fails, print a failure card *outside* the fold: what failed,
# the first error line with context, and the last lines of output.
#   ci_run build "Build" -- pnpm build
# The command runs in a subshell with stderr merged into stdout, so do not use it
# for `cd`/`export` steps or for commands whose stdout is consumed by a pipe.
ci_run() {
  _crn_id="${1:?section id required}"
  _crn_title="${2:?title required}"
  shift 2
  [ "${1:-}" = "--" ] && shift
  _crn_log="${CI_LOG_STATE:-${TMPDIR:-/tmp}}/${_crn_id}.log"
  _crn_t0="$(date +%s)"
  ci_section_start "$_crn_id" "$_crn_title"
  # `&& ||` keeps errexit from killing the subshell before the status is saved.
  { "$@" 2>&1 && echo 0 >"$_crn_log.rc" || echo "$?" >"$_crn_log.rc"; } | tee "$_crn_log" | _ci_pipe
  _crn_rc="$(cat "$_crn_log.rc" 2>/dev/null || echo 1)"
  ci_section_end "$_crn_id" "$_crn_rc"
  if [ "$_crn_rc" != 0 ]; then
    _ci_failure_card "$_crn_title" "$_crn_rc" "$(( $(date +%s) - _crn_t0 ))" "$_crn_log" "$*"
  fi
  return "$_crn_rc"
}

_ci_failure_card() {
  ci_fail "$1 failed ${CI_LOG_G_SEP} exit $2 ${CI_LOG_G_SEP} $(_ci_dur "$3")"
  ci_kv command "$(printf '%s' "$5" | cut -c1-96)"
  ci_kv "full output" "expand \"$1\" above"
  _cfc_re="${CI_LOG_ERROR_RE:-(^|[^a-z])(error|fatal|failed|failure|exception|panic|cannot|not found|denied|elifecycle)}"
  _cfc_total="$(wc -l <"$4" | tr -d ' ')"
  _cfc_first="$(grep -n -i -E -m 1 "$_cfc_re" "$4" 2>/dev/null | cut -d: -f1)"
  if [ -n "$_cfc_first" ]; then
    _ci_rule "$CI_LOG_G_DOT" "first error ${CI_LOG_G_SEP} line $_cfc_first of $_cfc_total" "$CI_LOG_DIM" "  "
    awk -v n="$_cfc_first" 'NR >= n && NR < n + 8' "$4" | cut -c1-112 | sed 's/^/    /' | _ci_pipe
  fi
  if [ -z "$_cfc_first" ] || [ "$(( _cfc_first + 8 ))" -le "$_cfc_total" ]; then
    _ci_rule "$CI_LOG_G_DOT" "last lines" "$CI_LOG_DIM" "  "
    tail -n 3 "$4" | cut -c1-112 | sed 's/^/    /' | _ci_pipe
  fi
}

_ci_dur() {
  if [ "$1" -lt 60 ]; then
    printf '%ss' "$1"
  elif [ "$1" -lt 3600 ]; then
    printf '%sm %02ds' "$(( $1 / 60 ))" "$(( $1 % 60 ))"
  else
    printf '%sh %02dm' "$(( $1 / 3600 ))" "$(( $1 % 3600 / 60 ))"
  fi
}

# End-of-job block. One row per section with a bar scaled to the slowest one,
# then the verdict as the very last line, where the job page opens.
#   ci_finish "Build"            status from $CI_JOB_STATUS (after_script) or the recorded sections
#   ci_finish "Build" "$?"       status from an exit code
ci_finish() {
  [ -n "$CI_LOG_STATE" ] && [ -f "$CI_LOG_STATE/events.tsv" ] || return 0
  [ ! -f "$CI_LOG_STATE/finished" ] || return 0
  : >"$CI_LOG_STATE/finished"
  awk -F '\t' -v title="${1:-${CI_JOB_NAME:-job}}" -v status="${2:-${CI_JOB_STATUS:-}}" \
      -v now="$(date +%s)" -v W="$CI_LOG_WIDTH" '
    function w(s) { if (bytes) gsub(/[\200-\277]/, "", s); return length(s) }
    function rep(c, n,   s) { s = ""; while (n-- > 0) s = s c; return s }
    function dur(s) {
      if (s < 60) return s "s"
      if (s < 3600) return int(s / 60) "m " sprintf("%02d", s % 60) "s"
      return int(s / 3600) "h " sprintf("%02d", int(s % 3600 / 60)) "m"
    }
    BEGIN { bytes = (length("é") == 2); E8 = ENVIRON["CI_LOG_G_EIGHTHS"] }
    $1 == "begin" && !t0 { t0 = $2 }
    $1 == "open"  { n++; id[n] = $3; name[n] = $4; st[n] = $2; rc[n] = ""; last[$3] = n }
    $1 == "close" && ($3 in last) { en[last[$3]] = $2; rc[last[$3]] = $4 }
    END {
      R = ENVIRON["CI_LOG_RESET"]; D = ENVIRON["CI_LOG_DIM"]; B = ENVIRON["CI_LOG_BOLD"]
      red = ENVIRON["CI_LOG_RED"]; green = ENVIRON["CI_LOG_GREEN"]
      failed = (status != "" && status != "0" && status != "success")
      for (i = 1; i <= n; i++) {
        if (rc[i] == "") { open[i] = 1; en[i] = now }
        if (rc[i] != "" && rc[i] != "0") { failed = 1; code = rc[i] }
        d[i] = en[i] - st[i]; if (d[i] > max) max = d[i]
        if (w(name[i]) > tw) tw = w(name[i])
      }
      if (status ~ /^[1-9][0-9]*$/) code = status
      if (tw > 44) tw = 44
      if (n) {
        lead = ENVIRON["CI_LOG_G_LIGHT"] ENVIRON["CI_LOG_G_LIGHT"] " Summary "
        print ""; print D lead rep(ENVIRON["CI_LOG_G_LIGHT"], W - w(lead)) R
      }
      for (i = 1; i <= n; i++) {
        bad = (rc[i] != "" && rc[i] != "0") || (open[i] && failed)
        cells = (max > 0) ? d[i] / max * 20 : 0; full = int(cells); frac = int((cells - full) * 8)
        bar = rep(ENVIRON["CI_LOG_G_BAR"], full); used = full
        if (E8 != "" && (frac > 0 || (full == 0 && d[i] > 0))) {
          if (frac == 0) frac = 1
          m = split(E8, e8, ""); per = m / 7; part = ""
          for (k = (frac - 1) * per + 1; k <= frac * per; k++) part = part e8[k]
          bar = bar part; used++
        }
        printf "  %s%s%s %s%s  %s%s%s%s  %7s\n", (bad ? red : green), \
          (bad ? ENVIRON["CI_LOG_G_FAIL"] : ENVIRON["CI_LOG_G_OK"]), R, \
          name[i], rep(" ", tw - w(name[i])), (bad ? red : D), bar, R, rep(" ", 20 - used), dur(d[i])
      }
      S = " " ENVIRON["CI_LOG_G_SEP"] " "
      if (status == "canceled") verdict = ENVIRON["CI_LOG_G_WARN"] " CANCELED"
      else verdict = failed ? ENVIRON["CI_LOG_G_FAIL"] " FAILED" : ENVIRON["CI_LOG_G_OK"] " PASSED"
      text = verdict S title (failed && code != "" ? S "exit " code : "") (t0 ? S dur(now - t0) : "")
      H = ENVIRON["CI_LOG_G_HEAVY"]
      fill = W - w(text) - 4; if (fill < 3) fill = 3
      print B (failed ? red : green) H H " " text " " rep(H, fill) R
    }' "$CI_LOG_STATE/events.tsv" | _ci_pipe
}

# Arm ci_finish for when the shell exits, pass or fail. Use this where a job
# cannot have an after_script; otherwise call ci_finish from after_script.
ci_finish_on_exit() {
  _CI_FINISH_TITLE="${1:-}"
  trap '_ci_rc=$?; ci_finish "$_CI_FINISH_TITLE" "$_ci_rc"' EXIT
}

# Older summary API: an expanded section of ci_kv lines.
ci_summary() {
  ci_section_start "summary" "Summary ${CI_LOG_G_SEP} ${1:-}" expanded
}

ci_summary_end() {
  ci_section_end "summary"
}
