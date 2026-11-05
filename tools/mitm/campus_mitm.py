#!/usr/bin/env python3
"""Minimal HTTP/HTTPS MITM proxy used to observe a phone's app traffic.

Runs with the system Python (needs only `cryptography`) so it works without pip.

Modes:
  observe  CONNECT tunnels are relayed byte-for-byte; only the target host,
           byte counts and timing are recorded. Nothing is decrypted, so the
           app keeps working even when it does not trust our CA.
  mitm     CONNECT tunnels are terminated with a per-host certificate signed by
           a local CA, requests/responses are recorded as JSONL.

Every record is appended to the output file as one JSON object per line.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import ipaddress
import json
import os
import socket
import ssl
import sys
import threading
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

CRLF = b"\r\n"
HDR_END = b"\r\n\r\n"
_read_lock = threading.Lock()


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


class Journal:
    """Append-only JSONL writer, safe for concurrent handler threads."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._fh = open(path, "a", encoding="utf-8")

    def write(self, record: dict) -> None:
        line = json.dumps(record, ensure_ascii=False)
        with _read_lock:
            self._fh.write(line + "\n")
            self._fh.flush()

    def close(self) -> None:
        with _read_lock:
            self._fh.close()


# --------------------------------------------------------------------------
# certificate authority
# --------------------------------------------------------------------------


class CertAuthority:
    def __init__(self, directory: Path, common_name: str) -> None:
        self.dir = directory
        self.dir.mkdir(parents=True, exist_ok=True)
        self.key_path = self.dir / "ca.key"
        self.crt_path = self.dir / "ca.crt"
        self.der_path = self.dir / "ca.der"
        self._leaves: dict[str, ssl.SSLContext] = {}
        self._lock = threading.Lock()

        if self.key_path.exists() and self.crt_path.exists():
            self.key = serialization.load_pem_private_key(
                self.key_path.read_bytes(), password=None
            )
            self.cert = x509.load_pem_x509_certificate(self.crt_path.read_bytes())
        else:
            self.key, self.cert = self._create_ca(common_name)

    def _create_ca(self, common_name: str):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name(
            [
                x509.NameAttribute(NameOID.COMMON_NAME, common_name),
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Local Capture"),
            ]
        )
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now_naive.replace(year=now_naive.year - 1))
            .not_valid_after(now_naive.replace(year=now_naive.year + 10))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_encipherment=False,
                    key_cert_sign=True,
                    key_agreement=False,
                    content_commitment=False,
                    data_encipherment=False,
                    crl_sign=True,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .add_extension(
                x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False
            )
            .sign(key, hashes.SHA256())
        )
        self.key_path.write_bytes(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        self.crt_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        self.der_path.write_bytes(cert.public_bytes(serialization.Encoding.DER))
        return key, cert

    def leaf_context(self, host: str) -> ssl.SSLContext:
        with self._lock:
            cached = self._leaves.get(host)
        if cached is not None:
            return cached

        leaf_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        try:
            san = x509.IPAddress(ipaddress.ip_address(host))
        except ValueError:
            san = x509.DNSName(host)

        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        leaf = (
            x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, host)]))
            .issuer_name(self.cert.subject)
            .public_key(leaf_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now_naive.replace(year=now_naive.year - 1))
            .not_valid_after(now_naive.replace(year=now_naive.year + 2))
            .add_extension(x509.SubjectAlternativeName([san]), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(
                x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False
            )
            .sign(self.key, hashes.SHA256())
        )

        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.set_alpn_protocols(["http/1.1"])
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(
            certfile=self._tmp_write(f"leaf-{_safe(host)}.crt", leaf.public_bytes(serialization.Encoding.PEM)),
            keyfile=self._tmp_write(
                f"leaf-{_safe(host)}.key",
                leaf_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.TraditionalOpenSSL,
                    encryption_algorithm=serialization.NoEncryption(),
                ),
            ),
        )
        with self._lock:
            self._leaves[host] = ctx
        return ctx

    def _tmp_write(self, name: str, data: bytes) -> str:
        path = self.dir / name
        if not path.exists():
            path.write_bytes(data)
        return str(path)


def _safe(host: str) -> str:
    return "".join(c if c.isalnum() or c in ".-" else "_" for c in host)


# --------------------------------------------------------------------------
# HTTP helpers
# --------------------------------------------------------------------------


def read_head(sock: socket.socket, initial: bytes = b"") -> tuple[bytes, bytes]:
    """Read until CRLFCRLF. Returns (head_without_terminator, leftover)."""
    buf = bytearray(initial)
    while HDR_END not in buf:
        chunk = sock.recv(65536)
        if not chunk:
            if not buf:
                return b"", b""
            raise ConnectionError("connection closed mid-header")
        buf.extend(chunk)
        if len(buf) > 1 << 20:
            raise ConnectionError("header too large")
    idx = buf.index(HDR_END)
    return bytes(buf[:idx]), bytes(buf[idx + 4 :])


def parse_head(head: bytes) -> tuple[str, str, str, dict[str, str]]:
    lines = head.split(CRLF)
    first = lines[0].decode("latin-1")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            continue
        raw = line.decode("latin-1")
        if ":" not in raw:
            continue
        key, _, value = raw.partition(":")
        key = key.strip().lower()
        value = value.strip()
        headers[key] = f"{headers[key]}, {value}" if key in headers else value
    return first, headers.pop("__none__", ""), "", headers


def read_body(sock: socket.socket, headers: dict[str, str], leftover: bytes) -> bytes:
    if headers.get("transfer-encoding", "").lower().startswith("chunked"):
        buf = bytearray(leftover)
        out = bytearray()
        while True:
            while b"\r\n" not in buf:
                chunk = sock.recv(65536)
                if not chunk:
                    return bytes(out)
                buf.extend(chunk)
            line_end = buf.index(CRLF)
            size_line = bytes(buf[:line_end]).split(b";")[0].strip()
            try:
                size = int(size_line, 16)
            except ValueError:
                return bytes(out)
            del buf[: line_end + 2]
            while len(buf) < size + 2:
                chunk = sock.recv(65536)
                if not chunk:
                    return bytes(out)
                buf.extend(chunk)
            out.extend(buf[:size])
            del buf[: size + 2]
            if size == 0:
                return bytes(out)

    length = int(headers.get("content-length", "0") or 0)
    if length <= 0:
        return b""
    buf = bytearray(leftover)
    while len(buf) < length:
        chunk = sock.recv(65536)
        if not chunk:
            break
        buf.extend(chunk)
    return bytes(buf[:length])


def decode_body(headers: dict[str, str], body: bytes) -> bytes:
    if not body:
        return b""
    encoding = headers.get("content-encoding", "").lower()
    try:
        if "gzip" in encoding:
            return gzip.decompress(body)
        if "deflate" in encoding:
            return zlib.decompress(body)
        if "br" in encoding:
            try:
                import brotli  # type: ignore

                return brotli.decompress(body)
            except Exception:
                return body
    except Exception:
        return body
    return body


def charset_of(headers: dict[str, str]) -> str:
    ctype = headers.get("content-type", "")
    for part in ctype.split(";"):
        part = part.strip()
        if part.lower().startswith("charset="):
            return part.split("=", 1)[1].strip().strip('"')
    return "utf-8"


def text_of(headers: dict[str, str], body: bytes, limit: int) -> tuple[str, int, bool, str]:
    """Return (text, decoded_size, truncated, base64_of_head) for a body."""
    raw = decode_body(headers, body)
    size = len(raw)
    truncated = size > limit
    text = raw[:limit].decode(charset_of(headers), errors="replace")
    b64 = base64.b64encode(raw[:limit]).decode("ascii")
    return text, size, truncated, b64


def split_hostport(value: str, default_port: int) -> tuple[str, int]:
    """Split "host:port" tolerantly; "host" alone keeps the default port."""
    if value.startswith("["):  # bracketed IPv6 literal
        host, _, rest = value[1:].partition("]")
        port = rest.lstrip(":")
        return host, int(port) if port else default_port
    host, sep, port = value.rpartition(":")
    if not sep:
        return value, default_port
    if not host:  # ":8080" style, no host part
        return "127.0.0.1", int(port)
    return host, int(port or default_port)


def normalize_headers(headers: dict[str, str]) -> dict[str, str]:
    """Drop volatile/auth material from the record but keep the shape."""
    drop = {"cookie", "set-cookie", "authorization", "proxy-authorization"}
    return {k: v for k, v in headers.items() if k not in drop}


# --------------------------------------------------------------------------
# proxy core
# --------------------------------------------------------------------------


class Proxy:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.journal = Journal(Path(args.out))
        self.ca = CertAuthority(Path(args.certs), args.ca_name) if args.mode == "mitm" else None
        try:
            import certifi  # a self-contained root bundle beats the Windows store

            self.upstream = ssl.create_default_context(cafile=certifi.where())
        except Exception:
            self.upstream = ssl.create_default_context()
        if args.insecure_upstream:
            self.upstream.check_hostname = False
            self.upstream.verify_mode = ssl.CERT_NONE
        self.upstream.set_alpn_protocols(["http/1.1"])
        self.upstream.minimum_version = ssl.TLSVersion.TLSv1_2
        self.count = 0
        self._count_lock = threading.Lock()

    # -- logging ----------------------------------------------------------
    def record(self, **fields) -> None:
        fields.setdefault("ts", now())
        self.journal.write(fields)
        with self._count_lock:
            self.count += 1
            n = self.count
        if n % 20 == 0 or self.args.verbose:
            print(f"[{fields['ts']}] #{n} {fields.get('host','')}{fields.get('path','')}", flush=True)

    # -- socket plumbing ---------------------------------------------------
    def handle(self, conn: socket.socket, addr) -> None:
        conn.settimeout(60)
        client = f"{addr[0]}:{addr[1]}"
        try:
            head, leftover = read_head(conn)
            if not head:
                return
            line, _, _, headers = parse_head(head)
            parts = line.split()
            if len(parts) < 2:
                return
            method, target = parts[0], parts[1]

            if method.upper() == "CONNECT":
                host, port = split_hostport(target, 443)
                conn.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
                if self.args.mode == "mitm":
                    self.terminate_tls(conn, host, port, client)
                else:
                    self.relay(conn, host, port, client)
                return

            # plain HTTP through the proxy: absolute-URI request
            self.forward_plain(conn, method, target, headers, leftover, client)
        except Exception as exc:  # keep the proxy alive
            if self.args.verbose:
                print(f"  ! {client} {type(exc).__name__}: {exc}", flush=True)
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def relay(self, conn: socket.socket, host: str, port: int, client: str) -> None:
        """Observe mode: opaque tunnel, log volume and lifetime only."""
        started = time.time()
        up = 0
        down = 0
        try:
            remote = socket.create_connection((host, port), timeout=15)
        except Exception as exc:
            self.record(layer="connect", client=client, host=host, port=port, ok=False, error=str(exc))
            return
        try:
            while True:
                r, _, _ = select_select([conn, remote], [], [], 60)
                if not r:
                    break
                for sock in r:
                    data = sock.recv(65536)
                    if not data:
                        raise ConnectionError("eof")
                    if sock is conn:
                        up += len(data)
                        remote.sendall(data)
                    else:
                        down += len(data)
                        conn.sendall(data)
        except Exception:
            pass
        finally:
            remote.close()
            self.record(
                layer="connect",
                client=client,
                host=host,
                port=port,
                ok=True,
                up_bytes=up,
                down_bytes=down,
                dur_ms=int((time.time() - started) * 1000),
            )

    def terminate_tls(self, conn: socket.socket, host: str, port: int, client: str) -> None:
        try:
            tls = self.ca.leaf_context(host).wrap_socket(conn, server_side=True)
        except Exception as exc:
            self.record(
                layer="tls",
                client=client,
                host=host,
                port=port,
                ok=False,
                error=f"{type(exc).__name__}: {exc}",
            )
            return

        sni = host
        try:
            sni = tls.server_hostname or host
        except Exception:
            pass

        try:
            head, leftover = read_head(tls)
            line, _, _, headers = parse_head(head)
            parts = line.split()
            if len(parts) < 2:
                return
            method, path = parts[0], parts[1]
            body = read_body(tls, headers, leftover)
            self.forward_tls(tls, host, port, method, path, headers, body, client, sni)
        finally:
            try:
                tls.close()
            except Exception:
                pass

    def forward_tls(self, tls, host, port, method, path, headers, body, client, sni) -> None:
        started = time.time()
        upstream_headers = {k: v for k, v in headers.items() if k not in ("proxy-connection",)}
        # ask for identity so we can always decode the body we record
        upstream_headers["accept-encoding"] = "gzip"
        upstream_headers["connection"] = "close"
        upstream_headers.pop("keep-alive", None)

        raw = f"{method} {path} HTTP/1.1".encode("latin-1") + CRLF
        for key, value in upstream_headers.items():
            raw += f"{key}: {value}".encode("latin-1") + CRLF
        raw += CRLF + body

        try:
            remote = self.upstream.wrap_socket(
                socket.create_connection((host, port), timeout=20), server_hostname=sni
            )
        except Exception as exc:
            self.record(
                layer="request",
                client=client,
                scheme="https",
                host=host,
                port=port,
                method=method,
                path=path,
                ok=False,
                error=f"upstream {type(exc).__name__}: {exc}",
            )
            reply = b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            try:
                tls.sendall(reply)
            except Exception:
                pass
            return

        status = 0
        resp_headers: dict[str, str] = {}
        resp_body = b""
        try:
            remote.sendall(raw)
            resp_head, resp_left = read_head(remote)
            status_line, _, _, resp_headers = parse_head(resp_head)
            bits = status_line.split()
            status = int(bits[1]) if len(bits) > 1 and bits[1].isdigit() else 0
            resp_body = read_body(remote, resp_headers, resp_left)
        except Exception as exc:
            self.record(
                layer="request",
                client=client,
                scheme="https",
                host=host,
                method=method,
                path=path,
                ok=False,
                error=f"read {type(exc).__name__}: {exc}",
            )
            return
        finally:
            try:
                remote.close()
            except Exception:
                pass

        req_text, req_size, req_trunc, req_b64 = text_of(headers, body, self.args.max_body)
        resp_text, resp_size, resp_trunc, resp_b64 = text_of(resp_headers, resp_body, self.args.max_body)

        self.record(
            layer="request",
            client=client,
            scheme="https",
            host=host,
            port=port,
            method=method,
            path=path,
            url=f"https://{host}{path}",
            req_headers=normalize_headers(headers),
            req_body=req_text,
            req_body_size=req_size,
            req_body_truncated=req_trunc,
            req_body_b64=req_b64,
            status=status,
            resp_headers=normalize_headers(resp_headers),
            resp_body=resp_text,
            resp_body_size=resp_size,
            resp_body_truncated=resp_trunc,
            resp_body_b64=resp_b64,
            dur_ms=int((time.time() - started) * 1000),
            ok=True,
        )

        # hand the response back to the client with a corrected framing
        out = build_response(status, resp_headers, resp_body)
        try:
            tls.sendall(out)
        except Exception:
            pass

    def forward_plain(self, conn, method, target, headers, leftover, client) -> None:
        started = time.time()
        if target.startswith("http://"):
            rest = target[len("http://") :]
            hostport, _, path = rest.partition("/")
            path = "/" + path
        else:
            hostport, path = target, "/"
        host, port = split_hostport(hostport, 80)

        body = read_body(conn, headers, leftover)
        out_headers = {k: v for k, v in headers.items() if k not in ("proxy-connection",)}
        out_headers["connection"] = "close"
        raw = f"{method} {path} HTTP/1.1".encode("latin-1") + CRLF
        for key, value in out_headers.items():
            raw += f"{key}: {value}".encode("latin-1") + CRLF
        raw += CRLF + body

        try:
            remote = socket.create_connection((host, port), timeout=20)
        except Exception as exc:
            self.record(
                layer="request", client=client, scheme="http", host=host, port=port,
                method=method, path=path, ok=False, error=str(exc),
            )
            return

        status = 0
        resp_headers: dict[str, str] = {}
        resp_body = b""
        try:
            remote.sendall(raw)
            resp_head, resp_left = read_head(remote)
            status_line, _, _, resp_headers = parse_head(resp_head)
            bits = status_line.split()
            status = int(bits[1]) if len(bits) > 1 and bits[1].isdigit() else 0
            resp_body = read_body(remote, resp_headers, resp_left)
        finally:
            remote.close()

        req_text, req_size, req_trunc, req_b64 = text_of(headers, body, self.args.max_body)
        resp_text, resp_size, resp_trunc, resp_b64 = text_of(resp_headers, resp_body, self.args.max_body)
        self.record(
            layer="request",
            client=client,
            scheme="http",
            host=host,
            port=port,
            method=method,
            path=path,
            url=f"http://{host}{path}",
            req_headers=normalize_headers(headers),
            req_body=req_text,
            req_body_size=req_size,
            req_body_truncated=req_trunc,
            req_body_b64=req_b64,
            status=status,
            resp_headers=normalize_headers(resp_headers),
            resp_body=resp_text,
            resp_body_size=resp_size,
            resp_body_truncated=resp_trunc,
            resp_body_b64=resp_b64,
            dur_ms=int((time.time() - started) * 1000),
            ok=True,
        )

        out = build_response(status, resp_headers, resp_body)
        conn.sendall(out)


def build_response(status: int, headers: dict[str, str], body: bytes) -> bytes:
    """Re-serialize a response whose body has already been de-chunked."""
    out = f"HTTP/1.1 {status} {_reason(status)}".encode("latin-1") + CRLF
    for key, value in headers.items():
        if key in ("transfer-encoding", "content-length", "connection", "keep-alive"):
            continue
        out += f"{key}: {value}".encode("latin-1") + CRLF
    if status not in (204, 304) and not (100 <= status < 200):
        out += f"content-length: {len(body)}".encode("latin-1") + CRLF
    out += b"connection: close" + CRLF
    return out + CRLF + body


def _reason(status: int) -> str:
    import http

    try:
        return http.HTTPStatus(status).phrase
    except Exception:
        return "Unknown"


def select_select(rlist, wlist, xlist, timeout):
    import select

    return select.select(rlist, wlist, xlist, timeout)


def main() -> int:
    ap = argparse.ArgumentParser(description="campus H5 traffic capture proxy")
    ap.add_argument("--mode", choices=["observe", "mitm"], default="mitm")
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--out", default="capture/session.jsonl")
    ap.add_argument("--certs", default="capture/certs")
    ap.add_argument("--ca-name", default="Campus Capture CA")
    ap.add_argument("--max-body", type=int, default=120000)
    ap.add_argument("--insecure-upstream", action="store_true", help="skip upstream certificate checks")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    proxy = Proxy(args)

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((args.bind, args.port))
    srv.listen(128)

    banner = [
        f"mode      : {args.mode}",
        f"listening : {args.bind}:{args.port}",
        f"journal   : {Path(args.out).resolve()}",
    ]
    if proxy.ca is not None:
        banner += [f"ca cert   : {proxy.ca.crt_path.resolve()}", f"ca der    : {proxy.ca.der_path.resolve()}"]
    print("\n".join(banner), flush=True)

    try:
        while True:
            conn, addr = srv.accept()
            threading.Thread(target=proxy.handle, args=(conn, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\nstopping", flush=True)
    finally:
        srv.close()
        proxy.journal.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
