// ELK (elkjs, the layout engine the page inlines), installed once into the per-user cache the
// java-diagrams helper manages. ARCHITECTURE_MAP_DEPS=<dir> overrides the location.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDeps } from '../../java-diagrams/scripts/deps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const deps = makeDeps({ pkg: 'elkjs', cacheName: 'architecture-map', env: 'ARCHITECTURE_MAP_DEPS', here });
export const { depsDir, installed, install, pkgDir } = deps;
export const elkBundlePath = () => join(deps.pkgDir(), 'lib', 'elk.bundled.js');
