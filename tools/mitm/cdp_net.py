#!/usr/bin/env python3
"""Capture a page's network traffic over the Chrome DevTools Protocol.

No TLS interception is involved: the browser itself reports every request and
response it makes, so this works even when the target app refuses our CA.

    python tools/mitm/cdp_net.py --port 9222 --match campusphere \
        --seconds 20 --reload --out capture/net.jsonl

Optional `--js` runs in the page right after capture starts (handy for
clicking a button), and `--grep` filters the printed summary.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cdp_eval import WebSocket, list_targets  # noqa: E402


class Session:
    def __init__(self, port: int, match: str) -> None:
        targets = [t for t in list_targets(port) if t.get("type") == "page"]
        if not targets:
            raise SystemExit("no page targets")
        if match:
            targets = [t for t in targets if match in t.get("url", "")] or targets
        target = targets[0]
        path = "/" + target["webSocketDebuggerUrl"].split("/", 3)[-1]
        self.url = target.get("url", "")
        self.ws = WebSocket("127.0.0.1", port, path)
        self.next_id = 0
        self.requests: dict[str, dict] = {}
        self.pending_bodies: dict[int, str] = {}

    def send(self, method: str, params: dict | None = None) -> int:
        self.next_id += 1
        payload = {"id": self.next_id, "method": method}
        if params is not None:
            payload["params"] = params
        self.ws.send(json.dumps(payload))
        return self.next_id

    def pump(self, deadline: float) -> None:
        while time.time() < deadline:
            try:
                message = json.loads(self.ws.recv(timeout=0.6))
            except (socket.timeout, TimeoutError):
                continue
            except ConnectionError:
                return
            self.dispatch(message)

    def dispatch(self, message: dict) -> None:
        method = message.get("method")
        params = message.get("params") or {}

        if method == "Network.requestWillBeSent":
            self.requests[params["requestId"]] = {
                "url": params["request"]["url"],
                "method": params["request"]["method"],
                "postData": params["request"].get("postData"),
                "headers": params["request"].get("headers"),
            }
        elif method == "Network.loadingFinished":
            rid = params["requestId"]
            if rid in self.requests:
                body_id = self.send("Network.getResponseBody", {"requestId": rid})
                self.pending_bodies[body_id] = rid
        elif message.get("id") in self.pending_bodies:
            rid = self.pending_bodies.pop(message["id"])
            result = message.get("result") or {}
            record = self.requests.get(rid)
            if record is not None:
                record["body"] = result.get("body")
                record["base64"] = result.get("base64Encoded", False)

    def close(self) -> None:
        self.ws.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9222)
    ap.add_argument("--match", default="")
    ap.add_argument("--seconds", type=float, default=20)
    ap.add_argument("--js", default="")
    ap.add_argument("--js-file", default="", help="read the --js expression from a file")
    ap.add_argument("--reload", action="store_true")
    ap.add_argument("--grep", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--max-body", type=int, default=20000)
    args = ap.parse_args()

    script = args.js
    if args.js_file:
        with open(args.js_file, encoding="utf-8") as handle:
            script = handle.read()

    session = Session(args.port, args.match)
    print(f"target: {session.url[:100]}", file=sys.stderr)

    session.send("Network.enable", {"maxPostDataSize": 65536})
    session.send("Page.enable")
    session.send("Runtime.enable")

    deadline = time.time() + args.seconds
    if args.reload:
        session.send("Page.reload", {"ignoreCache": False})
    if script:
        session.send("Runtime.evaluate", {
            "expression": script,
            "returnByValue": True,
            "awaitPromise": False,
            "userGesture": True,
        })

    session.pump(deadline)
    session.close()

    rows = list(session.requests.values())
    if args.out:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
            for row in rows:
                row["body"] = (row.get("body") or "")[: args.max_body]
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    needle = args.grep
    shown = 0
    for row in rows:
        blob = (row.get("url") or "") + " " + (row.get("body") or "")
        if needle and needle not in blob:
            continue
        body = (row.get("body") or "").replace("\n", " ")
        print(f"\n[{row['method']}] {row['url'][:150]}")
        if row.get("postData"):
            print(f"   req: {row['postData'][:220]}")
        if body:
            print(f"   res: {body[:400]}")
        shown += 1
        if shown >= 40:
            break

    print(f"\n--- {len(rows)} requests captured, {shown} shown ---", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
