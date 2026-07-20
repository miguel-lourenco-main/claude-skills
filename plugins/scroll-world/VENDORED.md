# Vendored fork of upstream

- Upstream: https://github.com/oso95/scroll-world (MIT, © 2026 cyw)
- Forked at commit: `f941ef93eec785f08634d5f42fb2cbd652dd06c6` (upstream plugin version 0.2.0)
- Vendored on: 2026-07-12

This is a fork: local modifications are allowed and expected to diverge from upstream. What was
copied: `LICENSE`, `README.md`, `.claude-plugin/plugin.json`, and `skills/scroll-world/`
(SKILL.md + references: scrub-engine.js, prompts.md, pipeline.md, knockout.py,
index-template.html). Excluded: upstream's own `.claude-plugin/marketplace.json`.

## To pull upstream changes

```bash
git clone --depth 1 https://github.com/oso95/scroll-world.git /tmp/scroll-world
# diff against this directory, port what you want, then update this file's sha/version/date.
# Local divergence is fine — this is a fork, not a mirror.
```
