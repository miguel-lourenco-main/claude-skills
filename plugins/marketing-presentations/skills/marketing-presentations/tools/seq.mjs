import { createRequire } from "module"; const require = createRequire((process.env.PW_FROM || process.cwd()) + "/package.json"); const { chromium } = require("@playwright/test");
const ROOT = `(document.querySelector("[data-scroll-root]") || document.querySelector("[data-variant-scroll]") || document.querySelector("[data-landing-scroll]") || document.scrollingElement)`;
// time sequence after load at a fixed offset (hero choreography). args: url outprefix offsetPx marksMs(csv)
const [,, url, outdir, offset = "0", marks = "0,250,600,1000,1600,2600"] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; p.on("pageerror", e => errors.push(String(e)));
await p.goto(url, { waitUntil: "load", timeout: 60000 });
const t0 = Date.now();
if (+offset) { await p.waitForSelector("main"); await p.evaluate(`${ROOT}.scrollTop = ${offset}`); }
let i = 0;
for (const m of marks.split(",").map(Number)) {
  const wait = m - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait);
  await p.screenshot({ path: `${outdir}-${String(i++).padStart(2, "0")}-t${m}.png` });
}
console.log(JSON.stringify({ frames: i, errors })); await b.close();
