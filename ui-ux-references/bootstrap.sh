#!/usr/bin/env bash
# bootstrap.sh — make ui-ux-references ready on this environment and wire it into
# the installed ui-ux-pro-max skill. Safe to re-run (idempotent); re-run after a
# ui-ux-pro-max plugin update, since the plugin cache is volatile and this repo
# is the durable source of truth.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

echo "==> ui-ux-references bootstrap"

# 1) Node deps
if [ ! -d node_modules ]; then
  echo "  - installing node deps"
  npm install --silent
fi

# 2) Chromium for Playwright (shared system cache; no-op if already present)
echo "  - ensuring Chromium for Playwright"
npx --yes playwright install chromium chromium-headless-shell >/dev/null 2>&1 || \
  echo "    (warning: could not install Chromium automatically; run 'npx playwright install chromium' manually)"

# 3) Git LFS (vault images + JS bundles are LFS-tracked) + build the query index
echo "  - ensuring Git LFS"
git lfs install >/dev/null 2>&1 || echo "    (warning: 'git lfs install' failed; install git-lfs for the vault binaries)"
echo "  - building vault index"
node scripts/build-index.cjs >/dev/null 2>&1 || echo "    (warning: build-index failed; run 'node scripts/build-index.cjs' manually)"

# 4) Wire into ui-ux-pro-max (best-effort; skip if not installed)
MARKER="<!-- ui-ux-references-integration -->"
read -r -d '' BLOCK <<'EOF' || true

<!-- ui-ux-references-integration -->
## Companion: Reference Examples (ui-ux-references skill)

Before generating UI for a known product type, pull REAL references from the
ui-ux-references library and look at them:

```bash
python3 ~/.claude/skills/ui-ux-references/scripts/query.py "<product type + style keywords>" -n 4
```

Open the returned `above-fold.jpg` / `full.jpg` with the Read tool (actually look at them) and
read the returned reference NOTE (`<slug>.md` in the Obsidian vault) — its Style / Palette /
Typography / Notable patterns / When-to-use sections — before designing. For exact tokens read the
note's `assets/css/` and `raw.html`. Combine these real examples with the rules from this skill's
`--design-system` output. To grow the library see `~/.claude/skills/ui-ux-references/README.md`.
EOF

patched=0
shopt -s nullglob
for f in "$HOME"/.claude/plugins/cache/ui-ux-pro-max-skill/*/*/.claude/skills/ui-ux-pro-max/SKILL.md; do
  if grep -qF "$MARKER" "$f"; then
    echo "  - ui-ux-pro-max already wired: $f"
  else
    printf '\n\n%s\n' "$BLOCK" >> "$f"
    echo "  - wired ui-ux-pro-max: $f"
  fi
  patched=1
done
shopt -u nullglob
[ "$patched" -eq 0 ] && echo "  - ui-ux-pro-max not found (skipped integration)"

echo "==> done"
