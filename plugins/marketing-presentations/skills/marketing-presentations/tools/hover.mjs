import { createRequire } from "module"; const require = createRequire((process.env.PW_FROM || process.cwd()) + "/package.json"); const { chromium } = require("@playwright/test");
const ROOT = `(document.querySelector("[data-scroll-root]") || document.querySelector("[data-variant-scroll]") || document.querySelector("[data-landing-scroll]") || document.scrollingElement)`;
// hover capture. args: url outprefix selector1,selector2,... (each hovered then screenshotted after 500ms)
const [,, url, outdir, sels = "a,button"] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); await p.waitForTimeout(2500);
let i = 0;
for (const sel of sels.split(",")) {
  const el = p.locator(sel).first(); if (!(await el.count())) { console.log("missing", sel); continue; }
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${outdir}-${String(i).padStart(2, "0")}-before.png` });
  await el.hover(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${outdir}-${String(i++).padStart(2, "0")}-hover.png` });
}
console.log(JSON.stringify({ frames: i })); await b.close();
