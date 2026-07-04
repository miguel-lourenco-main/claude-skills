// Find companies in the store by name / domain / city substring — the missing "which id is
// that?" helper for direct skill entry points (deepdive, blueprint, outreach, shortlist).
//
//   node scripts/find.mjs '{"q":"regional sintra"}'
//   node scripts/find.mjs '{"q":"geocasa.pt"}'
//
// Matches case/diacritic-insensitively across name, website/domain, city, district and vertical;
// every space-separated term must match somewhere. Returns the matches with their audit state.

import { hasAssessment, hasDossier, listCompanies, readAudit, storeRoot } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const q = String(req.q ?? req.query ?? "").trim();
if (!q) { emit({ action: "find", ok: false, error: "q required (name/domain/city substring)" }); process.exit(0); }

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const terms = fold(q).split(/\s+/).filter(Boolean);

const items = listCompanies(root)
  .map((c) => {
    const hay = fold([c.name, c.contacts?.website, c.contacts?.domain, c.location?.city, c.location?.district, c.sector?.vertical].join(" · "));
    if (!terms.every((t) => hay.includes(t))) return null;
    const a = readAudit(c.id, root);
    return {
      companyId: c.id,
      name: c.name,
      website: c.contacts?.website ?? null,
      vertical: c.sector?.vertical ?? null,
      city: c.location?.city ?? null,
      district: c.location?.district ?? null,
      audit: a ? { reachable: a.reachable, capturedAt: a.capturedAt ?? null, graded: !!(a.taste && !a.taste.pending), opportunity: a.taste?.opportunity ?? null } : null,
      hasDossier: hasDossier(c.id, root),
      hasAssessment: hasAssessment(c.id, root),
      shortlisted: !!c.pipeline?.shortlisted,
    };
  })
  .filter(Boolean)
  .slice(0, 25);

emit({ action: "find", q, count: items.length, items });
