#!/usr/bin/env python3
"""Simple HTTP server with no-cache headers for development."""
import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def guess_type(self, path):
        # Hardcode JS MIME type — Windows registry may map .js to text/plain
        # which causes Chrome to silently refuse ES modules (infinite load, no error)
        t = super().guess_type(path)
        if path.endswith('.js'):
            return 'text/javascript'
        return t

    def log_message(self, format, *args):
        if args and '404' in str(args[0]):
            super().log_message(format, *args)

# Allow reusing the port so re-launching doesn't crash with "address already in use"
socketserver.TCPServer.allow_reuse_address = True

PORT = 8765

with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"Serving on http://127.0.0.1:{PORT} (no-cache headers enabled)")
    httpd.serve_forever()
