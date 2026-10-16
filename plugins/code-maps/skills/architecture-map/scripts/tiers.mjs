#!/usr/bin/env node
// One command for the whole chain: the graph (java-diagrams, with the jdeps cross-check), then for
// each map document: project + verify, pack the page, check it in Chrome.
//
//   node tiers.mjs --classes target/classes [--classes ...] --map a.map.json [--map ...] --out-dir dist
//   a tier-0 document yields <name>.drawio + <name>.svg instead of a page
//                  [--graph graph.json] [--sources src/main/java] [--docs docs.json] [--sets main]
//                  [--shots dir] [--readonly] [--skip-render-check] [--accept-graph] [--write-map]
//
// Writes <out-dir>/<name>.html, .resolved.json, .verify.json, .reading.md per document, and
// <out-dir>/graph.json unless --graph names an existing one. Exits non-zero if any step fails.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const JD = join(here, '..', '..', 'java-diagrams', 'scripts');
const args = process.argv.slice(2);
const all = n => args.flatMap((a, i) => a === n ? [args[i + 1]] : []);
const one = n => all(n)[0];
const has = n => args.includes(n);
const classes = all('--classes'), maps = all('--map'), outDir = one('--out-dir');
if ((!classes.length && !one('--graph')) || !maps.length || !outDir) {
  console.error('usage: node tiers.mjs --classes <dir|jar> [--classes ...] --map doc.map.json [--map ...] --out-dir dist [--graph graph.json] [--sources dir] [--docs d.json] [--sets main] [--shots dir] [--readonly] [--skip-render-check] [--accept-graph] [--write-map]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const run = (cmd, argv) => spawnSync(cmd, argv, { stdio: 'inherit' }).status;
const step = (n, t) => console.log(`\n[${n}] ${t}`);
const die = m => { console.error('\nSTOPPED: ' + m); process.exit(1); };

let graph = one('--graph');
if (!graph || !existsSync(graph) || classes.length) {
  graph = graph || join(outDir, 'graph.json');
  step(1, 'reading class files and cross-checking against jdeps');
  const argv = [join(JD, 'run.mjs'), ...classes.flatMap(c => ['--classes', c]), '--graph-only', '--graph', graph];
  if (one('--sets')) argv.push('--sets', one('--sets'));
  if (run('node', argv) !== 0) die('the graph could not be read; nothing is drawn');
} else step(1, `using ${graph}`);

let failed = false;
for (const map of maps) {
  const name = basename(map).replace(/\.map\.json$/, '').replace(/\.json$/, '');
  const base = join(outDir, name);
  step(2, `${name}: projecting the document onto the graph`);
  const argv = [join(here, 'map.mjs'), '--graph', graph, '--map', map, '--out', base + '.resolved.json', '--report', base + '.verify.json', '--reading', base + '.reading.md'];
  for (const f of ['--sources', '--docs', '--sets']) if (one(f)) argv.push(f, one(f));
  for (const f of ['--accept-graph', '--write-map', '--prune-words', '--strict']) if (has(f)) argv.push(f);
  const st = run('node', argv);
  if (st !== 0) { console.error(`  ${name}: ${st === 3 ? 'the graph changed (re-run with --accept-graph after checking the words)' : st === 2 ? 'refused' : 'verification failed'}; no page written`); failed = true; continue; }
  if (JSON.parse(readFileSync(map, 'utf8')).meta?.tier === 0) {
    step(3, `${name}: writing the draw.io picture`);
    if (run('node', [join(here, 'drawio.mjs'), '--graph', graph, '--map', map, '--out', base + '.drawio', '--svg', base + '.svg', ...(one('--sets') ? ['--sets', one('--sets')] : []), ...(one('--sources') ? ['--sources', one('--sources')] : [])]) !== 0) failed = true;
    continue;
  }
  step(3, `${name}: packing the page`);
  const pk = [join(here, 'pack.mjs'), '--out', base + '.html', '--map', base + '.resolved.json', '--graph', graph];
  if (has('--readonly')) pk.push('--readonly');
  if (one('--sets')) pk.push('--sets', one('--sets'));
  if (run('node', pk) !== 0) { failed = true; continue; }
  if (!has('--skip-render-check')) {
    step(4, `${name}: checking the page in a browser`);
    const ck = [join(here, 'check-map.mjs'), base + '.html'];
    if (one('--shots')) ck.push('--shots', join(one('--shots'), name));
    const rc = run('node', ck);
    if (rc === 1) { console.error(`  ${name}: the page has problems (listed above)`); failed = true; }
    if (rc === 2) console.log('  no Chrome available; the page was not measured — say so when reporting.');
  }
}
if (failed) die('at least one document did not make it to a verified page');
console.log(`\nDone: ${maps.map(m => join(outDir, basename(m).replace(/\.map\.json$/, '') + (JSON.parse(readFileSync(m, 'utf8')).meta?.tier === 0 ? '.drawio' : '.html'))).join(', ')}`);
