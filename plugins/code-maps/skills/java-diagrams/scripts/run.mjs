#!/usr/bin/env node
// One command for the whole chain: extract -> cross-check against jdeps -> build + verify -> measure in Chrome.
//
//   node run.mjs --classes target/classes --out diagrams/project.html [--title Name]
//                [--classes other/target/classes ...] [--classes target/test-classes=test --sets main,test]
//                [--notes notes.json] [--dot-dir diagrams/dot] [--skip-render-check]
//
// Writes <out>, <out minus .html>.graph.json and .verify.json. Exits non-zero, and writes no page,
// if any step finds a problem.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { depsDir, install, installed } from './deps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const all = name => args.flatMap((a, i) => a === name ? [args[i + 1]] : []);
const one = name => all(name)[0];
const classes = all('--classes');
const out = one('--out');
if (!classes.length || !out) {
  console.error('usage: node run.mjs --classes <dir|jar>[=label] [--classes ...] --out <file.html> [--title T] [--notes notes.json] [--dot-dir dir] [--sets main,test] [--skip-render-check]');
  process.exit(2);
}
const step = (n, text) => console.log(`\n[${n}] ${text}`);
const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { stdio: 'inherit', ...opts });
const die = msg => { console.error('\nSTOPPED: ' + msg); process.exit(1); };

// prerequisites
const jv = spawnSync('java', ['-version'], { encoding: 'utf8' });
const major = Number((jv.stderr || '').match(/version "(\d+)/)?.[1]);
if (!major) die('no `java` on PATH. A JDK 24 or newer is needed to read class files.');
if (major < 24) die(`java ${major} found; the extractor needs JDK 24 or newer (it uses java.lang.classfile). The project itself may target any older Java version — only the JDK that runs this tool matters.`);
if (!installed()) {
  step(0, `installing Graphviz (one time) into ${depsDir()}`);
  if (!install()) die('npm install failed');
}

// stale classes: a diagram of old bytecode is a wrong diagram
const newest = (dir, ext) => {
  let t = 0;
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(ext)) t = Math.max(t, statSync(p).mtimeMs); } };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return t;
};
for (const c of classes) {
  const dir = resolve(c.replace(/=[^=/]*$/, ''));
  if (!existsSync(dir)) die(`${dir} does not exist. Compile the project first (mvn -q compile, or gradle classes).`);
  const src = [['target/classes', 'src/main/java'], ['target/test-classes', 'src/test/java'], ['build/classes/java/main', 'src/main/java'], ['build/classes/java/test', 'src/test/java']]
    .filter(([o]) => dir.endsWith(o)).map(([o, s]) => join(dir.slice(0, -o.length), s))[0];
  if (src && newest(src, '.java') > newest(dir, '.class')) {
    die(`${src} has sources newer than the classes in ${dir}. Recompile first, or the diagram will describe old code.`);
  }
}

const base = out.replace(/\.html?$/, '');
const graph = base + '.graph.json';
mkdirSync(dirname(resolve(out)), { recursive: true });

step(1, 'reading class files');
if (run('java', [join(here, 'Extract.java'), ...classes.flatMap(c => ['--classes', c]), '--out', graph]).status !== 0) die('extraction failed');

step(2, 'cross-checking against jdeps');
const cc = run('node', [join(here, 'crosscheck.mjs'), graph]);
if (cc.status === 1) die('jdeps reports dependencies the extractor did not find (listed above). Do not draw from this graph.');
if (cc.status !== 0) console.log('    jdeps could not run; continuing without the independent check — say so when reporting.');

step(3, 'building and verifying every view');
const build = ['build.mjs', graph, '--out', out, '--report', base + '.verify.json'];
for (const f of ['--title', '--notes', '--dot-dir', '--sets']) if (one(f)) build.push(f, one(f));
if (run('node', build.map((a, i) => i === 0 ? join(here, a) : a)).status !== 0) die('verification failed; no page was written');

if (!args.includes('--skip-render-check')) {
  step(4, 'measuring the page in a browser');
  const rc = run('node', [join(here, 'check-render.mjs'), out]);
  if (rc.status === 1) die('the page has clipped text or script errors (listed above)');
  if (rc.status === 2) console.log('    no Chrome available; legibility was not measured — say so when reporting.');
}
console.log(`\nDone: ${out}`);
