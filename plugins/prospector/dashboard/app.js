// Prospector dashboard — vanilla JS, no build. Reads the aggregated store from the
// bridge, renders it, and turns button clicks into queued actions. It never executes
// anything itself; the dashboard skill's watch-loop runs the queue and mutates the store.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (n) => (n ? "€" + (n / 1000).toFixed(0) + "k" : "—");
const isEmailJs = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s ?? "").trim());

// Inline SVG icons (Lucide-style) — no emoji as icons (ui-ux-pro-max §no-emoji-icons).
const ICONS = {
  check: '<path d="M4 12l5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  dots: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  board: '<rect x="3" y="3" width="6" height="18" rx="1"/><rect x="11" y="3" width="6" height="12" rx="1"/><rect x="19" y="3" width="2" height="0"/>',
  rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6 8.5-6"/>',
  trash: '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
};
const ic = (name, size = 16) => `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

const SOCIAL_URL = {
  instagram: (h) => `https://instagram.com/${h.replace(/^@/, "")}`,
  facebook: (h) => `https://facebook.com/${h}`,
  twitter: (h) => `https://x.com/${h.replace(/^@/, "")}`,
  linkedin: (h) => h,
  youtube: (h) => h,
  tiktok: (h) => `https://tiktok.com/@${h.replace(/^@/, "")}`,
  whatsapp: (h) => `https://wa.me/${String(h).replace(/\D/g, "")}`,
};
function socialChips(social) {
  const items = Object.entries(social || {});
  if (!items.length) return '<span class="csub">—</span>';
  return `<div class="chips">${items.map(([k, v]) => {
    const href = /^https?:\/\//i.test(v) ? v : (SOCIAL_URL[k] ? SOCIAL_URL[k](v) : null);
    return href ? `<a class="chip" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(k)}</a>` : `<span class="chip">${esc(k)}: ${esc(v)}</span>`;
  }).join("")}</div>`;
}
const emailLinks = (emails) => (emails?.length ? emails.map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join(", ") : "—");

const state = {
  store: null,
  selected: new Set(),
  sort: { key: "opportunity", dir: -1 },
  filter: "",
  view: "board",              // "board" | "table"
  facets: {},                 // { vertical, stage, district, city, site, oppMin, angle, dossier, shortlisted, qualified }
  detailId: null,
  focusId: null,              // keyboard-focused card/row id
  sig: "",
  console: { open: false, tab: "feed", raw: false },
  activity: { running: null, pending: 0 },
  stream: { reqId: null, seq: 0 }, // live agent event-stream cursor (the Log tab)
};

const COLS = [
  { key: "sel", label: "" },
  { key: "name", label: "Company", sortable: true },
  { key: "vertical", label: "Type", sortable: true },
  { key: "revenue", label: "Revenue", sortable: true },
  { key: "employees", label: "Staff", sortable: true },
  { key: "site", label: "Site", sortable: true },
  { key: "taste", label: "Taste", sortable: true, tip: "Visual quality of the site, 1 (worst)–5 (best), graded from the screenshots." },
  { key: "opportunity", label: "Opportunity", sortable: true, tip: "How much a redesign would help THIS site (0–1), from the taste grade. Leads are ranked by this — higher = better prospect." },
  { key: "angle", label: "Angle", sortable: true, tip: "The kind of opportunity the hunt identified for a qualified lead: redesign, get-a-site, AI upsell, or growth." },
  { key: "status", label: "Status", sortable: true },
  { key: "discovered", label: "Discovered", sortable: true, tip: "When this lead first entered the store (earliest source fetch date)." },
  { key: "del", label: "" },
];

const VTONE = {
  restaurants: "info", cafes: "info", bars: "info", hotels: "info", events: "info", hospitality: "info",
  dental: "accent", clinics: "accent", veterinary: "accent",
  beauty: "warn", fitness: "warn", photography: "warn",
  legal: "muted", realEstate: "muted", automotive: "muted", trades: "muted", other: "muted",
};

function val(c, key) {
  switch (key) {
    case "name": return c.name?.toLowerCase() ?? "";
    case "vertical": return c.sector?.vertical ?? "";
    case "revenue": return c.size?.revenue?.value ?? 0;
    case "employees": return c.size?.employees ?? 0;
    case "site": return c.audit?.reachable === false && c.audit?.reason !== "no website" ? 0.5 : c.digital?.hasWebsite ? 1 : 0;
    case "taste": return c.audit?.taste?.overall ?? -1;
    case "opportunity": return c.audit?.taste?.opportunity ?? -1;
    case "angle": return opportunityType(c) ?? "";
    case "status": return c.pipeline?.status ?? "";
    case "discovered": return discoveredAt(c) ?? "";
    default: return "";
  }
}

// ---- rendering -------------------------------------------------------------
function renderHead() {
  $("#thead").innerHTML = COLS.map((col) => {
    if (col.key === "sel") return `<div><input type="checkbox" id="selAll" title="Select all (filtered)"></div>`;
    if (col.key === "del") return `<div></div>`;
    const arrow = state.sort.key === col.key ? `<span class="arrow">${state.sort.dir < 0 ? "▾" : "▴"}</span>` : "";
    return `<div class="th" data-sort="${col.key}"${col.tip ? ` title="${esc(col.tip)}"` : ""}>${col.label} ${arrow}</div>`;
  }).join("");
  updateSelAll();
}

/** Reflect the selection state of the currently-filtered rows on the header checkbox. */
function updateSelAll() {
  const box = $("#selAll");
  if (!box) return;
  const ids = rows().map((c) => c.id);
  const sel = ids.filter((id) => state.selected.has(id)).length;
  box.checked = sel > 0 && sel === ids.length;
  box.indeterminate = sel > 0 && sel < ids.length;
}

function renderKpis() {
  const s = state.store?.stats ?? {};
  const cards = [
    { label: "Companies", value: s.total ?? 0, facet: null },
    { label: "Captured", value: s.captured ?? 0, facet: ["captured", true] },
    { label: "Graded", value: s.graded ?? 0, facet: ["graded", true] },
    { label: "High opportunity", value: s.highOpportunity ?? 0, hot: true, facet: ["oppMin", 0.7] },
    { label: "No website", value: s.noWebsite ?? 0, facet: ["site", "none"] },
  ];
  $("#kpis").innerHTML = cards.map((c) => {
    const on = c.facet ? state.facets[c.facet[0]] === c.facet[1] : false;
    const key = c.facet ? `${c.facet[0]}:${c.facet[1]}` : "clear";
    return `<button class="kpi ${c.hot ? "hot" : ""} ${on ? "on" : ""}" data-kpi="${key}" aria-pressed="${on}" title="Filter to ${esc(c.label)}"><div class="label">${c.label}</div><div class="value num">${c.value}</div></button>`;
  }).join("");
}

function rows() {
  let list = (state.store?.companies ?? []).slice();
  const f = state.facets;
  if (f.stage) list = list.filter((c) => stageOf(c) === f.stage);
  if (f.vertical) list = list.filter((c) => c.sector?.vertical === f.vertical);
  if (f.district) list = list.filter((c) => c.location?.district === f.district);
  if (f.city) list = list.filter((c) => c.location?.city === f.city);
  if (f.angle) list = list.filter((c) => opportunityType(c) === f.angle);
  if (f.site) list = list.filter((c) => siteState(c) === f.site);
  if (typeof f.oppMin === "number") list = list.filter((c) => (c.audit?.taste?.opportunity ?? -1) >= f.oppMin);
  if (f.captured) list = list.filter((c) => c.audit?.reachable === true);
  if (f.graded) list = list.filter((c) => c.audit?.taste && !c.audit.taste.pending && typeof c.audit.taste.overall === "number");
  if (f.dossier) list = list.filter((c) => c.hasDossier);
  if (f.shortlisted) list = list.filter((c) => c.pipeline?.shortlisted);
  if (f.qualified) list = list.filter((c) => c.pipeline?.hunt?.status === "qualified");
  const q = state.filter.trim().toLowerCase();
  if (q) list = list.filter((c) => (c.name + " " + (c.sector?.vertical ?? "") + " " + (c.location?.city ?? "")).toLowerCase().includes(q));
  const { key, dir } = state.sort;
  list.sort((a, b) => {
    const va = val(a, key), vb = val(b, key);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    // tiebreaker: actionable (has a website → auditable) leads rise above no-site dead-ends
    return (b.digital?.hasWebsite ? 1 : 0) - (a.digital?.hasWebsite ? 1 : 0);
  });
  return list;
}
const activeFacets = () => Object.entries(state.facets).filter(([, v]) => v !== undefined && v !== false && v !== "");

function tasteTone(v) { return v < 0 ? "muted" : v < 2.2 ? "danger" : v < 3.4 ? "warn" : "accent"; }
/** When this lead first entered the store: the full discoveredAt timestamp if present (new records),
 *  else the earliest provenance fetchedAt (legacy/seed records — date-only, no time available). */
function discoveredAt(c) { return c.discoveredAt ?? (c.provenance ?? []).map((p) => p.fetchedAt).filter(Boolean).sort()[0] ?? null; }
/** "24 Jun" for a date-only value; "24 Jun 14:32:07" when the value carries a time (full ISO). The
 *  full ISO string belongs in the title attribute. Seconds show only for records that stored a time. */
function fmtDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  const date = dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const hasTime = typeof d === "string" && d.length > 10; // "YYYY-MM-DD" has no time; full ISO does
  return hasTime ? `${date} ${dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}` : date;
}
const revKnown = (c) => c.size?.revenueKnown !== false && typeof c.size?.revenue?.value === "number" && c.size.revenue.value > 0;

/** Honest taste + opportunity cells from the real audit state — never a fabricated number. */
function auditCells(c) {
  const a = c.audit;
  if (!a) return { taste: '<span class="csub">—</span>', opp: '<span class="csub">not audited</span>' };
  if (a.reachable === false) {
    const lbl = a.reason === "no website" ? "no site" : a.reason || "unreachable";
    return { taste: `<span class="pill warn" title="${esc(a.reason ?? "")}">${esc(lbl)}</span>`, opp: '<span class="csub">—</span>' };
  }
  // Reachable but NO real screenshots → not a trustworthy audit (parked page, bot-protection, or a
  // failed/fabricated capture). Never surface a taste grade that isn't backed by captured tiles.
  if (!(a.screenshots?.desktop?.length > 0)) {
    return { taste: '<span class="pill warn" title="site responded but no screenshots were captured — re-audit to verify">no capture</span>', opp: '<span class="csub">—</span>' };
  }
  if (a.taste?.pending) return { taste: '<span class="pill info">grading…</span>', opp: '<span class="csub">captured</span>' };
  if (a.taste && typeof a.taste.overall === "number") {
    const t = a.taste.overall, o = a.taste.opportunity;
    return { taste: `<span class="pill ${tasteTone(t)}">${t}</span>`, opp: `<div class="bar" title="${o}"><span style="width:${Math.round(o * 100)}%"></span></div>` };
  }
  return { taste: '<span class="csub">—</span>', opp: '<span class="csub">—</span>' };
}

/** The Site-column cell. Surfaces a real audit verdict: an audited site that didn't resolve shows
 *  "unreachable" (with the reason/status on hover), not the bare "yes" of having a URL on record. */
function websiteCell(c) {
  const a = c.audit;
  if (a && a.reachable === false && a.reason !== "no website") {
    const why = `${a.reason || "unreachable"}${a.status ? ` · http ${a.status}` : ""}`;
    return `<span class="pill danger" title="site unreachable: ${esc(why)}">unreachable</span>`;
  }
  return c.digital?.hasWebsite ? '<span class="pill muted">yes</span>' : '<span class="pill warn">none</span>';
}

const LEADTYPE_LABEL = { "improvable-site": "redesign", "no-website": "get-a-site", "good-site": "AI upsell" };
/** A small qualified/rejected chip from the hunt verdict, shown next to the company name. */
function huntBadge(c) {
  const h = c.pipeline?.hunt;
  if (!h) return "";
  if (h.status === "rejected") return ` <span class="pill muted" title="hunt: rejected in triage">${ic("x", 10)}</span>`;
  const fit = typeof h.fit === "number" ? Math.round(h.fit * 100) + "%" : "";
  const lt = LEADTYPE_LABEL[h.leadType] ?? h.leadType ?? "lead";
  return ` <span class="pill accent" title="hunt-qualified · ${esc(lt)}${fit ? " · fit " + fit : ""}">${ic("check", 10)} ${esc(fit || "lead")}</span>`;
}

// The "kind of opportunity" identified by the hunt — its pitch angle. The stored pitchAngle is
// free-text (sometimes a whole sentence), so we normalize to a canonical label, falling back to the
// angle implied by the leadType. marketing-growth is checked first (it overrides the base type).
const ANGLE_MATCH = [
  [/marketing-growth|\bgrowth\b|visibilit|reach/, "growth"],
  [/ai-upsell|ai\/|ai upsell|automation|chatbot/, "AI upsell"],
  [/get-a-site|get a site|standalone|no[- ]website/, "get-a-site"],
  [/redesign|improvable|revamp|modern/, "redesign"],
];
const ANGLE_TONE = { redesign: "info", "get-a-site": "warn", "AI upsell": "accent", growth: "info" };
const ANGLE_SHORT = { redesign: "redesign", "get-a-site": "site", "AI upsell": "AI", growth: "growth" };
/** Opportunity/pitch angles for a hunt-qualified lead, PRIMARY first (ordered by position in the stored
 *  pitchAngle so a compound like "redesign+ai-upsell" keeps redesign primary), deduped, capped at 2.
 *  Empty for non-qualified leads. Falls back to the leadType's implied angle when no token is recognized. */
function opportunityAngles(c) {
  const h = c.pipeline?.hunt;
  if (!h || h.status !== "qualified") return [];
  const raw = `${h.pitchAngle ?? ""} ${c.assessment?.pitchAngle ?? ""}`.toLowerCase();
  const hits = [];
  for (const [re, label] of ANGLE_MATCH) { const m = raw.match(re); if (m) hits.push([m.index, label]); }
  const uniq = [...new Set(hits.sort((a, b) => a[0] - b[0]).map((x) => x[1]))].slice(0, 2);
  if (uniq.length) return uniq;
  const lt = LEADTYPE_LABEL[h.leadType];
  return lt ? [lt] : [];
}
/** Primary angle (for sorting / single-value uses). */
function opportunityType(c) { return opportunityAngles(c)[0] ?? null; }

// ---- pipeline funnel: ONE stage per lead, derived from the existing fields ----------------------
const STAGES = [
  { key: "new", label: "New" },
  { key: "audited", label: "Audited" },
  { key: "qualified", label: "Qualified" },
  { key: "shortlist", label: "Shortlist" },
  { key: "outreach", label: "Outreach" },
  { key: "contacted", label: "Contacted" },
  { key: "rejected", label: "Rejected" },
];
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const STEPPER = ["new", "audited", "qualified", "outreach", "contacted"]; // the linear progress path
/** The lead's single funnel stage (furthest-right wins). */
function stageOf(c) {
  const p = c.pipeline ?? {};
  if (p.status === "contacted") return "contacted";
  if (p.status === "outreach-ready") return "outreach";
  if (p.hunt?.status === "qualified") return p.shortlisted ? "shortlist" : "qualified";
  if (p.hunt?.status === "rejected") return "rejected";
  if (c.audit) return "audited";
  return "new";
}
/** Coarse site state for faceting. */
function siteState(c) {
  const a = c.audit;
  if (!c.digital?.hasWebsite) return "none";
  if (a?.reachable === false) return a.reason === "no website" ? "none" : "unreachable";
  if (a?.taste && typeof a.taste.overall === "number" && a.taste.overall >= 4) return "good";
  return "yes";
}
// action metadata for the guided next-step (agent:true ⇒ needs the headless claude / a session)
const STEP = {
  audit: { label: "Audit site", agent: false },
  hunt: { label: "Qualify (Find clients)", agent: true },
  deepdive: { label: "Deep dive", agent: true },
  outreach: { label: "Draft outreach", agent: true },
  contacted: { label: "Mark contacted", agent: false },
  wait: { label: "Grading…", agent: true },
  done: { label: "Won", agent: false },
  none: { label: "—", agent: false },
};
/** The recommended NEXT move for a lead, from its current state. */
function nextStepOf(c) {
  const p = c.pipeline ?? {}, a = c.audit;
  const hasSite = !!(c.digital?.hasWebsite && c.contacts?.website);
  if (p.status === "contacted") return { action: "done", ...STEP.done, reason: "contacted" };
  if (p.status === "outreach-ready") return { action: "contacted", ...STEP.contacted, reason: "outreach drafted — send it, then mark contacted" };
  if (p.hunt?.status === "qualified") return c.hasDossier
    ? { action: "outreach", ...STEP.outreach, reason: "qualified + researched — draft the pitch" }
    : { action: "deepdive", ...STEP.deepdive, reason: "qualified — research before pitching" };
  if (p.hunt?.status === "rejected") return { action: "none", label: "Rejected", agent: false, reason: "rejected in triage" };
  if (!hasSite) return { action: "none", label: "No site", agent: false, reason: "no website — a get-a-site lead, not a redesign" };
  if (!a) return { action: "audit", ...STEP.audit, reason: "has a site — audit it" };
  if (a.reachable === false) return { action: "none", label: "Unreachable", agent: false, reason: a.reason || "site unreachable" };
  if (a.taste?.pending) return { action: "wait", ...STEP.wait, reason: "captured — agent is grading the screenshots" };
  return { action: "hunt", ...STEP.hunt, reason: "graded — run Find clients to qualify it" };
}

function renderTable() {
  const list = rows();
  if (!list.length) {
    $("#tbody").innerHTML = `<div class="empty">No companies${state.filter ? " match the filter" : " yet — hit Discover"}.</div>`;
    return;
  }
  $("#tbody").innerHTML = list.map((c, i) => {
    const opp = c.audit?.taste?.opportunity ?? -1;
    const heat = opp >= 0.7 ? "hot" : opp >= 0.45 ? "warm" : "";
    const sel = state.selected.has(c.id) ? "sel" : "";
    const foc = state.focusId === c.id ? "foc" : "";
    const cells = auditCells(c);
    return `<div class="trow ${heat} ${sel} ${foc}" data-id="${c.id}" style="--i:${Math.min(i, 24)}">
      <div><input type="checkbox" data-check="${c.id}" ${sel ? "checked" : ""}></div>
      <div class="namecell">
        <button class="star ${c.pipeline?.shortlisted ? "on" : ""}" data-star="${c.id}" title="${c.pipeline?.shortlisted ? "Remove from shortlist" : "Shortlist as potential client"}">${c.pipeline?.shortlisted ? "★" : "☆"}</button>
        <div><div class="cname-row"><span class="cname">${esc(c.name)}</span>${huntBadge(c)}${c.hasDossier ? `<span class="dossier-dot" title="has a deep-dive dossier">${ic("file", 12)}</span>` : ""}</div><div class="csub">${esc(c.location?.city ?? "")}</div></div>
      </div>
      <div><span class="pill ${VTONE[c.sector?.vertical] ?? "muted"}">${esc(c.sector?.vertical ?? "—")}</span></div>
      <div class="num">${revKnown(c) ? eur(c.size.revenue.value) : '<span class="csub" title="revenue unknown — neutral can-pay prior">?</span>'}</div>
      <div class="num">${c.size?.employees ?? "—"}</div>
      <div>${websiteCell(c)}</div>
      <div>${cells.taste}</div>
      <div>${cells.opp}</div>
      <div>${(() => { const A = opportunityAngles(c); if (!A.length) return '<span class="csub">—</span>'; const sec = A[1] ? `<span class="csub" title="${esc(A.join(" + "))}"> +${esc(ANGLE_SHORT[A[1]] ?? A[1])}</span>` : ""; return `<span class="pill ${ANGLE_TONE[A[0]] ?? "muted"}" title="${esc(A.join(" + "))}">${esc(A[0])}</span>${sec}`; })()}</div>
      <div><span class="pill ${c.pipeline?.status === "contacted" ? "accent" : c.pipeline?.status === "outreach-ready" ? "info" : "muted"}">${esc(c.pipeline?.status ?? "—")}</span></div>
      <div class="csub">${(() => { const d = discoveredAt(c); return d ? `<span title="${esc(d)}">${esc(fmtDate(d))}</span>` : "—"; })()}</div>
      <div class="delcell"><button class="rowdel" data-delrow="${c.id}" title="Delete this lead" aria-label="Delete ${esc(c.name)}">${ic("trash", 14)}</button></div>
    </div>`;
  }).join("");
  updateSelAll();
}

function renderSelCount() {
  const el = $("#selCount"); if (!el) return; // the contextual action bar is now the canonical count
  el.textContent = "";
}

// ---- pipeline board --------------------------------------------------------
const STAGE_HINT = {
  new: "Newly discovered — audit to assess the site.",
  audited: "Site captured — run Find clients to qualify.",
  qualified: "Qualified leads — research, then pitch.",
  shortlist: "Starred leads you're pursuing.",
  outreach: "Outreach drafted — send and mark contacted.",
  contacted: "Reached out.",
  rejected: "Not a target.",
};
function cardHtml(c) {
  const opp = c.audit?.taste?.opportunity ?? -1;
  const heat = opp >= 0.7 ? "hot" : opp >= 0.45 ? "warm" : "";
  const sel = state.selected.has(c.id) ? "sel" : "";
  const foc = state.focusId === c.id ? "foc" : "";
  const A = opportunityAngles(c);
  const angle = A.length ? `<span class="pill ${ANGLE_TONE[A[0]] ?? "muted"}">${esc(A[0])}</span>` : "";
  const next = nextStepOf(c);
  const actionable = next.action !== "done" && next.action !== "none" && next.action !== "wait";
  return `<div class="card ${heat} ${sel} ${foc}" data-id="${c.id}" draggable="true" tabindex="0">
    <div class="card-top">
      <button class="star ${c.pipeline?.shortlisted ? "on" : ""}" data-star="${c.id}" title="Shortlist">${c.pipeline?.shortlisted ? "★" : "☆"}</button>
      <span class="card-name">${esc(c.name)}</span>
      <button class="card-del" data-delrow="${c.id}" title="Delete lead" aria-label="Delete ${esc(c.name)}">${ic("trash", 13)}</button>
      <button class="card-menu" data-menu="${c.id}" aria-label="Move lead">${ic("dots", 14)}</button>
    </div>
    <div class="card-sub csub">${esc(c.sector?.vertical ?? "")}${c.location?.city ? " · " + esc(c.location.city) : ""}</div>
    <div class="card-meta">${websiteCell(c)} ${angle} ${huntBadge(c)} ${c.hasDossier ? `<span class="dossier-dot" title="has a dossier">${ic("file", 12)}</span>` : ""}</div>
    ${opp >= 0 ? `<div class="card-opp"><div class="bar" title="opportunity ${opp}"><span style="width:${Math.round(opp * 100)}%"></span></div><span class="num">${opp.toFixed(2)}</span></div>` : ""}
    ${actionable ? `<button class="card-next" data-next="${c.id}" title="${esc(next.reason)}">▸ ${esc(next.label)}${next.agent ? ' <span class="csub">· agent</span>' : ""}</button>` : `<div class="card-next-none csub" title="${esc(next.reason)}">${esc(next.label)}</div>`}
  </div>`;
}
function renderBoard() {
  const list = rows();
  // active filter/facets that match nothing → one clear message, not a row of misleading empties
  if (!list.length && (state.filter.trim() || activeFacets().length)) {
    $("#board").innerHTML = `<div class="board-empty">No leads match your filter.<button class="btn" id="boardClear">Clear filters</button></div>`;
    return;
  }
  const byStage = Object.fromEntries(STAGES.map((s) => [s.key, []]));
  for (const c of list) byStage[stageOf(c)].push(c);
  let cols = STAGES.filter((s) => s.key !== "rejected" || byStage.rejected.length);
  if (state.facets.stage) cols = cols.filter((s) => s.key === state.facets.stage); // stage facet = focus one column
  $("#board").innerHTML = cols.map((s) => {
    const items = byStage[s.key];
    const opps = items.map((c) => c.audit?.taste?.opportunity).filter((x) => typeof x === "number");
    const avg = opps.length ? (opps.reduce((a, b) => a + b, 0) / opps.length).toFixed(2) : null;
    return `<section class="col col-${s.key}" data-stage="${s.key}">
      <header class="col-head"><span class="col-name">${s.label}</span><span class="col-count num">${items.length}</span>${avg ? `<span class="col-avg csub" title="avg opportunity">⌀${avg}</span>` : ""}</header>
      <div class="col-body">${items.length ? items.map(cardHtml).join("") : `<div class="col-empty csub">${STAGE_HINT[s.key]}</div>`}</div>
    </section>`;
  }).join("");
  $("#board").classList.toggle("focused", cols.length === 1); // a single (stage-focused) column gets more width
  sizeBoard();
}
/** Size the board to fill from its top to the viewport bottom, so columns are equal-height AND the
 *  horizontal scrollbar stays on-screen (a fixed CSS offset can't know the real content height above). */
function sizeBoard() {
  const board = $("#board");
  if (!board || state.view !== "board") return;
  const docTop = board.getBoundingClientRect().top + window.scrollY; // stable distance from doc top
  board.style.height = `${Math.max(260, window.innerHeight - docTop - 16)}px`;
}

// ---- view dispatch + bars --------------------------------------------------
function renderView() {
  $("#boardWrap").classList.toggle("on", state.view === "board");
  $("#tableWrap").classList.toggle("on", state.view === "table");
  $("#outreachWrap").classList.toggle("on", state.view === "outreach");
  document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));
  if (state.view === "board") renderBoard();
  else if (state.view === "outreach") renderOutreach();
  else { renderHead(); renderTable(); }
  renderFacetBar();
  renderActionBar();
  sizeBoard(); // after the action bar (it can shift the board's top)
}

const FACET_LABEL = { vertical: "type", stage: "stage", site: "site", angle: "angle", oppMin: "opportunity", district: "district", city: "city", dossier: "has dossier", shortlisted: "shortlisted", qualified: "qualified" };
function facetChip(k, v) {
  const txt = k === "oppMin" ? `opp ≥ ${v}` : k === "stage" ? STAGE_LABEL[v] ?? v : v === true ? FACET_LABEL[k] : `${FACET_LABEL[k]}: ${v}`;
  return `<button class="chip facet-on" data-facet-clear="${k}" title="Remove filter">${esc(txt)} ${ic("x", 9)}</button>`;
}
function setFacet(k, v) {
  if (v === undefined || v === null || v === false || v === "" || state.facets[k] === v) delete state.facets[k];
  else state.facets[k] = v;
  // District drives the city list — if the chosen city no longer sits in the selected district, drop it.
  if (k === "district" && state.facets.city) {
    const stillValid = (state.store?.companies ?? []).some((c) => c.location?.city === state.facets.city && (!state.facets.district || c.location?.district === state.facets.district));
    if (!stillValid) delete state.facets.city;
  }
  state.view === "board" ? renderBoard() : renderTable();
  renderFacetBar(); renderKpis(); syncUrl();
}
function renderFacetBar() {
  const active = activeFacets();
  const companies = state.store?.companies ?? [];
  const verticals = [...new Set(companies.map((c) => c.sector?.vertical).filter(Boolean))].sort();
  const districts = [...new Set(companies.map((c) => c.location?.district).filter(Boolean))].sort();
  // City list cascades off the chosen district: when a district is picked, only its cities are offered.
  const cities = [...new Set(companies
    .filter((c) => !state.facets.district || c.location?.district === state.facets.district)
    .map((c) => c.location?.city).filter(Boolean))].sort();
  const sel = (id, label, opts, cur) => `<select class="facet-sel" data-facet="${id}"><option value="">${label}</option>${opts.map((o) => `<option value="${esc(o.v)}" ${cur === o.v ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select>`;
  const controls = [
    sel("stage", "Stage", STAGES.map((s) => ({ v: s.key, l: s.label })), state.facets.stage),
    sel("vertical", "Type", verticals.map((v) => ({ v, l: v })), state.facets.vertical),
    districts.length ? sel("district", "District", districts.map((v) => ({ v, l: v })), state.facets.district) : "",
    sel("city", "City", cities.map((v) => ({ v, l: v })), state.facets.city),
    sel("site", "Site", [{ v: "yes", l: "has site" }, { v: "good", l: "good site" }, { v: "unreachable", l: "unreachable" }, { v: "none", l: "no site" }], state.facets.site),
    sel("angle", "Angle", ["redesign", "AI upsell", "get-a-site", "growth"].map((v) => ({ v, l: v })), state.facets.angle),
    sel("oppMin", "Opportunity", [{ v: "0.7", l: "≥ 0.7 (hot)" }, { v: "0.45", l: "≥ 0.45" }], state.facets.oppMin != null ? String(state.facets.oppMin) : ""),
  ].join("");
  const chips = active.map(([k, v]) => facetChip(k, v)).join("");
  $("#facetBar").innerHTML = `${controls}${chips}${active.length ? `<button class="chip chip-clear" id="facetClear">clear all</button>` : ""}`;
}

const ACTIONBAR = [
  { act: "audit", label: "Audit", icon: "scan" },
  { act: "deepdive", label: "Deep dive", icon: "search" },
  { act: "shortlist", label: "Shortlist", icon: "star" },
  { act: "outreach", label: "Outreach", icon: "mail" },
  { act: "advance", label: "Advance", icon: "bolt" },
  { act: "delete", label: "Delete", icon: "trash", danger: true },
];
function renderActionBar() {
  const bar = $("#actionBar");
  const ids = selectedIds();
  bar.classList.toggle("on", ids.length > 0);
  if (!ids.length) { bar.innerHTML = ""; return; }
  const auditable = ids.filter((id) => { const c = company(id); return !!(c?.digital?.hasWebsite && c?.contacts?.website); }).length;
  const btns = ACTIONBAR.map((b) => {
    let count = ids.length, note = "", disabled = false;
    if (b.act === "audit") { count = auditable; if (auditable < ids.length) note = `${ids.length - auditable} no site`; if (!auditable) disabled = true; }
    // Set the destructive Delete apart from the safe actions with a divider, so it's clearly the odd one out.
    return `${b.danger ? '<span class="ab-sep" aria-hidden="true"></span>' : ""}<button class="abtn ${b.danger ? "danger" : ""}" data-act="${b.act}" ${disabled ? "disabled" : ""} title="${esc(b.label)}${note ? " · " + note : ""}">${ic(b.icon, 14)} ${b.label}${b.act === "audit" && auditable !== ids.length ? ` (${count})` : ""}</button>`;
  }).join("");
  bar.innerHTML = `<span class="ab-count">${ids.length} selected</span>${btns}<button class="abtn ab-clear" id="selClear" aria-label="Clear selection">${ic("x", 13)}</button>`;
}

const RUN_VERB = { audit: "Auditing", discover: "Discovering", rank: "Ranking", outreach: "Drafting outreach", scope: "Updating scope", delete: "Deleting", hunt: "Hunting leads", import: "Importing leads" };

/** Compact human duration from ms: 45s · 3m12s · 1h04m. */
function fmtDur(ms) {
  if (!(ms > 0)) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}m${String(r).padStart(2, "0")}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

/** The live per-item progress line + bar + elapsed/ETA for a running action (from running.json's
 *  progress field). Returns "" when the action hasn't reported item-level progress yet. */
function progressHtml(run) {
  const p = run.progress;
  const elapsed = run.startedAt ? Date.now() - run.startedAt : 0;
  if (!p) {
    let detail = run.label || "";
    if (detail.startsWith(run.action)) detail = detail.slice(run.action.length).replace(/^[\s·]+/, "").trim();
    return ` <span class="csub">${detail ? esc(detail) + " · " : ""}starting…${elapsed ? " " + fmtDur(elapsed) : ""}</span>`;
  }
  const where = [p.item, p.phase].filter(Boolean).map(esc).join(" — ");
  let countPct = "";
  let bar = "";
  let eta = "";
  if (p.n) {
    const pct = Math.max(0, Math.min(1, p.i / p.n));
    countPct = `<b>${p.i}/${p.n}</b>`;
    bar = `<span class="pbar"><span style="width:${(pct * 100).toFixed(1)}%"></span></span>`;
    if (p.i > 0 && p.i < p.n && elapsed > 0) eta = ` · ~${fmtDur((elapsed / p.i) * (p.n - p.i))} left`;
  }
  // For agent runs (no item count) surface the latest event text — not just the phase/tool count.
  const msg = !p.n && p.message ? ` <span class="csub pmsg">${esc(p.message)}</span>` : "";
  const tools = p.tools ? ` · ${p.tools} tools` : "";
  return ` <span class="csub">${countPct}${countPct && where ? " · " : ""}${where}</span>${msg}${bar}<span class="csub">${fmtDur(elapsed)} elapsed${tools}${eta}</span>`;
}

function renderBanner() {
  const s = state.store?.stats ?? {};
  const el = $("#banner");

  // 1) the loop is actively running something (audit capture, discover, …) — show it.
  const run = state.activity?.running;
  if (run) {
    const verb = RUN_VERB[run.action] || `Running ${run.action}`;
    el.hidden = false;
    el.className = "banner info";
    el.innerHTML = `<span class="bdot live"></span> <b>${esc(verb)}…</b>${progressHtml(run)}${run.reqId ? ` <button class="banner-stop" data-stop="${esc(run.reqId)}" title="Stop this action">${ic("stop", 12)} Stop</button>` : ""}`;
    return;
  }

  // 2) agent-only work waiting: captured sites to grade + requested deep-dives.
  const grade = s.pendingGrading ?? 0;
  const dive = s.pendingDeepdive ?? 0;
  const hunt = s.pendingHunt ?? 0;
  if (!grade && !dive && !hunt) { el.hidden = true; return; }
  el.hidden = false;
  const bits = [];
  if (grade) bits.push(`${grade} to grade`);
  if (dive) bits.push(`${dive} deep-dive${dive > 1 ? "s" : ""} requested`);
  if (hunt) bits.push(`${hunt} hunt${hunt > 1 ? "s" : ""} requested`);
  const work = bits.join(" · ");
  if (s.agentOnline) {
    el.className = "banner info";
    el.innerHTML = `<span class="bdot live"></span> <b>Agent working</b> · ${work}…`;
  } else {
    const cmds = [grade ? "<code>/prospector:prospect-audit</code> grading" : null, dive ? "<code>/prospector:prospect-deepdive</code>" : null, hunt ? "<code>/prospector:prospect-hunt</code>" : null].filter(Boolean).join(" · ");
    el.className = "banner warn";
    el.innerHTML = `<span class="bdot"></span> <b>Agent offline</b> · ${work}. Open a Claude session — ${cmds}.`;
  }
}

function renderScopeChip() {
  const sc = state.store?.scope;
  if (!sc) return;
  $("#scopeChip").textContent = `${sc.country} · ${(sc.verticals ?? []).join("/")} · ${eur(sc.revenue?.min)}–${eur(sc.revenue?.max)}`;
}

// ---- deep-link URL state ---------------------------------------------------
function syncUrl() {
  const p = new URLSearchParams();
  if (state.view !== "board") p.set("view", state.view);
  for (const [k, v] of activeFacets()) p.set(k === "oppMin" ? "opp" : k, v === true ? "1" : v);
  if (state.filter.trim()) p.set("q", state.filter.trim());
  if (state.detailId) p.set("id", state.detailId);
  const s = p.toString();
  history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
}
function readUrl() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("view") === "table" || p.get("view") === "outreach") state.view = p.get("view");
  const f = {};
  for (const k of ["stage", "vertical", "district", "city", "site", "angle"]) if (p.get(k)) f[k] = p.get(k);
  if (p.get("opp")) f.oppMin = Number(p.get("opp"));
  for (const k of ["captured", "graded", "dossier", "shortlisted", "qualified"]) if (p.get(k) === "1") f[k] = true;
  state.facets = f;
  if (p.get("q")) state.filter = p.get("q");
  if (p.get("id")) state.detailId = p.get("id");
}

// ---- "move to stage" menu (drag alternative / keyboard-accessible) ---------
function closeMoveMenu() { document.getElementById("movemenu")?.remove(); }
function openMoveMenu(id, anchor) {
  closeMoveMenu();
  const cur = stageOf(company(id));
  const m = document.createElement("div");
  m.className = "movemenu"; m.id = "movemenu";
  m.innerHTML = `<div class="mm-head csub">Move to…</div>` + STAGES.filter((s) => s.key !== cur).map((s) => `<button class="mm-item" data-move="${s.key}">${esc(s.label)}</button>`).join("");
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = `${Math.min(r.bottom + 4, window.innerHeight - m.offsetHeight - 8)}px`;
  m.style.left = `${Math.min(r.left - 40, window.innerWidth - m.offsetWidth - 8)}px`;
  m.addEventListener("click", (e) => { const b = e.target.closest("[data-move]"); if (b) { moveTo([id], b.dataset.move); closeMoveMenu(); } });
}
document.addEventListener("click", (e) => { if (!e.target.closest("#movemenu") && !e.target.closest("[data-menu]")) closeMoveMenu(); }, true);

// ---- command palette (⌘K) --------------------------------------------------
function palCommands() {
  const reset = () => { state.facets = {}; reRender(); renderFacetBar(); renderKpis(); syncUrl(); };
  const cmds = [
    { t: "Board view", run: () => { state.view = "board"; renderView(); syncUrl(); } },
    { t: "Table view", run: () => { state.view = "table"; renderView(); syncUrl(); } },
    { t: "Outreach view", run: () => { state.view = "outreach"; renderView(); syncUrl(); } },
    ...STAGES.map((s) => ({ t: `Filter: ${s.label} stage`, run: () => setFacet("stage", s.key) })),
    { t: "Clear all filters", run: reset },
    { t: "Discover companies", run: openDiscover },
    { t: "Find clients (hunt)", run: openHunt },
    { t: "Edit scope", run: openScope },
    { t: "Toggle activity console", run: () => toggleConsole() },
  ];
  if (state.selected.size) for (const a of ["audit", "deepdive", "shortlist", "outreach", "advance", "delete"]) cmds.push({ t: `${a[0].toUpperCase() + a.slice(1)} selected (${state.selected.size})`, run: () => runAction(a) });
  for (const c of (state.store?.companies ?? [])) cmds.push({ t: `Open ${c.name}`, sub: c.sector?.vertical, run: () => openPanel(c.id) });
  return cmds;
}
let palIdx = 0, palList = [];
function openPalette() { $("#palette").classList.add("open"); $("#palInput").value = ""; palIdx = 0; renderPalette(""); $("#palInput").focus(); }
function closePalette() { $("#palette").classList.remove("open"); }
function renderPalette(q) {
  q = (q || "").toLowerCase();
  palList = palCommands().filter((c) => c.t.toLowerCase().includes(q)).slice(0, 40);
  palIdx = Math.max(0, Math.min(palIdx, palList.length - 1));
  $("#palList").innerHTML = palList.map((c, i) => `<div class="pal-item ${i === palIdx ? "on" : ""}" data-pi="${i}">${esc(c.t)}${c.sub ? ` <span class="csub">${esc(c.sub)}</span>` : ""}</div>`).join("") || `<div class="pal-empty csub">no commands</div>`;
}
function runPalette(i) { const c = palList[i]; closePalette(); if (c) c.run(); }

/** Don't rebuild the panel while the operator is typing in its outreach editor — a 2s poll would
 *  otherwise wipe unsaved edits mid-keystroke. */
const panelEditing = () => { const a = document.activeElement; return !!(a && $("#panel")?.contains(a) && /^(input|textarea)$/i.test(a.tagName)); };

function renderAll() {
  renderKpis();
  renderBanner();
  renderScopeChip();
  renderView();         // board / table / outreach + facet bar + action bar
  renderSelCount();
  if (state.detailId && !panelEditing()) renderPanel(state.detailId);
}

// ---- detail panel ----------------------------------------------------------
function company(id) { return (state.store?.companies ?? []).find((c) => c.id === id); }

const mutedP = (t) => `<p style="font-size:0.82rem;color:var(--p-muted)">${t}</p>`;

function techRows(a) {
  const t = a.tech ?? {};
  const perf = typeof t.lighthousePerf === "number" ? `${t.lighthousePerf}/100` : '<span class="csub">n/a</span>';
  return `<div class="kv">
    <div class="k">URL</div><div><a href="${esc(a.url)}" target="_blank" style="color:var(--p-info)">${esc(a.url)}</a></div>
    <div class="k">HTTPS</div><div>${t.https ? "yes" : '<span style="color:var(--p-danger)">no</span>'}</div>
    <div class="k">Mobile</div><div>${t.mobileFriendly ? "viewport set" : '<span style="color:var(--p-danger)">no viewport meta</span>'}</div>
    <div class="k">CMS</div><div>${esc(t.cms ?? "—")}</div>
    <div class="k">Last seen</div><div>${esc(t.lastModified ?? "—")}</div>
    <div class="k">Domain age</div><div>${typeof t.domainAge === "number" ? `${t.domainAge}y` : "—"}</div>
    <div class="k">Performance</div><div>${perf}</div>
  </div>`;
}

function shotGrid(c, a) {
  const shots = [...(a.screenshots?.desktop ?? []), ...(a.screenshots?.mobile ?? [])];
  if (!shots.length) return "";
  return `<h3>Screenshots</h3><div class="shots">${shots.map((s) => `<img loading="lazy" src="/screenshots/${c.id}/${encodeURIComponent(s)}" alt="${esc(s)}">`).join("")}</div>`;
}

function renderAuditSection(c) {
  const a = c.audit;
  if (!a) return `<h3>Website audit</h3>${mutedP("Not audited yet. Select this company and hit <b>Audit selected</b>.")}`;
  if (a.reachable === false) {
    const msg = a.reason === "no website"
      ? "No website on record — nothing to audit. (A pitch here is really a <i>get a site</i> pitch, not a redesign.)"
      : `Site unreachable (${esc(a.reason || "error")}${a.status ? `, http ${a.status}` : ""}). No screenshots, no taste score — by design.`;
    return `<h3>Website audit</h3><div class="issue ${a.reason === "no website" ? "medium" : "high"}">${msg}</div>`;
  }
  // Reachable but nothing captured: show an honest note (no taste, no broken screenshot tiles).
  if (!(a.screenshots?.desktop?.length > 0)) {
    return `<h3>Website audit</h3><div class="issue high">Site responded${a.status ? ` (http ${a.status})` : ""} but <b>no screenshots were captured</b> — usually bot-protection, a parked page, or a failed capture${a.captureError ? `: ${esc(a.captureError)}` : ""}. No taste grade is shown — <b>re-audit</b> to verify the site is really live.</div>${techRows(a)}`;
  }
  let taste = "";
  if (a.taste?.pending) {
    taste = `<div class="issue medium">Captured — awaiting visual grading. The taste pass (the agent reads these screenshots and grades them vs the ui-ux rubric) fills the scores.</div>`;
  } else if (a.taste && typeof a.taste.overall === "number") {
    const rows = Object.entries(a.taste.scores ?? {}).map(([k, v]) => `<div>${k}</div><div class="bar"><span style="width:${(v / 5) * 100}%"></span></div><div class="num">${v}</div>`).join("");
    taste = `<div class="kv"><div class="k">Taste</div><div><b>${a.taste.overall}</b>/5 · opportunity <b>${a.taste.opportunity}</b> · effort ${esc(a.taste.effortEstimate ?? "—")}</div></div>
      <h3>Taste breakdown</h3><div class="taste-grid">${rows}</div>
      <h3>Dated signals</h3><div>${(a.taste.datedSignals ?? []).map((s) => `<span class="signal">${esc(s)}</span>`).join("") || "—"}</div>
      <h3>Issues</h3><div>${(a.taste.issues ?? []).map((i) => `<div class="issue ${i.severity}"><b>${esc(i.area)}</b> — ${esc(i.note)}</div>`).join("") || "—"}</div>`;
  }
  return `<h3>Website audit</h3>${techRows(a)}${a.captureError ? `<div class="issue high">capture error: ${esc(a.captureError)}</div>` : ""}${taste}${shotGrid(c, a)}`;
}

/** The lead's position along the linear funnel as a stepper. */
function stepperHtml(c) {
  const cur = stageOf(c);
  if (cur === "rejected") return `<div class="stepper"><span class="step rejected">Rejected in triage</span></div>`;
  const at = cur === "shortlist" ? "qualified" : cur;
  const idx = STEPPER.indexOf(at);
  return `<div class="stepper">${STEPPER.map((s, i) => `<span class="step ${i < idx ? "done" : ""} ${i === idx ? "cur" : ""}">${STAGE_LABEL[s]}</span>`).join('<span class="step-sep"></span>')}</div>`;
}
/** Sticky workflow footer: where the lead is + its recommended next action. */
function panelFooter(c) {
  const n = nextStepOf(c);
  const actionable = !["none", "done", "wait"].includes(n.action);
  const btn = actionable
    ? `<button class="btn btn-primary" id="panelNext" data-next-act="${n.action}">▸ ${esc(n.label)}${n.agent ? ' <span class="csub">· agent</span>' : ""}</button>`
    : `<span class="pill ${n.action === "done" ? "accent" : "muted"}">${esc(n.label)}</span>`;
  return `<div class="panel-foot">
    ${stepperHtml(c)}
    <div class="pf-next"><span class="csub">${esc(n.reason)}</span>${btn}</div>
  </div>`;
}

function renderPanel(id) {
  const c = company(id);
  if (!c) return;
  const src = (c.provenance ?? [])[0]?.source;
  const revStr = revKnown(c) ? `${eur(c.size.revenue.value)} (${c.size?.revenue?.year ?? "—"})` : '<span class="csub">unknown</span>';
  $("#panel").innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="csub">${esc(c.sector?.vertical ?? "")} · ${esc(c.location?.city ?? "")}, ${esc(c.location?.district ?? "")}${src ? ` · <span class="pill muted">${esc(src)}</span>` : ""}</div>
      </div>
      <button class="x" id="panelClose" aria-label="Close">${ic("x", 16)}</button>
    </div>
    <div class="panel-body">
      <h3>Dossier</h3>
      <div class="kv">
        <div class="k">Opportunity</div><div>${c.audit?.taste && typeof c.audit.taste.opportunity === "number" ? `<b>${c.audit.taste.opportunity}</b> <span class="csub">redesign upside</span>` : '<span class="csub">—</span>'}</div>
        <div class="k">Revenue</div><div>${revStr}</div>
        <div class="k">Net income</div><div>${typeof c.size?.netIncome === "number" ? eur(c.size.netIncome) : "—"}</div>
        <div class="k">Employees</div><div>${c.size?.employees ?? "—"}</div>
        <div class="k">Founded</div><div>${c.founded ?? "—"}</div>
        <div class="k">Tax ID</div><div>${esc(c.taxId ?? "—")}</div>
        <div class="k">Website</div><div>${c.contacts?.website ? `<a href="${esc(c.contacts.website)}" target="_blank">${esc(c.contacts.domain ?? c.contacts.website)}</a>` : "none (social only)"}</div>
        <div class="k">Phone</div><div>${(c.contacts?.phones ?? []).map(esc).join(", ") || "—"}</div>
        <div class="k">Email</div><div>${emailLinks(c.contacts?.emails)}</div>
        <div class="k">Social</div><div>${socialChips(c.contacts?.social)}</div>
        ${(() => { const p = c.popularity ?? c.assessment?.popularity; return p && (p.rating != null || p.reviews != null) ? `<div class="k">Popularity</div><div>${p.rating != null ? `${p.rating}★` : "—"}${p.reviews != null ? ` <span class="csub">· ${p.reviews} reviews</span>` : ""}</div>` : ""; })()}
        <div class="k">Status</div><div>${esc(c.pipeline?.status ?? "—")}</div>
      </div>
      ${c.description ? mutedP(esc(c.description)) : ""}
      <h3>Provenance</h3>
      <div style="font-size:0.76rem;color:var(--p-muted)">${(c.provenance ?? []).map((p) => `${esc(p.source)} · ${esc((p.fields ?? []).join(", "))} · conf ${p.confidence}`).join("<br>") || "—"}</div>
      ${renderAssessmentSection(c)}
      ${renderOutreachSection(c)}
      ${renderAuditSection(c)}
      ${renderDossierSection(c)}
    </div>
    ${panelFooter(c)}`;
  $("#panelClose").onclick = closePanel;
  const pn = $("#panelNext"); if (pn) pn.onclick = () => runNext(pn.dataset.nextAct, [c.id]);
}

const ANGLE_LABEL = { redesign: "Redesign", "get-a-site": "Get a site", "ai-upsell": "AI upsell", "marketing-growth": "Marketing growth" };
/** The hunt verdict (decision · leadType · fit) + the usable pitch, rendered above the dossier. */
function renderAssessmentSection(c) {
  const a = c.assessment;
  if (!a) return "";
  const qualified = a.decision === "qualified";
  const fit = typeof a.fit === "number" ? Math.round(a.fit * 100) + "%" : "—";
  const lt = LEADTYPE_LABEL[a.leadType] ?? a.leadType ?? "—";
  const angle = ANGLE_LABEL[a.pitchAngle] ?? a.pitchAngle;
  const pop = a.popularity && (a.popularity.rating != null || a.popularity.reviews != null)
    ? `${a.popularity.rating ?? "—"}★${a.popularity.reviews != null ? ` · ${a.popularity.reviews} reviews` : ""}` : null;
  const reasons = (a.reasons ?? []).length
    ? `<ul class="reasons">${a.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "";
  const head = qualified
    ? `<span class="pill accent">${ic("check", 11)} qualified</span> <span class="pill info">${esc(lt)}</span> <b>fit ${fit}</b>${angle ? ` <span class="csub">· ${esc(angle)} angle</span>` : ""}${pop ? ` <span class="csub">· ${esc(pop)}</span>` : ""}`
    : `<span class="pill warn">${ic("x", 11)} rejected in triage</span>`;
  const pitch = qualified && a.pitch ? `<div class="pitch"><div class="csub" style="margin-bottom:0.35rem">Pitch (go/no-go + outreach base)</div><div class="dossier">${mdToHtml(a.pitch)}</div></div>` : "";
  return `<h3>Hunt verdict</h3><div style="margin-bottom:0.5rem">${head}</div>${reasons}${pitch}`;
}

// ---- outreach: the validate → send tool -----------------------------------
const OUTREACH_STATUS_TONE = { draft: "info", validated: "accent", bundled: "warn", sending: "info", sent: "accent", failed: "danger" };

/** The per-company outreach workspace shown in the detail panel: researched contacts to validate,
 *  an editable email + copy-paste text, and the validate / bundle / send-now controls. */
function renderOutreachSection(c) {
  const o = c.outreach;
  if (!o) {
    return `<h3>Outreach</h3>${mutedP("No outreach drafted yet — the agent researches a contact and writes an email + a text message you can validate, then send.")}<button class="btn" data-outreach-draft="${c.id}">${ic("mail", 14)} Draft outreach <span class="csub">· agent</span></button>`;
  }
  const st = o.status ?? "draft";
  const recip = o.chosenRecipient ?? "";
  const contacts = o.contacts ?? [];
  const sendable = ["validated", "bundled"].includes(st);
  const head = `<span class="pill ${OUTREACH_STATUS_TONE[st] ?? "muted"}">${esc(st)}</span>${o.pitchAngle ? ` <span class="csub">· ${esc(o.pitchAngle)} angle</span>` : ""}${o.emailSentAt ? ` <span class="csub">· sent ${esc(fmtDate(o.emailSentAt))}</span>` : ""}${o.textMarkedAt ? ` <span class="csub">· text sent</span>` : ""}`;

  const contactRows = contacts.length
    ? contacts.map((x, idx) => {
        const v = x.validation ?? "pending";
        const val = x.correctedValue || x.value;
        const isRecip = x.type === "email" && val === recip;
        return `<div class="oc-row v-${v}">
          <span class="pill ${x.type === "email" ? "info" : "muted"}">${esc(x.type)}</span>
          <span class="oc-val">${esc(val)}</span>
          ${x.source ? `<span class="csub" title="${esc(x.source)}">${esc(x.source)}</span>` : ""}
          ${x.confidence != null ? `<span class="csub">${Math.round(x.confidence * 100)}%</span>` : ""}
          <span class="spacer"></span>
          <span class="oc-acts">
            <button class="mini ${v === "valid" ? "on" : ""}" data-oc-validate="${c.id}|${idx}|valid" title="Mark valid">${ic("check", 12)}</button>
            <button class="mini ${v === "invalid" ? "on" : ""}" data-oc-validate="${c.id}|${idx}|invalid" title="Mark invalid">${ic("x", 12)}</button>
            ${x.type === "email" ? `<button class="mini ${isRecip ? "on" : ""}" data-oc-use="${c.id}|${idx}" title="Use as the recipient">use</button>` : ""}
          </span>
        </div>`;
      }).join("")
    : mutedP("Research found no contact — add a recipient by hand below.");

  const editor = `
    <div class="o-field"><label class="csub">Recipient — the email it will be sent to</label>
      <input class="field-in ${isEmailJs(recip) ? "" : "bad"}" id="oRecipient" value="${esc(recip)}" placeholder="name@empresa.pt"></div>
    <div class="o-field"><label class="csub">Email subject</label>
      <input class="field-in" id="oSubject" value="${esc(o.email?.subject ?? "")}"></div>
    <div class="o-field"><label class="csub">Email body</label>
      <textarea class="field-in o-ta" id="oBody" rows="9">${esc(o.email?.body ?? "")}</textarea></div>
    <div class="o-field"><label class="csub">Text message — copy & paste into WhatsApp / IG / SMS</label>
      <textarea class="field-in o-ta" id="oText" rows="4">${esc(o.text?.body ?? "")}</textarea>
      <div class="o-row"><button class="btn" data-outreach-copy="${c.id}">Copy text</button><button class="btn" data-outreach-marktext="${c.id}">${o.textMarkedAt ? "Mark text sent ✓" : "Mark text sent"}</button></div>
    </div>`;

  const actions = `<div class="o-actions">
    <button class="btn" data-outreach-save="${c.id}">Save draft</button>
    <button class="btn btn-primary" data-outreach-validate="${c.id}">${ic("check", 14)} Validate</button>
    ${st === "bundled"
      ? `<button class="btn" data-outreach-unbundle="${c.id}">Remove from bundle</button>`
      : `<button class="btn" data-outreach-bundle="${c.id}" ${sendable ? "" : "disabled"} title="${sendable ? "Add to the send bundle" : "Validate it first"}">Add to bundle</button>`}
    <button class="btn btn-primary" data-outreach-send="${c.id}" ${sendable ? "" : "disabled"} title="${sendable ? "Send the email now" : "Validate it first"}">${ic("mail", 14)} Send now</button>
    <button class="btn" data-outreach-redraft="${c.id}" title="Re-run the agent draft">↻ Regenerate <span class="csub">· agent</span></button>
  </div>${o.error ? `<div class="issue high">send failed: ${esc(o.error)}</div>` : ""}`;

  return `<h3>Outreach</h3><div style="margin-bottom:0.5rem">${head}</div>
    <div class="o-contacts">${contactRows}</div>${editor}${actions}`;
}

/** Read the panel's outreach editor — null when the editor isn't on screen (so callers from the
 *  Outreach LIST never accidentally blank the email/text by sending empty fields). */
function readOutreachEditor() {
  const r = $("#oRecipient");
  if (!r) return null;
  return { chosenRecipient: r.value.trim(), email: { subject: $("#oSubject").value, body: $("#oBody").value }, text: { body: $("#oText").value } };
}
function contactsOf(id) { return (company(id)?.outreach?.contacts ?? []).map((x) => ({ ...x })); }

/** Persist outreach edits/validation/status via the deterministic outreach-save action. Includes the
 *  on-screen editor fields when present, plus any explicit contacts/recipient/status overrides. */
function saveOutreach(id, opts = {}) {
  const ed = readOutreachEditor();
  const patch = ed ? { ...ed } : {};
  if (opts.contacts) patch.contacts = opts.contacts;
  if (opts.chosenRecipient !== undefined) patch.chosenRecipient = opts.chosenRecipient;
  const msg = { action: "outreach-save", companyId: id };
  if (Object.keys(patch).length) msg.patch = patch;
  if (opts.status) msg.status = opts.status;
  if (opts.markTextSent) msg.markTextSent = true;
  postAction(msg);
}
function validateContact(id, idx, verdict) {
  const contacts = contactsOf(id);
  if (!contacts[idx]) return;
  contacts[idx].validation = contacts[idx].validation === verdict ? "pending" : verdict;
  saveOutreach(id, { contacts });
}
function useContact(id, idx) {
  const contacts = contactsOf(id);
  const x = contacts[idx];
  if (!x) return;
  const val = x.correctedValue || x.value;
  const inp = $("#oRecipient"); if (inp) inp.value = val;
  saveOutreach(id, { contacts, chosenRecipient: val });
}
/** Send one email now: ensure edits are saved + the lead is validated, then enqueue the send (the
 *  loop runs FIFO, so the save lands before the send). */
function sendNow(id) {
  const o = company(id)?.outreach;
  const ed = readOutreachEditor();
  const recip = (ed?.chosenRecipient) || o?.chosenRecipient || "";
  if (!isEmailJs(recip)) return toast("set a valid recipient email first", "err");
  if (ed) saveOutreach(id, { status: o?.status === "bundled" ? "bundled" : "validated" });
  else if (!["validated", "bundled"].includes(o?.status)) postAction({ action: "outreach-save", companyId: id, status: "validated" });
  postAction({ action: "send", companyId: id });
  toast("sending…", "ok");
}
function sendBundle() {
  const bundle = (state.store?.companies ?? []).filter((c) => c.outreach?.status === "bundled");
  if (!bundle.length) return toast("bundle is empty — add validated leads to it first", "err");
  if (!confirm(`Send ${bundle.length} email${bundle.length === 1 ? "" : "s"} now?`)) return;
  for (const c of bundle) postAction({ action: "send", companyId: c.id });
  toast(`sending ${bundle.length} email(s)…`, "ok");
}

/** One delegated handler for every outreach control, shared by the panel + the Outreach list.
 *  Returns true if it handled the click. */
function handleOutreachClick(e) {
  const hit = (a) => e.target.closest(`[data-${a}]`);
  let b;
  if ((b = hit("outreach-draft"))) { postAction({ action: "outreach", companyIds: [b.dataset.outreachDraft] }); toast("outreach draft queued — needs the agent", "ok"); return true; }
  if ((b = hit("outreach-redraft"))) { postAction({ action: "outreach", companyIds: [b.dataset.outreachRedraft] }); toast("re-drafting outreach — needs the agent", "ok"); return true; }
  if ((b = hit("outreach-open"))) { openPanel(b.dataset.outreachOpen); return true; }
  if ((b = hit("outreach-save"))) { saveOutreach(b.dataset.outreachSave); toast("saved", "ok"); return true; }
  if ((b = hit("outreach-validate"))) {
    const id = b.dataset.outreachValidate;
    const recip = readOutreachEditor()?.chosenRecipient || company(id)?.outreach?.chosenRecipient || "";
    if (!isEmailJs(recip)) { toast("set a valid recipient email before validating", "err"); return true; }
    saveOutreach(id, { status: "validated" }); toast("validated — ready to send", "ok"); return true;
  }
  if ((b = hit("outreach-bundle"))) { saveOutreach(b.dataset.outreachBundle, { status: "bundled" }); toast("added to bundle", "ok"); return true; }
  if ((b = hit("outreach-unbundle"))) { saveOutreach(b.dataset.outreachUnbundle, { status: "validated" }); toast("removed from bundle", "ok"); return true; }
  if ((b = hit("outreach-send"))) { sendNow(b.dataset.outreachSend); return true; }
  if ((b = hit("outreach-copy"))) {
    const id = b.dataset.outreachCopy;
    const txt = ($("#oText")?.value) ?? company(id)?.outreach?.text?.body ?? "";
    navigator.clipboard?.writeText(txt).then(() => toast("text copied", "ok"), () => toast("copy failed", "err"));
    return true;
  }
  if ((b = hit("outreach-marktext"))) { postAction({ action: "outreach-save", companyId: b.dataset.outreachMarktext, markTextSent: true }); toast("text marked sent", "ok"); return true; }
  if ((b = hit("oc-validate"))) { const [id, idx, verdict] = b.dataset.ocValidate.split("|"); validateContact(id, Number(idx), verdict); return true; }
  if ((b = hit("oc-use"))) { const [id, idx] = b.dataset.ocUse.split("|"); useContact(id, Number(idx)); return true; }
  return false;
}

// ---- outreach view (the worklist + bundle) ---------------------------------
function outreachList() {
  let list = (state.store?.companies ?? []).filter((c) => c.outreach || c.pipeline?.status === "outreach-ready" || c.pipeline?.hunt?.status === "qualified");
  const q = state.filter.trim().toLowerCase();
  if (q) list = list.filter((c) => (c.name + " " + (c.sector?.vertical ?? "") + " " + (c.location?.city ?? "")).toLowerCase().includes(q));
  const rank = (c) => { const s = c.outreach?.status; return s === "bundled" ? 0 : s === "validated" ? 1 : s === "draft" ? 2 : s === "failed" ? 3 : s === "sent" ? 5 : 4; };
  list.sort((a, b) => rank(a) - rank(b) || (b.audit?.taste?.opportunity ?? -1) - (a.audit?.taste?.opportunity ?? -1));
  return list;
}
function renderOutreach() {
  const list = outreachList();
  const bundle = (state.store?.companies ?? []).filter((c) => c.outreach?.status === "bundled");
  const head = `<div class="o-bundlebar"><b>Outreach</b> <span class="csub">${list.length} lead${list.length === 1 ? "" : "s"}</span><span class="spacer"></span><span class="csub">${bundle.length} in bundle</span><button class="btn btn-primary" id="sendBundle" ${bundle.length ? "" : "disabled"}>${ic("mail", 14)} Send bundle (${bundle.length})</button></div>`;
  if (!list.length) { $("#outreach").innerHTML = head + `<div class="empty">No outreach leads yet — qualify leads, then draft outreach from a lead's panel.</div>`; return; }
  const body = list.map((c) => {
    const o = c.outreach;
    const st = o?.status ?? "—";
    const recip = o?.chosenRecipient ?? "";
    const angle = o?.pitchAngle ?? opportunityType(c) ?? "";
    const sendable = o && ["validated", "bundled"].includes(st);
    const acts = !o
      ? `<button class="mini" data-outreach-draft="${c.id}">Draft</button>`
      : `<button class="mini" data-outreach-open="${c.id}">Open</button>`
        + (st === "bundled" ? `<button class="mini on" data-outreach-unbundle="${c.id}">Bundled</button>` : `<button class="mini" data-outreach-bundle="${c.id}" ${sendable ? "" : "disabled"}>+ bundle</button>`)
        + `<button class="mini" data-outreach-send="${c.id}" ${sendable ? "" : "disabled"}>Send</button>`;
    return `<div class="o-listrow" data-id="${c.id}">
      <span class="o-name">${esc(c.name)}</span>
      <span class="csub o-city">${esc(c.location?.city ?? "")}</span>
      ${angle ? `<span class="pill ${ANGLE_TONE[angle] ?? "muted"}">${esc(angle)}</span>` : '<span class="csub">—</span>'}
      <span class="o-recip ${recip ? "" : "missing"}" title="${esc(recip)}">${esc(recip || "no recipient")}</span>
      <span class="pill ${OUTREACH_STATUS_TONE[st] ?? "muted"}">${esc(st)}</span>
      <span class="spacer"></span>
      <span class="o-listacts">${acts}</span>
    </div>`;
  }).join("");
  $("#outreach").innerHTML = head + `<div class="o-listbody">${body}</div>`;
}

function renderDossierSection(c) {
  if (c.hasDossier) {
    return `<h3>Deep-dive report</h3>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem"><button class="btn" data-dossier-view="${c.id}">${ic("file", 14)} View dossier</button><button class="btn" data-dossier-request="${c.id}" title="Re-run the research">↻ Refresh</button></div>
      <div class="dossier" id="dossierBody" hidden></div>`;
  }
  return `<h3>Deep-dive report</h3>${mutedP("No dossier yet — a deep dive gathers everything available and writes a full report.")}<button class="btn" data-dossier-request="${c.id}">${ic("search", 14)} Request deep dive</button>`;
}

async function loadDossier(id) {
  const body = $("#dossierBody");
  if (!body) return;
  body.hidden = false;
  body.innerHTML = '<span class="csub">loading…</span>';
  try {
    const md = await (await fetch(`/dossier?id=${encodeURIComponent(id)}`, { cache: "no-store" })).text();
    body.innerHTML = mdToHtml(md);
  } catch {
    body.innerHTML = '<span class="csub">could not load dossier</span>';
  }
}

/** Minimal, safe markdown → HTML for the dossier (headings, bold/italic/code, links, lists, hr). */
function mdToHtml(md) {
  const lines = esc(md).split("\n");
  const out = [];
  let inList = false;
  const inline = (t) => t
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>'); // bare URLs
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^###\s+/.test(l)) { closeList(); out.push(`<h5>${inline(l.replace(/^###\s+/, ""))}</h5>`); }
    else if (/^##\s+/.test(l)) { closeList(); out.push(`<h4>${inline(l.replace(/^##\s+/, ""))}</h4>`); }
    else if (/^#\s+/.test(l)) { closeList(); out.push(`<h3>${inline(l.replace(/^#\s+/, ""))}</h3>`); }
    else if (/^---+\s*$/.test(l)) { closeList(); out.push("<hr>"); }
    else if (/^[-*]\s+/.test(l)) { if (!inList) { out.push("<ul>"); inList = true; } out.push(`<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`); }
    else if (l.trim() === "") { closeList(); }
    else { closeList(); out.push(`<p>${inline(l)}</p>`); }
  }
  closeList();
  return out.join("\n");
}

function openPanel(id) {
  state.detailId = id;
  renderPanel(id);
  $("#panel").classList.add("open");
  $("#panel").setAttribute("aria-hidden", "false");
  $("#scrim").classList.add("open");
  syncUrl();
}
function closePanel() {
  state.detailId = null;
  $("#panel").classList.remove("open");
  $("#panel").setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("open");
  syncUrl();
}

// ---- data + polling --------------------------------------------------------
async function loadStore() {
  try {
    const r = await fetch("/api/store", { cache: "no-store" });
    const store = await r.json();
    setLive(true, `${store.stats.total} companies · store ok`);
    const sig = JSON.stringify((store.companies ?? []).map((c) => [c.id, c.audit?.taste?.overall, c.audit?.taste?.opportunity, c.audit?.taste?.pending, c.audit?.reachable, c.pipeline?.status, c.pipeline?.hunt?.status, c.pipeline?.hunt?.leadType, c.pipeline?.shortlisted, c.digital?.hasWebsite, c.outreach?.status, c.outreach?.chosenRecipient])) + JSON.stringify(store.scope);
    state.store = store;
    renderBanner(); // refresh each poll — agent online/offline changes without store data changing
    if (sig !== state.sig && !state.dragging) { // never rebuild the board mid-drag — defer to the next poll
      state.sig = sig;
      // drop selections for companies that vanished
      for (const id of [...state.selected]) if (!company(id)) state.selected.delete(id);
      renderAll();
    }
  } catch {
    setLive(false, "bridge offline");
  }
}

async function loadStatus() {
  try {
    // /api/activity carries the live `running` marker too, so the banner reflects work in flight.
    const d = await (await fetch("/api/activity", { cache: "no-store" })).json();
    state.activity = { running: d.running ?? null, pending: d.pending ?? 0 };
    const badge = $("#pending");
    if (d.pending > 0) { badge.hidden = false; badge.textContent = `${d.pending} queued`; }
    else badge.hidden = true;
    renderBanner();
    sizeBoard(); // the banner showing/hiding shifts the board's top
  } catch { /* ignore */ }
}

function setLive(ok, text) {
  $("#live").classList.toggle("off", !ok);
  $("#statusText").textContent = text;
}

// ---- local-worker connection component (Part B): always-visible status pill + a click-through
//      detail panel (status, the exact connect command, Reconnect) — useful in every state. ----
const WORKER_LABEL = { working: "Local worker · running", connected: "Local worker connected", disconnected: "Local worker offline", off: "Local worker · off" };
async function loadWorkers() {
  const el = $("#workerPill");
  if (!el) return;
  let d;
  try { d = await (await fetch("/api/workers", { cache: "no-store" })).json(); } catch { d = { enabled: false, state: "off" }; }
  state.workers = d;
  const st = WORKER_LABEL[d.state] ? d.state : "off";
  el.hidden = false; // always visible so the feature is discoverable (even when disabled)
  el.className = `worker-pill ${st}`;
  el.title = "Local-first agent worker — click for status + how to connect";
  el.innerHTML = `<span class="wp-dot"></span> ${WORKER_LABEL[st]}`;
  if (document.getElementById("workerPanel")) renderWorkerPanel(); // keep an open panel live
}

const WORKER_STATUS = {
  working: "A local Claude session is running agent work off your subscription (the cloud isn't paying).",
  connected: "A local Claude session is connected and idle, ready to take agent work.",
  disconnected: "No local session connected — the cloud agent (metered API) is handling agent work.",
  off: "Worker mode is disabled on the server.",
};
function renderWorkerPanel() {
  const panel = document.getElementById("workerPanel");
  if (!panel) return;
  const d = state.workers ?? { enabled: false, state: "off" };
  const st = WORKER_LABEL[d.state] ? d.state : "off";
  const origin = location.origin;
  const cmd = `export PROSPECTOR_BRIDGE_URL="${origin}"\nexport PROSPECTOR_WORKER_TOKEN="<your token>"`;
  const enableNote = !d.enabled
    ? `<p class="wpn-note">To enable, set <code>PROSPECTOR_WORKER_TOKEN</code> on the server (e.g. <code>flyctl secrets set PROSPECTOR_WORKER_TOKEN=…</code>). Then a local Claude Code session can run the agent work (hunt / deep-dive / outreach) off your subscription, with the cloud's metered API as the fallback.</p>`
    : "";
  const connectSec = d.enabled
    ? `<div class="wpn-sec">
         <div class="wpn-h">Connect a local worker</div>
         <p class="wpn-note">In a Claude Code session logged in with your <b>subscription</b>, set these then run <code>/prospector:prospect-worker</code>:</p>
         <pre class="wpn-cmd" id="wpnCmd">${esc(cmd)}</pre>
         <div class="wpn-actions">
           <button class="btn" data-worker-copy>Copy</button>
           <button class="btn btn-primary" data-worker-reconnect title="Free any stuck job + fail over to the cloud now">Reconnect</button>
         </div>
       </div>`
    : "";
  const stat = (d.workers?.length)
    ? `<div class="wpn-sec csub">${d.workers.length} session(s) connected${d.leases?.length ? ` · ${d.leases.length} job(s) running` : ""}</div>`
    : "";
  panel.innerHTML = `
    <div class="wpn-head"><span class="wp-dot ${st}"></span> <b>Local worker</b></div>
    <p class="wpn-note">${esc(WORKER_STATUS[st])}</p>
    ${enableNote}${connectSec}${stat}`;
}
function toggleWorkerPanel() {
  const existing = document.getElementById("workerPanel");
  if (existing) { existing.remove(); return; }
  const panel = document.createElement("div");
  panel.className = "worker-panel"; panel.id = "workerPanel";
  document.body.appendChild(panel);
  renderWorkerPanel();
  const r = $("#workerPill").getBoundingClientRect();
  panel.style.top = `${r.bottom + 6}px`;
  panel.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
}

// ---- actions ---------------------------------------------------------------
async function postAction(action) {
  try {
    const r = await fetch("/api/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
    const out = await r.json();
    if (!r.ok || out.error) return toast(out.error ?? "action failed", "err");
    toast(`queued: ${action.action}${action.companyIds ? ` (${action.companyIds.length})` : ""}`, "ok");
    loadStatus();
  } catch {
    toast("bridge offline — is the dashboard skill running?", "err");
  }
}

/** Quick per-row/per-card delete of a single lead. Confirms, drops it from the view optimistically
 *  (the poll then confirms), and queues the same `delete` action the bulk action bar uses. */
function deleteLead(id) {
  const c = company(id);
  const name = c?.name ?? "this lead";
  if (!confirm(`Delete "${name}" and its audits + screenshots? This cannot be undone.`)) return;
  state.selected.delete(id);
  if (state.store?.companies) state.store.companies = state.store.companies.filter((x) => x.id !== id); // optimistic
  state.view === "board" ? renderBoard() : renderTable();
  renderActionBar(); renderKpis(); renderFacetBar();
  postAction({ action: "delete", companyIds: [id] });
}

async function cancelAction(payload) {
  try {
    await fetch("/api/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    toast(payload.all ? "cancelling all queued + running…" : "stopping action…", "ok");
    loadStatus();
  } catch {
    toast("bridge offline", "err");
  }
}

function selectedIds() { return [...state.selected]; }

function clearSelection() { state.selected.clear(); renderSelCount(); renderActionBar(); state.view === "board" ? renderBoard() : renderTable(); }

/** Audit only the auditable (has-site) ids; explain what was skipped instead of erroring after click. */
function auditSelection(ids) {
  const hasSite = (id) => { const c = company(id); return !!(c?.digital?.hasWebsite && c?.contacts?.website); };
  const auditable = ids.filter(hasSite);
  if (!auditable.length) return toast("nothing to audit — selected leads have no website", "err");
  if (auditable.length < ids.length) toast(`auditing ${auditable.length} · ${ids.length - auditable.length} have no site`, "ok");
  postAction({ action: "audit", companyIds: auditable });
}
/** Map a manual stage move to the real transition (existing action, or the setstatus action). */
function moveTo(ids, stage) {
  ids = Array.isArray(ids) ? ids : [ids];
  if (!ids.length) return;
  if (stage === "audited") return auditSelection(ids);
  if (stage === "outreach") return postAction({ action: "outreach", companyIds: ids });
  const payload = stage === "qualified" ? { huntStatus: "qualified" }
    : stage === "rejected" ? { huntStatus: "rejected" }
    : stage === "shortlist" ? { shortlisted: true }
    : stage === "contacted" ? { status: "contacted" }
    : stage === "new" ? { status: "candidate" } : null;
  if (!payload) return;
  for (const id of ids) { // optimistic: the card jumps columns immediately, the poll confirms
    const c = company(id); if (!c) continue; c.pipeline = { ...(c.pipeline ?? {}) };
    if (payload.status !== undefined) c.pipeline.status = payload.status;
    if (payload.shortlisted !== undefined) c.pipeline.shortlisted = payload.shortlisted;
    if (payload.huntStatus !== undefined) c.pipeline.hunt = { ...(c.pipeline.hunt ?? {}), status: payload.huntStatus, manual: true };
  }
  state.view === "board" ? renderBoard() : renderTable();
  renderKpis();
  postAction({ action: "setstatus", companyIds: ids, payload });
}
/** Run each lead's recommended next step, grouped by action. */
function advanceSelection(ids) {
  const groups = {};
  for (const id of ids) { const c = company(id); if (!c) continue; const n = nextStepOf(c); if (["none", "done", "wait"].includes(n.action)) continue; (groups[n.action] ??= []).push(id); }
  const acts = Object.keys(groups);
  if (!acts.length) return toast("nothing to advance — no actionable next step in the selection", "ok");
  for (const a of acts) runNext(a, groups[a]);
  toast(`advancing ${acts.reduce((n, a) => n + groups[a].length, 0)} lead(s)…`, "ok");
}
/** Execute one lead's next-step action for the given ids. */
function runNext(action, ids) {
  if (action === "audit") return postAction({ action: "audit", companyIds: ids });
  if (action === "deepdive") return postAction({ action: "deepdive", companyIds: ids });
  if (action === "outreach") return postAction({ action: "outreach", companyIds: ids });
  if (action === "contacted") return moveTo(ids, "contacted");
  if (action === "hunt") return openHunt(); // "qualify" = run a (scoped) Find-clients pass
}

function runAction(act) {
  if (act === "discover") return openDiscover();
  if (act === "hunt") return openHunt();
  const ids = selectedIds();
  if (!ids.length) return toast("select one or more leads first", "err");
  if (act === "delete") {
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "lead" : "leads"} and their audits + screenshots? This cannot be undone.`)) return;
    postAction({ action: "delete", companyIds: ids }); clearSelection(); return;
  }
  if (act === "shortlist") return moveTo(ids, "shortlist");
  if (act === "deepdive") { postAction({ action: "deepdive", companyIds: ids }); toast(`deep dive requested for ${ids.length}`, "ok"); return; }
  if (act === "audit") return auditSelection(ids);
  if (act === "outreach") return postAction({ action: "outreach", companyIds: ids });
  if (act === "advance") return advanceSelection(ids);
}

// ---- hunt modal (find potential clients) -----------------------------------
function openHunt() {
  const sc = state.store?.scope;
  $("#huDistrict").value = sc?.districts?.[0] ?? "";
  $("#huCity").value = sc?.cities?.[0] ?? "";
  if (sc?.verticals?.[0]) $("#huVertical").value = sc.verticals[0];
  $("#huErr").textContent = "";
  $("#huntModal").classList.add("open");
}
function closeHunt() { $("#huntModal").classList.remove("open"); }
function runHunt() {
  const district = $("#huDistrict").value.trim();
  const city = $("#huCity").value.trim();
  const area = [city, district].filter(Boolean).join(", ");
  const vertical = $("#huVertical").value;
  const quota = Math.max(1, Math.min(100, Number($("#huQuota").value) || 10));
  const sources = [...document.querySelectorAll("#huSources input:checked")].map((i) => i.value);
  const leadTypes = [...document.querySelectorAll("#huLeadTypes input:checked")].map((i) => i.value);
  const requireSocial = $("#huRequireSocial").checked;
  const excludeGoodSites = $("#huExcludeGood").checked;
  const popularityMin = $("#huPopMin").value ? Number($("#huPopMin").value) : 0;
  const popularityMax = $("#huPopMax").value ? Number($("#huPopMax").value) : null;
  const effortCap = Math.max(1, Math.min(500, Number($("#huEffort").value) || 40));
  if (!area) return ($("#huErr").textContent = "pick a district or city");
  if (!leadTypes.length) return ($("#huErr").textContent = "pick at least one lead type to qualify");
  if (!sources.length) return ($("#huErr").textContent = "pick at least one source");
  postAction({ action: "hunt", payload: { area, district, city, vertical, verticals: [vertical], quota, sources, leadTypes, requireSocial, excludeGoodSites, popularityMin, popularityMax, effortCap } });
  toast("hunt queued — needs a Claude session (run /prospector:prospect-hunt)", "ok");
  closeHunt();
}

// ---- discover modal --------------------------------------------------------
/** Pre-fill the Discover modal from the active scope, so a run defaults to the scope you've set
 *  (verticals, region, sources, website posture, cap). Re-runs on every open = "reset to scope". */
function openDiscover() {
  const sc = state.store?.scope ?? {};
  $("#dscDistrict").value = sc.districts?.[0] ?? "";
  $("#dscCity").value = sc.cities?.[0] ?? "";
  // verticals ← scope.verticals (default to restaurants if the scope has none)
  const wantV = new Set(sc.verticals?.length ? sc.verticals : ["restaurants"]);
  document.querySelectorAll("#dscVerticals input").forEach((i) => (i.checked = wantV.has(i.value)));
  // sources ← scope.sources.allow (default osm), minus any denied
  const allow = sc.sources?.allow?.length ? sc.sources.allow : ["osm"];
  const deny = new Set(sc.sources?.deny ?? []);
  document.querySelectorAll("#dscSources input").forEach((i) => (i.checked = allow.includes(i.value) && !deny.has(i.value)));
  // website posture ← scope.hasWebsite (true→has, false→none, else any)
  $("#dscWebsite").value = sc.hasWebsite === true ? "has" : sc.hasWebsite === false ? "none" : "any";
  if (sc.maxCompanies) $("#dscCount").value = Math.min(200, sc.maxCompanies);
  const bits = [];
  if (sc.excludeContacted !== false) bits.push("skips contacted");
  if (sc.freshnessDays) bits.push(`skips <${sc.freshnessDays}d-old`);
  if (sc.suppress?.domains?.length) bits.push(`${sc.suppress.domains.length} suppressed domain(s)`);
  $("#dscScopeHint").innerHTML = bits.length ? `Pre-filled from your scope · also honors: ${bits.join(" · ")}. <b>Edit Scope</b> to change the defaults.` : "Pre-filled from your scope. <b>Edit Scope</b> to change the defaults.";
  $("#dscErr").textContent = "";
  $("#discoverModal").classList.add("open");
}
function closeDiscover() { $("#discoverModal").classList.remove("open"); }
function runDiscover() {
  const district = $("#dscDistrict").value.trim();
  const city = $("#dscCity").value.trim();
  const area = [city, district].filter(Boolean).join(", ");
  const verticals = [...document.querySelectorAll("#dscVerticals input:checked")].map((i) => i.value);
  const sources = [...document.querySelectorAll("#dscSources input:checked")].map((i) => i.value);
  const count = Math.max(1, Math.min(200, Number($("#dscCount").value) || 25));
  const website = $("#dscWebsite").value; // any | has | none
  const onlyNew = $("#dscOnlyNew").checked;
  if (!verticals.length) return ($("#dscErr").textContent = "pick at least one vertical");
  if (!sources.length) return ($("#dscErr").textContent = "pick at least one source");
  if (!area && sources.some((s) => s !== "wikidata")) return ($("#dscErr").textContent = "pick a district or city (OSM / Maps / Páginas need a location)");
  postAction({ action: "discover", payload: { sources, area, district, city, verticals, count, website, onlyNew } });
  closeDiscover();
}

// ---- scope modal -----------------------------------------------------------
function openScope() {
  $("#scopeText").value = JSON.stringify(state.store?.scope ?? {}, null, 2);
  $("#scopeErr").textContent = "";
  $("#scopeModal").classList.add("open");
}
function closeScope() { $("#scopeModal").classList.remove("open"); }
function saveScope() {
  let scope;
  try { scope = JSON.parse($("#scopeText").value); }
  catch (e) { return ($("#scopeErr").textContent = "Invalid JSON: " + e.message); }
  postAction({ action: "scope", payload: { scope } });
  closeScope();
}

// ---- screenshot lightbox ---------------------------------------------------
const lb = { shots: [], i: 0, zoom: 1 };
const LB_MIN = 0.25, LB_MAX = 4;
function openLightbox(shots, i) {
  if (!shots.length) return;
  lb.shots = shots; lb.i = i;
  lbShow();
  $("#lightbox").classList.add("open");
}
function lbShow() {
  const s = lb.shots[lb.i];
  if (!s) return;
  $("#lbImg").src = s.src;
  $("#lbCap").textContent = `${s.label}  ·  ${lb.i + 1}/${lb.shots.length}`;
  const multi = lb.shots.length > 1;
  $("#lbPrev").style.display = multi ? "" : "none";
  $("#lbNext").style.display = multi ? "" : "none";
  lb.zoom = 1; lbApplyZoom();                 // each image starts at fit-width
  $("#lbStage").scrollTop = 0; $("#lbStage").scrollLeft = 0;
}
function lbApplyZoom() {
  $("#lbImg").style.width = `${lb.zoom * 100}%`;       // % of the stage = fit-width at 100%
  $("#lbZoomLevel").textContent = `${Math.round(lb.zoom * 100)}%`;
}
function lbZoom(factor) { lb.zoom = Math.min(LB_MAX, Math.max(LB_MIN, lb.zoom * factor)); lbApplyZoom(); }
function lbFit() { lb.zoom = 1; lbApplyZoom(); $("#lbStage").scrollLeft = 0; }
function lbNav(d) { lb.i = (lb.i + d + lb.shots.length) % lb.shots.length; lbShow(); }
function closeLightbox() { $("#lightbox").classList.remove("open"); $("#lbImg").src = ""; }

// ---- activity console ------------------------------------------------------
function toggleConsole(force) {
  state.console.open = typeof force === "boolean" ? force : !state.console.open;
  $("#console").classList.toggle("open", state.console.open);
  $("#activityBtn").classList.toggle("btn-primary", state.console.open);
  if (state.console.open) loadActivity();
}
function setConsoleTab(t) {
  state.console.tab = t;
  document.querySelectorAll(".ctab").forEach((b) => b.classList.toggle("on", b.dataset.ctab === t));
  $("#paneFeed").classList.toggle("on", t === "feed");
  $("#paneStream").classList.toggle("on", t === "log"); // "Log" tab = the live agent event stream
  if (t === "log") loadActivity(); // refresh the stream immediately on switch
}

// ---- live agent event stream (the Log tab) --------------------------------
// kind → [tag, css-class] for the terminal-style rows. No emoji — colored mono tags.
const EV_KIND = { meta: ["META", "k-meta"], prompt: ["PROMPT", "k-prompt"], system: ["INIT", "k-system"], msg: ["MSG", "k-msg"], tool: ["TOOL", "k-tool"], tool_result: ["RES", "k-res"], stderr: ["ERR", "k-err"], result: ["DONE", "k-done"] };
function streamRow(e) {
  const [tag, cls] = EV_KIND[e.kind] || ["·", "k-msg"];
  const who = e.who === "subagent" ? '<span class="ev-who">sub</span>' : "";
  const detail = e.detail && e.detail !== e.label ? `<div class="ev-detail">${esc(e.detail)}</div>` : "";
  return `<div class="ev ${cls}${detail ? " has-detail" : ""}" data-seq="${e.seq}"><span class="ev-seq">${e.seq}</span><span class="ev-tag">${tag}</span><span class="ev-main">${who}<span class="ev-label">${esc(e.label)}</span>${detail}</span></div>`;
}
/** Pick the request whose events to stream: a live agent run, else the most recent agent result. */
function streamReqId(d) {
  if (d.running?.agent && d.running.reqId) return d.running.reqId;
  const r = (d.results || []).find((x) => (x.action === "hunt" || x.action === "deepdive") && x.reqId);
  return r?.reqId ?? null;
}
/** Append new events for the active request into #streamBody (DOM append = it streams). */
async function streamUpdate(d) {
  if (!state.console.open || state.console.tab !== "log") return;
  const body = $("#streamBody");
  const reqId = streamReqId(d);
  if (reqId !== state.stream.reqId) { state.stream = { reqId, seq: 0 }; body.innerHTML = ""; } // new run → reset
  if (!reqId) { $("#streamWho").textContent = "no agent run yet"; if (!body.children.length) body.innerHTML = '<div class="console-empty">No agent run yet — start <b>Find clients</b> or <b>Deep dive</b> to stream its events here.</div>'; return; }
  const running = !!(d.running && d.running.reqId === reqId);
  let ev; try { ev = await (await fetch(`/api/events?reqId=${encodeURIComponent(reqId)}&after=${state.stream.seq}`, { cache: "no-store" })).json(); } catch { return; }
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;
  if (state.stream.seq === 0) { body.innerHTML = ""; if (ev.skipped) body.insertAdjacentHTML("beforeend", `<div class="ev-skip">… ${ev.skipped} earlier events hidden</div>`); }
  for (const e of ev.events) body.insertAdjacentHTML("beforeend", streamRow(e));
  state.stream.seq = ev.total;
  $("#streamWho").textContent = `${reqId} · ${ev.total} event${ev.total === 1 ? "" : "s"}${running ? " · live" : " · done"}`;
  body.classList.toggle("live", running);
  if (atBottom) body.scrollTop = body.scrollHeight;
}
const logLink = (reqId) => reqId ? `<a class="loglink" href="/log?reqId=${encodeURIComponent(reqId)}" target="_blank" rel="noopener" title="Full action log / claude transcript">log ${ic("ext", 11)}</a>` : "";
const actRow = (cls, action, sum, meta, reqId) =>
  `<div class="act ${cls}"><span class="a-act">${esc(action)}</span><span class="a-sum">${esc(sum)}</span><span class="a-meta">${logLink(reqId)}${meta ? `<span class="csub"> ${esc(meta)}</span>` : ""}</span></div>`;

async function loadActivity() {
  let d;
  try { d = await (await fetch("/api/activity", { cache: "no-store" })).json(); } catch { return; }
  $("#consoleLive").classList.toggle("busy", !!d.running);
  $("#consoleState").textContent = d.running ? `running ${d.running.label || d.running.action}…` : d.pending ? `${d.pending} queued` : "idle";
  // NOTE: the #pending badge is owned solely by loadStatus() — don't set it here too,
  // or the two pollers (different intervals) flip its text back and forth ("1" ↔ "1 queued").

  const parts = [];
  if (d.running) parts.push(`<div class="act run"><span class="a-act">${esc(d.running.action)}</span><span class="a-sum">${progressHtml(d.running) || esc(d.running.label || "")}</span><span class="a-meta">${logLink(d.running.reqId)}${d.running.reqId ? `<button class="stopbtn" data-stop="${esc(d.running.reqId)}">${ic("stop", 11)} Stop</button>` : "running…"}</span></div>`);
  for (const q of d.queue) parts.push(`<div class="act queued"><span class="a-act">${esc(q.action)}</span><span class="a-sum">${esc(q.target || "")}</span><span class="a-meta">${q.id ? `<button class="stopbtn" data-stop="${esc(q.id)}" aria-label="Cancel">${ic("x", 11)}</button>` : "queued"}</span></div>`);
  for (const r of d.results) parts.push(actRow(r.ok ? "" : "fail", r.action, r.summary || "", `${r.ms != null ? `${r.ms}ms` : ""}${r.costUSD ? ` · $${r.costUSD.toFixed(2)}` : ""}`, r.reqId));
  $("#paneFeed").innerHTML = parts.join("") || '<div class="console-empty">No activity yet. Trigger an action (Discover, Audit, Score…).</div>';

  // raw loop/system log (folded behind the "raw" toggle in the stream pane)
  const log = $("#paneLog");
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  log.textContent = (d.log || []).join("\n") || "(loop log empty — is the watch-loop running?)";
  if (atBottom) log.scrollTop = log.scrollHeight;

  streamUpdate(d); // live agent event stream (the Log tab)
}

// ---- toasts ----------------------------------------------------------------
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- wiring ----------------------------------------------------------------
const reRender = () => { state.view === "board" ? renderBoard() : renderTable(); };
$("#filter").addEventListener("input", (e) => { state.filter = e.target.value; reRender(); renderActionBar(); syncUrl(); });
$("#thead").addEventListener("click", (e) => {
  const th = e.target.closest("[data-sort]");
  if (!th) return;
  const key = th.dataset.sort;
  state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : (key === "name" || key === "vertical" || key === "status" ? 1 : -1) };
  renderHead(); renderTable();
});
$("#thead").addEventListener("change", (e) => {
  if (e.target.id !== "selAll") return;
  const ids = rows().map((c) => c.id);
  if (e.target.checked) ids.forEach((id) => state.selected.add(id));
  else ids.forEach((id) => state.selected.delete(id));
  renderTable(); renderSelCount();
});
$("#tbody").addEventListener("click", (e) => {
  const star = e.target.closest("[data-star]");
  if (star) {
    const id = star.dataset.star;
    const c = company(id);
    const next = !c?.pipeline?.shortlisted;
    if (c) { c.pipeline = { ...(c.pipeline ?? {}), shortlisted: next }; renderTable(); } // optimistic; poll confirms
    postAction({ action: "shortlist", companyIds: [id], payload: { value: next } });
    return;
  }
  const del = e.target.closest("[data-delrow]");
  if (del) { deleteLead(del.dataset.delrow); return; }
  const check = e.target.closest("[data-check]");
  if (check) {
    const id = check.dataset.check;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    e.target.closest(".trow").classList.toggle("sel");
    renderSelCount(); renderActionBar();
    return;
  }
  const row = e.target.closest("[data-id]");
  if (row) openPanel(row.dataset.id);
});

// ---- board interactions (click + drag-to-advance) --------------------------
function toggleSelect(id) { if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id); renderSelCount(); renderActionBar(); reRender(); }
function flashCard(id) { try { const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`); if (el) { el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 700); } } catch { /* ignore */ } }
$("#board").addEventListener("click", (e) => {
  if (lpFired) { lpFired = false; return; } // a long-press already handled this interaction (select), don't also open
  if (e.target.closest("#boardClear")) { state.facets = {}; state.filter = ""; $("#filter").value = ""; reRender(); renderFacetBar(); renderKpis(); syncUrl(); return; }
  const star = e.target.closest("[data-star]");
  if (star) { const id = star.dataset.star; const c = company(id); const v = !c?.pipeline?.shortlisted; if (c) { c.pipeline = { ...(c.pipeline ?? {}), shortlisted: v }; renderBoard(); } postAction({ action: "shortlist", companyIds: [id], payload: { value: v } }); return; }
  const del = e.target.closest("[data-delrow]");
  if (del) { deleteLead(del.dataset.delrow); return; }
  const nx = e.target.closest("[data-next]");
  if (nx) { const c = company(nx.dataset.next); if (c) { runNext(nextStepOf(c).action, [c.id]); flashCard(c.id); } return; }
  const menu = e.target.closest("[data-menu]");
  if (menu) { openMoveMenu(menu.dataset.menu, menu); return; }
  const card = e.target.closest(".card");
  if (!card) return;
  // In select mode (anything already selected) a plain click toggles selection instead of opening the
  // detail — the click is hijacked by the multi-select, so tapping cards keeps building the set. Modifier
  // keys do the same. Clear the selection (× in the action bar) to leave select mode and reopen details.
  if (e.metaKey || e.ctrlKey || e.shiftKey || state.selected.size > 0) { toggleSelect(card.dataset.id); return; }
  openPanel(card.dataset.id);
});
let dragId = null;
$("#board").addEventListener("dragstart", (e) => { const card = e.target.closest(".card"); if (!card) return; dragId = card.dataset.id; state.dragging = true; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
$("#board").addEventListener("dragend", (e) => { e.target.closest(".card")?.classList.remove("dragging"); document.querySelectorAll(".col.drop").forEach((c) => c.classList.remove("drop")); dragId = null; state.dragging = false; });
$("#board").addEventListener("dragover", (e) => { const col = e.target.closest(".col"); if (!col) return; e.preventDefault(); document.querySelectorAll(".col.drop").forEach((c) => c !== col && c.classList.remove("drop")); col.classList.add("drop"); });
$("#board").addEventListener("drop", (e) => { const col = e.target.closest(".col"); if (!col || !dragId) return; e.preventDefault(); const ids = state.selected.has(dragId) ? selectedIds() : [dragId]; col.classList.remove("drop"); moveTo(ids, col.dataset.stage); });

// ---- long-press to multi-select (board cards) ------------------------------
// Press-and-hold a card for 1s (without moving or dragging) to toggle it into the selection — a
// touch-friendly path to multi-select that mirrors Cmd/Ctrl-click. Movement or release cancels it.
const LP_MS = 1000, LP_MOVE = 10;
let lpTimer = null, lpCard = null, lpStart = null, lpFired = false;
function cancelLongPress() {
  if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
  if (lpCard) { lpCard.classList.remove("lp-arming"); lpCard = null; }
  lpStart = null;
}
$("#board").addEventListener("pointerdown", (e) => {
  if (e.button > 0) return; // primary button / touch only
  lpFired = false;
  if (e.target.closest("[data-star],[data-delrow],[data-menu],[data-next],#boardClear")) return; // real controls own the press
  const card = e.target.closest(".card");
  if (!card) return;
  cancelLongPress();
  lpCard = card; lpStart = { x: e.clientX, y: e.clientY };
  card.classList.add("lp-arming");
  lpTimer = setTimeout(() => {
    lpFired = true; lpTimer = null;
    card.classList.remove("lp-arming"); lpCard = null;
    toggleSelect(card.dataset.id); // enter multi-select on this card
    flashCard(card.dataset.id);
  }, LP_MS);
});
$("#board").addEventListener("pointermove", (e) => {
  if (!lpStart) return;
  if (Math.abs(e.clientX - lpStart.x) > LP_MOVE || Math.abs(e.clientY - lpStart.y) > LP_MOVE) cancelLongPress();
});
$("#board").addEventListener("pointerup", cancelLongPress);
$("#board").addEventListener("pointercancel", cancelLongPress);
$("#board").addEventListener("pointerleave", cancelLongPress);
$("#board").addEventListener("dragstart", cancelLongPress); // a real drag pre-empts the hold
// The touch context-menu the hold would otherwise raise on mobile: swallow it while a press is armed/fired.
$("#board").addEventListener("contextmenu", (e) => { if (lpFired || lpCard) e.preventDefault(); });

// ---- contextual action bar + facets + KPIs + view toggle -------------------
$("#actionBar").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) return runAction(b.dataset.act); if (e.target.closest("#selClear")) clearSelection(); });
$("#facetBar").addEventListener("change", (e) => { const s = e.target.closest("[data-facet]"); if (!s) return; const k = s.dataset.facet; setFacet(k, k === "oppMin" ? (s.value ? Number(s.value) : undefined) : (s.value || undefined)); });
$("#facetBar").addEventListener("click", (e) => { const cl = e.target.closest("[data-facet-clear]"); if (cl) return setFacet(cl.dataset.facetClear, undefined); if (e.target.closest("#facetClear")) { state.facets = {}; reRender(); renderFacetBar(); renderKpis(); syncUrl(); } });
$("#kpis").addEventListener("click", (e) => { const k = e.target.closest("[data-kpi]"); if (!k) return; const key = k.dataset.kpi; if (key === "clear") { state.facets = {}; reRender(); renderFacetBar(); renderKpis(); syncUrl(); return; } const [fk, fv] = key.split(":"); setFacet(fk, fk === "oppMin" ? Number(fv) : fv === "true" ? true : fv); });
document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; renderView(); syncUrl(); }));
window.addEventListener("resize", sizeBoard);
$("#editScope").addEventListener("click", openScope);
// ---- import / export the store bundle ----
$("#exportBtn").addEventListener("click", () => {
  const a = document.createElement("a"); a.href = "/api/export"; a.download = ""; // Content-Disposition forces the download
  document.body.appendChild(a); a.click(); a.remove();
  toast("preparing export…", "ok");
});
$("#importBtn").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ""; // reset so the same file can be re-picked
  if (!file) return;
  toast(`uploading ${file.name}…`, "ok");
  try {
    const r = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/gzip" }, body: file });
    const out = await r.json();
    if (!r.ok || out.error) return toast(out.error ?? "import failed", "err");
    toast(`import queued (${(out.bytes / 1048576).toFixed(1)} MB) — merging…`, "ok");
    loadStatus();
  } catch { toast("upload failed — is the app reachable?", "err"); }
});
$("#workerPill").addEventListener("click", (e) => { e.stopPropagation(); toggleWorkerPanel(); });
document.addEventListener("click", async (e) => {
  // close the worker panel on any outside click
  const panel = document.getElementById("workerPanel");
  if (panel && !e.target.closest("#workerPanel") && !e.target.closest("#workerPill")) panel.remove();
  // copy the connect command
  if (e.target.closest("[data-worker-copy]")) {
    const cmd = document.getElementById("wpnCmd")?.textContent ?? "";
    navigator.clipboard?.writeText(cmd).then(() => toast("connect command copied", "ok"), () => toast("copy failed", "err"));
    return;
  }
  // reconnect: free stuck leases + fail over to the cloud now
  if (e.target.closest("[data-worker-reconnect]")) {
    try {
      const out = await (await fetch("/api/worker/reset", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
      toast(out.reconnect || "freed stuck jobs — run /prospector:prospect-worker locally to reconnect", "ok");
      loadWorkers();
    } catch { toast("reconnect failed", "err"); }
  }
});
$("#scopeCancel").addEventListener("click", closeScope);
$("#scopeSave").addEventListener("click", saveScope);
$("#scrim").addEventListener("click", closePanel);
$("#scopeModal").addEventListener("click", (e) => { if (e.target.id === "scopeModal") closeScope(); });
$("#dscCancel").addEventListener("click", closeDiscover);
$("#dscRun").addEventListener("click", runDiscover);
$("#discoverModal").addEventListener("click", (e) => { if (e.target.id === "discoverModal") closeDiscover(); });
$("#primebar").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) runAction(b.dataset.act); });
$("#huCancel").addEventListener("click", closeHunt);
$("#huRun").addEventListener("click", runHunt);
$("#huntModal").addEventListener("click", (e) => { if (e.target.id === "huntModal") closeHunt(); });
$("#activityBtn").addEventListener("click", () => toggleConsole());
$("#consoleClose").addEventListener("click", () => toggleConsole(false));
$("#cancelAll").addEventListener("click", () => cancelAction({ all: true }));
document.querySelectorAll(".ctab").forEach((b) => b.addEventListener("click", () => setConsoleTab(b.dataset.ctab)));
$("#rawToggle").addEventListener("click", () => { state.console.raw = !state.console.raw; $("#paneStream").classList.toggle("rawon", state.console.raw); $("#rawToggle").classList.toggle("on", state.console.raw); });
$("#streamBody").addEventListener("click", (e) => { const row = e.target.closest(".ev.has-detail"); if (row) row.classList.toggle("open"); });
const stopClick = (e) => { const s = e.target.closest("[data-stop]"); if (s) cancelAction({ reqId: s.dataset.stop }); };
$("#banner").addEventListener("click", stopClick);
$("#paneFeed").addEventListener("click", stopClick);
$("#outreach").addEventListener("click", (e) => {
  if (e.target.closest("#sendBundle")) return sendBundle();
  if (handleOutreachClick(e)) return;
  const row = e.target.closest(".o-listrow");
  if (row) openPanel(row.dataset.id);
});
$("#panel").addEventListener("click", (e) => {
  if (handleOutreachClick(e)) return;
  const dv = e.target.closest("[data-dossier-view]");
  if (dv) { loadDossier(dv.dataset.dossierView); return; }
  const dr = e.target.closest("[data-dossier-request]");
  if (dr) { postAction({ action: "deepdive", companyIds: [dr.dataset.dossierRequest] }); toast("deep dive requested — needs a Claude session (/prospector:prospect-deepdive)", "ok"); return; }
  const img = e.target.closest(".shots img");
  if (!img) return;
  const imgs = [...$("#panel").querySelectorAll(".shots img")];
  openLightbox(imgs.map((x) => ({ src: x.getAttribute("src"), label: x.getAttribute("alt") })), imgs.indexOf(img));
});
$("#lbClose").addEventListener("click", closeLightbox);
$("#lbPrev").addEventListener("click", () => lbNav(-1));
$("#lbNext").addEventListener("click", () => lbNav(1));
$("#lbZoomIn").addEventListener("click", () => lbZoom(1.25));
$("#lbZoomOut").addEventListener("click", () => lbZoom(1 / 1.25));
$("#lbFit").addEventListener("click", lbFit);
$("#lbStage").addEventListener("wheel", (e) => { if (e.ctrlKey) { e.preventDefault(); lbZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); } }, { passive: false });
$("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });
// ---- command palette wiring ----
$("#paletteBtn").addEventListener("click", openPalette);
$("#palInput").addEventListener("input", (e) => { palIdx = 0; renderPalette(e.target.value); });
$("#palList").addEventListener("click", (e) => { const it = e.target.closest("[data-pi]"); if (it) runPalette(Number(it.dataset.pi)); });
$("#palette").addEventListener("click", (e) => { if (e.target.id === "palette") closePalette(); });

function moveFocus(delta) {
  const list = rows(); if (!list.length) return;
  let i = list.findIndex((c) => c.id === state.focusId);
  i = i < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, i + delta));
  state.focusId = list[i].id; reRender();
  try { document.querySelector(`[data-id="${CSS.escape(state.focusId)}"]`)?.scrollIntoView({ block: "nearest" }); } catch { /* ignore */ }
}
const typing = (e) => /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;

document.addEventListener("keydown", (e) => {
  // command palette
  if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("#palette").classList.contains("open") ? closePalette() : openPalette(); return; }
  if ($("#palette").classList.contains("open")) {
    if (e.key === "Escape") closePalette();
    else if (e.key === "ArrowDown") { e.preventDefault(); palIdx = Math.min(palList.length - 1, palIdx + 1); renderPalette($("#palInput").value); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); renderPalette($("#palInput").value); }
    else if (e.key === "Enter") { e.preventDefault(); runPalette(palIdx); }
    return;
  }
  if ($("#lightbox").classList.contains("open")) {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lbNav(-1);
    else if (e.key === "ArrowRight") lbNav(1);
    else if (e.key === "+" || e.key === "=") lbZoom(1.25);
    else if (e.key === "-" || e.key === "_") lbZoom(1 / 1.25);
    else if (e.key === "0") lbFit();
    return;
  }
  if (e.key === "Escape") { closePalette(); closeMoveMenu(); closePanel(); closeScope(); closeDiscover(); closeHunt(); toggleConsole(false); return; }
  if (typing(e)) return;
  if (e.key === "/") { e.preventDefault(); $("#filter").focus(); return; }
  if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); moveFocus(1); return; }
  if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); moveFocus(-1); return; }
  if (e.key === "Enter" && state.focusId) { openPanel(state.focusId); return; }
  if ((e.key === "x" || e.key === " ") && state.focusId) { e.preventDefault(); toggleSelect(state.focusId); return; }
});

// boot
readUrl();
loadStore().then(() => { if (state.detailId && company(state.detailId)) openPanel(state.detailId); });
loadStatus();
setInterval(loadStore, 2000);
setInterval(loadStatus, 2000);
loadWorkers();
setInterval(loadWorkers, 3000);
setInterval(() => { if (state.console.open) loadActivity(); }, 1500);
