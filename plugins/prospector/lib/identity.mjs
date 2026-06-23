// Identity resolution for discovery — the hard part of multi-source data. A company
// found by OSM, Wikidata and a scraper must collapse to ONE record. Key = domain when
// known (strongest), else name+city slug. Merge unions fields + provenance.

export const slug = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export function domainOf(url) {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const website = (p) => p?.contacts?.website ?? p?.website ?? null;

/** Stable dedupe key: domain wins, else name+city. */
export function dedupeKey(p) {
  const d = domainOf(website(p));
  return d ? `d:${d}` : `n:${slug(p.name)}|${slug(p.location?.city)}`;
}

/** Canonical company id for the store: web-<domain> or loc-<name>-<city>. */
export function companyId(p) {
  const d = domainOf(website(p));
  return d ? `web-${slug(d)}` : `loc-${slug(p.name)}-${slug(p.location?.city)}`;
}

/** Merge a freshly-discovered company onto an existing record (or {}). Prefers existing
 *  non-null fields, fills gaps from incoming, unions provenance + contacts. */
export function mergeCompany(existing, incoming) {
  const out = { ...incoming, ...existing }; // existing wins on scalars it already has
  out.id = existing.id ?? incoming.id;
  out.name = existing.name || incoming.name;
  out.sector = { ...incoming.sector, ...existing.sector };
  out.location = { ...incoming.location, ...existing.location };
  out.size = { ...incoming.size, ...existing.size };
  out.contacts = {
    ...incoming.contacts,
    ...existing.contacts,
    website: existing.contacts?.website || incoming.contacts?.website || null,
    domain: existing.contacts?.domain || incoming.contacts?.domain || null,
    emails: [...new Set([...(existing.contacts?.emails ?? []), ...(incoming.contacts?.emails ?? [])])],
    phones: [...new Set([...(existing.contacts?.phones ?? []), ...(incoming.contacts?.phones ?? [])])],
    social: { ...(incoming.contacts?.social ?? {}), ...(existing.contacts?.social ?? {}) },
  };
  out.digital = { hasWebsite: !!(existing.digital?.hasWebsite || incoming.digital?.hasWebsite), socialOnly: !(existing.digital?.hasWebsite || incoming.digital?.hasWebsite) };
  const prov = [...(existing.provenance ?? []), ...(incoming.provenance ?? [])];
  const seen = new Set();
  out.provenance = prov.filter((p) => { const k = `${p.source}:${(p.fields ?? []).join(",")}`; if (seen.has(k)) return false; seen.add(k); return true; });
  out.pipeline = existing.pipeline ?? incoming.pipeline ?? { status: "candidate", leadScore: null };
  return out;
}
