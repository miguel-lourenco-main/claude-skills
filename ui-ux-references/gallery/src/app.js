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

// Vault data source. The vault is NOT shipped with the site. When served locally
// the vault sits at /vault (override with ?vault=URL) and we fetch it directly;
// on a hosted deploy that 404s and the user loads their own vault folder instead.
const VAULT_URL = (new URLSearchParams(location.search).get("vault") || "/vault").replace(/\/+$/, "");

// ---- vault note parsing (mirrors the %% TEARDOWN %% format) -----------------
const SECTION_KEYS = {
  Style: "style", Palette: "palette_notes", Typography: "typography",
  "Layout sections": "layout", Strengths: "strengths", Weaknesses: "weaknesses",
  "Notable patterns": "patterns", "When to use": "when_to_use",
};
function parseTeardown(mdText) {
  const out = {};
  if (!mdText) return out;
  const m = mdText.match(/%%\s*TEARDOWN:START[\s\S]*?%%([\s\S]*?)%%\s*TEARDOWN:END/);
  if (!m) return out;
  const body = m[1];
  const heads = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  for (let i = 0; i < heads.length; i++) {
    const key = SECTION_KEYS[heads[i][1].trim()];
    if (!key) continue;
    const start = heads[i].index + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    const t = body.slice(start, end).trim();
    if (t) out[key] = t;
  }
  return out;
}
function parseSwatch(s) {
  const m = String(s).match(/(#[0-9a-fA-F]{3,8})\s*(.*)$/);
  return m ? { hex: m[1], label: m[2].trim() } : { hex: null, label: String(s) };
}
// Human label for a screenshot file ("above-fold.jpg" -> "Above the fold").
const SHOT_LABELS = { "above-fold": "Above the fold", full: "Full page" };
function shotLabel(p) {
  const base = String(p).split("/").pop().replace(/\.[a-z0-9]+$/i, "");
  return SHOT_LABELS[base] || base.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
// Extracted HTML files of a reference. `html` (build-index.cjs) lists only files
// that exist, with sizes; older indexes only had the raw_html/rendered_html paths.
// Nothing is read here — `readText(path)` is called when the panel is opened.
const HTML_LABELS = { raw: "Raw served HTML", rendered: "Rendered DOM" };
function htmlEntries(r, readText) {
  const list = Array.isArray(r.html)
    ? r.html
    : [["raw", r.raw_html], ["rendered", r.rendered_html]].filter(([, p]) => p).map(([kind, path]) => ({ kind, path }));
  return list.map((h) => ({
    kind: h.kind, label: HTML_LABELS[h.kind] || h.kind, path: h.path,
    bytes: Number(h.bytes) || 0, text: null, load: () => readText(h.path),
  }));
}
function buildRecord(r, teardown, resolve, readText) {
  // `screenshots` (build-index.cjs) lists every capture; older indexes only had
  // above_fold + full, so fall back to those.
  const shotPaths = Array.isArray(r.screenshots) ? r.screenshots : [r.above_fold, r.full].filter(Boolean);
  const gallery = shotPaths.map((p) => ({ src: resolve(p), label: shotLabel(p) })).filter((s) => s.src);
  return {
    slug: r.slug, title: r.title || r.slug, category: r.category || "uncategorized",
    url: r.url || "", quality: Number(r.quality) || 0, captured: r.captured || "",
    headingFont: r.heading_font || "", bodyFont: r.body_font || "",
    tags: (r.tags || []).filter((t) => t !== "ui-reference"),
    palette: (r.palette || []).map(parseSwatch),
    shots: { above_fold: r.above_fold ? resolve(r.above_fold) : null, full: r.full ? resolve(r.full) : null },
    gallery,
    html: htmlEntries(r, readText),
    resolve,
    teardown,
  };
}
function finalize(records) {
  records.sort((a, b) => b.quality - a.quality || a.title.localeCompare(b.title));
  const categories = [...new Set(records.map((r) => r.category))].sort();
  return { meta: { count: records.length, categories }, records };
}

// Source 1 — fetch a served vault (local). `note`/`above_fold` are vault-relative.
async function fromUrl(base) {
  const res = await fetch(`${base}/_index.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`no _index.json at ${base}`);
  const index = JSON.parse(await res.text());
  const records = await Promise.all(
    index.map(async (r) => {
      let note = "";
      if (r.note) { try { const n = await fetch(`${base}/${r.note}`); if (n.ok) note = await n.text(); } catch {} }
      return buildRecord(r, parseTeardown(note), (p) => `${base}/${p}`, async (p) => {
        const res = await fetch(`${base}/${p}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      });
    }),
  );
  return finalize(records);
}

// Source 2 — a folder the user picked (hosted). Map vault-relative path -> File.
async function fromFiles(fileList) {
  const map = new Map();
  for (const f of fileList) {
    const rel = f.webkitRelativePath.split("/").slice(1).join("/"); // drop the picked-folder name
    if (rel) map.set(rel, f);
  }
  const idx = map.get("_index.json");
  if (!idx) throw new Error("No _index.json in that folder — pick the vault root (the folder containing _index.json).");
  const index = JSON.parse(await idx.text());
  const records = await Promise.all(
    index.map(async (r) => {
      const nf = r.note && map.get(r.note);
      const note = nf ? await nf.text() : "";
      return buildRecord(
        r, parseTeardown(note),
        (p) => { const f = map.get(p); return f ? URL.createObjectURL(f) : null; },
        async (p) => { const f = map.get(p); if (!f) throw new Error("not in the picked folder"); return f.text(); },
      );
    }),
  );
  return finalize(records);
}

let wired = false;
function applyData(data) {
  state.records = data.records || [];
  state.category = "all";
  $("#stat-count").textContent = data.meta.count;
  $("#stat-cats").textContent = (data.meta.categories || []).length;
  $("#loader").hidden = true;
  $("#controls").hidden = false;
  grid.hidden = false;
  $("#cat-pills").innerHTML = "";
  buildPills(data.meta.categories || []);
  if (!wired) { wire(); wired = true; }
  apply();
}

function showLoader(msg) {
  $("#controls").hidden = true;
  grid.hidden = true;
  emptyMsg.hidden = true;
  $("#loader").hidden = false;
  if (msg) $("#loader-error").textContent = msg;
  const input = $("#vault-input");
  input.onchange = async () => {
    if (!input.files?.length) return;
    $("#loader-error").textContent = "Reading vault…";
    try { applyData(await fromFiles(input.files)); }
    catch (e) { $("#loader-error").textContent = e.message || String(e); }
  };
}

async function boot() {
  try { applyData(await fromUrl(VAULT_URL)); }
  catch { showLoader(""); }
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
  document.addEventListener("keydown", (e) => {
    if (!lightbox.hidden) return lightboxKey(e);
    if (e.key === "Escape" && !overlay.hidden) closeDetail();
  });
  $("#lb-close").onclick = closeLightbox;
  $("#lb-prev").onclick = () => stepLightbox(-1);
  $("#lb-next").onclick = () => stepLightbox(1);
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox || e.target.classList.contains("lb-stage")) closeLightbox(); });
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
        ${r.gallery.length > 1 ? `<span class="n-badge" title="${r.gallery.length} screenshots">${r.gallery.length} shots</span>` : ""}
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
  $("#detail").innerHTML = `
    ${shotsHtml(r)}
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
      ${htmlPanelHtml(r)}
    </div>`;
  wireShots(r);
  wireHtmlPanel(r);
  $(".sheet").scrollTop = 0;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  $("#close").focus();
}

// ---- extracted HTML: collapsible, lazy-loaded, highlighted, copyable ---------
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const PREVIEW_CHARS = 200_000; // highlight this much up front; the rest on request

function htmlPanelHtml(r) {
  if (!r.html.length) return "";
  const sizes = r.html.map((h) => `${h.kind}${h.bytes ? ` ${kb(h.bytes)}` : ""}`).join(" · ");
  const tabs = r.html
    .map((h, i) => `<button type="button" class="h-tab" role="tab" data-kind="${esc(h.kind)}" aria-selected="${i === 0}">${esc(h.label)}</button>`)
    .join("");
  return `<details class="html-panel" id="html-panel">
      <summary><span class="h-title">Extracted HTML</span><span class="h-sizes">${esc(sizes)}</span></summary>
      <div class="h-bar">
        <div class="h-tabs" role="tablist" aria-label="HTML version">${tabs}</div>
        <span class="h-status" aria-live="polite"></span>
        <label class="h-wrap"><input type="checkbox" /> wrap</label>
        <a class="h-btn h-open" target="_blank" rel="noreferrer">Open file ↗</a>
        <button type="button" class="h-btn h-copy">Copy</button>
      </div>
      <pre class="code" tabindex="0" aria-label="Extracted HTML source (read-only)"><code></code></pre>
      <button type="button" class="h-btn h-more" hidden></button>
    </details>`;
}

function wireHtmlPanel(r) {
  const panel = $("#html-panel");
  if (!panel) return;
  const code = $(".code code", panel), pre = $(".code", panel), status = $(".h-status", panel);
  const more = $(".h-more", panel), open = $(".h-open", panel), copy = $(".h-copy", panel);
  const tabs = [...panel.querySelectorAll(".h-tab")];
  let cur = null;

  async function show(h) {
    cur = h;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.kind === h.kind)));
    open.href = r.resolve(h.path) || "#";
    more.hidden = true;
    copy.disabled = true;
    if (h.text == null) {
      code.textContent = "";
      status.textContent = "Loading…";
      try { h.text = await h.load(); }
      catch (e) { if (cur === h) { status.textContent = `Could not load ${h.path.split("/").pop()} (${e.message || e})`; } return; }
      if (cur !== h) return; // user switched tabs meanwhile
    }
    const t = h.text;
    status.textContent = `${t.split("\n").length.toLocaleString()} lines · ${kb(h.bytes || t.length)}`;
    code.innerHTML = highlightHtml(t.length > PREVIEW_CHARS ? t.slice(0, PREVIEW_CHARS) : t);
    pre.scrollTop = 0;
    copy.disabled = false;
    if (t.length > PREVIEW_CHARS) {
      more.hidden = false;
      more.textContent = `Showing the first ${kb(PREVIEW_CHARS)} — show all ${kb(t.length)}`;
    }
  }

  panel.addEventListener("toggle", () => { if (panel.open && !cur) show(r.html[0]); });
  tabs.forEach((t, i) => {
    t.onclick = () => show(r.html[i]);
    t.onkeydown = (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); n.click();
    };
  });
  more.onclick = () => { code.innerHTML = highlightHtml(cur.text); more.hidden = true; };
  $(".h-wrap input", panel).onchange = (e) => pre.classList.toggle("wrap", e.target.checked);
  copy.onclick = async () => {
    if (!cur?.text) return;
    try { await navigator.clipboard.writeText(cur.text); }
    catch {
      const ta = el("textarea"); ta.value = cur.text; document.body.append(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    copy.textContent = "Copied ✓";
    setTimeout(() => (copy.textContent = "Copy"), 1400);
  };
}

// Small single-pass HTML highlighter: comments, doctype, tags, attributes, values.
// <script>/<style> bodies are left as plain text. Everything is escaped first.
function highlightHtml(src) {
  const tagRe = /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<\/?[A-Za-z][^\s/>]*(?:"[^"]*"|'[^']*'|[^'">])*>?/g;
  const attrRe = /([^\s=/>"']+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g;
  const span = (c, t) => `<span class="${c}">${esc(t)}</span>`;
  let out = "", last = 0, m;
  while ((m = tagRe.exec(src))) {
    out += esc(src.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("<!--")) out += span("t-com", t);
    else if (t.startsWith("<!")) out += span("t-doc", t);
    else {
      const name = /^<\/?([^\s/>]+)/.exec(t);
      const head = name[0], tail = t.slice(head.length);
      const close = /\/?>$/.exec(tail);
      const attrs = close ? tail.slice(0, close.index) : tail;
      let l = 0, am;
      out += span("t-tag", head);
      attrRe.lastIndex = 0;
      while ((am = attrRe.exec(attrs))) {
        out += esc(attrs.slice(l, am.index)) + span("t-attr", am[1]);
        if (am[2]) out += esc(am[2]) + span("t-val", am[3]);
        l = am.index + am[0].length;
      }
      out += esc(attrs.slice(l)) + (close ? span("t-tag", close[0]) : "");
      // raw-text elements: jump to the matching close tag
      const tn = name[1].toLowerCase();
      if (!head.startsWith("</") && (tn === "script" || tn === "style")) {
        const endRe = new RegExp(`</${tn}\\s*>`, "ig");
        endRe.lastIndex = tagRe.lastIndex;
        const em = endRe.exec(src);
        const stop = em ? em.index : src.length;
        out += esc(src.slice(tagRe.lastIndex, stop));
        tagRe.lastIndex = stop;
      }
    }
    last = tagRe.lastIndex;
  }
  return out + esc(src.slice(last));
}

// ---- screenshots: hero + thumbnail strip + lightbox ---------------------------
function shotsHtml(r) {
  const g = r.gallery;
  if (!g.length) return "";
  const hero = `<button class="d-hero" type="button" data-shot="0" aria-label="Open ${esc(g[0].label)} screenshot full size">
      <img src="${esc(g[0].src)}" alt="${esc(r.title)} — ${esc(g[0].label)}" />
      <span class="zoom-hint">click to enlarge</span>
    </button>`;
  if (g.length < 2) return hero;
  const thumbs = g
    .map((s, i) => `<button class="thumb" type="button" data-shot="${i}" aria-label="Screenshot ${i + 1} of ${g.length}: ${esc(s.label)}">
        <img src="${esc(s.src)}" alt="" loading="lazy" decoding="async" /><span>${esc(s.label)}</span>
      </button>`)
    .join("");
  return `${hero}<div class="strip" role="group" aria-label="${g.length} screenshots — arrow keys to move, Enter to enlarge">${thumbs}</div>`;
}
function wireShots(r) {
  const btns = [...document.querySelectorAll("#detail [data-shot]")];
  const thumbs = btns.filter((b) => b.classList.contains("thumb"));
  for (const b of btns) b.onclick = () => openLightbox(r, Number(b.dataset.shot), b);
  thumbs.forEach((b, i) => {
    b.onkeydown = (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -i : e.key === "End" ? thumbs.length - 1 - i : 0;
      if (!d) return;
      e.preventDefault();
      thumbs[(i + d + thumbs.length) % thumbs.length].focus();
    };
  });
}

const lightbox = $("#lightbox");
const lb = { rec: null, i: 0, returnTo: null };
function openLightbox(r, i, from) {
  lb.rec = r; lb.returnTo = from || null;
  lightbox.hidden = false;
  showLightbox(i);
  $("#lb-close").focus();
}
function showLightbox(i) {
  const g = lb.rec.gallery;
  lb.i = (i + g.length) % g.length;
  const s = g[lb.i];
  const img = $("#lb-img");
  img.src = s.src;
  img.alt = `${lb.rec.title} — ${s.label}`;
  $("#lb-cap").textContent = `${s.label} · ${lb.i + 1} / ${g.length}`;
  $("#lb-open").href = s.src;
  $(".lb-stage").scrollTop = 0;
  $("#lb-prev").hidden = $("#lb-next").hidden = g.length < 2;
}
function stepLightbox(d) { showLightbox(lb.i + d); }
function closeLightbox() {
  lightbox.hidden = true;
  $("#lb-img").removeAttribute("src");
  lb.returnTo?.focus();
}
function lightboxKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closeLightbox(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); stepLightbox(1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); stepLightbox(-1); }
  else if (e.key === "Tab") {
    // keep focus inside the lightbox
    const f = [...lightbox.querySelectorAll("button:not([hidden]), a[href]")];
    const at = f.indexOf(document.activeElement);
    const next = e.shiftKey ? (at <= 0 ? f.length - 1 : at - 1) : (at + 1) % f.length;
    e.preventDefault();
    f[next].focus();
  }
}

function closeDetail() {
  overlay.hidden = true;
  document.body.style.overflow = "";
}

boot();
