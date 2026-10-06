#!/usr/bin/env python3
"""Hermetic tests for the Jev decider: decision rules, pins, and both hooks end to end against a
local mock of /v1/systemone. No network, no real key. Run: python3 scripts/test_jev.py"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import jev  # noqa: E402

T = jev.tiers()


def answers(tier="sonnet", conf=0.95, judgement=0.0, jconf=0.9, risky=0.05):
    return {"tier": {"type": "choice", "choice": tier, "confidence": conf,
                     "probabilities": {tier: conf, "opus": 1 - conf}},
            "judgement": {"type": "score", "score": judgement, "confidence": jconf},
            "risky": {"type": "noul", "noul": risky}}


class DecideSpawn(unittest.TestCase):
    def test_downgrade_confident(self):
        m, why = jev.decide_spawn({"model": "opus"}, answers("sonnet", 0.93), 0.8, t=T)
        self.assertEqual(m, "sonnet"); self.assertIn("over caller's opus", why)

    def test_below_threshold_keeps_caller(self):
        m, _ = jev.decide_spawn({"model": "opus"}, answers("haiku", 0.6), 0.8, t=T)
        self.assertIsNone(m)

    def test_agreement_is_noop(self):
        m, why = jev.decide_spawn({"model": "sonnet"}, answers("sonnet", 0.99), 0.8, t=T)
        self.assertIsNone(m); self.assertIn("agrees", why)

    def test_upgrade_allowed_to_opus(self):
        m, _ = jev.decide_spawn({"model": "haiku"}, answers("opus", 0.9), 0.8, t=T)
        self.assertEqual(m, "opus")

    def test_never_fable(self):
        m, _ = jev.decide_spawn({"model": "fable"}, answers("opus", 0.9), 0.8, t=T)
        self.assertEqual(m, "opus")
        m, _ = jev.decide_spawn({"model": "sonnet"}, {"tier": {"choice": "fable", "confidence": 0.99}}, 0.8, t=T)
        self.assertIsNone(m)

    def test_judgement_guard_blocks_downgrade(self):
        m, why = jev.decide_spawn({"model": "opus"}, answers("sonnet", 0.9, judgement=1.8, jconf=0.9), 0.8, t=T)
        self.assertIsNone(m); self.assertIn("judgement", why)

    def test_risky_guard_blocks_downgrade(self):
        m, why = jev.decide_spawn({"model": "opus"}, answers("haiku", 0.9, risky=0.95), 0.8, t=T)
        self.assertIsNone(m); self.assertIn("risky", why)

    def test_guards_do_not_block_upgrade(self):
        m, _ = jev.decide_spawn({"model": "haiku"}, answers("opus", 0.9, judgement=2.0, risky=0.99), 0.8, t=T)
        self.assertEqual(m, "opus")

    def test_inherit_uses_default(self):
        m, _ = jev.decide_spawn({}, answers("haiku", 0.9), 0.8, requested_default="sonnet", t=T)
        self.assertEqual(m, "haiku")
        m, why = jev.decide_spawn({}, answers("sonnet", 0.9), 0.8, requested_default=None, t=T)
        self.assertEqual(m, "sonnet"); self.assertIn("no model", why)

    def test_full_model_ids(self):
        self.assertEqual(jev.tier_of("claude-opus-5-5"), "opus")
        self.assertEqual(jev.tier_of("claude-fable-5-1[1m]"), "fable")
        self.assertIsNone(jev.tier_of("gpt-6"))


class DecidePrompt(unittest.TestCase):
    def test_routes(self):
        self.assertEqual(jev.decide_prompt({"route": {"choice": "ship", "confidence": 0.9}}, 0.8, T)[0], "ship")
        self.assertIsNone(jev.decide_prompt({"route": {"choice": "keep", "confidence": 0.99}}, 0.8, T)[0])
        self.assertIsNone(jev.decide_prompt({"route": {"choice": "ship", "confidence": 0.5}}, 0.8, T)[0])
        self.assertIsNone(jev.decide_prompt({"route": {"choice": "banana", "confidence": 0.99}}, 0.8, T)[0])


class Pins(unittest.TestCase):
    def test_pin_phrases(self):
        for text, want in [("please do this on opus", "opus"), ("usa o sonnet para isto", "sonnet"),
                           ("run it with Haiku", "haiku"), ("switch to fable", "fable"),
                           ("am I overusing Opus?", None), ("the opus port failed", None), ("", None)]:
            self.assertEqual(jev.user_pin(text), want, text)


class MockJev(BaseHTTPRequestHandler):
    canned = answers("haiku", 0.92)
    seen = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        MockJev.seen.append((self.path, self.headers.get("Authorization"), body))
        if self.headers.get("Authorization") != "Bearer test-key":
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"error":{"code":401}}'); return
        out = {"model": "typesafe/jev-mock", "answers": {k: v for k, v in MockJev.canned.items() if k in body["questions"]},
               "usage": {"input_tokens": 300, "output_tokens": 40, "cost": 0.0000126}}
        data = json.dumps(out).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a):
        pass


class HooksEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), MockJev)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.home = tempfile.mkdtemp()
        cls.env = dict(os.environ, HOME=cls.home, OPENROUTER_API_KEY="test-key",
                       JEV_BASE_URL=f"http://127.0.0.1:{cls.srv.server_port}",
                       CLAUDE_PLUGIN_ROOT=str(HERE.parent), CLAUDE_CODE_SUBAGENT_MODEL="sonnet")
        cls.env.pop("TYPESAFE_API_KEY", None)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def hook(self, script, payload, **env):
        p = subprocess.run([sys.executable, str(HERE / script)], input=json.dumps(payload),
                           capture_output=True, text=True, env=dict(self.env, **env), timeout=20)
        self.assertEqual(p.returncode, 0, p.stderr)
        return json.loads(p.stdout) if p.stdout.strip() else None

    def decisions(self):
        path = Path(self.home) / ".claude" / "model-router" / "decisions.jsonl"
        return [json.loads(l) for l in path.read_text().splitlines()] if path.exists() else []

    def spawn(self, **tool_input):
        return {"hook_event_name": "PreToolUse", "tool_name": "Agent", "session_id": "s1",
                "transcript_path": "/nonexistent", "tool_input": dict({"description": "d", "prompt": "p" * 50,
                                                                        "subagent_type": "general-purpose"}, **tool_input)}

    def test_1_general_purpose_is_rerouted(self):
        MockJev.canned = answers("haiku", 0.92)
        out = self.hook("route_spawn.py", self.spawn(model="opus", description="wait for pipeline"))
        self.assertEqual(out["hookSpecificOutput"]["updatedInput"]["model"], "haiku")
        self.assertEqual(out["hookSpecificOutput"]["updatedInput"]["description"], "wait for pipeline")
        self.assertIn("Jev routed", out["hookSpecificOutput"]["additionalContext"])
        d = self.decisions()[-1]
        self.assertEqual((d["event"], d["applied"], d["requested"], d["route"]), ("spawn", "haiku", "opus", "openrouter"))
        path, auth, body = MockJev.seen[-1]
        self.assertEqual(path, "/v1/systemone"); self.assertEqual(body["model"], "typesafe/jev-1.13")
        self.assertEqual(set(body["questions"]), {"tier", "judgement", "risky"})
        self.assertNotIn("transcript_path", json.dumps(body["state"]))

    def test_2_low_confidence_is_silent(self):
        MockJev.canned = answers("haiku", 0.55)
        self.assertIsNone(self.hook("route_spawn.py", self.spawn(model="opus")))
        self.assertIsNone(self.decisions()[-1]["applied"])

    def test_3_pinned_agent_undoes_upgrade(self):
        out = self.hook("route_spawn.py", self.spawn(subagent_type="model-router:reviewer", model="opus"))
        self.assertEqual(out["hookSpecificOutput"]["updatedInput"]["model"], "sonnet")
        self.assertEqual(self.decisions()[-1]["reason"], "pinned agent; caller's model undone")
        n = len(MockJev.seen)
        self.assertIsNone(self.hook("route_spawn.py", self.spawn(subagent_type="model-router:ci-watcher", model="haiku")))
        self.assertEqual(len(MockJev.seen), n, "pinned agents never call Jev")

    def test_4_fork_and_foreign_plugins_untouched(self):
        n = len(MockJev.seen)
        self.assertIsNone(self.hook("route_spawn.py", self.spawn(subagent_type="fork")))
        self.assertIsNone(self.hook("route_spawn.py", self.spawn(subagent_type="feature-dev:code-reviewer", model="opus")))
        self.assertEqual(len(MockJev.seen), n)

    def test_5_no_key_fails_open(self):
        env = dict(self.env); env.pop("OPENROUTER_API_KEY")
        p = subprocess.run([sys.executable, str(HERE / "route_spawn.py")], input=json.dumps(self.spawn(model="opus")),
                           capture_output=True, text=True, env=env, timeout=20)
        self.assertEqual((p.returncode, p.stdout.strip()), (0, ""))
        self.assertIn("no OPENROUTER_API_KEY", self.decisions()[-1]["error"])

    def test_6_bad_key_fails_open(self):
        self.assertIsNone(self.hook("route_spawn.py", self.spawn(model="opus"), OPENROUTER_API_KEY="wrong"))
        self.assertIn("HTTP 401", self.decisions()[-1]["error"])

    def test_7_prompt_pin_then_spawn(self):
        MockJev.canned = {"route": {"type": "choice", "choice": "keep", "confidence": 0.9}}
        self.assertIsNone(self.hook("advise_prompt.py", {"hook_event_name": "UserPromptSubmit", "session_id": "s2",
                                                          "transcript_path": "/nonexistent",
                                                          "prompt": "port the smart extractor, run it on opus please"}))
        MockJev.canned = answers("sonnet", 0.99)
        out = self.hook("route_spawn.py", dict(self.spawn(model="sonnet"), session_id="s2"))
        self.assertEqual(out["hookSpecificOutput"]["updatedInput"]["model"], "opus")
        self.assertIn("pinned opus", out["hookSpecificOutput"]["additionalContext"])
        # the next prompt without a pin clears it
        self.hook("advise_prompt.py", {"hook_event_name": "UserPromptSubmit", "session_id": "s2",
                                       "transcript_path": "/nonexistent", "prompt": "now review the result for consistency"})
        out = self.hook("route_spawn.py", dict(self.spawn(model="sonnet"), session_id="s2"))
        self.assertIsNone(out)

    def test_8_prompt_advice(self):
        MockJev.canned = {"route": {"type": "choice", "choice": "ship", "confidence": 0.91}}
        out = self.hook("advise_prompt.py", {"hook_event_name": "UserPromptSubmit", "session_id": "s3",
                                             "transcript_path": "/nonexistent", "prompt": "commit and push the pending work"})
        ctx = out["hookSpecificOutput"]["additionalContext"]
        self.assertIn("ship work", ctx); self.assertIn("/model-router:ship", ctx)
        for p in ("/model-router:ship", "sim", "! ls", "[context-checkpoint] keep"):
            n = len(MockJev.seen)
            self.assertIsNone(self.hook("advise_prompt.py", {"hook_event_name": "UserPromptSubmit", "session_id": "s3",
                                                             "transcript_path": "/nonexistent", "prompt": p}))
            self.assertEqual(len(MockJev.seen), n, p)

    def test_9_samples_ring_keeps_last_ten_verbatim(self):
        MockJev.canned = answers("sonnet", 0.9)
        for i in range(13):
            self.hook("route_spawn.py", self.spawn(model="opus", description=f"sample {i}"))
        path = Path(self.home) / ".claude" / "model-router" / "jev-samples.jsonl"
        rows = [json.loads(l) for l in path.read_text().splitlines()]
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[-1]["request"]["state"]["description"], "sample 12")
        self.assertEqual(rows[0]["request"]["state"]["description"], "sample 3")
        self.assertEqual(set(rows[-1]["request"]["questions"]), {"tier", "judgement", "risky"})
        self.assertEqual(rows[-1]["response"]["answers"]["tier"]["choice"], "sonnet")
        self.assertEqual(rows[-1]["meta"]["route"], "openrouter")
        self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
        p = subprocess.run([sys.executable, str(HERE / "jev.py"), "--samples", "2"], capture_output=True,
                           text=True, env=self.env, timeout=20)
        self.assertIn("sample 1/2", p.stdout); self.assertIn("sample 12", p.stdout); self.assertIn("tier: sonnet", p.stdout)
        # a failed call is not a sample
        n = len(rows)
        self.hook("route_spawn.py", self.spawn(model="opus"), OPENROUTER_API_KEY="wrong")
        self.assertEqual(len(path.read_text().splitlines()), n)

    def test_9b_sonnet_main_session_gets_no_advice(self):
        tr = Path(self.home) / "t.jsonl"
        tr.write_text(json.dumps({"type": "assistant", "message": {"model": "claude-sonnet-5"}}) + "\n")
        n = len(MockJev.seen)
        self.assertIsNone(self.hook("advise_prompt.py", {"hook_event_name": "UserPromptSubmit", "session_id": "s4",
                                                          "transcript_path": str(tr), "prompt": "commit and push the pending work"}))
        self.assertEqual(len(MockJev.seen), n)
        self.assertEqual(jev.main_session_model(str(tr)), "claude-sonnet-5")


if __name__ == "__main__":
    unittest.main(verbosity=1)
