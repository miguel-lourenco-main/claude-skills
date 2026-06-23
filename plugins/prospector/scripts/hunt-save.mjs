// Save a per-company hunt result: write assessments/<id>.json (verdict + pitch), merge any
// researched ENRICHMENT back onto the company (description/social/phones/emails/popularity —
// so the record reflects that deep research happened, not just the basic discovery stub), and
// stamp pipeline.hunt. Each subagent calls this on completion, so results land incrementally
// (live dashboard + resilience).
//
//   node scripts/hunt-save.mjs '{"companyId":"web-x","assessment":{"decision":"qualified",
//     "leadType":"improvable-site","fit":0.82,"reasons":[...],"pitch":"…","pitchAngle":"redesign",
//     "popularity":{"rating":4.4,"reviews":120}},
//     "enrich":{"description":"…","social":{"instagram":"…"},"phones":["…"],"emails":["…"]}}'

import { readCompany, storeRoot, touchHeartbeat, writeAssessment, writeCompany } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const uniq = (arr) => [...new Set((arr ?? []).filter(Boolean))];

const root = storeRoot();
touchHeartbeat(root);
const req = readRequest();
const id = req.companyId;
const c = readCompany(id, root);
if (!c) { emit({ action: "hunt-save", ok: false, error: `no company ${id}` }); process.exit(0); }

const a = req.assessment ?? {};
const decision = a.decision ?? req.decision; // "qualified" | "rejected"
if (decision !== "qualified" && decision !== "rejected") { emit({ action: "hunt-save", ok: false, error: "decision must be qualified|rejected" }); process.exit(0); }

const assessment = {
  companyId: id,
  decision,
  leadType: a.leadType ?? null,        // improvable-site | no-website | good-site | null (rejected)
  fit: typeof a.fit === "number" ? a.fit : null,
  reasons: a.reasons ?? [],
  pitch: a.pitch ?? null,              // usable outreach base + go/no-go memo
  pitchAngle: a.pitchAngle ?? null,    // redesign | get-a-site | ai-upsell | marketing-growth
  popularity: a.popularity ?? null,    // { rating, reviews }
  examinedAt: new Date().toISOString(),
};
writeAssessment(assessment, root);

// Merge researched enrichment back onto the company so the record reflects the deep research
// (research wins where discovery only had a stub). Contacts union; description overrides the
// generic discovery stub; popularity stamped for quick scanning.
const e = req.enrich ?? {};
const enriched = [];
c.contacts = c.contacts ?? {};
if (e.social && Object.keys(e.social).length) { c.contacts.social = { ...(c.contacts.social ?? {}), ...e.social }; enriched.push("social"); }
if (e.phones?.length) { c.contacts.phones = uniq([...(c.contacts.phones ?? []), ...e.phones]); enriched.push("phones"); }
if (e.emails?.length) { c.contacts.emails = uniq([...(c.contacts.emails ?? []), ...e.emails]); enriched.push("emails"); }
if (typeof e.description === "string" && e.description.trim()) { c.description = e.description.trim(); enriched.push("description"); }
const hasSite = !!(c.contacts.website || c.digital?.hasWebsite);
const hasSocial = !!(c.contacts.social && Object.keys(c.contacts.social).length);
c.digital = { ...(c.digital ?? {}), hasWebsite: hasSite, socialOnly: !hasSite && hasSocial };
if (assessment.popularity && (assessment.popularity.rating != null || assessment.popularity.reviews != null)) { c.popularity = assessment.popularity; enriched.push("popularity"); }
if (enriched.length) {
  c.provenance = [...(c.provenance ?? []), { source: "hunt-research", fetchedAt: new Date().toISOString().slice(0, 10), fields: enriched, confidence: 0.75 }];
}

c.pipeline = { ...(c.pipeline ?? {}), hunt: { status: decision, leadType: assessment.leadType, fit: assessment.fit, examinedAt: assessment.examinedAt } };
writeCompany(c, root);

emit({ action: "hunt-save", ok: true, companyId: id, decision, leadType: assessment.leadType, fit: assessment.fit, enriched });
