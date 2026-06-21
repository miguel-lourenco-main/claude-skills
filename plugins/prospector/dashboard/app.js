// Prospector dashboard — vanilla JS, no build. Reads the aggregated store from the
// bridge, renders it, and turns button clicks into queued actions. It never executes
// anything itself; the dashboard skill's watch-loop runs the queue and mutates the store.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const eur = (n) => (n ? "€" + (n / 1000).toFixed(0) + "k" : "—");

const state = {
  store: null,
  selected: new Set(),
  sort: { key: "leadScore", dir: -1 },
  filter: "",
  detailId: null,
  sig: "",
};

const COLS = [
  { key: "sel", label: "" },
  { key: "name", label: "Company", sortable: true },
  { key: "vertical", label: "Vertical", sortable: true },
  { key: "revenue", label: "Revenue", sortable: true },
  { key: "employees", label: "Staff", sortable: true },
  { key: "site", label: "Site", sortable: true },
  { key: "taste", label: "Taste", sortable: true },
  { key: "opportunity", label: "Opportunity", sortable: true },
  { key: "leadScore", label: "Score", sortable: true },
  { key: "status", label: "Status", sortable: true },
];

const VTONE = { hospitality: "info", clinics: "accent", legal: "warn", realEstate: "info", trades: "muted" };

function val(c, key) {
  switch (key) {
    case "name": return c.name?.toLowerCase() ?? "";
    case "vertical": return c.sector?.vertical ?? "";
    case "revenue": return c.size?.revenue?.value ?? 0;
    case "employees": return c.size?.employees ?? 0;
    case "site": return c.digital?.hasWebsite ? 1 : 0;
    case "taste": return c.audit?.taste?.overall ?? -1;
    case "opportunity": return c.audit?.taste?.opportunity ?? -1;
    case "leadScore": return c.pipeline?.leadScore ?? -1;
    case "status": return c.pipeline?.status ?? "";
    default: return "";
  }
}

// ---- rendering -------------------------------------------------------------
function renderHead() {
  $("#thead").innerHTML = COLS.map((col) => {
    if (col.key === "sel") return `<div></div>`;
    const arrow = state.sort.key === col.key ? `<span class="arrow">${state.sort.dir < 0 ? "▾" : "▴"}</span>` : "";
    return `<div class="th" data-sort="${col.key}">${col.label} ${arrow}</div>`;
  }).join("");
}

function renderKpis() {
  const s = state.store?.stats ?? {};
  const cards = [
    { label: "Companies", value: s.total ?? 0 },
    { label: "Audited", value: s.audited ?? 0 },
    { label: "High opportunity", value: s.highOpportunity ?? 0, hot: true },
    { label: "No website", value: s.noWebsite ?? 0 },
    { label: "Contacted", value: s.contacted ?? 0 },
  ];
  $("#kpis").innerHTML = cards.map((c) => `<div class="kpi ${c.hot ? "hot" : ""}"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`).join("");
}

function rows() {
  let list = (state.store?.companies ?? []).slice();
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

function renderTable() {
  const list = rows();
  if (!list.length) {
    $("#tbody").innerHTML = `<div class="empty">No companies${state.filter ? " match the filter" : " yet — hit Discover"}.</div>`;
    return;
  }
  $("#tbody").innerHTML = list.map((c) => {
    const score = c.pipeline?.leadScore;
    const heat = score >= 70 ? "hot" : score >= 45 ? "warm" : "";
    const sel = state.selected.has(c.id) ? "sel" : "";
    const opp = c.audit?.taste?.opportunity;
    const taste = c.audit?.taste?.overall;
    return `<div class="trow ${heat} ${sel}" data-id="${c.id}">
      <div><input type="checkbox" data-check="${c.id}" ${sel ? "checked" : ""}></div>
      <div><div class="cname">${esc(c.name)}</div><div class="csub">${esc(c.location?.city ?? "")}</div></div>
      <div><span class="pill ${VTONE[c.sector?.vertical] ?? "muted"}">${esc(c.sector?.vertical ?? "—")}</span></div>
      <div class="num">${eur(c.size?.revenue?.value)}</div>
      <div class="num">${c.size?.employees ?? "—"}</div>
      <div>${c.digital?.hasWebsite ? '<span class="pill muted">yes</span>' : '<span class="pill warn">none</span>'}</div>
      <div>${taste != null ? `<span class="pill ${tasteTone(taste)}">${taste}</span>` : '<span class="csub">—</span>'}</div>
      <div>${opp != null ? `<div class="bar" title="${opp}"><span style="width:${Math.round(opp * 100)}%"></span></div>` : '<span class="csub">not audited</span>'}</div>
      <div class="score">${score != null ? score : "—"}</div>
      <div><span class="pill ${c.pipeline?.status === "contacted" ? "accent" : c.pipeline?.status === "outreach-ready" ? "info" : "muted"}">${esc(c.pipeline?.status ?? "—")}</span></div>
    </div>`;
  }).join("");
}

function renderSelCount() {
  const n = state.selected.size;
  $("#selCount").textContent = n ? `${n} selected` : "";
}

function renderScopeChip() {
  const sc = state.store?.scope;
  if (!sc) return;
  $("#scopeChip").textContent = `${sc.country} · ${(sc.verticals ?? []).join("/")} · ${eur(sc.revenue?.min)}–${eur(sc.revenue?.max)}`;
}

function renderAll() {
  renderHead();
  renderKpis();
  renderScopeChip();
  renderTable();
  renderSelCount();
  if (state.detailId) renderPanel(state.detailId);
}

// ---- detail panel ----------------------------------------------------------
function company(id) { return (state.store?.companies ?? []).find((c) => c.id === id); }

function renderPanel(id) {
  const c = company(id);
  if (!c) return;
  const a = c.audit;
  const shots = a?.screenshots ? [...(a.screenshots.desktop ?? []), ...(a.screenshots.mobile ?? [])] : [];
  const tasteRows = a
    ? Object.entries(a.taste.scores).map(([k, v]) => `<div>${k}</div><div class="bar"><span style="width:${(v / 5) * 100}%"></span></div><div class="num">${v}</div>`).join("")
    : "";
  $("#panel").innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="csub">${esc(c.sector?.vertical ?? "")} · ${esc(c.location?.city ?? "")}, ${esc(c.location?.district ?? "")}</div>
      </div>
      <button class="x" id="panelClose">✕</button>
    </div>
    <div class="panel-body">
      <h3>Dossier</h3>
      <div class="kv">
        <div class="k">Lead score</div><div><b>${c.pipeline?.leadScore ?? "—"}</b></div>
        <div class="k">Revenue</div><div>${eur(c.size?.revenue?.value)} (${c.size?.revenue?.year ?? "—"})</div>
        <div class="k">Net income</div><div>${eur(c.size?.netIncome)}</div>
        <div class="k">Employees</div><div>${c.size?.employees ?? "—"}</div>
        <div class="k">Founded</div><div>${c.founded ?? "—"}</div>
        <div class="k">Tax ID</div><div>${esc(c.taxId ?? "—")}</div>
        <div class="k">Website</div><div>${c.contacts?.website ? `<a href="${esc(c.contacts.website)}" target="_blank" style="color:var(--p-info)">${esc(c.contacts.domain)}</a>` : "none (social only)"}</div>
        <div class="k">Phone</div><div>${esc((c.contacts?.phones ?? [])[0] ?? "—")}</div>
        <div class="k">Status</div><div>${esc(c.pipeline?.status ?? "—")}</div>
      </div>
      <p style="font-size:0.82rem;color:var(--p-muted);margin-top:0.8rem">${esc(c.description ?? "")}</p>
      <h3>Provenance</h3>
      <div style="font-size:0.76rem;color:var(--p-muted)">${(c.provenance ?? []).map((p) => `${esc(p.source)} · ${esc((p.fields ?? []).join(", "))} · conf ${p.confidence}`).join("<br>") || "—"}</div>

      ${a ? `
      <h3>Website audit</h3>
      <div class="kv">
        <div class="k">Taste</div><div><b>${a.taste.overall}</b>/5 · opportunity <b>${a.taste.opportunity}</b> · effort ${esc(a.taste.effortEstimate)}</div>
        <div class="k">HTTPS</div><div>${a.tech.https ? "yes" : '<span style="color:var(--p-danger)">no</span>'}</div>
        <div class="k">Mobile</div><div>${a.tech.mobileFriendly ? "friendly" : '<span style="color:var(--p-danger)">not friendly</span>'}</div>
        <div class="k">Performance</div><div>${a.tech.lighthousePerf}/100</div>
        <div class="k">CMS</div><div>${esc(a.tech.cms)}</div>
        <div class="k">Last modified</div><div>${esc(a.tech.lastModified)}</div>
      </div>
      <h3>Taste breakdown</h3>
      <div class="taste-grid">${tasteRows}</div>
      <h3>Dated signals</h3>
      <div>${(a.taste.datedSignals ?? []).map((s) => `<span class="signal">${esc(s)}</span>`).join("") || "—"}</div>
      <h3>Issues</h3>
      <div>${(a.taste.issues ?? []).map((i) => `<div class="issue ${i.severity}"><b>${esc(i.area)}</b> — ${esc(i.note)}</div>`).join("") || "—"}</div>
      ${shots.length ? `<h3>Screenshots</h3><div class="shots">${shots.map((s) => `<img loading="lazy" src="/screenshots/${c.id}/${encodeURIComponent(s)}" alt="${esc(s)}">`).join("")}</div>` : ""}
      ` : `<h3>Website audit</h3><p style="font-size:0.82rem;color:var(--p-muted)">Not audited yet. Select this company and hit <b>Audit selected</b>.</p>`}
    </div>`;
  $("#panelClose").onclick = closePanel;
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
    const sig = JSON.stringify((store.companies ?? []).map((c) => [c.id, c.pipeline?.leadScore, c.audit?.taste?.overall, c.audit?.taste?.opportunity, c.pipeline?.status, c.digital?.hasWebsite])) + JSON.stringify(store.scope);
    state.store = store;
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
    const r = await fetch("/api/status", { cache: "no-store" });
    const s = await r.json();
    const badge = $("#pending");
    if (s.pending > 0) { badge.hidden = false; badge.textContent = `${s.pending} queued`; }
    else badge.hidden = true;
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

function selectedIds() { return [...state.selected]; }

function runAction(act) {
  if (act === "discover") return postAction({ action: "discover", payload: { count: 3 } });
  if (act === "score") return postAction({ action: "score" });
  if (act === "audit" || act === "outreach") {
    const ids = selectedIds();
    if (!ids.length) return toast("select one or more companies first", "err");
    return postAction({ action: act, companyIds: ids });
  }
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
$("#tbody").addEventListener("click", (e) => {
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
$("#scopeCancel").addEventListener("click", closeScope);
$("#scopeSave").addEventListener("click", saveScope);
$("#scrim").addEventListener("click", closePanel);
$("#scopeModal").addEventListener("click", (e) => { if (e.target.id === "scopeModal") closeScope(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePanel(); closeScope(); } });

// boot
loadStore();
loadStatus();
setInterval(loadStore, 2000);
setInterval(loadStatus, 2000);
