// STUB outreach — writes a per-company outreach draft (PT) into outreach/<id>.md,
// seeded from the audit's dated signals. Next phase: compose with the ui-ux-pro-max
// + humanizer skills to generate a real spec mockup + a non-AI-sounding pitch.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAudit, readCompany, paths, storeRoot, writeCompany } from "../lib/store.mjs";
import { emit, readRequest } from "./_cli.mjs";

const root = storeRoot();
const req = readRequest();
const ids = (req.companyIds ?? []).filter((id) => readCompany(id, root));
const written = [];
mkdirSync(paths(root).outreach, { recursive: true });

for (const id of ids) {
  const c = readCompany(id, root);
  const a = readAudit(id, root);
  const signals = a?.taste?.datedSignals ?? [];
  const first = (c.name.split(/[ ,]/)[0]) || "equipa";
  const md = [
    `# Outreach — ${c.name}`,
    "",
    `- **Website:** ${c.contacts?.website ?? "(none — social only)"}`,
    `- **Vertical:** ${c.sector?.vertical} · **City:** ${c.location?.city}`,
    `- **Taste:** ${a ? a.taste.overall + "/5" : "not audited"} · **Opportunity:** ${a ? a.taste.opportunity : "—"}`,
    "",
    "## Email (PT) — draft",
    "",
    `Assunto: Uma ideia rápida para o site da ${first}`,
    "",
    `Olá,`,
    "",
    a
      ? `Reparei que o site da ${c.name} ${signals.length ? "tem alguns pontos que podem estar a custar-vos clientes (" + signals.slice(0, 2).join(", ") + ")" : "podia estar a trabalhar mais para vocês"}. Preparei uma ideia de como ficaria modernizado — sem compromisso.`
      : `A ${c.name} ainda não tem um site próprio. Para ${c.sector?.vertical}, isso costuma significar reservas/contactos perdidos. Posso mostrar-vos uma proposta simples.`,
    "",
    "Faz sentido enviar-vos uma pré-visualização?",
    "",
    "_(stub draft — replace with ui-ux mockup + humanizer pass)_",
    "",
  ].join("\n");
  writeFileSync(join(paths(root).outreach, `${id}.md`), md, "utf8");
  c.pipeline = { ...(c.pipeline ?? {}), status: c.pipeline?.status === "contacted" ? "contacted" : "outreach-ready" };
  writeCompany(c, root);
  written.push(id);
}

emit({ action: "outreach", ok: true, written, count: written.length });
