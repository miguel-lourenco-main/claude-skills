// STUB audit — writes a website audit record (tech + taste) for each target company.
// Next phase: replace with real capture (Playwright section-split screenshots) + a
// vision taste pass. Contract stays: read company, write audits/<id>.website.json.

import { listCompanyIds, readCompany, storeRoot, writeAudit } from "../lib/store.mjs";
import { emit, hashInt, pick, readRequest } from "./_cli.mjs";

const CMS = ["Wix (2016 template)", "WordPress (Divi)", "Joomla (2014)", "Custom (jQuery)", "Squarespace", "static HTML"];
const SIGNALS = ["non-responsive below 768px", "dated copyright year", "stock photo carousel", "tiny body text", "no clear CTA", "slow image loading", "clip-art icons", "no HTTPS"];

const root = storeRoot();
const req = readRequest();
const ids = (req.companyIds && req.companyIds.length ? req.companyIds : listCompanyIds(root)).filter((id) => readCompany(id, root));
const audited = [];

for (const id of ids) {
  const c = readCompany(id, root);
  const h = hashInt(id);
  const hasSite = !!c.digital?.hasWebsite;
  // Stub taste: lower (worse) scores → higher opportunity. Social-only sites score lowest.
  const base = hasSite ? 1 + (h % 4) : 1;
  const s = (n) => Math.max(1, Math.min(5, base + ((hashInt(id + n) % 3) - 1)));
  const scores = { visual: s("v"), typography: s("t"), layout: s("l"), modernity: s("m"), mobile: s("mo"), trust: s("tr"), conversion: s("co") };
  const overall = Number((Object.values(scores).reduce((a, b) => a + b, 0) / 7).toFixed(1));
  const opportunity = Number(Math.max(0, Math.min(1, (5 - overall) / 4 + (hasSite ? 0 : 0.15))).toFixed(2));
  const audit = {
    companyId: id,
    url: c.contacts?.website ?? null,
    capturedAt: new Date().toISOString().slice(0, 10),
    tech: {
      https: hasSite ? h % 7 !== 0 : false,
      mobileFriendly: scores.mobile >= 4,
      lighthousePerf: 25 + (h % 60),
      cms: hasSite ? pick(CMS, id) : "no website",
      lastModified: `${2013 + (h % 11)}-0${1 + (h % 9)}`,
      domainAge: hasSite ? 8 + (h % 12) : 0,
    },
    screenshots: hasSite
      ? { desktop: ["desktop-hero.png", "desktop-section.png"], mobile: ["mobile-hero.png"], thumbnail: "thumbnail.png" }
      : { desktop: [], mobile: [], thumbnail: null },
    taste: {
      scores,
      overall,
      datedSignals: [pick(SIGNALS, id + "a"), pick(SIGNALS, id + "b")].filter((v, i, arr) => arr.indexOf(v) === i),
      issues: [{ severity: opportunity > 0.7 ? "high" : "medium", area: scores.mobile <= 2 ? "mobile" : "visual", note: hasSite ? "stub finding — replace with real taste analysis" : "no website — social presence only" }],
      opportunity,
      effortEstimate: overall < 2 ? "L" : overall < 3.2 ? "M" : "S",
    },
  };
  writeAudit(audit, root);
  audited.push(id);
}

emit({ action: "audit", ok: true, audited, count: audited.length });
