// Where a skill's npm dependency lives. Never inside the skill's own folder when that folder is a
// plugin cache: the dependency goes to a per-user cache directory, installed once on first run.
// `makeDeps` is the factory, shared with the sibling skills (architecture-map uses it for ELK);
// the exports below are java-diagrams' own instance (Graphviz as wasm).
//   JAVA_DIAGRAMS_DEPS=<dir> overrides the location.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function makeDeps({ pkg, cacheName, env, here }) {
  const PKG = join('node_modules', ...pkg.split('/'));
  const cache = process.env[env]
    || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'claude-code-maps', cacheName);
  // a copy installed beside the scripts (the old personal-skill layout) is used as it is
  const depsDir = () => existsSync(join(here, PKG)) ? here : cache;
  const installed = () => existsSync(join(depsDir(), PKG));
  const install = () => {
    mkdirSync(cache, { recursive: true });
    for (const f of ['package.json', 'package-lock.json']) if (existsSync(join(here, f))) copyFileSync(join(here, f), join(cache, f));
    return spawnSync('npm', ['install', '--silent', '--prefix', cache], { stdio: 'inherit' }).status === 0;
  };
  const pkgDir = () => join(depsDir(), PKG);
  return { depsDir, installed, install, pkgDir, cache };
}

const here = dirname(fileURLToPath(import.meta.url));
const own = makeDeps({ pkg: '@hpcc-js/wasm-graphviz', cacheName: 'java-diagrams', env: 'JAVA_DIAGRAMS_DEPS', here });
export const depsDir = own.depsDir;
export const installed = own.installed;
export const install = own.install;

export async function loadGraphviz() {
  const { Graphviz } = await import(pathToFileURL(join(own.pkgDir(), 'dist', 'index.js')).href);
  return Graphviz.load();
}
