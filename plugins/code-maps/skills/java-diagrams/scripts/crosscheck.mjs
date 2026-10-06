#!/usr/bin/env node
// Independent completeness check: jdeps (shipped with the JDK) lists every class-to-class
// dependency it finds in the same class files. Every pair jdeps reports between two extracted
// types must also be in graph.json, or the extractor missed a relationship.
//
//   node crosscheck.mjs graph.json            (class roots are read from graph.json's meta)
//
// Exit 0: nothing missing. Exit 1: jdeps saw pairs the graph lacks (listed). Exit 2: could not run.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const graphPath = process.argv[2];
if (!graphPath) { console.error('usage: node crosscheck.mjs graph.json'); process.exit(2); }
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const known = new Set(graph.types.map(t => t.id));
const ours = new Set(graph.edges.map(e => e.from + ' ' + e.to));

const out = mkdtempSync(join(tmpdir(), 'jdeps-'));
const theirs = new Set();
try {
  const roots = graph.meta.roots.map(r => r.path);
  try {
    execFileSync('jdeps', ['-verbose:class', '-filter:none', '-dotoutput', out, ...roots], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error('jdeps failed: ' + (e.stderr?.toString().trim() || e.message));
    process.exit(2);
  }
  for (const f of readdirSync(out)) {
    if (f === 'summary.dot') continue;
    for (const line of readFileSync(join(out, f), 'utf8').split('\n')) {
      const m = line.match(/^\s*"([^"]+)"\s*->\s*"([^" ]+)/);
      if (!m) continue;
      const [, from, to] = m;
      if (from !== to && known.has(from) && known.has(to)) theirs.add(from + ' ' + to);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

const missing = [...theirs].filter(p => !ours.has(p)).sort();
const extra = [...ours].filter(p => !theirs.has(p)).sort();
console.log(`graph.json: ${ours.size} pairs   jdeps: ${theirs.size} pairs`);
console.log(`in jdeps but not in graph (MISSED): ${missing.length}`);
console.log(`in graph but not in jdeps (seen only by the extractor): ${extra.length}`);
if (extra.length) {
  const byKind = {};
  const idx = new Map(graph.edges.map(e => [e.from + ' ' + e.to, e]));
  for (const p of extra) {
    const k = Object.keys(idx.get(p).kinds).sort().join('+');
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log('  by kind: ' + Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
}
for (const p of missing.slice(0, 40)) console.log('  MISSED ' + p.replace(' ', ' -> '));
if (missing.length > 40) console.log(`  ... and ${missing.length - 40} more`);
process.exit(missing.length ? 1 : 0);
