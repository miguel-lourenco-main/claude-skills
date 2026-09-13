#!/usr/bin/env python3
"""Per-workstation record of the bi-weekly usage review, and whether a new one is due.

The record lives in ~/.claude/model-router/usage-review.json on each machine; it is never part of
the plugin, so every workstation keeps its own schedule. A review is due when the record is
missing, unreadable, written by an older analyzer, belongs to another host (a synced home dir),
dated in the future, or at least INTERVAL_DAYS old.

CLI: `review_state.py` prints the status as JSON.
"""
import datetime as dt
import json
import os
import socket
import sys
from pathlib import Path

INTERVAL_DAYS = 14
ANALYZER_VERSION = 2  # bump when metrics change meaning; older records then count as invalid
HISTORY_KEEP = 12
STATE_DIR = Path.home() / ".claude" / "model-router"
STATE_FILE = STATE_DIR / "usage-review.json"
REPORTS_DIR = STATE_DIR / "reports"


def load():
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, ValueError):
        return None


def check(today=None):
    """Return {"due": bool, "reason": str, "last": record-or-None}."""
    today = today or dt.date.today()
    if not STATE_FILE.exists():
        return {"due": True, "reason": "no usage analysis recorded on this workstation", "last": None}
    state = load()
    history = state.get("history") if isinstance(state, dict) else None
    if not history or not isinstance(history[-1], dict):
        return {"due": True, "reason": "the usage-review record is unreadable", "last": None}
    last = history[-1]
    if last.get("analyzer_version") != ANALYZER_VERSION:
        return {"due": True, "reason": "the last analysis was made by an older analyzer", "last": last}
    host = socket.gethostname()
    if last.get("host") != host:
        return {"due": True, "reason": f"the last record belongs to {last.get('host')!r}, not {host!r}", "last": last}
    try:
        ran = dt.date.fromisoformat(last["ran_on"])
    except (KeyError, TypeError, ValueError):
        return {"due": True, "reason": "the last analysis has no valid date", "last": last}
    age = (today - ran).days
    if age < 0:
        return {"due": True, "reason": f"the last analysis is dated in the future ({ran})", "last": last}
    if age >= INTERVAL_DAYS:
        return {"due": True, "reason": f"the last analysis was {age} days ago (every {INTERVAL_DAYS})", "last": last}
    return {"due": False, "reason": f"last analysis {age} days ago; next due in {INTERVAL_DAYS - age}", "last": last}


def record(metrics, report_path=None, today=None):
    """Append this analysis to the workstation's history (atomic write). Returns the previous entry."""
    state = load()
    history = state.get("history", []) if isinstance(state, dict) else []
    history = [h for h in history if isinstance(h, dict) and h.get("host") == socket.gethostname()]
    previous = history[-1] if history else None
    history.append({
        "ran_on": (today or dt.date.today()).isoformat(),
        "host": socket.gethostname(),
        "analyzer_version": ANALYZER_VERSION,
        "report": str(report_path) if report_path else None,
        "metrics": metrics,
    })
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps({"history": history[-HISTORY_KEEP:]}, indent=2) + "\n")
    os.replace(tmp, STATE_FILE)
    return previous


if __name__ == "__main__":
    status = check()
    last = status["last"] or {}
    print(json.dumps({
        "due": status["due"],
        "reason": status["reason"],
        "last_ran_on": last.get("ran_on"),
        "last_window": (last.get("metrics") or {}).get("window"),
        "last_report": last.get("report"),
    }, indent=2))
    sys.exit(0)
