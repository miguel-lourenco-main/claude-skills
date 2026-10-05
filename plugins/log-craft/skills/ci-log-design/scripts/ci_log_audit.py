#!/usr/bin/env python3
"""ci_log_audit.py - measure how readable a GitLab CI job log is.

Usage:
  ci_log_audit.py <trace-file> [<trace-file> ...]     human report
  ci_log_audit.py --json <trace-file>                 metrics as JSON
  ci_log_audit.py --render <trace-file>               what a reader sees on open:
                                                      authored zone, collapsed
                                                      sections folded to one line

Input is a raw job trace (`glab api projects/<id>/jobs/<job>/trace`, or the
"raw" link on the job page), with or without runner timestamps. Stdlib only.

Everything is measured on the *authored zone* (the step_script and after_script
runner sections): the part of the log the repo's own scripts control.
"""
import json
import re
import sys
import unicodedata

SCREEN = 40          # lines a reader sees without scrolling; GitLab opens at the bottom
WIDE = 120           # widest line that survives a laptop-width job page without wrapping
RUNNER_SECTIONS = {
    "prepare_executor", "prepare_script", "get_sources", "restore_cache",
    "download_artifacts", "step_script", "after_script", "archive_cache",
    "archive_cache_on_failure", "upload_artifacts_on_success",
    "upload_artifacts_on_failure", "cleanup_file_variables", "resolve_secrets",
}
AUTHORED = {"step_script", "after_script"}

TS = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+Z [0-9a-f]{2}[OE]([ +])")
MARK = re.compile(r"section_(start|end):(\d+):([A-Za-z0-9_.\-]+)(\[[^\]]*\])?\r?(?:\x1b\[0K)?")
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
DECOR = re.compile(r"^[\s\-=_*#~+|─-╿▀-▟⠀-⣿]+$")
FAIL = re.compile(r"^\s*(✖|✗|✘|\[ ?FAIL(ED)? ?\]|FAIL(ED)?\b|ERROR\b|error[:\[])", re.I)
OKLN = re.compile(r"^\s*(✓|✔|\[ ?OK ?\]|PASS(ED)?\b)")
WARN = re.compile(r"^\s*(⚠|\[ ?WARN ?\]|WARN(ING)?\b)", re.I)
SUMMARY = re.compile(r"^\W*(?i:summary|result)\b|\b(PASSED|FAILED|CANCELED)\b")
VERDICT = re.compile(r"^(ERROR: Job failed|Job succeeded)")


def cell_width(text):
    """Terminal cells, counting emoji and East Asian wide glyphs as 2."""
    w = 0
    for ch in text:
        o = ord(ch)
        if o == 0xFE0F:                 # emoji presentation selector widens the previous glyph
            w += 1
        elif unicodedata.combining(ch) or o in (0x200D, 0xFE0E):
            continue
        elif unicodedata.east_asian_width(ch) in "WF" or 0x1F300 <= o <= 0x1FAFF:
            w += 2
        else:
            w += 1
    return w


def is_wide_glyph(ch):
    o = ord(ch)
    return o == 0xFE0F or unicodedata.east_asian_width(ch) in "WF" or 0x1F300 <= o <= 0x1FAFF


def parse(raw):
    """Yield dicts: text, colored, section stack snapshot, header-of (section id or None)."""
    logical = []
    for line in raw.split("\n"):
        m = TS.match(line)
        if m:
            body = line[m.end():]
            if m.group(1) == "+" and logical:
                logical[-1] += body
                continue
            line = body
        logical.append(line)

    stack, out = [], []
    for line in logical:
        header_of, pos, rest = None, 0, ""
        for m in MARK.finditer(line):
            rest += line[pos:m.start()]
            pos = m.end()
            kind, sid, opts = m.group(1), m.group(3), m.group(4) or ""
            if kind == "start":
                stack.append({"id": sid, "collapsed": "collapsed=true" in opts,
                              "start": int(m.group(2)), "lines": 0})
                header_of = sid
            else:
                for i in range(len(stack) - 1, -1, -1):
                    if stack[i]["id"] == sid:
                        closed = stack.pop(i)
                        out.append({"closed": closed, "dur": int(m.group(2)) - closed["start"]})
                        break
                else:
                    out.append({"orphan_end": sid})
        rest += line[pos:]
        colored = bool(ANSI.search(rest))
        text = ANSI.sub("", rest)
        if "\r" in text:                       # a terminal would keep only the last overwrite
            parts = [p for p in text.split("\r") if p.strip()]
            text = parts[-1] if parts else ""
        if not text.strip() and header_of is None and MARK.search(line):
            continue                           # a bare section_end line renders as nothing
        zone = next((s["id"] for s in stack if s["id"] in AUTHORED), None)
        custom = [s for s in stack if s["id"] not in RUNNER_SECTIONS]
        hidden = any(s["collapsed"] for s in custom if s["id"] != header_of)
        for s in custom:
            if s["id"] != header_of:
                s["lines"] += 1
        out.append({"text": text.rstrip(), "colored": colored, "zone": zone,
                    "header_of": header_of, "hidden": hidden,
                    "depth": len(custom)})
    return out, [s["id"] for s in stack if s["id"] not in RUNNER_SECTIONS]


def audit(raw):
    events, unclosed = parse(raw)
    lines = [e for e in events if "text" in e]
    verdict = next((VERDICT.match(e["text"]).group(1) for e in reversed(lines)
                    if VERDICT.match(e["text"])), "unknown")
    failed = verdict.startswith("ERROR")
    zone = [e for e in lines if e["zone"]]
    visible = [e for e in zone if not e["hidden"]]
    n, v = max(len(zone), 1), max(len(visible), 1)

    widths = [cell_width(e["text"]) for e in visible]
    echo = [e for e in visible if e["text"].startswith("$ ")]
    custom_closed = [e for e in events if "closed" in e and e["closed"]["id"] not in RUNNER_SECTIONS]
    tail = visible[-SCREEN:]
    fail_idx = [i for i, e in enumerate(visible) if FAIL.match(e["text"])]
    status = [e for e in visible if FAIL.match(e["text"]) or OKLN.match(e["text"]) or WARN.match(e["text"])]

    m = {
        "verdict": verdict,
        "authored_lines": len(zone),
        "visible_lines": len(visible),
        "hidden_share": round(1 - len(visible) / n, 2),
        "custom_sections": len(custom_closed),
        "unclosed_sections": unclosed,
        "orphan_section_ends": [e["orphan_end"] for e in events if "orphan_end" in e],
        "empty_sections": [e["closed"]["id"] for e in custom_closed if e["closed"]["lines"] == 0],
        "max_width": max(widths, default=0),
        "wide_lines": sum(1 for w in widths if w > WIDE),
        "decoration_share": round(sum(1 for e in visible if e["text"] and DECOR.match(e["text"])) / v, 3),
        "blank_share": round(sum(1 for e in visible if not e["text"].strip()) / v, 3),
        "echo_lines": len(echo),
        "echo_share": round(len(echo) / v, 3),
        "echo_wide": sum(1 for e in echo if cell_width(e["text"]) > WIDE),
        "wide_glyph_lines": sum(1 for e in visible if any(is_wide_glyph(c) for c in e["text"])),
        "status_lines": len(status),
        "has_summary": any(e["header_of"] and "summary" in e["header_of"].lower() for e in zone)
                       or any(SUMMARY.search(e["text"]) for e in tail),
        "fail_marker_on_last_screen": any(FAIL.match(e["text"]) for e in tail) if failed else None,
        "lines_after_last_fail_marker": (len(visible) - 1 - fail_idx[-1]) if failed and fail_idx else None,
    }

    # Checks: (id, passed, weight, message). Weights sum to 100.
    c = []
    c.append(("failure-lands-last", (not failed) or bool(m["fail_marker_on_last_screen"]), 20,
              "a failed job states what failed within the last %d visible lines" % SCREEN))
    c.append(("summary", m["has_summary"], 12, "the job ends with a summary block"))
    c.append(("noise-folded", len(visible) <= 80 or m["hidden_share"] >= 0.6, 15,
              "tool output is folded: <=80 visible lines, or >=60% inside collapsed sections"))
    c.append(("width", m["wide_lines"] == 0, 10, "no visible line wider than %d cells" % WIDE))
    c.append(("echo", m["echo_share"] <= 0.15 and m["echo_wide"] == 0, 10,
              "echoed commands are <=15% of visible lines and none is over-wide"))
    c.append(("decoration", m["decoration_share"] <= 0.08, 8, "rule/box-only lines are <=8% of visible lines"))
    c.append(("blank", m["blank_share"] <= 0.15, 5, "blank lines are <=15% of visible lines"))
    c.append(("sections-balanced", not unclosed and not m["orphan_section_ends"], 8,
              "every section_start has its section_end"))
    c.append(("sections-used", m["custom_sections"] >= 1 or len(zone) <= SCREEN, 5,
              "logs longer than a screen use collapsible sections"))
    c.append(("glyph-width", m["wide_glyph_lines"] <= 2, 4,
              "at most two lines carry emoji/wide glyphs (they break column alignment)"))
    c.append(("status-vocabulary", m["status_lines"] >= 1, 3, "outcomes use status-glyph lines"))
    m["score"] = sum(w for _, ok, w, _ in c if ok)
    m["checks"] = [{"id": i, "pass": ok, "weight": w, "rule": msg} for i, ok, w, msg in c]
    return m, visible, events


def render(events):
    """The log as a reader first sees it: collapsed sections folded to their header."""
    out = []
    for e in events:
        if "text" not in e or not e["zone"] or e["hidden"]:
            continue
        if e["header_of"] and e["header_of"] not in RUNNER_SECTIONS:
            out.append("> " + e["text"])
        elif not e["header_of"]:
            out.append(e["text"])
    return "\n".join(out)


def main(argv):
    as_json = "--json" in argv
    as_render = "--render" in argv
    files = [a for a in argv if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 2
    worst = 100
    for path in files:
        with open(path, encoding="utf-8", errors="replace", newline="") as fh:
            m, _, events = audit(fh.read())
        worst = min(worst, m["score"])
        if as_render:
            print(render(events))
        elif as_json:
            print(json.dumps({"file": path, **m}, ensure_ascii=False, indent=2))
        else:
            print("%s  score %d/100  (%s)" % (path, m["score"], m["verdict"]))
            print("  authored %d lines, %d visible on open (%d%% folded), %d custom sections, max width %d"
                  % (m["authored_lines"], m["visible_lines"], m["hidden_share"] * 100,
                     m["custom_sections"], m["max_width"]))
            for ch in m["checks"]:
                if not ch["pass"]:
                    print("  FAIL %-20s -%2d  %s" % (ch["id"], ch["weight"], ch["rule"]))
    return 0 if worst >= 80 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
