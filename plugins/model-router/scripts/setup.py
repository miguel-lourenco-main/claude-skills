#!/usr/bin/env python3
"""Merge model-router's per-machine settings into ~/.claude/settings.json (idempotent)."""
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

WANTED_ENV = {"CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"}
MARKETPLACE = "claude-skills"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--settings", default=str(Path.home() / ".claude" / "settings.json"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = Path(args.settings)
    data = json.loads(path.read_text()) if path.exists() else {}
    before = json.dumps(data, sort_keys=True)

    env = data.setdefault("env", {})
    for key, value in WANTED_ENV.items():
        if env.get(key) not in (None, value):
            print(f"keeping existing {key}={env[key]!r} (not overwriting)")
            continue
        env[key] = value

    markets = data.get("extraKnownMarketplaces", {})
    if MARKETPLACE in markets:
        markets[MARKETPLACE]["autoUpdate"] = True
    else:
        print(f"marketplace {MARKETPLACE!r} not in extraKnownMarketplaces; add it with /plugin marketplace add")

    if json.dumps(data, sort_keys=True) == before:
        print(f"{path}: already configured, nothing to do")
        return 0
    rendered = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if args.dry_run:
        print(rendered)
        return 0
    if path.exists():
        backup = path.with_name(f"{path.name}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(path, backup)
        print(f"backup: {backup}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered)
    print(f"{path}: updated (new sessions pick it up)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
