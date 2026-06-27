# Prospector — hosted (online) build.
# Bundles Playwright (website capture, with its Chromium) + the Claude CLI (the agent actions:
# hunt / deepdive / outreach). Set PROSPECTOR_PASSWORD at runtime → the bridge serves on 0.0.0.0
# behind shared-password auth. The store lives on a persistent volume so leads + screenshots survive
# deploys. Run a SINGLE instance — the file store + lock files assume one process (no autoscale).
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app
ENV NODE_ENV=production \
    PROSPECTOR_NO_OPEN=1 \
    PROSPECTOR_ROOT=/data/.prospector

# Claude CLI for the agentic actions; authenticated at runtime via ANTHROPIC_API_KEY.
RUN npm install -g @anthropic-ai/claude-code

# Install runtime deps, then ensure the matching Chromium is present (capture.mjs falls back to the
# bundled Chromium when no system Google Chrome exists — which is the case in this image).
COPY package.json ./
RUN npm install --omit=dev && npx playwright install chromium

COPY . .

# Persisted store (companies, audits, screenshots, outreach, request queue).
VOLUME ["/data"]
# Documentation only — the platform's $PORT (or PROSPECTOR_PORT) overrides this at runtime.
EXPOSE 8092
CMD ["node", "bridge/server.mjs"]
