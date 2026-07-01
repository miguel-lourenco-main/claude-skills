// claude-skills marketplace hub — static, no build.
// Featured UIs come from the curated apps.json; the full plugin list is read
// live from the repo's .claude-plugin/marketplace.json (copied to ./marketplace.json
// by the Pages CI job). New plugins appear automatically; a plugin flips from a
// "CLI" to a "UI" row as soon as it gets an entry in apps.json.

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const isExternal = (href) => /^https?:\/\//i.test(href || "");
// A soft gradient tile from an accent color, with a darkened second stop.
const tileBg = (accent) =>
  `background:linear-gradient(135deg, ${accent} 0%, ${accent} 35%, color-mix(in srgb, ${accent} 45%, #08090a) 100%);`;
// Stable per-plugin accent for marketplace rows that have no featured app.
const FALLBACK_ACCENTS = ["#5e6ad2", "#62ffb3", "#ff8a5c", "#c6ff3a", "#f06292", "#4dd0e1"];
const accentFor = (name, apps) => {
  const a = apps.find((x) => x.plugin === name);
  if (a) return a.accent;
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_ACCENTS[h % FALLBACK_ACCENTS.length];
};
const monoFor = (name) => {
  const parts = String(name).split(/[-_\s]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
};

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

function renderApps(apps) {
  const wrap = $("#apps");
  wrap.replaceChildren();
  for (const app of apps) {
    const ext = isExternal(app.href);
    const card = el("a", "card");
    card.href = app.href;
    if (ext) { card.target = "_blank"; card.rel = "noreferrer"; }
    card.append(
      el("div", "card-tile", `<span>${esc(app.monogram || monoFor(app.name))}</span>`),
    );
    card.querySelector(".card-tile").setAttribute("style", tileBg(app.accent || "#5e6ad2"));
    const body = el("div", "card-body");
    body.append(
      el("div", "card-top",
        `<span class="card-name">${esc(app.name)}</span><span class="chip">${esc(app.plugin)}</span>`),
      el("p", "card-desc", esc(app.description || "")),
      el("div", "card-foot",
        `<span class="card-launch">Launch ${ext ? "↗" : "→"}</span><span class="host">${esc(app.host || "")}</span>`),
    );
    card.append(body);
    wrap.append(card);
  }
  $("#apps-block").hidden = apps.length === 0;
}

function renderMarket(plugins, apps) {
  const list = $("#market");
  list.replaceChildren();
  for (const p of plugins) {
    const app = apps.find((a) => a.plugin === p.name);
    const accent = accentFor(p.name, apps);
    const row = el("li", "row");

    // --- clickable header: click/Enter/Space expands the row to show full info ---
    const head = el("div", "row-head");
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    head.setAttribute("aria-expanded", "false");

    const mono = el("div", "row-mono", esc(app?.monogram || monoFor(p.name)));
    mono.setAttribute("style", tileBg(accent));

    const main = el("div", "row-main");
    main.append(
      el("div", "row-name",
        `<b>${esc(p.name)}</b>` +
        `<span class="badge ${app ? "ui" : "cli"}">${app ? "UI" : "CLI"}</span>` +
        (p.category ? `<span class="cat">${esc(p.category)}</span>` : "")),
      el("p", "row-desc", esc(p.description || "")),
    );

    const side = el("div", "row-side");
    if (app) {
      const ext = isExternal(app.href);
      const launch = el("a", "row-launch", `Launch ${ext ? "↗" : "→"}`);
      launch.href = app.href;
      if (ext) { launch.target = "_blank"; launch.rel = "noreferrer"; }
      launch.addEventListener("click", (e) => e.stopPropagation()); // don't toggle
      side.append(launch);
    }
    // External (url-sourced) plugins carry no local version.
    if (p.version) side.append(el("span", "row-ver", `v${esc(p.version)}`));
    side.append(el("span", "chevron",
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>'));

    head.append(mono, main, side);

    // --- expandable detail: all the repository info from marketplace.json ---
    const detail = el("div", "row-detail");
    detail.hidden = true;
    detail.append(buildDetail(p, app));

    const toggle = () => {
      const open = row.classList.toggle("open");
      head.setAttribute("aria-expanded", String(open));
      detail.hidden = !open;
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });

    row.append(head, detail);
    list.append(row);
  }
  $("#market-block").hidden = plugins.length === 0;
}

// Source can be a string path ("./plugins/x") or an object ({source:"url", url, sha}).
function sourceField(src) {
  if (!src) return null;
  if (typeof src === "string") return { html: `<code>${esc(src)}</code>` };
  if (src.url) {
    const sha = src.sha ? ` <span class="mono faint">@ ${esc(src.sha.slice(0, 7))}</span>` : "";
    return { html: `<a href="${esc(src.url)}" target="_blank" rel="noreferrer">${esc(src.url)}</a>${sha}` };
  }
  return { html: `<code>${esc(JSON.stringify(src))}</code>` };
}

function buildDetail(p, app) {
  const dl = el("dl", "detail-grid");
  const field = (label, html) => {
    if (html == null) return;
    dl.append(el("dt", null, esc(label)), el("dd", null, html));
  };

  field("Description", esc(p.description || "—"));
  field("Category", p.category ? esc(p.category) : null);
  field("Version", p.version ? `v${esc(p.version)}` : "external / upstream");
  const src = sourceField(p.source);
  field("Source", src ? src.html : null);
  if (p.author) {
    const a = p.author;
    const email = a.email ? ` <span class="faint">· ${esc(a.email)}</span>` : "";
    field("Author", `${esc(a.name || "—")}${email}`);
  }
  if (app) {
    const ext = isExternal(app.href);
    field("UI", `<a href="${esc(app.href)}"${ext ? ' target="_blank" rel="noreferrer"' : ""}>` +
      `${esc(app.name)} — launch ${ext ? "↗" : "→"}</a>` +
      (app.host ? ` <span class="faint">(${esc(app.host)})</span>` : ""));
  }
  return dl;
}

async function main() {
  try {
    const [appsData, market] = await Promise.all([
      getJSON("apps.json").catch(() => ({ apps: [] })),
      getJSON("marketplace.json").catch(() => ({ plugins: [] })),
    ]);
    const apps = appsData.apps || [];
    const plugins = market.plugins || [];

    renderApps(apps);
    renderMarket(plugins, apps);

    $("#stat-apps").textContent = apps.length;
    $("#stat-plugins").textContent = plugins.length;

    if (!apps.length && !plugins.length) {
      const e = $("#error");
      e.textContent = "Couldn't load apps.json or marketplace.json.";
      e.hidden = false;
    }
  } catch (err) {
    const e = $("#error");
    e.textContent = `Failed to load: ${err.message}`;
    e.hidden = false;
  }
}

main();
