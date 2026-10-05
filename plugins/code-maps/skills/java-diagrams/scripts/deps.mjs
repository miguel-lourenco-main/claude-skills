// Where Graphviz (wasm) lives. Never inside the skill's own folder when that folder is a plugin
// cache: the dependency goes to a per-user cache directory, installed once on first run.
//   JAVA_DIAGRAMS_DEPS=<dir> overrides the location.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PKG = join('node_modules', '@hpcc-js', 'wasm-graphviz');
const cache = process.env.JAVA_DIAGRAMS_DEPS
  || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'claude-code-maps', 'java-diagrams');

// a copy installed beside the scripts (the old personal-skill layout) is used as it is
export const depsDir = () => existsSync(join(here, PKG)) ? here : cache;
export const installed = () => existsSync(join(depsDir(), PKG));

export function install() {
  mkdirSync(cache, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(here, f), join(cache, f));
  return spawnSync('npm', ['install', '--silent', '--prefix', cache], { stdio: 'inherit' }).status === 0;
}

export async function loadGraphviz() {
  const { Graphviz } = await import(pathToFileURL(join(depsDir(), PKG, 'dist', 'index.js')).href);
  return Graphviz.load();
}
