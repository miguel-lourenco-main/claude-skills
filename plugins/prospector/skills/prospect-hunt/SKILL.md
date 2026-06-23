---
name: prospect-hunt
description: Opinionated "find potential clients" — discover + qualify in a loop until a quota of GOOD leads is filled, fanning out a subagent per company that triages, then (on the keepers) audits + researches and writes a verdict + usable pitch. Use when the user says "find me clients", "find potential clients in <area>", "hunt for leads", "qualify prospects", or to drain queued `hunt` requests from the dashboard's 🎯 Find clients button. The opinionated counterpart to plain discover+audit.
---

# Prospect · hunt

You are the ORCHESTRATOR of a looped, parallel lead-qualification run. You fan out **one subagent per
company** (via the Agent tool) so it's fast and resilient — each subagent saves its own result, so leads
stream into the dashboard as they finish and a cancel/crash never loses completed work.

## 0 · Setup

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$PLUGIN" >/dev/null 2>&1 || true   # capture needs playwright
```

Read the queued hunts (each has a `payload` of options): `node "$PLUGIN/scripts/hunt-pending.mjs"`.
A request `payload` looks like:
```json
{ "area":"Porto", "district":"Porto", "verticals":["restaurants","beauty"], "quota":10,
  "sources":["osm","gmaps"],
  "leadTypes":["improvable-site","no-website","good-site"],
  "requireSocial":true, "excludeGoodSites":true,
  "popularityMin":0, "popularityMax":null, "effortCap":40 }
```
(Direct invocation: build the same options from what the user asked.)

## 1 · The quota loop (per hunt request)

Track `accepted` (qualified ids) and `examined`. Repeat until `accepted.length >= quota`
OR `examined >= effortCap` OR canceled:

1. **Discover a batch** of candidates into the store (run several times, varying vertical/area so each
   round finds NEW companies). `onlyWithWebsite` must be **false** (we keep no-website leads):
   ```bash
   node "$PLUGIN/scripts/discover.mjs" '{"action":"discover","payload":{"sources":["osm","gmaps"],"area":"Porto","district":"Porto","vertical":"restaurants","count":15,"onlyWithWebsite":false}}'
   ```
2. **Find NEW candidates** = companies with `pipeline.hunt` UNSET. List ids:
   ```bash
   node -e 'const{listCompanies}=require("'$PLUGIN'/lib/store.mjs");' 2>/dev/null || \
   node --input-type=module -e "import {listCompanies} from '$PLUGIN/lib/store.mjs'; console.log(JSON.stringify(listCompanies().filter(c=>!c.pipeline?.hunt).map(c=>c.id)))"
   ```
3. **Fan out subagents** — process the new candidates in **concurrent batches of ~5** (each launches
   Chrome; don't exceed ~6). Send the batch's Agent tool calls in ONE message. Use the subagent prompt
   in §2. Each returns `{id, decision, leadType, fit}`.
4. `examined += batch.length`; `accepted += ids where decision==="qualified"`.
5. **Check cancel** between batches: `node "$PLUGIN/scripts/hunt-pending.mjs"` — if THIS reqId no longer
   appears, OR `requests/cancel.jsonl` targets it, stop gracefully (completed work is already saved).

When the quota is filled (or capped/canceled), **resolve**:
```bash
node "$PLUGIN/scripts/hunt-resolve.mjs" '{"reqId":"<reqId>","summary":"qualified N/quota · examined M","canceled":<true|false>}'
```
Narrate progress to the user as batches complete (e.g. "qualified 6/10, examined 18…").

## 2 · The per-company subagent (the Agent tool prompt)

Spawn a subagent per candidate with this job. Give it the `companyId`, the company record fields
(name, website, vertical, city, social, phones), `PROSPECTOR_ROOT`, `PLUGIN`, and the hunt options.

> **TRIAGE first (cheap — no screenshots):** Establish the site tier and signals.
> - Reachability/quality: if there's a website, `WebFetch` it — is it reachable? modern or dated/weak? If
>   no website, it's tier **none**. Unreachable/parked = tier **dead**.
> - Social presence: confirm at least one social account (from the record or a quick `WebSearch`).
> - Popularity: `WebSearch` the business name + city for Google/Maps rating + review count.
>
> **Decide accept/reject against the options:**
> - `dead` site → **reject** (not a target type).
> - `none` (no website) → accept as **no-website** ONLY if `"no-website"` in leadTypes (and `requireSocial`
>   satisfied); else reject.
> - `weak` site → accept as **improvable-site** if `"improvable-site"` in leadTypes; else reject.
> - `good` site → accept as **good-site** if `"good-site"` in leadTypes; else (excludeGoodSites) reject.
> - If `requireSocial` and no social found → reject. If a popularity number is known and falls outside
>   `[popularityMin, popularityMax]` → reject. (Low popularity WITHIN range is fine — it becomes a
>   marketing-growth angle.)
>
> **If REJECT:** save and stop (fast):
> `node "$PLUGIN/scripts/hunt-save.mjs" '{"companyId":"<id>","assessment":{"decision":"rejected","reasons":["..."]}}'`
>
> **If ACCEPT → full treatment:**
> 1. **Always write an audit record** so the company shows a coherent audited state (not "not audited"):
>    `node "$PLUGIN/scripts/audit.mjs" '{"action":"audit","companyIds":["<id>"]}'`. For a site it captures
>    screenshots + tech (taste pending); for a no-website lead it writes the honest `reachable:false ·
>    no website` record. **If it has a website**, then **Read** the tiles in `screenshots/<id>/` and grade:
>    `node "$PLUGIN/scripts/grade.mjs" '{"companyId":"<id>","taste":{"scores":{...},"opportunity":0..1,"datedSignals":[...],"issues":[...],"effortEstimate":"S|M|L"}}'`.
> 2. Research: `WebFetch` the site + `WebSearch` reviews/social/decision-maker/competitors → write a
>    dossier `dossiers/<id>.md` (the `prospect-deepdive` format: min-info header + organized sections).
> 3. Compute `fit` (0–1) and write the **pitch** — a short markdown that is BOTH a go/no-go memo AND a
>    usable outreach opener (Portuguese). **Adapt the angle:**
>    - improvable-site → `redesign` (their site is dated/loses customers).
>    - no-website → `get-a-site` (active business, no site = lost discovery/bookings).
>    - good-site → `ai-upsell` (solid site; pitch AI features / smarter usage).
>    - **low popularity (few reviews/visits)** → `marketing-growth` — a modern site to grow their
>      visibility/reach/marketing, regardless of base type.
> 4. Save — pass **`enrich`** with everything you LEARNED so the company record stops being a bare
>    discovery stub (research wins over the generic stub; contacts are unioned). Include the social
>    handles/URLs you found, any phone/email, and a real one-line description:
>    `node "$PLUGIN/scripts/hunt-save.mjs" '{"companyId":"<id>","assessment":{"decision":"qualified","leadType":"...","fit":0.x,"reasons":["..."],"pitch":"...","pitchAngle":"...","popularity":{"rating":x,"reviews":n}},"enrich":{"description":"<real one-liner>","social":{"instagram":"...","facebook":"..."},"phones":["..."],"emails":["..."]}}'`
>    (omit any `enrich` field you didn't find — never fabricate; `popularity` is stamped from the assessment).
>
> Return one line: `{id, decision, leadType, fit}`. Never fabricate — base the verdict on what you saw.

## 3 · Notes

- Rejected companies stay in the store (`pipeline.hunt.status:"rejected"` + a reasons assessment) so you
  don't re-examine them and the user can see why — they're filterable/deletable in the dashboard.
- This is **agent-only** (the loop skips `hunt`). It composes the existing `discover`/`audit`/`grade`/
  deepdive pieces; don't reimplement them. Keep concurrency ≤ ~6 (Chrome). The 🎯 Find clients dashboard
  button queues a `hunt` request that this skill drains.
