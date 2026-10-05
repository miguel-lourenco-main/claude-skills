/**
 * ci-log.mjs — shared report-style logging for GitLab CI job logs (node side).
 *
 * Mirrors ci-log.sh: one-line header, GitLab collapsible sections, glyph-prefixed
 * status lines (✓ ! ✖ → ·), aligned key/value details, end-of-job verdict.
 * Zero dependencies. Honors NO_COLOR, FORCE_COLOR, CI_LOG_ASCII, CI_LOG_WIDTH.
 *
 * Sections are appended to the same per-job state file as ci-log.sh
 * ($CI_LOG_STATE/events.tsv), so a job that mixes shell and node steps still
 * gets one timeline from `ci_finish`.
 *
 * Scripts whose stdout is a machine-readable contract should bind everything
 * to stderr:  const log = createCiLog({ stream: process.stderr });
 * GitLab renders both streams in the job log, so styling is preserved.
 */
import { appendFileSync } from 'node:fs';

const env = process.env;
const forced = (env.FORCE_COLOR && env.FORCE_COLOR !== '0') || (env.CLICOLOR_FORCE && env.CLICOLOR_FORCE !== '0');
const colorsEnabled = !env.NO_COLOR && Boolean(forced || env.GITLAB_CI || env.GITHUB_ACTIONS || process.stdout.isTTY);

const C = colorsEnabled
  ? {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
    }
  : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', cyan: '' };

/** Single-cell glyphs only; emoji break column alignment in the job page. */
export const sym = env.CI_LOG_ASCII
  ? { ok: 'ok', warn: '!', fail: 'x', arrow: '->', info: '-', heavy: '=', light: '-', sep: '|' }
  : { ok: '✓', warn: '!', fail: '✖', arrow: '→', info: '·', heavy: '━', light: '─', sep: '·' };

const WIDTH = Number(env.CI_LOG_WIDTH) || 78;

function now() {
  return Math.floor(Date.now() / 1000);
}

function event(kind, id, detail = '') {
  if (!env.CI_LOG_STATE) return;
  try {
    appendFileSync(`${env.CI_LOG_STATE}/events.tsv`, `${kind}\t${now()}\t${id}\t${String(detail).replace(/[\t\n]/g, ' ')}\n`);
  } catch {
    // The timeline is a nicety; never fail a job over it.
  }
}

function rule(char, text) {
  return `${char}${char} ${text} ${char.repeat(Math.max(3, WIDTH - [...text].length - 4))}`;
}

/** "k=v k=v" rendering that keeps tokens greppable as plain text. */
function renderFields(fields = {}) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`);
  return parts.length > 0 ? ` ${C.dim}${parts.join(' ')}${C.reset}` : '';
}

/**
 * Build a logger bound to one stream (default stdout).
 * All exported top-level helpers are the stdout-bound instance.
 */
export function createCiLog({ stream = process.stdout } = {}) {
  const write = (line) => stream.write(`${line}\n`);

  const api = {
    sectionStart(id, title, { collapsed = true } = {}) {
      const mode = collapsed ? '[collapsed=true]' : '';
      event('open', id, title);
      write(
        `\x1b[0Ksection_start:${now()}:${id}${mode}\r\x1b[0K${C.bold}${C.cyan}${title}${C.reset}`,
      );
    },
    sectionEnd(id, exitCode = 0) {
      event('close', id, exitCode);
      write(`\x1b[0Ksection_end:${now()}:${id}\r\x1b[0K`);
    },
    header(title, subtitle) {
      write('');
      write(`${C.bold}${C.cyan}${rule(sym.heavy, title)}${C.reset}`);
      if (subtitle) write(`${C.dim}   ${subtitle}${C.reset}`);
    },
    banner(title, subtitle) {
      api.header(title, subtitle);
    },
    hr() {
      write(`${C.dim}${sym.light.repeat(WIDTH)}${C.reset}`);
    },
    step(msg, fields) {
      write(`  ${C.bold}${sym.arrow} ${msg}${C.reset}${renderFields(fields)}`);
    },
    ok(msg, fields) {
      write(`  ${C.green}${sym.ok}${C.reset} ${msg}${renderFields(fields)}`);
    },
    warn(msg, fields) {
      write(`  ${C.yellow}${sym.warn}${C.reset} ${msg}${renderFields(fields)}`);
    },
    fail(msg, fields) {
      write(`  ${C.red}${sym.fail} ${msg}${C.reset}${renderFields(fields)}`);
    },
    info(msg, fields) {
      write(`  ${C.dim}${sym.info} ${msg}${C.reset}${renderFields(fields)}`);
    },
    kv(key, value, { pad = 16 } = {}) {
      write(`    ${C.dim}${String(key).padEnd(pad)}${C.reset} ${value}`);
    },
    /** Verdict as the last line of a node-only job. Shell jobs use ci_finish. */
    verdict(title, { failed = false, detail } = {}) {
      const text = `${failed ? `${sym.fail} FAILED` : `${sym.ok} PASSED`} ${sym.sep} ${title}${detail ? ` ${sym.sep} ${detail}` : ''}`;
      write(`${C.bold}${failed ? C.red : C.green}${rule(sym.heavy, text)}${C.reset}`);
    },
    summaryOpen(title) {
      api.sectionStart('summary', `Summary ${sym.sep} ${title}`, { collapsed: false });
    },
    summaryClose() {
      api.sectionEnd('summary');
    },
  };

  return api;
}

const defaultLog = createCiLog();

export const sectionStart = defaultLog.sectionStart;
export const sectionEnd = defaultLog.sectionEnd;
export const header = defaultLog.header;
export const banner = defaultLog.banner;
export const hr = defaultLog.hr;
export const step = defaultLog.step;
export const ok = defaultLog.ok;
export const warn = defaultLog.warn;
export const fail = defaultLog.fail;
export const info = defaultLog.info;
export const kv = defaultLog.kv;
export const verdict = defaultLog.verdict;
export const summaryOpen = defaultLog.summaryOpen;
export const summaryClose = defaultLog.summaryClose;
