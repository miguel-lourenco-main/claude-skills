// Send the EMAIL of a validated outreach record via SMTP (nodemailer). EMAIL is the ONLY channel
// the app sends — the `text` message is copy-paste only. One company per request; a "bundle" is just
// several `send` requests the loop runs sequentially. Always person-triggered (never automatic).
//
// Guards (fail closed, suppression-aware): the record must be validated/bundled, have a valid chosen
// recipient + an email subject+body, and must not already be sent / contacted. On success: status
// "sent", pipeline.status "contacted". A per-send delay paces a one-click bundle so it doesn't burst.
//
// Config (env): SMTP_HOST · SMTP_PORT (587) · SMTP_USER · SMTP_PASS · OUTREACH_FROM (default SMTP_USER)
//   · OUTREACH_SEND_DELAY_MS (2000).
//
//   node scripts/send.mjs '{"action":"send","companyId":"web-x"}'

import { readCompany, readOutreach, storeRoot, writeCompany, writeOutreach } from "../lib/store.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const id = req.companyId ?? req.companyIds?.[0];
const now = () => new Date().toISOString();
const DELAY = Number(process.env.OUTREACH_SEND_DELAY_MS ?? 2000);
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());

function fail(error) { emit({ action: "send", ok: false, companyId: id, error }); process.exit(0); }

if (!id) fail("companyId required");
const c = readCompany(id, root);
if (!c) fail(`no company ${id}`);
const o = readOutreach(id, root);
if (!o) fail("no outreach draft — draft + validate it first");
if (o.status === "sent") fail("already sent (suppressed)");
if (c.pipeline?.status === "contacted" && !req.force) fail("already contacted (suppressed)");
if (!["validated", "bundled"].includes(o.status)) fail(`not validated (status=${o.status}) — check it before sending`);

const to = (o.chosenRecipient || "").trim();
if (!isEmail(to)) fail("no valid recipient email chosen");
if (!o.email?.subject || !o.email?.body) fail("email subject/body missing");

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.OUTREACH_FROM || user;
if (!host || !user || !pass || !from) fail("SMTP not configured (set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS, OUTREACH_FROM)");

let nodemailer;
try { nodemailer = (await import("nodemailer")).default; }
catch { fail("nodemailer not installed — run npm install"); }

progress({ i: 1, n: 1, item: c.name || id, phase: "sending", message: to });
if (DELAY > 0) await new Promise((r) => setTimeout(r, DELAY)); // pace bundled sends

o.status = "sending"; o.updatedAt = now(); writeOutreach(o, root);

try {
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const info = await transporter.sendMail({ from, to, subject: o.email.subject, text: o.email.body });
  o.status = "sent"; o.emailSentAt = now(); o.messageId = info.messageId ?? null; o.error = null;
  o.history = [...(o.history ?? []), { at: now(), event: "sent", detail: to }];
  o.updatedAt = now();
  writeOutreach(o, root);
  c.pipeline = { ...(c.pipeline ?? {}), status: "contacted" };
  writeCompany(c, root);
  emit({ action: "send", ok: true, companyId: id, to, messageId: o.messageId });
} catch (e) {
  o.status = "failed"; o.error = String(e?.message ?? e); o.updatedAt = now();
  o.history = [...(o.history ?? []), { at: now(), event: "failed", detail: o.error }];
  writeOutreach(o, root);
  emit({ action: "send", ok: false, companyId: id, to, error: o.error });
}
