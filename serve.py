#!/usr/bin/env python3
"""Serves World Survey on loopback: python3 serve.py [port] [--dist]

Without --dist it serves the source folder (for development); with --dist it serves the built dist/.
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json'}

    def send_head(self):
        # App routes (/play/find/, /atlas/peru/) have no file in the source folder: serve the shell, as the build does.
        path = self.translate_path(self.path)
        if not os.path.exists(path) and '.' not in os.path.basename(self.path.split('?')[0].rstrip('/')):
            self.path = '/index.html'
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    root = HERE / 'dist' if '--dist' in sys.argv else HERE
    port = int(args[0]) if args else int(os.environ.get('PORT', 4462))
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(root)))
    print(f'World Survey on http://127.0.0.1:{port}/ ({root.name})', flush=True)
    server.serve_forever()
