import http.server
import socketserver
import webbrowser
import threading
import os
import sys
import socket

# ─── Configuration ────────────────────────────────────────────────────────────
DEFAULT_PORT = 8000
MAX_PORT_TRIES = 10  # Try up to 10 ports if default is busy

# Always run from the directory containing this script
os.chdir(os.path.dirname(os.path.abspath(__file__)))


# ─── Custom HTTP Handler ──────────────────────────────────────────────────────
class MDStudioHandler(http.server.SimpleHTTPRequestHandler):
    """Serves static files with correct MIME types and PWA headers."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=".", **kwargs)

    def end_headers(self):
        # Required for Service Worker to work correctly
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def guess_type(self, path):
        """Ensure correct MIME types for all file types."""
        # In Python 3.13+, guess_type returns a single string, not a tuple
        result = super().guess_type(path)
        mime = result[0] if isinstance(result, tuple) else result

        ext_map = {
            ".md":          "text/markdown",
            ".js":          "application/javascript",
            ".css":         "text/css",
            ".json":        "application/json",
            ".webmanifest": "application/manifest+json",
            ".svg":         "image/svg+xml",
            ".woff2":       "font/woff2",
            ".woff":        "font/woff",
        }
        ext = os.path.splitext(str(path))[1].lower()
        resolved = ext_map.get(ext, mime or "application/octet-stream")
        # Return in the format the parent class expects
        return resolved if not isinstance(result, tuple) else (resolved, None)

    def log_message(self, format, *args):
        """Suppress per-request logs -- only show errors (4xx/5xx)."""
        status_code = args[1] if len(args) > 1 else "000"
        try:
            code = int(status_code)
            if code >= 400:
                print(f"  [ERROR {code}] {args[0]}")
        except (ValueError, IndexError):
            pass


# --- Port Binding -------------------------------------------------------------
def bind_local_port(start_port: int, max_tries: int = MAX_PORT_TRIES):
    """Bind one socket to the first free port.

    Returns the already-bound (and later listened-on) socket. The socket is
    handed directly to the server, so there is no check-then-use window where
    another process could steal the port (BUG-020 TOCTOU).
    """
    for port in range(start_port, start_port + max_tries):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("", port))
            return s, port
        except OSError:
            s.close()
            continue
    raise OSError(
        f"Could not find a free port in range {start_port}-{start_port + max_tries - 1}.\n"
        "Please close other applications using these ports and try again."
    )


# ─── Reusable TCP Server ───────────────────────────────────────────────────────
class ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """Threaded TCPServer: SO_REUSEADDR + each request handled on its own thread.

    Without ThreadingMixIn, ONE stalled/aborted connection (browser cancel,
    slow asset) freezes the single-threaded accept loop and every subsequent
    request — including file uploads — hangs indefinitely.
    """
    allow_reuse_address = True
    daemon_threads = True


# ─── Server Start ─────────────────────────────────────────────────────────────
def start_server(listening_socket: socket.socket):
    """Serve forever on a pre-bound socket (no TOCTOU race)."""
    actual_port = listening_socket.getsockname()[1]

    # Create the server WITHOUT binding (bind_and_activate=False), then swap in
    # our already-bound socket. This is the TOCTOU-free handoff.
    httpd = ReusableTCPServer(("", actual_port), MDStudioHandler, bind_and_activate=False)
    httpd.socket.close()                 # discard the placeholder socket
    httpd.socket = listening_socket      # reuse the bound socket
    listening_socket.listen(httpd.request_queue_size)
    host, port = listening_socket.getsockname()[:2]
    httpd.server_name = socket.getfqdn(host)
    httpd.server_port = port

    url = f"http://localhost:{actual_port}"
    print(f"\n  MD Studio is running!")
    print(f"  Open in browser --> {url}")
    print(f"  Serving from:    {os.getcwd()}")
    print(f"\n  Press Ctrl+C to stop the server.\n")

    # Open browser after a short delay (server needs to be ready)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped. Goodbye!\n")
        httpd.shutdown()
    finally:
        httpd.server_close()


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        sock, port = bind_local_port(DEFAULT_PORT)
        if port != DEFAULT_PORT:
            print(f"  Port {DEFAULT_PORT} is busy, using port {port} instead.")
        start_server(sock)
    except OSError as e:
        print(e)
        sys.exit(1)
    except Exception as e:
        print(f"  Unexpected error: {e}")
        sys.exit(1)