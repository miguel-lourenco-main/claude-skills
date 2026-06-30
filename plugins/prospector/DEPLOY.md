# Deploying Prospector online

Prospector runs as a **single container** with a **persistent volume** and **shared-password auth**.
It keeps the full agentic pipeline (discover / hunt / audit / deepdive / outreach run by a headless
`claude` on the server) plus the outreach workspace. TLS is terminated by the host platform.

> **Single instance only.** The store is flat files + lock files (`loop.lock`, `agent.lock`) that
> assume one process. Set instance count = 1 and disable autoscaling.

## 1. Environment / secrets

| Variable | Required | What it does |
|---|---|---|
| `PROSPECTOR_PASSWORD` | **yes** | The shared password. Setting it switches the bridge to ONLINE mode (binds `0.0.0.0`, gates every data route behind a session cookie). |
| `SESSION_SECRET` | recommended | HMAC key for the session cookie. If unset, it's derived from the password (sessions reset if the password changes). Use a long random string. |
| `ANTHROPIC_API_KEY` | **yes** | Authenticates the headless `claude` CLI for the agent actions (hunt / deepdive / outreach). Without it, those actions wait in the queue. |
| `PROSPECTOR_ROOT` | preset | Store path. The image sets `/data/.prospector` (on the volume). |
| `PORT` | platform | The bridge reads `$PORT` (falls back to `PROSPECTOR_PORT`, then 8092). Most hosts inject this. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | for sending | SMTP credentials used by `send.mjs`. Use the operator's own mailbox (app-password) so the `From:` is a real personal address — best for cold-outreach reply rates. `SMTP_PORT` defaults to 587. |
| `OUTREACH_FROM` | for sending | The `From:` address (defaults to `SMTP_USER`). |
| `OUTREACH_SEND_DELAY_MS` | optional | Pause before each send (default 2000ms) — paces a one-click bundle so it doesn't burst. |
| `PROSPECTOR_CLAUDE_MODEL` | optional | Model for agent actions (default `opus`). |

## 2. Volume

Mount a persistent disk at **`/data`** (a few GB — screenshots dominate). The store is created on
first boot. To carry over your existing local data, copy your `.prospector/` into `/data/.prospector`
on the volume; otherwise it starts empty (discover/hunt to fill it).

## 3. Deploy (any container host — Railway / Render / Fly.io / a VPS)

```bash
docker build -t prospector .
docker run -p 8092:8092 \
  -e PROSPECTOR_PASSWORD='choose-a-strong-one' \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e ANTHROPIC_API_KEY='sk-ant-…' \
  -e SMTP_HOST='smtp.gmail.com' -e SMTP_PORT=587 \
  -e SMTP_USER='you@gmail.com' -e SMTP_PASS='app-password' \
  -e OUTREACH_FROM='you@gmail.com' \
  -v prospector-data:/data \
  prospector
```

On a managed host: point it at this repo's `Dockerfile`, set the env vars above as secrets, attach a
volume at `/data`, set instances = 1, and let the platform front it with HTTPS. Open the URL → you'll
hit the password screen.

## 4. Verify after deploy

1. The URL redirects to `/login`; the password lets you in; `/api/store` returns 401 without the cookie.
2. Discover / Find clients work (the agent runs server-side via `ANTHROPIC_API_KEY`).
3. In the **Outreach** view: draft → validate the contact → **Send now** lands a real email; **Send
   bundle** sends the bundled ones. The store survives a container restart (volume).

## 5. Import / export leads (move data local ↔ cloud)

The whole store — companies **and** their audits, dossiers, assessments, outreach, and screenshots —
moves as a single `.tar.gz` bundle.

- **Export / backup:** the dashboard **Export** button downloads the store (`GET /api/export`). From a
  local store: `node scripts/bundle.mjs export out.tar.gz`.
- **Import:** the dashboard **Import** button uploads a bundle and merges it (`POST /api/import`).
  Default policy is **fill-gaps** — existing leads are kept (contacts/provenance unioned) and only the
  artifacts the target is missing are added; nothing richer is overwritten.

## 6. Local-first worker — run the agent off your subscription (free)

Instead of the cloud paying the metered API for hunt / deep-dive / outreach, a **local Claude Code
session** can drain that work off your subscription, with the cloud API as the automatic fallback when
no session is connected.

1. **Enable it on the server** — set a shared worker token (any long random string):
   ```bash
   flyctl secrets set PROSPECTOR_WORKER_TOKEN="$(openssl rand -hex 24)" -a prospector-leadgen
   ```
   (Unset = feature dormant; the `/api/worker/*` routes 404 and everything behaves as before.)

2. **Connect from your PC** — in a Claude Code session (logged in with your **subscription**, not an
   API key), set the same token + the app URL and run the skill:
   ```bash
   export PROSPECTOR_BRIDGE_URL="https://prospector-leadgen.fly.dev"
   export PROSPECTOR_WORKER_TOKEN="…"   # the same value you set on Fly
   ```
   then run **`/prospector:prospect-worker`**. It leases queued agent work, runs the normal
   hunt/deepdive/outreach procedure on a synced workdir, and pushes results back.

3. The dashboard's **Local worker** pill shows *connected / running / offline*. **Reconnect** (when
   offline) frees any stuck job and fails over to the cloud immediately. When a session is connected,
   the cloud only pays for work it doesn't process.

> **Compliance:** routing the app's agent work through a personal Claude subscription is the pattern
> Anthropic restricts — this is the trade-off for free local processing; the cloud API path is the
> compliant fallback. Your call.

## Notes & limits

- **Cold-email deliverability/consent:** send from the operator's own mailbox, keep volume low, honor
  suppression (the app never re-sends to a `contacted` lead). Add SPF/DKIM if you switch to a provider
  (Resend/Postmark) instead of a personal mailbox.
- **Text channel is copy-paste only** — the app drafts it; the operator pastes it into WhatsApp/IG/SMS
  and clicks "Mark text sent". Only **email** is auto-sent.
- Reply/bounce tracking and scheduled bundles are out of scope for now (manual / send-now).
- Local dev is unchanged: with no `PROSPECTOR_PASSWORD`, the bridge stays loopback-only and open
  (`npm start`).
