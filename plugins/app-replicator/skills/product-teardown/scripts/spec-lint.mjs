#!/usr/bin/env node
// spec-lint — validates a product-teardown replication folder (replication/<slug>/).
// Usage: node spec-lint.mjs <dir>     Zero dependencies, Node 18+.
// Prints `[rule-id] <file>:<line> <message>` per finding; exit 1 if any, else 0.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node spec-lint.mjs <replication-dir>'); process.exit(2); }
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { console.error(`spec-lint: not a directory: ${dir}`); process.exit(2); }

const HEADINGS = [
  '## 0 · Header', '## 1 · Product overview', '## 2 · Surface map', '## 3 · Feature inventory',
  '## 4 · Behaviour specs', '## 5 · Interaction details', '## 6 · State model', '## 7 · Data and API',
  '## 8 · Design layer', '## 9 · Asset catalogue', '## 10 · Clean-room rules and non-goals',
  '## 11 · Unverified register', '## 12 · Genesis hand-off',
];
const BANNER = '> **NOT A LIVE TEARDOWN** — behaviour rows are documented or unverified only.';
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.webm', '.opus']);
const TABLE_FILES = ['SPEC.md', 'api-map.md', 'assets.md'];
const PLACEHOLDER_FILES = ['SPEC.md', 'api-map.md', 'assets.md', 'PROGRESS.md', 'design-tokens.json'];
const EMPTY_EV = new Set(['', '—', '–', '-']);

const findings = [];
const counts = { tables: 0, rows: 0, M: 0, O: 0, D: 0, I: 0, U: 0 };
const report = (rule, file, line, msg) => findings.push({ rule, file, line, msg });
const read = (f) => { const p = path.join(dir, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };

// ---- markdown helpers -------------------------------------------------------
// Returns lines with a flag telling whether each sits inside a ``` / ~~~ fence.
function fenceMask(lines) {
  let fence = null;
  return lines.map((l) => {
    const m = l.match(/^\s*(```+|~~~+)/);
    if (m) {
      if (!fence) { fence = m[1][0]; return true; }
      if (m[1][0] === fence) { fence = null; return true; }
    }
    return fence !== null;
  });
}
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim());
}
const isSep = (line) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line.trim());
// Parse tables; each: {header, headerLine, rows:[{cells, line}], section}
function parseTables(text) {
  const lines = text.split('\n');
  const fenced = fenceMask(lines);
  const tables = [];
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    if (/^## /.test(lines[i])) section = lines[i].trim();
    if (!lines[i].trim().startsWith('|')) continue;
    if (i + 1 < lines.length && !fenced[i + 1] && isSep(lines[i + 1])) {
      const t = { header: splitRow(lines[i]), headerLine: i + 1, rows: [], section };
      let j = i + 2;
      for (; j < lines.length && !fenced[j] && lines[j].trim().startsWith('|'); j++) {
        t.rows.push({ cells: splitRow(lines[j]), line: j + 1 });
      }
      tables.push(t);
      i = j - 1;
    }
  }
  return tables;
}

// ---- evidence-cell validation ------------------------------------------------
const evidenceDir = path.join(dir, 'evidence');
function evidenceExists(ref) {
  const candidates = [ref, ref.split(/\s+/)[0]].map((r) => r.replace(/^evidence\//, ''));
  return candidates.some((r) => r && !r.includes('..') && fs.existsSync(path.join(evidenceDir, r)));
}
// `context` = text of the row/token outside the ev cell and ID column (for the M digit check).
function checkEv(cell, context, file, line, unverifiedIds) {
  const raw = (cell ?? '').trim();
  if (EMPTY_EV.has(raw)) { report('ev-missing', file, line, 'ev cell is empty'); return; }
  for (const part of raw.split(';').map((p) => p.trim())) {
    if (!part) { report('ev-missing', file, line, `empty ref in "${raw}"`); continue; }
    const m = part.match(/^([A-Za-z])\s+(\S.*)$/);
    if (!m || !'MODIU'.includes(m[1])) {
      report('ev-class', file, line, `bad ev ref "${part}" (want "<M|O|D|I|U> <ref>")`);
      continue;
    }
    const [, cls, ref] = m;
    counts[cls]++;
    if (cls === 'M' && !/\d/.test(context)) {
      report('ev-measured-no-number', file, line, `measured ref "${part}" but the row has no number`);
    } else if (cls === 'O' && !evidenceExists(ref.trim())) {
      report('ev-file-missing', file, line, `observed ref "${ref}" not found under evidence/`);
    } else if (cls === 'U') {
      const id = ref.trim();
      if (!/^U-\d{2,}$/.test(id)) report('ev-unverified-unregistered', file, line, `"${id}" is not a U-NN id`);
      else if (!unverifiedIds.has(id)) report('ev-unverified-unregistered', file, line, `${id} is not registered in §11`);
    }
  }
}

// ---- SPEC.md structure ---------------------------------------------------------
const spec = read('SPEC.md');
const unverifiedIds = new Set();
if (spec === null) {
  report('headings', 'SPEC.md', 0, 'SPEC.md is missing');
} else {
  const lines = spec.split('\n');
  const fenced = fenceMask(lines);
  const h2 = [];
  lines.forEach((l, i) => { if (!fenced[i] && /^## /.test(l)) h2.push({ text: l.trimEnd(), line: i + 1 }); });
  const got = h2.map((h) => h.text);
  for (const h of HEADINGS) if (!got.includes(h)) report('headings', 'SPEC.md', 0, `missing heading "${h}"`);
  for (const h of h2) if (!HEADINGS.includes(h.text)) report('headings', 'SPEC.md', h.line, `unexpected heading "${h.text}"`);
  const known = got.filter((h) => HEADINGS.includes(h));
  const expectedOrder = HEADINGS.filter((h) => known.includes(h));
  if (known.join('\n') !== expectedOrder.join('\n')) report('headings', 'SPEC.md', 0, 'headings out of order or duplicated');

  // §0 mode line
  const s0 = h2.find((h) => h.text === HEADINGS[0]);
  let mode = null;
  if (s0) {
    const next = h2.find((h) => h.line > s0.line);
    const body = lines.slice(s0.line, next ? next.line - 1 : lines.length);
    for (const l of body) { const m = l.trim().match(/^\*\*Mode:\*\*\s*(live|degraded)\s*$/); if (m) { mode = m[1]; break; } }
  }
  if (!mode) report('mode-missing', 'SPEC.md', s0 ? s0.line : 0, '§0 has no "**Mode:** live|degraded" line');
  if (mode === 'degraded') {
    const h1 = lines.findIndex((l, i) => !fenced[i] && /^# /.test(l));
    let k = h1 + 1;
    while (h1 >= 0 && k < lines.length && lines[k].trim() === '') k++;
    if (h1 < 0 || lines[k]?.trim() !== BANNER) {
      report('degraded-banner', 'SPEC.md', h1 + 1 || 1, 'degraded mode requires the NOT A LIVE TEARDOWN banner right after the H1');
    }
  }
  // §11 register ids (pre-pass so U refs anywhere can be resolved)
  for (const t of parseTables(spec)) {
    if (t.section !== HEADINGS[11]) continue;
    for (const r of t.rows) if (/^U-\d{2,}$/.test(r.cells[0])) unverifiedIds.add(r.cells[0]);
  }
}

// ---- tables in SPEC / api-map / assets ----------------------------------------------
for (const f of TABLE_FILES) {
  const text = read(f);
  if (text === null) continue;
  for (const t of parseTables(text)) {
    counts.tables++;
    const last = t.header[t.header.length - 1];
    if (last !== 'ev') { report('ev-missing', f, t.headerLine, `table's last column is "${last}", expected "ev"`); continue; }
    const evIdx = t.header.length - 1;
    for (const r of t.rows) {
      counts.rows++;
      const context = r.cells.filter((_, i) => i !== 0 && i !== evIdx).join(' | ');
      checkEv(r.cells.length > evIdx ? r.cells[evIdx] : '', context, f, r.line, unverifiedIds);
    }
  }
}

// ---- placeholders ------------------------------------------------------------------
for (const f of PLACEHOLDER_FILES) {
  const text = read(f);
  if (text === null) continue;
  text.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/\{\{[^}]*\}\}/g)) report('placeholder', f, i + 1, `unfilled placeholder ${m[0]}`);
  });
}

// ---- design-tokens.json ----------------------------------------------------------------
const tokText = read('design-tokens.json');
if (tokText === null) {
  report('tokens-json', 'design-tokens.json', 0, 'file is missing');
} else {
  let tok = null;
  try { tok = JSON.parse(tokText); } catch (e) { report('tokens-json', 'design-tokens.json', 0, `invalid JSON: ${e.message}`); }
  if (tok) {
    const tlines = tokText.split('\n');
    const lineOf = (key) => { const i = tlines.findIndex((l) => l.includes(`"${key}"`)); return i + 1; };
    for (const k of ['viewport', 'date', 'source']) {
      if (tok._meta?.[k] === undefined || tok._meta[k] === '') report('tokens-json', 'design-tokens.json', lineOf('_meta'), `_meta.${k} is missing`);
    }
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    const walk = (node, p) => {
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith('_') || !isObj(v)) continue;
        const isLeaf = 'value' in v || 'uses' in v || 'ev' in v || !Object.values(v).some(isObj);
        if (!isLeaf) { walk(v, `${p}${k}.`); continue; }
        const ln = lineOf(k);
        const miss = ['value', 'uses', 'ev'].filter((f) => !(f in v));
        if (miss.length) report('tokens-json', 'design-tokens.json', ln, `token ${p}${k} lacks ${miss.join(', ')}`);
        if ('ev' in v) checkEv(String(v.ev), JSON.stringify(v.value ?? '') + ' ' + JSON.stringify(v.uses ?? ''), 'design-tokens.json', ln, unverifiedIds);
      }
    };
    walk(tok, '');
  }
}

// ---- evidence/: no audio files ---------------------------------------------------------
(function scan(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) scan(p);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      report('audio-downloaded', path.relative(dir, p), 0, 'audio file in evidence/ — catalogue audio, never download');
    }
  }
})(evidenceDir);

// ---- output ------------------------------------------------------------------------------
for (const f of findings) console.log(`[${f.rule}] ${f.file}:${f.line} ${f.msg}`);
if (findings.length) {
  console.log(`spec-lint: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(`spec-lint: OK (tables ${counts.tables}, rows ${counts.rows}, M ${counts.M} / O ${counts.O} / D ${counts.D} / I ${counts.I} / U ${counts.U})`);
