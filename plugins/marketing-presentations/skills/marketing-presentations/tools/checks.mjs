import { createRequire } from "module"; const require = createRequire((process.env.PW_FROM || process.cwd()) + "/package.json"); const { chromium } = require("@playwright/test");
const ROOT = `(document.querySelector("[data-scroll-root]") || document.querySelector("[data-variant-scroll]") || document.querySelector("[data-landing-scroll]") || document.scrollingElement)`;
// phone overflow, reduced-motion, no-JS. args: url [mustText — text that must render with reduced motion and without JS]
const [,, url, mustText = ""] = process.argv;
const has = (t) => !t || document.body.innerText.includes(t);
const b = await chromium.launch();
const out = {};
{ const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); await p.waitForTimeout(1500);
  out.phoneOverflow = await p.evaluate(`(() => { const r = ${ROOT}; return r.scrollWidth - r.clientWidth; })()`);
  await p.close(); }
{ const c = await b.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }); await p.waitForTimeout(1500);
  out.reducedMotionArmed = await p.evaluate(() => document.querySelectorAll("[data-xp-armed]:not([data-xp-in]), [data-ft-armed]:not([data-ft-in]), [data-armed]:not([data-in])").length);
  out.reducedMotionHasText = await p.evaluate(`(${has})(${JSON.stringify(mustText)})`);
  await p.screenshot({ path: "reduced-top.png" });
  await c.close(); }
{ const c = await b.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
  await p.goto(url, { waitUntil: "load", timeout: 60000 }); await p.waitForTimeout(1000);
  out.noJsHasText = await p.evaluate(`(${has})(${JSON.stringify(mustText)})`);
  out.noJsTextLength = await p.evaluate(() => document.body.innerText.length);
  await c.close(); }
console.log(JSON.stringify(out)); await b.close();
