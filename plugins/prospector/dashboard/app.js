// Prospector dashboard — vanilla JS, no build. Reads the aggregated store from the
// bridge, renders it, and turns button clicks into queued actions. It never executes
// anything itself; the dashboard skill's watch-loop runs the queue and mutates the store.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (n) => (n ? "€" + (n / 1000).toFixed(0) + "k" : "—");

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
  filterShortlisted: false,
  filterQualified: false,
  detailId: null,
  sig: "",
  console: { open: false, tab: "feed" },
  activity: { running: null, pending: 0 },
};

const COLS = [
  { key: "sel", label: "" },
  { key: "name", label: "Company", sortable: true },
  { key: "vertical", label: "Vertical", sortable: true },
  { key: "revenue", label: "Revenue", sortable: true },
  { key: "employees", label: "Staff", sortable: true },
  { key: "site", label: "Site", sortable: true },
  { key: "taste", label: "Taste", sortable: true, tip: "Visual quality of the site, 1 (worst)–5 (best), graded from the screenshots." },
  { key: "opportunity", label: "Opportunity", sortable: true, tip: "How much a redesign would help THIS site (0–1), from the taste grade. Leads are ranked by this — higher = better prospect." },
  { key: "status", label: "Status", sortable: true },
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
    case "site": return c.digital?.hasWebsite ? 1 : 0;
    case "taste": return c.audit?.taste?.overall ?? -1;
    case "opportunity": return c.audit?.taste?.opportunity ?? -1;
    case "status": return c.pipeline?.status ?? "";
    default: return "";
  }
}

// ---- rendering -------------------------------------------------------------
function renderHead() {
  $("#thead").innerHTML = COLS.map((col) => {
    if (col.key === "sel") return `<div><input type="checkbox" id="selAll" title="Select all (filtered)"></div>`;
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
    { label: "Companies", value: s.total ?? 0 },
    { label: "Captured", value: s.captured ?? 0 },
    { label: "Graded", value: s.graded ?? 0 },
    { label: "High opportunity", value: s.highOpportunity ?? 0, hot: true },
    { label: "No website", value: s.noWebsite ?? 0 },
  ];
  $("#kpis").innerHTML = cards.map((c) => `<div class="kpi ${c.hot ? "hot" : ""}"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`).join("");
}

function rows() {
  let list = (state.store?.companies ?? []).slice();
  if (state.filterShortlisted) list = list.filter((c) => c.pipeline?.shortlisted);
  if (state.filterQualified) list = list.filter((c) => c.pipeline?.hunt?.status === "qualified");
  const f = state.filter.trim().toLowerCase();
  if (f) list = list.filter((c) => (c.name + " " + (c.sector?.vertical ?? "") + " " + (c.location?.city ?? "")).toLowerCase().includes(f));
  const { key, dir } = state.sort;
  list.sort((a, b) => {
    const va = val(a, key), vb = val(b, key);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return list;
}

function tasteTone(v) { return v < 0 ? "muted" : v < 2.2 ? "danger" : v < 3.4 ? "warn" : "accent"; }
const revKnown = (c) => c.size?.revenueKnown !== false && typeof c.size?.revenue?.value === "number" && c.size.revenue.value > 0;

/** Honest taste + opportunity cells from the real audit state — never a fabricated number. */
function auditCells(c) {
  const a = c.audit;
  if (!a) return { taste: '<span class="csub">—</span>', opp: '<span class="csub">not audited</span>' };
  if (a.reachable === false) {
    const lbl = a.reason === "no website" ? "no site" : a.reason || "unreachable";
    return { taste: `<span class="pill warn" title="${esc(a.reason ?? "")}">${esc(lbl)}</span>`, opp: '<span class="csub">—</span>' };
  }
  if (a.taste?.pending) return { taste: '<span class="pill info">grading…</span>', opp: '<span class="csub">captured</span>' };
  if (a.taste && typeof a.taste.overall === "number") {
    const t = a.taste.overall, o = a.taste.opportunity;
    return { taste: `<span class="pill ${tasteTone(t)}">${t}</span>`, opp: `<div class="bar" title="${o}"><span style="width:${Math.round(o * 100)}%"></span></div>` };
  }
  return { taste: '<span class="csub">—</span>', opp: '<span class="csub">—</span>' };
}

const LEADTYPE_LABEL = { "improvable-site": "redesign", "no-website": "get-a-site", "good-site": "AI upsell" };
/** A small qualified/rejected chip from the hunt verdict, shown next to the company name. */
function huntBadge(c) {
  const h = c.pipeline?.hunt;
  if (!h) return "";
  if (h.status === "rejected") return ' <span class="pill muted" title="hunt: rejected in triage">✕</span>';
  const fit = typeof h.fit === "number" ? Math.round(h.fit * 100) + "%" : "";
  const lt = LEADTYPE_LABEL[h.leadType] ?? h.leadType ?? "lead";
  return ` <span class="pill accent" title="hunt-qualified · ${esc(lt)}${fit ? " · fit " + fit : ""}">✓ ${esc(fit || "lead")}</span>`;
}

function renderTable() {
  const list = rows();
  if (!list.length) {
    $("#tbody").innerHTML = `<div class="empty">No companies${state.filter ? " match the filter" : " yet — hit Discover"}.</div>`;
    return;
  }
  $("#tbody").innerHTML = list.map((c) => {
    const opp = c.audit?.taste?.opportunity ?? -1;
    const heat = opp >= 0.7 ? "hot" : opp >= 0.45 ? "warm" : "";
    const sel = state.selected.has(c.id) ? "sel" : "";
    const cells = auditCells(c);
    return `<div class="trow ${heat} ${sel}" data-id="${c.id}">
      <div><input type="checkbox" data-check="${c.id}" ${sel ? "checked" : ""}></div>
      <div class="namecell">
        <button class="star ${c.pipeline?.shortlisted ? "on" : ""}" data-star="${c.id}" title="${c.pipeline?.shortlisted ? "Remove from shortlist" : "Shortlist as potential client"}">${c.pipeline?.shortlisted ? "★" : "☆"}</button>
        <div><div class="cname">${esc(c.name)}${huntBadge(c)}${c.hasDossier ? ' <span class="dossier-dot" title="has a deep-dive dossier">📄</span>' : ""}</div><div class="csub">${esc(c.location?.city ?? "")}</div></div>
      </div>
      <div><span class="pill ${VTONE[c.sector?.vertical] ?? "muted"}">${esc(c.sector?.vertical ?? "—")}</span></div>
      <div class="num">${revKnown(c) ? eur(c.size.revenue.value) : '<span class="csub" title="revenue unknown — neutral can-pay prior">?</span>'}</div>
      <div class="num">${c.size?.employees ?? "—"}</div>
      <div>${c.digital?.hasWebsite ? '<span class="pill muted">yes</span>' : '<span class="pill warn">none</span>'}</div>
      <div>${cells.taste}</div>
      <div>${cells.opp}</div>
      <div><span class="pill ${c.pipeline?.status === "contacted" ? "accent" : c.pipeline?.status === "outreach-ready" ? "info" : "muted"}">${esc(c.pipeline?.status ?? "—")}</span></div>
    </div>`;
  }).join("");
  updateSelAll();
}

function renderSelCount() {
  const n = state.selected.size;
  $("#selCount").textContent = n ? `${n} selected` : "";
}

const RUN_VERB = { audit: "Auditing", discover: "Discovering", rank: "Ranking", outreach: "Drafting outreach", scope: "Updating scope", delete: "Deleting", hunt: "Hunting leads" };

function renderBanner() {
  const s = state.store?.stats ?? {};
  const el = $("#banner");

  // 1) the loop is actively running something (audit capture, discover, …) — show it.
  const run = state.activity?.running;
  if (run) {
    const verb = RUN_VERB[run.action] || `Running ${run.action}`;
    let detail = run.label || "";
    if (detail.startsWith(run.action)) detail = detail.slice(run.action.length).replace(/^[\s·]+/, "").trim();
    el.hidden = false;
    el.className = "banner info";
    el.innerHTML = `<span class="bdot live"></span> <b>${esc(verb)}…</b>${detail ? ` <span class="csub">${esc(detail)}</span>` : ""} <span class="csub">· working in the background</span>${run.reqId ? ` <button class="banner-stop" data-stop="${esc(run.reqId)}" title="Stop this action">⏹ Stop</button>` : ""}`;
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

function renderShortlistChip() {
  const n = state.store?.stats?.shortlisted ?? 0;
  $("#shortlistCount").textContent = n ? `(${n})` : "";
  $("#shortlistFilter").classList.toggle("btn-primary", state.filterShortlisted);
}

function renderQualifiedChip() {
  const n = state.store?.stats?.qualified ?? 0;
  $("#qualifiedCount").textContent = n ? `(${n})` : "";
  $("#qualifiedFilter").classList.toggle("btn-primary", state.filterQualified);
}

function renderAll() {
  renderHead();
  renderKpis();
  renderBanner();
  renderScopeChip();
  renderShortlistChip();
  renderQualifiedChip();
  renderTable();
  renderSelCount();
  if (state.detailId) renderPanel(state.detailId);
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
      <button class="x" id="panelClose">✕</button>
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
      ${renderAuditSection(c)}
      ${renderDossierSection(c)}
    </div>`;
  $("#panelClose").onclick = closePanel;
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
    ? `<span class="pill accent">✓ qualified</span> <span class="pill info">${esc(lt)}</span> <b>fit ${fit}</b>${angle ? ` <span class="csub">· ${esc(angle)} angle</span>` : ""}${pop ? ` <span class="csub">· ${esc(pop)}</span>` : ""}`
    : `<span class="pill warn">✕ rejected in triage</span>`;
  const pitch = qualified && a.pitch ? `<div class="pitch"><div class="csub" style="margin-bottom:0.35rem">Pitch (go/no-go + outreach base)</div><div class="dossier">${mdToHtml(a.pitch)}</div></div>` : "";
  return `<h3>Hunt verdict</h3><div style="margin-bottom:0.5rem">${head}</div>${reasons}${pitch}`;
}

function renderDossierSection(c) {
  if (c.hasDossier) {
    return `<h3>Deep-dive report</h3>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem"><button class="btn" data-dossier-view="${c.id}">📄 View dossier</button><button class="btn" data-dossier-request="${c.id}" title="Re-run the research">↻ Refresh</button></div>
      <div class="dossier" id="dossierBody" hidden></div>`;
  }
  return `<h3>Deep-dive report</h3>${mutedP("No dossier yet — a deep dive gathers everything available and writes a full report.")}<button class="btn" data-dossier-request="${c.id}">🔍 Request deep dive</button>`;
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
}
function closePanel() {
  state.detailId = null;
  $("#panel").classList.remove("open");
  $("#panel").setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("open");
}

// ---- data + polling --------------------------------------------------------
async function loadStore() {
  try {
    const r = await fetch("/api/store", { cache: "no-store" });
    const store = await r.json();
    setLive(true, `${store.stats.total} companies · store ok`);
    const sig = JSON.stringify((store.companies ?? []).map((c) => [c.id, c.audit?.taste?.overall, c.audit?.taste?.opportunity, c.audit?.taste?.pending, c.pipeline?.status, c.digital?.hasWebsite])) + JSON.stringify(store.scope);
    state.store = store;
    renderBanner(); // refresh each poll — agent online/offline changes without store data changing
    if (sig !== state.sig) {
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
  } catch { /* ignore */ }
}

function setLive(ok, text) {
  $("#live").classList.toggle("off", !ok);
  $("#statusText").textContent = text;
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

function runAction(act) {
  if (act === "discover") return openDiscover();
  if (act === "hunt") return openHunt();
  const ids = selectedIds();
  if (!ids.length) return toast("select one or more companies first", "err");
  if (act === "delete") {
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? "company" : "companies"} and their audits + screenshots? This cannot be undone.`)) return;
    postAction({ action: "delete", companyIds: ids });
    state.selected.clear();
    renderSelCount();
    return;
  }
  if (act === "shortlist") return postAction({ action: "shortlist", companyIds: ids, payload: { value: true } });
  if (act === "deepdive") {
    postAction({ action: "deepdive", companyIds: ids });
    toast(`deep dive requested for ${ids.length} — needs a Claude session (run /prospector:prospect-deepdive)`, "ok");
    return;
  }
  if (act === "audit") {
    // an audit needs a reachable website — drop no-website companies up front, deselect them, explain.
    const hasSite = (id) => { const c = company(id); return !!(c?.digital?.hasWebsite && c?.contacts?.website); };
    const auditable = ids.filter(hasSite);
    const noSite = ids.filter((id) => !hasSite(id));
    if (noSite.length) {
      noSite.forEach((id) => state.selected.delete(id));
      renderTable(); renderSelCount();
      const n = noSite.length;
      if (auditable.length) toast(`Skipped ${n} with no website · auditing ${auditable.length}`, "ok");
      else return toast(`${n} selected ${n > 1 ? "have" : "has"} no website — nothing to audit`, "err");
    }
    return postAction({ action: "audit", companyIds: auditable });
  }
  if (act === "outreach") return postAction({ action: act, companyIds: ids });
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
function openDiscover() {
  const sc = state.store?.scope;
  $("#dscDistrict").value = sc?.districts?.[0] ?? "";
  $("#dscCity").value = sc?.cities?.[0] ?? "";
  if (sc?.verticals?.[0]) $("#dscVertical").value = sc.verticals[0];
  $("#dscErr").textContent = "";
  $("#discoverModal").classList.add("open");
}
function closeDiscover() { $("#discoverModal").classList.remove("open"); }
function runDiscover() {
  const district = $("#dscDistrict").value.trim();
  const city = $("#dscCity").value.trim();
  const area = [city, district].filter(Boolean).join(", ");
  const vertical = $("#dscVertical").value;
  const sources = [...document.querySelectorAll("#dscSources input:checked")].map((i) => i.value);
  const count = Math.max(1, Math.min(200, Number($("#dscCount").value) || 25));
  const onlyWithWebsite = $("#dscOnlyWeb").checked;
  if (!sources.length) return ($("#dscErr").textContent = "pick at least one source");
  if (!area && sources.some((s) => s !== "wikidata")) return ($("#dscErr").textContent = "pick a district or city (OSM / Maps / Páginas need a location)");
  postAction({ action: "discover", payload: { sources, area, district, city, vertical, count, onlyWithWebsite } });
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
  $("#paneLog").classList.toggle("on", t === "log");
}
const actRow = (cls, action, sum, meta) =>
  `<div class="act ${cls}"><span class="a-act">${esc(action)}</span><span class="a-sum">${esc(sum)}</span><span class="a-meta">${esc(meta)}</span></div>`;

async function loadActivity() {
  let d;
  try { d = await (await fetch("/api/activity", { cache: "no-store" })).json(); } catch { return; }
  $("#consoleLive").classList.toggle("busy", !!d.running);
  $("#consoleState").textContent = d.running ? `running ${d.running.label || d.running.action}…` : d.pending ? `${d.pending} queued` : "idle";
  // NOTE: the #pending badge is owned solely by loadStatus() — don't set it here too,
  // or the two pollers (different intervals) flip its text back and forth ("1" ↔ "1 queued").

  const parts = [];
  if (d.running) parts.push(`<div class="act run"><span class="a-act">${esc(d.running.action)}</span><span class="a-sum">${esc(d.running.label || "")}</span><span class="a-meta">${d.running.reqId ? `<button class="stopbtn" data-stop="${esc(d.running.reqId)}">⏹ Stop</button>` : "running…"}</span></div>`);
  for (const q of d.queue) parts.push(`<div class="act queued"><span class="a-act">${esc(q.action)}</span><span class="a-sum">${esc(q.target || "")}</span><span class="a-meta">${q.id ? `<button class="stopbtn" data-stop="${esc(q.id)}">✕</button>` : "queued"}</span></div>`);
  for (const r of d.results) parts.push(actRow(r.ok ? "" : "fail", r.action, r.summary || "", r.ms != null ? `${r.ms}ms` : ""));
  $("#paneFeed").innerHTML = parts.join("") || '<div class="console-empty">No activity yet. Trigger an action (Discover, Audit, Score…).</div>';

  const log = $("#paneLog");
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  log.textContent = (d.log || []).join("\n") || "(loop log empty — is the watch-loop running?)";
  if (atBottom) log.scrollTop = log.scrollHeight;
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
$("#filter").addEventListener("input", (e) => { state.filter = e.target.value; renderTable(); });
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
    const cur = company(id)?.pipeline?.shortlisted;
    postAction({ action: "shortlist", companyIds: [id], payload: { value: !cur } });
    return;
  }
  const check = e.target.closest("[data-check]");
  if (check) {
    const id = check.dataset.check;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    e.target.closest(".trow").classList.toggle("sel");
    renderSelCount();
    return;
  }
  const row = e.target.closest("[data-id]");
  if (row) openPanel(row.dataset.id);
});
document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => runAction(b.dataset.act)));
$("#editScope").addEventListener("click", openScope);
$("#shortlistFilter").addEventListener("click", () => { state.filterShortlisted = !state.filterShortlisted; renderTable(); renderShortlistChip(); });
$("#scopeCancel").addEventListener("click", closeScope);
$("#scopeSave").addEventListener("click", saveScope);
$("#scrim").addEventListener("click", closePanel);
$("#scopeModal").addEventListener("click", (e) => { if (e.target.id === "scopeModal") closeScope(); });
$("#dscCancel").addEventListener("click", closeDiscover);
$("#dscRun").addEventListener("click", runDiscover);
$("#discoverModal").addEventListener("click", (e) => { if (e.target.id === "discoverModal") closeDiscover(); });
$("#qualifiedFilter").addEventListener("click", () => { state.filterQualified = !state.filterQualified; renderTable(); renderQualifiedChip(); });
$("#huCancel").addEventListener("click", closeHunt);
$("#huRun").addEventListener("click", runHunt);
$("#huntModal").addEventListener("click", (e) => { if (e.target.id === "huntModal") closeHunt(); });
$("#activityBtn").addEventListener("click", () => toggleConsole());
$("#consoleClose").addEventListener("click", () => toggleConsole(false));
$("#cancelAll").addEventListener("click", () => cancelAction({ all: true }));
document.querySelectorAll(".ctab").forEach((b) => b.addEventListener("click", () => setConsoleTab(b.dataset.ctab)));
const stopClick = (e) => { const s = e.target.closest("[data-stop]"); if (s) cancelAction({ reqId: s.dataset.stop }); };
$("#banner").addEventListener("click", stopClick);
$("#paneFeed").addEventListener("click", stopClick);
$("#panel").addEventListener("click", (e) => {
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
document.addEventListener("keydown", (e) => {
  if ($("#lightbox").classList.contains("open")) {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lbNav(-1);
    else if (e.key === "ArrowRight") lbNav(1);
    else if (e.key === "+" || e.key === "=") lbZoom(1.25);
    else if (e.key === "-" || e.key === "_") lbZoom(1 / 1.25);
    else if (e.key === "0") lbFit();
    return;
  }
  if (e.key === "Escape") { closePanel(); closeScope(); closeDiscover(); closeHunt(); toggleConsole(false); }
});

// boot
loadStore();
loadStatus();
setInterval(loadStore, 2000);
setInterval(loadStatus, 2000);
setInterval(() => { if (state.console.open) loadActivity(); }, 1500);
