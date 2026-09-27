#!/usr/bin/env python3
"""A local stand-in for /v1/systemone, for dry runs without a key or a bill.

    python3 scripts/mock_jev.py [--tier haiku] [--confidence 0.92] [--port 0]

prints the port, then answers every request with that tier, judgement 0, risky 0.05, and a
`route` of "keep". Point the hooks at it with OPENROUTER_API_KEY=mock JEV_BASE_URL=http://127.0.0.1:<port>.
"""
import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", default="haiku")
    ap.add_argument("--confidence", type=float, default=0.92)
    ap.add_argument("--route", default="keep")
    ap.add_argument("--port", type=int, default=0)
    a = ap.parse_args()

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            canned = {
                "tier": {"type": "choice", "choice": a.tier, "confidence": a.confidence,
                         "probabilities": {a.tier: a.confidence}},
                "judgement": {"type": "score", "score": 0.0, "confidence": 0.9},
                "risky": {"type": "noul", "noul": 0.05},
                "route": {"type": "choice", "choice": a.route, "confidence": 0.9},
            }
            out = {"model": "typesafe/jev-mock", "answers": {k: v for k, v in canned.items() if k in body["questions"]},
                   "usage": {"input_tokens": len(json.dumps(body)) // 4, "output_tokens": 40, "cost": 0.0}}
            data = json.dumps(out).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

        def log_message(self, fmt, *args):
            sys.stderr.write("mock_jev: " + fmt % args + "\n")

    srv = HTTPServer(("127.0.0.1", a.port), H)
    print(srv.server_port, flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
