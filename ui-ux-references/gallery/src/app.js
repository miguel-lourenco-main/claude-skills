// UI Reference Library — static gallery over the baked data.json.
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Tiny markdown for teardown prose: paragraphs, `- ` bullet lists, **bold**, `code`.
function md(text) {
  if (!text) return "";
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const out = [];
  let list = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    if (bullet) {
      if (!list) { list = []; }
      list.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
  }
  if (list) out.push(`<ul>${list.join("")}</ul>`);
  return out.join("");
}

const state = { records: [], filtered: [], category: "all", query: "", sort: "quality" };

const grid = $("#grid");
const emptyMsg = $("#empty");
const overlay = $("#overlay");

async function boot() {
  let data;
  try {
    data = await (await fetch("data.json")).json();
  } catch {
    grid.innerHTML = `<p class="empty">Couldn't load <code>data.json</code> — run the build first.</p>`;
    return;
  }
  state.records = data.records || [];
  const { meta } = data;
  $("#stat-count").textContent = meta.count;
  $("#stat-cats").textContent = (meta.categories || []).length;
  if (meta.generated) {
    $("#gen").textContent = `updated ${meta.generated}`;
    $("#gen").hidden = false;
    $("#gen-sep").hidden = false;
  }
  buildPills(meta.categories || []);
  wire();
  apply();
}

function buildPills(cats) {
  const wrap = $("#cat-pills");
  const count = (c) => state.records.filter((r) => c === "all" || r.category === c).length;
  const mk = (val, label) => {
    const b = el("button", "pill", `${esc(label)}<span class="ct">${count(val)}</span>`);
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(val === state.category));
    b.dataset.val = val;
    b.onclick = () => { state.category = val; syncPills(); apply(); };
    return b;
  };
  wrap.append(mk("all", "All"));
  for (const c of cats) wrap.append(mk(c, c));
}
function syncPills() {
  for (const b of document.querySelectorAll(".pill"))
    b.setAttribute("aria-selected", String(b.dataset.val === state.category));
}

function wire() {
  $("#search").addEventListener("input", (e) => { state.query = e.target.value.toLowerCase().trim(); apply(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
  $("#close").onclick = closeDetail;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeDetail(); });
}

function apply() {
  const terms = state.query.split(/\s+/).filter(Boolean);
  let rows = state.records.filter((r) => {
    if (state.category !== "all" && r.category !== state.category) return false;
    if (!terms.length) return true;
    const hay = `${r.title} ${r.category} ${r.tags.join(" ")} ${r.palette.map((p) => p.label).join(" ")}`.toLowerCase();
    return terms.every((t) => hay.includes(t)); // all words must match (AND)
  });
  rows.sort(state.sort === "title" ? (a, b) => a.title.localeCompare(b.title) : (a, b) => b.quality - a.quality);
  state.filtered = rows;
  render(rows);
}

function render(rows) {
  grid.innerHTML = "";
  emptyMsg.hidden = rows.length > 0;
  rows.forEach((r, i) => {
    const card = el("button", "card");
    card.style.animationDelay = `${Math.min(i, 12) * 35}ms`;
    const sw = r.palette.slice(0, 6).map((p) => `<i style="background:${esc(p.hex || "#222")}"></i>`).join("");
    const tags = r.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const more = r.tags.length > 3 ? `<span class="tag more">+${r.tags.length - 3}</span>` : "";
    card.innerHTML = `
      <div class="shot">
        ${r.shots.above_fold ? `<img src="${esc(r.shots.above_fold)}" alt="${esc(r.title)} screenshot" decoding="async" />` : `<span class="no-shot">no screenshot</span>`}
        <span class="q-badge"><b>${r.quality}</b>/100</span>
      </div>
      <div class="card-body">
        <div class="card-head">
          <span class="card-title">${esc(r.title)}</span>
          <span class="cat-chip">${esc(r.category)}</span>
        </div>
        <div class="swatches">${sw}</div>
        <div class="tags">${tags}${more}</div>
      </div>`;
    card.onclick = () => openDetail(r);
    grid.append(card);
  });
}

function openDetail(r) {
  const pal = r.palette
    .map(
      (p) => `<div class="chip"><span class="sw" style="background:${esc(p.hex || "#222")}"></span>
        <span class="meta"><span class="hex">${esc(p.hex || "—")}</span><span class="lbl">${esc(p.label || "")}</span></span></div>`,
    )
    .join("");
  const tags = r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const T = r.teardown || {};
  const sectionDefs = [
    ["style", "Style"],
    ["palette_notes", "Palette"],
    ["typography", "Typography"],
    ["layout", "Layout"],
    ["strengths", "Strengths"],
    ["weaknesses", "Weaknesses"],
    ["patterns", "Notable patterns"],
    ["when_to_use", "When to use"],
  ];
  const sections = sectionDefs
    .filter(([k]) => T[k])
    .map(([k, label]) => `<div class="sec"><h3>${label}</h3><div class="prose">${md(T[k])}</div></div>`)
    .join("");
  const fonts =
    r.headingFont || r.bodyFont
      ? `<div class="fonts">
          ${r.headingFont ? `<div class="f"><b>Heading</b><span>${esc(r.headingFont)}</span></div>` : ""}
          ${r.bodyFont ? `<div class="f"><b>Body</b><span>${esc(r.bodyFont)}</span></div>` : ""}
        </div>`
      : "";
  const shot = r.shots.full || r.shots.above_fold;
  $("#detail").innerHTML = `
    ${shot ? `<div class="d-hero"><img src="${esc(shot)}" alt="${esc(r.title)} full page" /></div>` : ""}
    <div class="d-pad">
      <h2 id="d-title">${esc(r.title)}</h2>
      <div class="d-meta">
        <span class="qpill"><b>${r.quality}</b>/100</span>
        <span class="mono">${esc(r.category)}</span>
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(r.url.replace(/^https?:\/\//, ""))} ↗</a>` : ""}
        ${r.captured ? `<span>captured ${esc(r.captured)}</span>` : ""}
      </div>
      ${pal ? `<div class="d-pal">${pal}</div>` : ""}
      ${tags ? `<div class="d-tags">${tags}</div>` : ""}
      ${fonts}
      <div class="sections">${sections || '<div class="sec"><div class="prose"><p>No teardown yet for this reference.</p></div></div>'}</div>
    </div>`;
  $(".sheet").scrollTop = 0;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  $("#close").focus();
}

function closeDetail() {
  overlay.hidden = true;
  document.body.style.overflow = "";
}

boot();
