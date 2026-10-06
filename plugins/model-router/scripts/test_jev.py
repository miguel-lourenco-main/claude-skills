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
    usage = {"input_tokens": 300, "output_tokens": 40, "cost": 0.0000126}
    seen = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        MockJev.seen.append((self.path, self.headers.get("Authorization"), body))
        if self.headers.get("Authorization") != "Bearer test-key":
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"error":{"code":401}}'); return
        out = {"model": "typesafe/jev-mock", "answers": {k: v for k, v in MockJev.canned.items() if k in body["questions"]},
               "usage": MockJev.usage}
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


class SharedClient(unittest.TestCase):
    """jev_decide.py: the surface other plugins call. Same request as the hooks, wider key lookup,
    an answer that is never an exception, nothing written to the router's sample log."""

    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), MockJev)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.env = {k: v for k, v in os.environ.items() if not k.endswith("_API_KEY") and not k.startswith("JEV_")}
        self.env.update(HOME=self.home, JEV_BASE_URL=self.base, CLAUDE_PLUGIN_ROOT=str(HERE.parent))
        MockJev.canned = {"flake": {"type": "noul", "noul": 0.79}}
        self.request = {"state": {"job": "e2e", "failure_reason": "script_failure"},
                        "questions": {"flake": {"type": "noul", "instructions": "Is this the environment?"}}}

    def run_client(self, request=None, **env):
        p = subprocess.run([sys.executable, str(HERE / "jev_decide.py")], input=json.dumps(request or self.request),
                           capture_output=True, text=True, env=dict(self.env, **env), timeout=20)
        return p.returncode, json.loads(p.stdout)

    def test_answers_through_the_same_request_as_the_hooks(self):
        n = len(MockJev.seen)
        code, out = self.run_client(OPENROUTER_API_KEY="test-key")
        self.assertEqual((code, out["ok"], out["answers"]["flake"]["noul"]), (0, True, 0.79))
        self.assertEqual(out["model"], "typesafe/jev-mock")
        path, auth, body = MockJev.seen[-1]
        self.assertEqual((len(MockJev.seen), path, auth), (n + 1, "/v1/systemone", "Bearer test-key"))
        self.assertEqual((body["model"], body["state"]["job"]), ("typesafe/jev-1.13", "e2e"))

    def test_no_key_is_an_answer_not_an_exception(self):
        n = len(MockJev.seen)
        code, out = self.run_client()
        self.assertEqual((code, out["ok"]), (1, False)); self.assertIn("no key", out["reason"])
        self.assertEqual(len(MockJev.seen), n)

    def test_bad_key_and_bad_request_keep_the_shape(self):
        code, out = self.run_client(OPENROUTER_API_KEY="wrong")
        self.assertEqual((code, out["ok"]), (1, False)); self.assertIn("HTTP 401", out["reason"])
        p = subprocess.run([sys.executable, str(HERE / "jev_decide.py")], input="not json", capture_output=True,
                           text=True, env=self.env, timeout=20)
        self.assertEqual((p.returncode, json.loads(p.stdout)["ok"]), (1, False))

    def test_finds_another_plugins_key_where_the_hook_stays_off(self):
        d = Path(self.home) / ".claude" / "context-checkpoint"; d.mkdir(parents=True)
        (d / "jev.env").write_text('OPENROUTER_API_KEY="test-key"\n')
        code, out = self.run_client()
        self.assertEqual((code, out["ok"]), (0, True))
        # the spawn hook, same machine: it rewrites models, so it wants the router's own key
        n = len(MockJev.seen)
        spawn = {"hook_event_name": "PreToolUse", "tool_name": "Agent", "session_id": "s9", "transcript_path": "/nonexistent",
                 "tool_input": {"description": "d", "prompt": "p" * 50, "subagent_type": "general-purpose", "model": "opus"}}
        p = subprocess.run([sys.executable, str(HERE / "route_spawn.py")], input=json.dumps(spawn), capture_output=True,
                           text=True, env=self.env, timeout=20)
        self.assertEqual((p.returncode, p.stdout.strip(), len(MockJev.seen)), (0, "", n))
        log = Path(self.home) / ".claude" / "model-router" / "decisions.jsonl"
        self.assertIn("jev unavailable", json.loads(log.read_text().splitlines()[-1])["reason"])

    def test_a_typesafe_key_goes_to_typesafe(self):
        import jev_decide
        self.assertEqual(jev_decide._route_for("TYPESAFE_API_KEY", "k")[0], "typesafe")
        self.assertEqual(jev_decide._route_for("JEV_API_KEY", "k")[0], "openrouter")

    def test_request_model_override_and_no_sample_written(self):
        code, out = self.run_client(dict(self.request, model="jev-latest"), OPENROUTER_API_KEY="test-key")
        self.assertEqual((code, MockJev.seen[-1][2]["model"]), (0, "jev-latest"))
        self.assertFalse((Path(self.home) / ".claude" / "model-router" / "jev-samples.jsonl").exists())

    def raw_client(self, stdin, **env):
        p = subprocess.run([sys.executable, str(HERE / "jev_decide.py")], input=stdin, capture_output=True,
                           text=True, env=dict(self.env, **env), timeout=20)
        return p.returncode, json.loads(p.stdout), p.stderr

    def test_a_request_that_is_not_one_is_still_an_answer(self):
        n = len(MockJev.seen)
        for stdin in ("[1, 2]", "null", '"text"', json.dumps(dict(self.request, timeout_s="soon"))):
            code, out, err = self.raw_client(stdin, OPENROUTER_API_KEY="test-key")
            self.assertEqual((code, out["ok"], err), (1, False, ""), stdin)
            self.assertIn("bad request", out["reason"])
        self.assertEqual(len(MockJev.seen), n)

    def test_an_odd_usage_block_is_not_a_failed_decision(self):
        self.addCleanup(setattr, MockJev, "usage", MockJev.usage)
        for usage in ({"cost": "n/a"}, [1], None, "free"):
            MockJev.usage = usage
            code, out, err = self.raw_client(json.dumps(self.request), OPENROUTER_API_KEY="test-key")
            self.assertEqual((code, out["ok"], out["cost"], err), (0, True, 0.0, ""), usage)
            self.assertEqual(out["answers"]["flake"]["noul"], 0.79)

    def test_an_unreadable_timeout_in_the_environment_is_ignored(self):
        for bad in ("soon", "-3", ""):
            code, out, err = self.raw_client(json.dumps(self.request), OPENROUTER_API_KEY="test-key", JEV_TIMEOUT_S=bad)
            self.assertEqual((code, out["ok"], err), (0, True, ""), bad)

    def test_a_key_file_that_is_not_text_does_not_hide_the_next_one(self):
        d = Path(self.home) / ".claude"; (d / "context-checkpoint").mkdir(parents=True)
        (d / "a-binary.env").write_bytes(b"\xff\xfe\x00OPENROUTER_API_KEY=\xff")
        (d / "context-checkpoint" / "jev.env").write_bytes(b"\xff\xfe not text\n")
        (d / "zz.env").write_text("OPENROUTER_API_KEY=test-key\n")
        code, out, err = self.raw_client(json.dumps(self.request))
        self.assertEqual((code, out["ok"], err), (0, True, ""))

    def test_builders_and_readers(self):
        import jev_decide as jd
        self.assertEqual(jd.choice("which", {"a": "A", "b": "B"})["criteria"], {"a": "A", "b": "B"})
        self.assertEqual(jd.score("how", ["none", "some", "all"])["criteria"], ["none", "some", "all"])
        with self.assertRaises(AssertionError):
            jd.score("how", ["only one"])
        self.assertEqual(jd.value({"type": "noul", "noul": 0.8}), 0.8)
        self.assertEqual(jd.value({"type": "choice", "choice": "b"}), "b")
        self.assertEqual(jd.band({"type": "score", "score": 1.0}, 3), 0.5)
        self.assertIsNone(jd.value("not an answer"))
        self.assertIsNone(jd.band({"type": "choice", "choice": "b"}, 3))


if __name__ == "__main__":
    unittest.main(verbosity=1)
