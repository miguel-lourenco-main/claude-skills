---
name: prospect-outreach
description: Draft outreach for selected companies in the Prospector store — research the best contact(s), then write a humanized PT email AND a short copy-paste text, for a human to validate + send from the dashboard. Use when the user says "write outreach", "draft the cold email", "prep the pitch", or to drain queued `outreach` requests from the dashboard. Writes outreach/<id>.json (canonical) via outreach-save.mjs; the operator then validates contacts and sends the email (text is copy-paste only).
---

# Prospect · outreach

You draft a ready-to-validate outreach package for each target company. A human operator then checks
the contacts you found, edits the copy, and sends the **email** from the dashboard (the **text** is
copy-paste only — never auto-sent). Your job is research + drafting, NOT sending.

You produce, per company: **researched contact(s)** (so the operator has something concrete to
validate), a **PT email** (subject + body), and a short **PT text** message. Persist everything by
calling `outreach-save.mjs` — it is the only writer. **Never fabricate** a contact or a fact.

## 0 · Setup

```bash
PLUGIN="${CLAUDE_PLUGIN_ROOT:-$HOME/Desktop/workspace/personal/projects/claude-skills/plugins/prospector}"
export PROSPECTOR_ROOT="${PROSPECTOR_ROOT:-$PWD/.prospector}"
```

The request targets specific `companyIds`. For each id, read what's already known:
the company record (`companies/<id>.json`), its audit (`audits/<id>.website.json` — dated signals,
opportunity), and its hunt assessment (`assessments/<id>.json` — `pitch`, `pitchAngle`, `leadType`,
`reasons`). Respect the scope's suppression lists and skip any lead already `contacted`.

## 1 · Per company

1. **Research the best contact(s).** `WebFetch` the company website's contact / about / footer pages
   and `WebSearch` the business name + city for a decision-maker, a real email, and social handles.
   Collect each as `{type, value, source, confidence}`:
   - `type` ∈ email | phone | instagram | facebook | linkedin | whatsapp | other
   - `source` = where you saw it (a URL, "website footer", "discovery record")
   - `confidence` = 0..1 (a named owner's address > a generic `geral@` > a guessed pattern). **Never
     invent or pattern-guess an address** — if you only have a generic inbox, record that honestly; if
     you found nothing usable, return an empty contacts list and say so.
   - Set `chosenRecipient` to the best **email** ONLY if you're reasonably confident; otherwise leave
     it null for the operator to fill after validating.

2. **Draft the email (PT).** Subject + body, seeded from the audit's `datedSignals` and the
   assessment's `pitch`/`pitchAngle`. Make it personal and specific to THIS business (reference the
   real problem you'd fix), short, and non-salesy. The highest-converting tactic is offering a
   concrete next step (a quick speculative mockup / a 10-min look) rather than a generic pitch.

3. **Draft the text (PT).** A 2–4 sentence version of the same message for WhatsApp/IG/SMS — even more
   informal and concise. This is what the operator copies and pastes manually.

4. **Humanize.** Run both drafts through the `humanizer` skill so they don't read as AI-generated.
   (Optionally compose a `ui-ux-pro-max` hero-mockup idea to reference as the hook — keep the file
   output to the structured record below.)

5. **Persist** (the only write — supply DATA, not files):
   ```bash
   node "$PLUGIN/scripts/outreach-save.mjs" '{"companyId":"<id>","draft":{
     "email":{"subject":"…","body":"…"},
     "text":{"body":"…"},
     "contacts":[{"type":"email","value":"geral@x.pt","source":"site footer","confidence":0.5}],
     "pitchAngle":"redesign",
     "chosenRecipient":"geral@x.pt"}}'
   ```
   This writes `outreach/<id>.json` (status `draft`) + a readable `outreach/<id>.md`, and sets the lead
   to `outreach-ready`. Omit `chosenRecipient` when unsure.

## 2 · Finish

After all target companies are drafted (or you're stopping), resolve the request so it drains:
```bash
node "$PLUGIN/scripts/outreach-resolve.mjs" '{"reqId":"<reqId>","summary":"drafted N/N · contacts found for M"}'
```
Then print one final line summarizing the outcome.

## Notes

- **You draft; the human validates + sends.** Email is sent by the app via SMTP from the dashboard
  (`send.mjs`), only after the operator validates the contact and marks it. Text is copy-paste only.
- This is **agent-only** (the loop skips `outreach` and leaves it for the agent-runner / a human
  session). The deterministic follow-ups — saving operator edits and sending — are `outreach-save` and
  `send`, which the loop runs.
- Never fabricate contacts, reviews, or facts. An honest "no email found" is correct and useful — the
  operator can then research it by hand.
