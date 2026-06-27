// Persist an outreach record (outreach/<id>.json) — the single setter shared by BOTH writers:
//   • the prospect-outreach agent passes `draft` (email + text + researched contacts) → status "draft";
//   • the dashboard passes `patch` (operator edits), `status` (draft→validated→bundled…), or
//     `markTextSent` (operator sent the copy-paste text elsewhere).
// Also re-renders a human-readable outreach/<id>.md from the record, and keeps pipeline.status
// coherent for the board's stageOf() (a checked/queued lead is "outreach-ready"; a contacted lead
// is never downgraded). The .json is the source of truth — the agent supplies DATA, not files.
//
//   node scripts/outreach-save.mjs '{"companyId":"web-x","draft":{"email":{"subject":"…","body":"…"},
//     "text":{"body":"…"},"contacts":[{"type":"email","value":"geral@x.pt","source":"site","confidence":0.6}],
//     "pitchAngle":"redesign","chosenRecipient":"geral@x.pt"}}'

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths, readCompany, readOutreach, storeRoot, touchHeartbeat, writeCompany, writeOutreach } from "../lib/store.mjs";
import { emit, progress, readRequest } from "./_cli.mjs";

const root = storeRoot();
touchHeartbeat(root); // the agent may call this; harmless on the human path
const req = readRequest();
const ids = req.companyIds ?? (req.companyId ? [req.companyId] : []);
const now = () => new Date().toISOString();
const VALID_STATUS = new Set(["draft", "validated", "bundled", "sending", "sent", "failed"]);
const saved = [];

mkdirSync(paths(root).outreach, { recursive: true });

function normContact(x = {}) {
  return {
    type: x.type ?? "other",
    value: String(x.value ?? "").trim(),
    source: x.source ?? null,
    confidence: typeof x.confidence === "number" ? x.confidence : null,
    validation: x.validation ?? "pending",
    correctedValue: x.correctedValue ?? null,
  };
}

function renderMd(c, o) {
  const contacts = (o.contacts ?? []).length
    ? o.contacts.map((x) => `- **${x.type}:** ${x.value}${x.source ? ` _(${x.source}${x.confidence != null ? `, conf ${x.confidence}` : ""})_` : ""} — ${x.validation}`)
    : ["- (none found — research turned up nothing usable)"];
  return [
    `# Outreach — ${c.name}`, "",
    `- **Status:** ${o.status}`,
    `- **Angle:** ${o.pitchAngle ?? "—"}`,
    `- **Chosen recipient:** ${o.chosenRecipient ?? "(not set)"}`,
    "", "## Contacts (validate before sending)", "", ...contacts,
    "", "## Email", "", `**Assunto:** ${o.email?.subject ?? ""}`, "", o.email?.body ?? "_(no email body)_",
    "", "## Text — copy-paste into WhatsApp / IG / SMS", "", o.text?.body ?? "_(no text)_", "",
  ].join("\n");
}

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const c = readCompany(id, root);
  if (!c) continue;
  progress({ i: i + 1, n: ids.length, item: c.name || id, phase: "saving" });

  const o = readOutreach(id, root) ?? { companyId: id, status: "draft", contacts: [], history: [] };
  o.contacts = o.contacts ?? [];
  o.history = o.history ?? [];

  if (req.draft) {
    const d = req.draft;
    if (d.email) o.email = { subject: d.email.subject ?? "", body: d.email.body ?? "" };
    if (d.text) o.text = { body: d.text.body ?? "" };
    if (Array.isArray(d.contacts)) o.contacts = d.contacts.map(normContact);
    if (d.pitchAngle !== undefined) o.pitchAngle = d.pitchAngle;
    if (d.chosenRecipient !== undefined) o.chosenRecipient = d.chosenRecipient || null;
    o.status = "draft";
    o.draftedAt = now();
    o.history.push({ at: now(), event: "drafted", detail: `${o.contacts.length} contact(s)` });
  }

  if (req.patch) {
    const p = req.patch;
    if (p.email) o.email = { ...(o.email ?? {}), ...p.email };
    if (p.text) o.text = { ...(o.text ?? {}), ...p.text };
    if (Array.isArray(p.contacts)) o.contacts = p.contacts.map(normContact);
    if (p.chosenRecipient !== undefined) o.chosenRecipient = p.chosenRecipient || null;
    if (p.pitchAngle !== undefined) o.pitchAngle = p.pitchAngle;
  }

  if (req.markTextSent) { o.textMarkedAt = now(); o.history.push({ at: now(), event: "text-sent" }); }

  if (req.status && VALID_STATUS.has(req.status)) {
    o.status = req.status;
    o.history.push({ at: now(), event: `status:${req.status}` });
  }

  o.updatedAt = now();
  writeOutreach(o, root);
  try { writeFileSync(join(paths(root).outreach, `${id}.md`), renderMd(c, o), "utf8"); } catch { /* best-effort */ }

  // Keep the board's funnel coherent: a lead with an outreach package in flight sits at
  // "outreach-ready" — but never downgrade one already marked "contacted".
  if (["validated", "bundled", "draft"].includes(o.status) && c.pipeline?.status !== "contacted") {
    c.pipeline = { ...(c.pipeline ?? {}), status: "outreach-ready" };
    writeCompany(c, root);
  }
  saved.push(id);
}

emit({ action: "outreach-save", ok: true, saved, count: saved.length });
