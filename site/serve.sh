#!/usr/bin/env bash
# Local preview of the GitLab Pages site. Mirrors the CI `pages` job layout into a
# temp dir and serves it, so the hub (/), the gallery (/gallery/), and marketplace.json
# all resolve exactly like the deployed site. The vault is linked in too (not shipped to
# Pages) so the local gallery auto-loads instead of showing the "load your vault" prompt.
#
#   bash site/serve.sh           # → http://127.0.0.1:8099/
#   PORT=9000 bash site/serve.sh
#
# Stop with Ctrl-C. Re-run after editing site/ — it rebuilds the temp dir each time.
set -euo pipefail

REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
PORT="${PORT:-8099}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

mkdir -p "$OUT/gallery"
cp -r "$REPO/site/." "$OUT/"
cp -r "$REPO/ui-ux-references/gallery/src/." "$OUT/gallery/"
cp "$REPO/.claude-plugin/marketplace.json" "$OUT/marketplace.json"
# The gallery fetches the vault from an absolute /vault; link it so it auto-loads locally.
[ -d "$REPO/ui-ux-references/vault" ] && ln -s "$REPO/ui-ux-references/vault" "$OUT/vault" || true

echo "▸ claude-skills hub  → http://127.0.0.1:$PORT/"
echo "  gallery            → http://127.0.0.1:$PORT/gallery/"
echo "  (temp build at $OUT — Ctrl-C to stop)"
cd "$OUT" && exec python3 -m http.server "$PORT" --bind 127.0.0.1
