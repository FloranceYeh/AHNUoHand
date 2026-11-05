#!/usr/bin/env python3
"""Tiny Chrome DevTools Protocol client (stdlib only).

Lists debug targets and evaluates JavaScript in a page WebView, which is how
we read runtime-only values (for example the AES key a page builds in memory).

    python tools/mitm/cdp_eval.py --port 9224 --list
    python tools/mitm/cdp_eval.py --port 9224 --eval "window.location.href"
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.client
import json
import os
import socket
import struct
import sys


def list_targets(port: int, host_header: str = "localhost") -> list[dict]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    conn.putrequest("GET", "/json/list", skip_host=True, skip_accept_encoding=True)
    conn.putheader("Host", f"{host_header}:{port}")
    conn.putheader("Accept", "application/json")
    conn.endheaders()
    resp = conn.getresponse()
    body = resp.read().decode("utf-8", "replace")
    conn.close()
    return json.loads(body) if body.strip() else []


class WebSocket:
    """Minimal RFC6455 client: text frames only, no extensions."""

    def __init__(self, host: str, port: int, path: str, timeout: float = 20.0) -> None:
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode())
        self._buf = b""
        head = self._read_until(b"\r\n\r\n")
        status = head.split(b"\r\n", 1)[0]
        if b"101" not in status:
            raise ConnectionError(f"websocket handshake failed: {status!r}")
        expected = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()
        ).decode()
        if expected.encode() not in head:
            raise ConnectionError("websocket accept mismatch")

    def _read_until(self, marker: bytes) -> bytes:
        while marker not in self._buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("socket closed during handshake")
            self._buf += chunk
        idx = self._buf.index(marker) + len(marker)
        head, self._buf = self._buf[:idx], self._buf[idx:]
        return head

    def _read_exact(self, n: int) -> bytes:
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("socket closed")
            self._buf += chunk
        data, self._buf = self._buf[:n], self._buf[n:]
        return data

    def send(self, text: str) -> None:
        payload = text.encode()
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 1 << 16:
            header.append(0x80 | 126)
            header += struct.pack("!H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack("!Q", length)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def recv(self, timeout: float = 20.0) -> str:
        self.sock.settimeout(timeout)
        while True:
            b1, b2 = self._read_exact(2)
            opcode = b1 & 0x0F
            masked = b2 & 0x80
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._read_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._read_exact(8))[0]
            mask = self._read_exact(4) if masked else b""
            payload = self._read_exact(length)
            if masked:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x8:
                raise ConnectionError("websocket closed by peer")
            if opcode == 0x9:  # ping -> pong
                continue
            if opcode in (0x1, 0x2):
                return payload.decode("utf-8", "replace")

    def close(self) -> None:
        try:
            self.sock.sendall(b"\x88\x82" + os.urandom(4))
        except Exception:
            pass
        self.sock.close()


def connect(port: int, match: str = "", host_header: str = "localhost") -> WebSocket:
    targets = [t for t in list_targets(port, host_header) if t.get("type") == "page"]
    if not targets:
        raise SystemExit("no page targets")
    if match:
        targets = [t for t in targets if match in t.get("url", "")] or targets
    target = targets[0]
    ws_url = target["webSocketDebuggerUrl"]
    path = "/" + ws_url.split("/", 3)[-1]
    print(f"target: {target.get('title','')[:80]}", file=sys.stderr)
    print(f"url   : {target.get('url','')[:120]}", file=sys.stderr)
    return WebSocket("127.0.0.1", port, path)


def evaluate(ws: WebSocket, expression: str, await_promise: bool = True) -> dict:
    ws.send(json.dumps({
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": await_promise,
            "userGesture": True,
        },
    }))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == 1:
            return msg.get("result", {})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9224)
    ap.add_argument("--host-header", default="localhost")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--match", default="")
    ap.add_argument("--eval", default="")
    args = ap.parse_args()

    if args.list:
        for t in list_targets(args.port, args.host_header):
            print(t.get("type"), "|", t.get("url", "")[:100])
        return 0

    ws = connect(args.port, args.match, args.host_header)
    try:
        result = evaluate(ws, args.eval)
        payload = result.get("result", {})
        if "value" in payload:
            value = payload["value"]
            print(json.dumps(value, ensure_ascii=False, indent=2) if not isinstance(value, str) else value)
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        ws.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
