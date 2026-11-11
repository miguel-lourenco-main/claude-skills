import { createRequire } from "module"; const require = createRequire((process.env.PW_FROM || process.cwd()) + "/package.json"); const { chromium } = require("@playwright/test");
const ROOT = `(document.querySelector("[data-scroll-root]") || document.querySelector("[data-variant-scroll]") || document.querySelector("[data-landing-scroll]") || document.scrollingElement)`;
// flipbook of a scrubbed/pinned stage. args: url outprefix fromPx toPx stepPx waitMs
const [,, url, outdir, from = "0", to = "3000", step = "200", wait = "120"] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; p.on("pageerror", e => errors.push(String(e)));
await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); await p.waitForTimeout(2500);
await p.evaluate(`${ROOT}.scrollTop = ${Math.max(0, +from - 400)}`); await p.waitForTimeout(600);
let i = 0;
for (let y = +from; y <= +to; y += +step, i++) {
  await p.evaluate(`${ROOT}.scrollTop = ${y}`); await p.waitForTimeout(+wait);
  await p.screenshot({ path: `${outdir}-${String(i).padStart(2, "0")}-y${y}.png` });
}
console.log(JSON.stringify({ frames: i, errors })); await b.close();
