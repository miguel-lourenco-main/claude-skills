---
name: ui-ux-gallery
description: Run the UI Reference Gallery locally — a static, OLED-dark gallery over the ui-ux-references vault (screenshots, palettes, typography, full teardowns) for a human to browse and analyze the references visually. Use when the user says "run/open/serve/preview the gallery", "show me the references in a browser", "browse the reference library", or "let me look through the extracted UIs". It serves the gallery + vault locally so it auto-loads. NOT for designing a UI (use ui-ux-director) and NOT for searching from the CLI (use ui-ux-references).
---

# UI Gallery

Serves the reference gallery locally and opens it. The gallery is a **client-side** app (no build): it
reads the vault at runtime. Served from the `ui-ux-references/` root, the vault is at `/vault` and the
gallery auto-loads it. (The same shell, deployed to GitLab Pages without a vault, instead lets a
visitor pick their own vault folder — see `ui-ux-references/gallery/README.md`.)

> This skill **runs** the gallery; it doesn't design it. Source: the `claude-skills` monorepo at
> `ui-ux-references/gallery/` (beside the vault).

## 0 · Locate the references root

The gallery + vault live in the monorepo **checkout** (not the plugin cache, which isn't a git repo).
The `~/.claude/skills/ui-ux-references` symlink points into the checkout — use it to find the repo:

```bash
REPO="$(git -C "$HOME/.claude/skills/ui-ux-references" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$REPO" ] || REPO="$(git rev-parse --show-toplevel 2>/dev/null)"
ROOT="${UIUX_REFS_ROOT:-${REPO:+$REPO/ui-ux-references}}"
echo "references root: ${ROOT:-NOT FOUND}"
```

If `$ROOT/gallery/src/index.html` or `$ROOT/vault/_index.json` is missing, the checkout isn't reachable
— tell the user to run from their `claude-skills` checkout (or set `$UIUX_REFS_ROOT`). Prereq: `python3`.

## 1 · Serve + open

Serve the references root (so both `/gallery` and `/vault` are reachable) in the **background**, then
report the link and open it:

```bash
PORT="${PORT:-8091}"
( cd "$ROOT" && nohup python3 -m http.server "$PORT" >/tmp/ui-gallery.log 2>&1 & )
sleep 1
URL="http://127.0.0.1:$PORT/gallery/src/index.html"
echo "▸ UI Reference Gallery → $URL"
xdg-open "$URL" >/dev/null 2>&1 || true   # best-effort open
```

If the port is already serving, just report the URL (no second server). Tell the user the URL, that
it's in the background, and how to stop it: `pkill -f "http.server $PORT"`.

The gallery auto-loads the vault from `/vault`. To point it elsewhere, append `?vault=<URL>`.

## 2 · Deploy (mention, don't run)

The repo-root `.gitlab-ci.yml` `pages` job publishes only the gallery **shell** (no vault) on the
default branch. The hosted gallery lets each visitor load their own vault folder in the browser. To
update the hosted shell, commit changes under `gallery/src/` and push.
