#!/usr/bin/env node
// build.mjs — bake the local ui-ux-references vault into a self-contained static
// site in ./public, ready for GitLab Pages. Reads $UIUX_VAULT (else the stable
// ~/.claude/ui-ux-references-vault), parses each note's %% TEARDOWN %% prose,
// copies only the two screenshots per reference, and emits public/data.json +
// the static gallery. No runtime filesystem access — everything is baked in.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", ".."); // claude-skills/
const SRC = join(HERE, "src");
const OUT = resolve(process.env.OUT ?? join(REPO, "public"));

const VAULT = resolve(
  process.env.UIUX_VAULT
    ? process.env.UIUX_VAULT.replace(/^~(?=$|\/)/, homedir())
    : (existsSync(join(REPO, "ui-ux-references", "vault"))
        ? join(REPO, "ui-ux-references", "vault")
        : join(homedir(), ".claude", "ui-ux-references-vault")),
);

const INDEX = join(VAULT, "_index.json");
if (!existsSync(INDEX)) {
  console.error(`[gallery] no vault index at ${INDEX}\n  Set $UIUX_VAULT or run build-index.cjs first.`);
  process.exit(1);
}

// ---- parse a note's TEARDOWN region into titled sections --------------------
const SECTION_KEYS = {
  Style: "style",
  Palette: "palette_notes",
  Typography: "typography",
  "Layout sections": "layout",
  Strengths: "strengths",
  Weaknesses: "weaknesses",
  "Notable patterns": "patterns",
  "When to use": "when_to_use",
};

function parseTeardown(notePath) {
  const out = {};
  if (!notePath || !existsSync(notePath)) return out;
  const md = readFileSync(notePath, "utf8");
  const m = md.match(/%%\s*TEARDOWN:START[\s\S]*?%%([\s\S]*?)%%\s*TEARDOWN:END/);
  if (!m) return out;
  const body = m[1];
  const re = /^##\s+(.+?)\s*$/gm;
  const heads = [...body.matchAll(re)];
  for (let i = 0; i < heads.length; i++) {
    const title = heads[i][1].trim();
    const key = SECTION_KEYS[title];
    if (!key) continue;
    const start = heads[i].index + heads[i][0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    const text = body.slice(start, end).trim();
    if (text) out[key] = text;
  }
  return out;
}

// "#08090a near-black bg" -> { hex, label }
function parseSwatch(s) {
  const m = String(s).match(/(#[0-9a-fA-F]{3,8})\s*(.*)$/);
  return m ? { hex: m[1], label: m[2].trim() } : { hex: null, label: String(s) };
}

// ---- (re)build public/ ------------------------------------------------------
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "shots"), { recursive: true });

const index = JSON.parse(readFileSync(INDEX, "utf8"));
const records = [];

// Paths in _index.json are stored relative to the vault root.
const underVault = (p) => (!p ? p : isAbsolute(p) ? p : join(VAULT, p));

for (const r of index) {
  const slug = r.slug;
  const shotDir = join(OUT, "shots", slug);
  mkdirSync(shotDir, { recursive: true });
  const shots = {};
  for (const [k, src0] of [["above_fold", r.above_fold], ["full", r.full]]) {
    const src = underVault(src0);
    if (src && existsSync(src)) {
      const name = `${k}.jpg`;
      copyFileSync(src, join(shotDir, name));
      shots[k] = `shots/${slug}/${name}`;
    }
  }
  const teardown = parseTeardown(underVault(r.note));
  records.push({
    slug,
    title: r.title || slug,
    category: r.category || "uncategorized",
    url: r.url || "",
    quality: Number(r.quality) || 0,
    captured: r.captured || "",
    headingFont: r.heading_font || "",
    bodyFont: r.body_font || "",
    tags: (r.tags || []).filter((t) => t !== "ui-reference"),
    palette: (r.palette || []).map(parseSwatch),
    counts: { css: r.css_count || 0, js: r.js_count || 0, images: r.images_count || 0 },
    shots,
    teardown,
  });
}

// Newest-feeling first: highest quality, then title.
records.sort((a, b) => b.quality - a.quality || a.title.localeCompare(b.title));

const categories = [...new Set(records.map((r) => r.category))].sort();
const meta = {
  count: records.length,
  categories,
  generated: process.env.BUILD_DATE || "", // injected by CI; Date.* avoided for reproducibility
};

writeFileSync(join(OUT, "data.json"), JSON.stringify({ meta, records }, null, 2));

// Copy static gallery assets.
for (const f of readdirSync(SRC)) copyFileSync(join(SRC, f), join(OUT, f));

console.log(
  `[gallery] built ${records.length} reference(s) across ${categories.length} categor${
    categories.length === 1 ? "y" : "ies"
  } -> ${OUT}`,
);
