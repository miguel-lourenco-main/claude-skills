// rank — order companies by redesign OPPORTUNITY (the measured signal) and regenerate
// leads.md. There is no composite "score" anymore: opportunity is the ranking.

import { writeFileSync } from "node:fs";
import { listCompanies, opportunityOf, paths, readAudit, revenueKnown, storeRoot } from "../lib/store.mjs";
import { emit } from "./_cli.mjs";

const root = storeRoot();
const ranked = listCompanies(root)
  .map((c) => { const a = readAudit(c.id, root); return { c, a, opp: opportunityOf(c, a) }; })
  .sort((p, q) => q.opp - p.opp);

const rev = (c) => (revenueKnown(c) ? `€${(c.size.revenue.value / 1000).toFixed(0)}k` : "_?_");
const tasteCell = (a) => (!a ? "—" : a.reachable === false ? `_${a.reason}_` : a.taste?.pending ? "_grading…_" : a.taste?.overall ?? "—");
const rows = ranked.map(({ c, a, opp }, i) =>
  `| ${i + 1} | ${opp.toFixed(2)} | ${c.name} | ${c.sector?.vertical ?? ""} | ${c.location?.city ?? ""} | ${rev(c)} | ${tasteCell(a)} | ${c.contacts?.website ?? "—"} | ${c.pipeline?.status ?? ""} |`);
const unknownRev = ranked.filter(({ c }) => !revenueKnown(c)).length;
const md = [
  "# Prospector — leads (ranked by redesign opportunity)",
  "",
  `_Generated ${new Date().toISOString()} · ${ranked.length} companies · opportunity 0–1 = how much a redesign would help_`,
  unknownRev ? `\n> ⚠ ${unknownRev} compan${unknownRev === 1 ? "y has" : "ies have"} no known revenue (\`?\`) — context only; ranking is by opportunity.` : "",
  "",
  "| # | Opp | Company | Vertical | City | Revenue | Taste | Website | Status |",
  "| - | --- | ------- | -------- | ---- | ------- | ----- | ------- | ------ |",
  ...rows,
  "",
].join("\n");
writeFileSync(paths(root).leads, md, "utf8");

emit({ action: "rank", ok: true, ranked: ranked.length, top: ranked[0]?.c.name });
