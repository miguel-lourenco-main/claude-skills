'use strict';
/**
 * Minimal, dependency-free YAML-frontmatter parse/serialize for our FLAT note format
 * (scalars + single-line inline arrays only). Shared by extract.cjs and build-index.cjs
 * so we never need PyYAML / js-yaml. Keep notes to this flat shape.
 */

function unquote(s) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const inner = s.slice(1, -1);
    if (s[0] === '"') {
      try { return JSON.parse(s); } catch { return inner; }
    }
    return inner;
  }
  return s;
}

function splitTopLevelCommas(s) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function parseValue(v) {
  v = v.trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevelCommas(inner).map((x) => unquote(x));
  }
  return unquote(v);
}

/** parse(md) -> { data, body } ; data values are strings | string[] (numbers/dates left as strings). */
function parse(md) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!m) return { data: {}, body: md };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line);
    if (!mm) continue;
    data[mm[1]] = parseValue(mm[2]);
  }
  return { data, body: md.slice(m[0].length) };
}

function serializeScalar(v) {
  if (typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '') return '""';
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;          // numeric string -> bare
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;       // ISO date -> bare
  if (/^(true|false)$/.test(s)) return s;
  return JSON.stringify(s);                          // everything else -> double-quoted
}

function serializeValue(v) {
  if (Array.isArray(v)) return '[' + v.map(serializeScalar).join(', ') + ']';
  return serializeScalar(v);
}

/** stringify(data, keyOrder?) -> "---\n...\n---\n" */
function stringify(data, keyOrder) {
  const keys = keyOrder
    ? keyOrder.filter((k) => k in data).concat(Object.keys(data).filter((k) => !keyOrder.includes(k)))
    : Object.keys(data);
  const lines = ['---'];
  for (const k of keys) lines.push(`${k}: ${serializeValue(data[k])}`);
  lines.push('---');
  return lines.join('\n') + '\n';
}

/** Replace text between `<!-- MARK:START -->`/`<!-- MARK:END -->` or `%% MARK:START %%`/`%% MARK:END %%`. */
function replaceRegion(body, mark, replacement) {
  const re = new RegExp(
    `(%%\\s*${mark}:START[^\\n]*%%|<!--\\s*${mark}:START[^>]*-->)([\\s\\S]*?)(%%\\s*${mark}:END\\s*%%|<!--\\s*${mark}:END\\s*-->)`,
  );
  if (!re.test(body)) return null;
  return body.replace(re, (_m, start, _mid, end) => `${start}\n${replacement}\n${end}`);
}

module.exports = { parse, stringify, serializeValue, serializeScalar, replaceRegion };
