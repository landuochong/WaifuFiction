#!/usr/bin/env python3
"""Local-only static server for the Paper Dance motion studio."""

from __future__ import annotations

import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("PAPER_DANCE_HOST", "127.0.0.1")
PORT = int(os.environ.get("PAPER_DANCE_PORT", "8765"))


class Handler(SimpleHTTPRequestHandler):
    server_version = "PaperDanceLocal/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/api/health":
            body = json.dumps({
                "ok": True,
                "mode": "local",
                "paid_provider": False,
                "message": "本地素材与动作工作台已就绪",
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Paper Dance Local: http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
