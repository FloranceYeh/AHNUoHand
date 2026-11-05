"""连接当前 Tauri 主 WebView 并执行一段 JS。

移动端 WebView 进程重启后 socket 名会变，这里每次自动查找最新的那个。
用法：
    python tools/mitm/mobile_cdp.py "location.href"
    python tools/mitm/mobile_cdp.py --file script.js
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cdp_eval import connect, evaluate  # noqa: E402

PORT = 9222


def find_socket() -> str | None:
    """找到应用的 WebView 调试 socket（排除浏览器的）。"""
    out = subprocess.run(
        ["adb", "shell", "cat", "/proc/net/unix"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stdout
    names = re.findall(r"@(webview_devtools_remote_\d+)", out)
    return names[-1] if names else None


def forward(socket: str) -> None:
    subprocess.run(["adb", "forward", "--remove-all"], capture_output=True)
    subprocess.run(
        ["adb", "forward", f"tcp:{PORT}", f"localabstract:{socket}"],
        capture_output=True,
    )


def run(script: str) -> str:
    socket = find_socket()
    if not socket:
        return "ERR: 没找到 WebView 调试 socket"
    forward(socket)
    ws = connect(PORT, "tauri.localhost")
    try:
        raw = evaluate(ws, script)
        value = (raw.get("result") or {}).get("value")
        if isinstance(value, str):
            return value
        return str(raw)[:400]
    except Exception as error:  # noqa: BLE001
        return f"ERR: {type(error).__name__}: {error}"
    finally:
        ws.close()


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: mobile_cdp.py <js> | --file <path>")
        return 2

    if sys.argv[1] == "--file":
        with open(sys.argv[2], encoding="utf-8") as handle:
            script = handle.read()
    else:
        script = sys.argv[1]

    print(run(script))
    return 0


if __name__ == "__main__":
    sys.exit(main())
