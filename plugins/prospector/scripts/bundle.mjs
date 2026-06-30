// Store bundle helper — package the store (companies + audits + assessments + dossiers + outreach +
// screenshots + scope) as a .tar.gz you can move between a local store and the cloud (and import via
// the dashboard or scripts/import.mjs). Mirrors the bridge's GET /api/export.
//
//   node scripts/bundle.mjs export                 # full bundle → stdout (redirect to a file)
//   node scripts/bundle.mjs export out.tar.gz      # full bundle → out.tar.gz
//   node scripts/bundle.mjs export --json out.tgz  # JSON-only (no screenshots) — what the worker pull uses
//
// Respects PROSPECTOR_ROOT (defaults to ./.prospector).

import { spawnSync } from "node:child_process";
import { bundleDirs, storeRoot } from "../lib/store.mjs";

const [cmd, ...rest] = process.argv.slice(2);
if (cmd !== "export") { process.stderr.write("usage: bundle.mjs export [--json] [outfile.tar.gz]\n"); process.exit(2); }

const root = storeRoot();
const jsonOnly = rest.includes("--json");
const out = rest.find((a) => !a.startsWith("--")) ?? "-"; // "-" = stdout
const names = bundleDirs(root, { screenshots: !jsonOnly });
if (!names.length) { process.stderr.write(`store at ${root} is empty — nothing to export\n`); process.exit(1); }

// `tar czf <out> -C <root> <names…>` — out="-" streams the archive to stdout.
const r = spawnSync("tar", ["czf", out, "-C", root, ...names], { stdio: "inherit" });
process.exit(r.status ?? 0);
