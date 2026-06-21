// score — compute each company's lead score (money × site-matters × opportunity)
// and regenerate the human-readable leads.md rollup. Real even in the stub phase:
// it's pure math over whatever the store currently holds.

import { readAudit, listCompanies, paths, readScope, storeRoot, leadScore, writeCompany } from "../lib/store.mjs";
import { writeFileSync } from "node:fs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const scope = readScope(root);
let companies = listCompanies(root);
if (req.companyIds && req.companyIds.length) {
  const want = new Set(req.companyIds);
  // still re-rank the whole set, but only recompute the requested ones
  for (const c of companies) {
    if (!want.has(c.id)) continue;
    c.pipeline = { ...(c.pipeline ?? {}), leadScore: leadScore(c, readAudit(c.id, root), scope) };
    writeCompany(c, root);
  }
} else {
  for (const c of companies) {
    c.pipeline = { ...(c.pipeline ?? {}), leadScore: leadScore(c, readAudit(c.id, root), scope) };
    writeCompany(c, root);
  }
}

// Reload + sort for the rollup.
companies = listCompanies(root).sort((a, b) => (b.pipeline?.leadScore ?? -1) - (a.pipeline?.leadScore ?? -1));
const eur = (n) => (n ? `€${(n / 1000).toFixed(0)}k` : "—");
const rows = companies.map((c, i) => {
  const a = readAudit(c.id, root);
  return `| ${i + 1} | **${c.pipeline?.leadScore ?? "—"}** | ${c.name} | ${c.sector?.vertical ?? ""} | ${c.location?.city ?? ""} | ${eur(c.size?.revenue?.value)} | ${a ? a.taste.overall : "—"} | ${a ? a.taste.opportunity : "—"} | ${c.pipeline?.status ?? ""} |`;
});
const md = [
  "# Prospector — leads",
  "",
  `_Generated ${new Date().toISOString()} · ${companies.length} companies · weights ${JSON.stringify(scope.weights)}_`,
  "",
  "| # | Score | Company | Vertical | City | Revenue | Taste | Opportunity | Status |",
  "| - | ----- | ------- | -------- | ---- | ------- | ----- | ----------- | ------ |",
  ...rows,
  "",
].join("\n");
writeFileSync(paths(root).leads, md, "utf8");

emit({ action: "score", ok: true, scored: companies.length, top: companies[0]?.name });
