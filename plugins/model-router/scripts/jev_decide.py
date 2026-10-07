#!/usr/bin/env python3
"""jev_decide - one decision-model client for every plugin that needs a bounded answer.

Jev (TypeSafe's "System One") answers typed questions about a state with calibrated
probabilities and writes no prose. That shape fits a particular kind of question well and most
questions badly, so read `skills/decision-model/SKILL.md` before reaching for it.

This exists because the first plugin to use Jev (context-checkpoint) had to solve four dull
problems - finding the key, shaping the request, bounding the wait, and degrading when any of it
fails - and the second one must not solve them again. Routing *which model does what* is this
plugin's subject, so the client lives here and the others call it.

The request itself is `jev.post`, the same call the router's spawn and prompt hooks make
(`jev.py`), so this plugin talks to Jev in one place. What this file adds is the surface another
plugin needs: a CLI and an answer that is never an exception. The key is found the way the hooks
find it (`jev.credentials`: the environment, the router's own jev.env, then any other plugin's
under ~/.claude), so a key put down for one plugin serves every decision on the machine. Calls
made here are not written to the router's sample log, which stays about routing.

Usage:
  echo '{"state": {...}, "questions": {...}}' | python3 jev_decide.py
  python3 jev_decide.py --self-test        # one live call, exits non-zero if Jev is unreachable

Output (stdout, JSON), always - a failure is an answer, not an exception:
  {"ok": true,  "model": "...", "answers": {...}, "cost": 0.00004, "seconds": 0.4}
  {"ok": false, "reason": "no key (set ...)" | "JevUnavailable: openrouter: timed out" | "bad request: ..."}

Branch on `ok`. `reason` is a sentence for a person or a log and its wording is not a contract.
The exit code is 0 when ok and 1 otherwise.

A caller that gets `ok: false` must have somewhere to go. That is the contract: Jev is an
improvement on a decision, never the only way to reach one.

A call made here waits JEV_TIMEOUT_S seconds (default 12), or the request's `timeout_s`. The
router's hooks have their own, shorter bound (JEV_TIMEOUT, default 4), because they hold a spawn.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev  # noqa: E402

DEFAULT_TIMEOUT = 12.0


def _env_seconds(name, default):
    """A positive number of seconds from the environment; the default when unset or unreadable."""
    try:
        v = float(os.environ.get(name) or default)
    except ValueError:
        return default
    return v if v > 0 else default


TIMEOUT = _env_seconds("JEV_TIMEOUT_S", DEFAULT_TIMEOUT)


def find_route():
    """The router's own key lookup (`jev.credentials`): the environment, the router's jev.env, then
    any other plugin's. None when there is none."""
    try:
        return jev.credentials()
    except jev.JevUnavailable:
        return None


def decide(state, questions, timeout=TIMEOUT, model=None):
    """Ask Jev. Returns the dict this script prints; never raises."""
    t0 = time.time()
    try:
        found = find_route()
        if not found:
            return {"ok": False, "reason": "no key (set OPENROUTER_API_KEY or write ~/.claude/model-router/jev.env)"}
        route, base, route_model, key = found
        d, _ = jev.post(route, base, model or route_model, key, state, questions, float(timeout))
        usage = d.get("usage") if isinstance(d.get("usage"), dict) else {}
        try:
            cost = float(usage.get("cost") or 0.0)
        except (TypeError, ValueError):  # an odd usage block is not a failed decision
            cost = 0.0
        return {
            "ok": True,
            "model": d.get("model") or model or route_model,
            "answers": d["answers"],
            "cost": cost,
            "seconds": round(time.time() - t0, 2),
        }
    except Exception as e:  # one shape for the caller, whatever went wrong, including in reading the answer
        return {"ok": False, "reason": f"{type(e).__name__}: {e}"[:200], "seconds": round(time.time() - t0, 2)}


# -- question builders --------------------------------------------------------
#
# Shaping a question is where a decision model is won or lost, so the shapes are here rather than
# rewritten per caller. Jev cannot explain itself: a badly worded scale returns a confident number
# with nothing behind it, and no prose to give it away.


def noul(instructions):
    """Yes/no. The answer carries `noul`, the probability of yes."""
    return {"type": "noul", "instructions": instructions}


def choice(instructions, options):
    """One of `options` ({name: what it means}), with a probability each and a confidence."""
    return {"type": "choice", "instructions": instructions, "criteria": options}


def score(instructions, levels):
    """A position on 2-10 described levels. Describe every level in words: a scale of bare
    numbers is where a decision model invents a meaning and answers it confidently."""
    assert 2 <= len(levels) <= 10, "Jev takes 2 to 10 levels"
    return {"type": "score", "instructions": instructions, "criteria": list(levels)}


def value(answer):
    """The plain value of one answer, whatever its type - probability, chosen name, or position."""
    if not isinstance(answer, dict):
        return None
    if answer.get("type") == "noul":
        return answer.get("noul")
    if answer.get("type") == "choice":
        return answer.get("choice")
    return answer.get("score")


def band(answer, levels):
    """A `score` answer as a 0-1 position, so a caller can threshold without knowing the scale."""
    s = value(answer)
    try:
        return None if s is None or levels < 2 else max(0.0, min(1.0, float(s) / (levels - 1)))
    except (TypeError, ValueError):
        return None


def main():
    if "--self-test" in sys.argv:
        out = decide("the word ok", {"alive": noul("Is the state the word ok?")})
        print(json.dumps(out))
        sys.exit(0 if out.get("ok") else 1)
    try:
        req = json.load(sys.stdin)
        if not isinstance(req, dict):
            raise ValueError("the request must be a JSON object")
        timeout = float(req.get("timeout_s") or TIMEOUT)
    except Exception as e:
        print(json.dumps({"ok": False, "reason": f"bad request: {e}"[:200]}))
        sys.exit(1)
    out = decide(req.get("state"), req.get("questions") or {}, timeout=timeout, model=req.get("model"))
    print(json.dumps(out))
    sys.exit(0 if out.get("ok") else 1)


if __name__ == "__main__":
    main()
