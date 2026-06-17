---
name: ui-ux-gallery
description: Build and run the UI Reference Gallery locally — a static, OLED-dark gallery over the ui-ux-references vault (screenshots, palettes, typography, full teardowns) for a human to browse and analyze the references visually. Use when the user says "run/open/serve/preview the gallery", "show me the references in a browser", "browse the reference library", or "let me look through the extracted UIs". It bakes the local vault into a static site and serves it. NOT for designing a UI (use ui-ux-director) and NOT for searching from the CLI (use ui-ux-references).
---

# UI Gallery

Builds the static reference gallery from the local vault and serves it so the user can browse it in
a browser. The gallery is a build-time bake (no runtime filesystem access), the same artifact that
deploys to GitLab Pages — this skill just runs it locally.

> This skill **runs** the gallery; it doesn't design it. The gallery's source lives in the
> `claude-skills` monorepo at `ui-ux-references/gallery/` (beside the vault and the Pages CI).

## 0 · Locate the gallery

The gallery is part of the monorepo (not shipped inside the plugin cache), so resolve it via the
references skill's location, then the repo root:

```bash
SK="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/ui-ux-references}"
[ -d "$SK" ] || SK="$HOME/.claude/skills/ui-ux-references"
REPO="$(cd "$SK" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)"
GALLERY="${UIUX_GALLERY:-${REPO:+$REPO/ui-ux-references/gallery}}"
[ -d "$GALLERY" ] || GALLERY="$(cd "$SK/../../../.." 2>/dev/null && pwd)/ui-ux-references/gallery"
echo "gallery: $GALLERY"
```

If `$GALLERY/build.mjs` doesn't exist, the monorepo checkout isn't reachable from here — tell the
user to run it from their `claude-skills` checkout (or set `$UIUX_GALLERY`).

Prereqs: `node` (build) and `python3` (serve) — both standard. The build needs no npm install.

## 1 · Build

```bash
node "$GALLERY/build.mjs"   # bakes the vault into <repo>/public (vault resolved automatically)
```

This parses each note's teardown and copies the two screenshots per reference (~5 MB total). Re-run
it whenever the vault changes. The output dir is the repo's `public/` (override with `OUT=…`).

## 2 · Serve

Serve `public/` and give the user the URL. Start it in the **background** so the session isn't
blocked, then report the link:

```bash
PORT="${PORT:-8091}"
( cd "$REPO/public" && python3 -m http.server "$PORT" >/tmp/ui-gallery.log 2>&1 & )
echo "▸ UI Reference Gallery → http://127.0.0.1:$PORT"
xdg-open "http://127.0.0.1:$PORT" >/dev/null 2>&1 || true   # best-effort open
```

Tell the user the URL, that it's serving in the background, and how to stop it:
`pkill -f "http.server $PORT"`.

## 3 · Deploy (mention, don't run)

The same `public/` deploys to **GitLab Pages** via the repo-root `.gitlab-ci.yml` `pages` job on the
default branch (it runs `git lfs pull` → `build.mjs` → publishes `public/`). To ship the live gallery,
the user commits any new references + pushes; CI rebuilds and redeploys. `public/` is git-ignored —
never commit it. See `ui-ux-references/gallery/README.md`.
