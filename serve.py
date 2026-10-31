#!/usr/bin/env python3
"""本地起一个静态服务。录音功能需要安全上下文，file:// 下会被浏览器拦。

文档根是 web/。web/ 是自包含的，可以直接整个目录拿去部署。

    python serve.py 8080   →  http://127.0.0.1:8080/
"""

import http.server
import functools
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "web")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"http://127.0.0.1:{PORT}/")
        httpd.serve_forever()
