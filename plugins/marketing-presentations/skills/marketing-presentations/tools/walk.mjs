import { createRequire } from "module"; const require = createRequire((process.env.PW_FROM || process.cwd()) + "/package.json"); const { chromium } = require("@playwright/test");
const ROOT = `(document.querySelector("[data-scroll-root]") || document.querySelector("[data-variant-scroll]") || document.querySelector("[data-landing-scroll]") || document.scrollingElement)`;
// viewport-by-viewport walk; prints {total,frames,pending,errors}. args: url outdir [w h stepPx pendingSelector settleMs]
const [,, url, outdir, w = "1440", h = "900", step = "900", pendingSel = "[data-xp-armed]:not([data-xp-in]), [data-ft-armed]:not([data-ft-in]), [data-armed]:not([data-in])", settle = "1100"] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errors = []; p.on("console", m => m.type() === "error" && errors.push(m.text())); p.on("pageerror", e => errors.push(String(e)));
await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); await p.waitForTimeout(2500);
const total = await p.evaluate(`${ROOT}.scrollHeight`);
for (let y = 0, i = 0; y < total; y += +step, i++) {
  await p.evaluate(`${ROOT}.scrollTop = ${y}`); await p.waitForTimeout(+settle);
  await p.screenshot({ path: `${outdir}/v${String(i).padStart(2, "0")}.png` });
}
const pending = await p.evaluate((sel) => document.querySelectorAll(sel).length, pendingSel);
console.log(JSON.stringify({ total, frames: Math.ceil(total / +step), pending, errors })); await b.close();
