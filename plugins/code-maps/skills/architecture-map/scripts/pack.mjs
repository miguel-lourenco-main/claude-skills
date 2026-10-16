#!/usr/bin/env node
// Fills the page template: the shared core (model.mjs + core.mjs, inlined as plain scripts), the
// layout engine (ELK, gzip + base64), and — for a published page — the resolved document and the
// compact model. Without --map the result is the blank editor: open it and drop the files in.
//
//   node pack.mjs --out page.html [--map doc.resolved.json --graph graph.json] [--title T] [--readonly] [--sets main]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installed, install, depsDir, elkBundlePath } from './deps.mjs';
import { buildModel } from '../../java-diagrams/scripts/model.mjs';
import { compactModel } from './core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!opt('--out') || (opt('--map') && !opt('--graph'))) { console.error('usage: node pack.mjs --out page.html [--map doc.resolved.json --graph graph.json] [--title T] [--readonly] [--sets main]'); process.exit(2); }
if (!installed()) { console.log(`installing ELK (one time) into ${depsDir()}`); if (!install()) { console.error('npm install failed'); process.exit(2); } }

/** An ES module as a plain script: `import {a} from './x.mjs'` -> `const {a} = __mod.x;`, exports collected into __mod.<name>. */
export function inlineModule(name, source) {
  const names = [];
  let body = source
    .replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']*\/([\w-]+)\.mjs';\s*$/gm, (_, what, mod) => `const {${what}} = __mod.${mod};`)
    .replace(/^export\s+(const|let|function|async function|class)\s+([\w$]+)/gm, (_, kw, id) => { names.push(id); return `${kw} ${id}`; })
    .replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, list) => { for (const n of list.split(',')) { const id = n.trim().split(/\s+as\s+/).pop(); if (id) names.push(id); } return ''; });
  return `__mod.${name} = (() => {\n${body}\nreturn { ${[...new Set(names)].join(', ')} };\n})();\n`;
}

const template = readFileSync(join(here, '..', 'assets', 'map-editor.html'), 'utf8');
const core = 'const __mod = {};\n' + inlineModule('model', readFileSync(join(here, '..', '..', 'java-diagrams', 'scripts', 'model.mjs'), 'utf8')) + inlineModule('core', readFileSync(join(here, 'core.mjs'), 'utf8'));
const b64 = s => gzipSync(s, { level: 9 }).toString('base64');
const elk = b64(readFileSync(elkBundlePath(), 'utf8'));
let data = 'null', title = opt('--title') || '';
if (opt('--map')) {
  const resolved = JSON.parse(readFileSync(opt('--map'), 'utf8'));
  const model = buildModel(JSON.parse(readFileSync(opt('--graph'), 'utf8')), { sets: (opt('--sets') || 'main').split(',') });
  title = title || resolved.meta?.title || '';
  data = JSON.stringify({ doc: resolved, model: b64(JSON.stringify(compactModel(model))), readonly: args.includes('--readonly') });
}
const safe = s => s.replace(/<\/script/gi, '<\\/script');
for (const m of ['/*__CORE__*/', '"__ELK__"', '/*__MAP__*/null', '__TITLE__']) if (!template.includes(m)) { console.error(`template lacks the marker ${m}`); process.exit(2); }
const html = template
  .replace('__TITLE__', () => (title || 'Architecture map').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])))
  .replace('/*__CORE__*/', () => safe(core))
  .replace('"__ELK__"', () => JSON.stringify(elk))
  .replace('/*__MAP__*/null', () => safe(data));
mkdirSync(dirname(opt('--out')) || '.', { recursive: true });
writeFileSync(opt('--out'), html);
console.log(`wrote ${opt('--out')} (${(html.length / 1048576).toFixed(2)} MB${opt('--map') ? ', with data' : ', blank editor'})`);
