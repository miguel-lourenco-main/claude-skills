// Import a store bundle (.tar.gz from `bundle.mjs export` / the dashboard Export / the remote-worker
// push) and MERGE every artifact into the store — company, audit, assessment, dossier, outreach,
// screenshots. Two policies:
//   "fill-gaps" (default): keep existing; mergeCompany() on the record (existing wins scalars, unions
//      contacts/provenance) and only ADD the artifacts the target is missing — never overwrite richer
//      existing data. This is the user-facing import.
//   "overwrite": incoming wins on every artifact — used by the remote-worker push (idempotent re-merge).
//
//   node scripts/import.mjs '{"action":"import","payload":{"file":"/path/bundle.tar.gz","mode":"fill-gaps"}}'

import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assessmentFile, auditFile, dedupeByUrl, dossierFile, hasAssessment, hasAudit,
  hasDossier, hasOutreach, outreachFile, paths, readCompany, readJSON, storeRoot, writeCompany,
} from "../lib/store.mjs";
import { mergeCompany } from "../lib/identity.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const root = storeRoot();
const p = paths(root);
// Ensure the dir skeleton WITHOUT seeding sample data (ensureStore would seed an empty target).
for (const d of [p.companies, p.audits, p.assessments, p.dossiers, p.outreach, p.screenshots, p.requests]) mkdirSync(d, { recursive: true });

const req = readRequest();
const file = req.payload?.file ?? req.file;
const overwrite = (req.payload?.mode ?? req.mode ?? "fill-gaps") === "overwrite";

function fail(error) { emit({ action: "import", ok: false, error }); process.exit(0); }
if (!file || !existsSync(file)) fail(`bundle file not found: ${file}`);

const tmp = mkdtempSync(join(tmpdir(), "prospector-import-"));
const x = spawnSync("tar", ["xzf", file, "-C", tmp], { stdio: ["ignore", "ignore", "pipe"] });
if (x.status !== 0) {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  fail(`extract failed: ${(x.stderr || "").toString().slice(0, 200)}`);
}

const tCompanies = join(tmp, "companies");
const ids = existsSync(tCompanies)
  ? readdirSync(tCompanies).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  : [];

const arts = { audits: 0, assessments: 0, dossiers: 0, outreach: 0, screenshots: 0 };
let merged = 0, created = 0;
const copyIf = (cond, src, dst) => {
  if (!cond || !existsSync(src)) return false;
  try { copyFileSync(src, dst); return true; } catch { return false; }
};

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  progress({ i: i + 1, n: ids.length, item: id, phase: "importing" });
  const incoming = readJSON(join(tCompanies, `${id}.json`));
  if (!incoming) continue;
  incoming.id = id; // keep the record id aligned with its artifacts' filename key

  const existing = readCompany(id, root);
  // fill-gaps: existing wins scalars (don't clobber richer data). overwrite (worker push): incoming
  // wins scalars (the fresh agent result) but still unions contacts/provenance with existing.
  const record = !existing ? incoming
    : overwrite ? mergeCompany(incoming, existing)
    : mergeCompany(existing, incoming);
  writeCompany(record, root);
  existing ? merged++ : created++;

  if (copyIf(overwrite || !hasAudit(id, root), join(tmp, "audits", `${id}.website.json`), auditFile(id, root))) arts.audits++;
  if (copyIf(overwrite || !hasAssessment(id, root), join(tmp, "assessments", `${id}.json`), assessmentFile(id, root))) arts.assessments++;
  if (copyIf(overwrite || !hasDossier(id, root), join(tmp, "dossiers", `${id}.md`), dossierFile(id, root))) arts.dossiers++;
  if (copyIf(overwrite || !hasOutreach(id, root), join(tmp, "outreach", `${id}.json`), outreachFile(id, root))) {
    arts.outreach++;
    copyIf(true, join(tmp, "outreach", `${id}.md`), join(p.outreach, `${id}.md`)); // carry the rendered .md along
  }
  const ssSrc = join(tmp, "screenshots", id);
  const ssDst = join(p.screenshots, id);
  if (existsSync(ssSrc) && (overwrite || !existsSync(ssDst))) {
    try { cpSync(ssSrc, ssDst, { recursive: true }); arts.screenshots++; } catch { /* skip */ }
  }
}

// Collapse any URL twins the import introduced (idempotent; same pass discover runs).
let collapsed = 0;
try { collapsed = dedupeByUrl(root).length; } catch { /* best-effort */ }

try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
// A bridge-uploaded bundle lives under requests/imports/ — clean it up once merged.
if (String(file).includes(`${p.imports}`.replace(root, "")) || String(file).includes("/imports/")) {
  try { rmSync(file); } catch { /* ignore */ }
}

emit({ action: "import", ok: true, companies: ids.length, created, merged, collapsed, ...arts, mode: overwrite ? "overwrite" : "fill-gaps" });
