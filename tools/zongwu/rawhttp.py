#!/usr/bin/env python3
"""用裸 TLS（ALPN=http/1.1）发 HTTP 请求。

学校的 nginx 在缺少 ALPN 时会直接掐连接，`requests` 会拿到 SSLError；
这里复刻代理里那套握手参数，顺便支持把响应落到文件。
"""

from __future__ import annotations

import argparse
import socket
import ssl
import sys

import certifi


def fetch(host: str, path: str, method: str = "GET", headers: dict | None = None,
          body: bytes | None = None, timeout: float = 20.0) -> tuple[int, dict, bytes]:
    ctx = ssl.create_default_context(cafile=certifi.where())
    ctx.set_alpn_protocols(["http/1.1"])
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2

    request = f"{method} {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n"
    request += "User-Agent: Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36\r\n"
    request += "Accept: */*\r\n"
    for key, value in (headers or {}).items():
        request += f"{key}: {value}\r\n"
    if body is not None:
        request += f"Content-Length: {len(body)}\r\n"
    request += "\r\n"

    with socket.create_connection((host, 443), timeout=timeout) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as tls:
            tls.sendall(request.encode("latin-1") + (body or b""))
            raw = b""
            while True:
                try:
                    chunk = tls.recv(65536)
                except Exception:
                    break
                if not chunk:
                    break
                raw += chunk

    head, _, payload = raw.partition(b"\r\n\r\n")
    lines = head.decode("latin-1", "replace").split("\r\n")
    status = 0
    if lines and lines[0].startswith("HTTP/"):
        parts = lines[0].split()
        status = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    response_headers = {}
    for line in lines[1:]:
        if ":" in line:
            key, _, value = line.partition(":")
            response_headers[key.strip().lower()] = value.strip()

    if response_headers.get("transfer-encoding", "").lower() == "chunked":
        payload = _dechunk(payload)
    return status, response_headers, payload


def _dechunk(data: bytes) -> bytes:
    out = bytearray()
    buf = bytearray(data)
    while True:
        if b"\r\n" not in buf:
            break
        idx = buf.index(b"\r\n")
        size_line = bytes(buf[:idx]).split(b";")[0].strip()
        try:
            size = int(size_line, 16)
        except ValueError:
            break
        del buf[: idx + 2]
        if size == 0:
            break
        out.extend(buf[:size])
        del buf[: size + 2]
    return bytes(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--host", default="ybt.ahnu.edu.cn")
    ap.add_argument("--out", default="")
    ap.add_argument("--show", type=int, default=600)
    args = ap.parse_args()

    status, headers, body = fetch(args.host, args.path)
    print(f"{status} {args.path}  ct={headers.get('content-type','')[:40]}  len={len(body)}")
    if args.out:
        with open(args.out, "wb") as handle:
            handle.write(body)
        print("saved:", args.out)
    print(body[: args.show].decode("utf-8", "replace"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
