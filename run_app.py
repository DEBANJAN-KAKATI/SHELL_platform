import json, socket, sys, urllib.request, webbrowser
from pathlib import Path
from app import create_app


def port_free(host, port):
    with socket.socket() as s:
        try:
            s.bind((host, port))
            return True
        except OSError:  # in use, or reserved by Windows ("forbidden by its access permissions")
            return False


def dashboard_running(url):
    # No proxy: a corporate proxy would answer 403 for 127.0.0.1.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(url + "/api/health", timeout=2) as response:
            return json.load(response).get("status") == "ok"
    except Exception:
        return False


if __name__ == '__main__':
    b = Path(__file__).resolve().parent; s = json.loads((b / 'config/settings.json').read_text())
    host, port = s['host'], int(s['port'])
    if not port_free(host, port):
        url = f"http://{host}:{port}"
        if dashboard_running(url):
            print(f"The dashboard is already running at {url}")
            if s.get('open_browser'): webbrowser.open(url)
            sys.exit(0)
        free = next((p for p in range(port + 1, port + 50) if port_free(host, p)), None)
        if free is None:
            sys.exit(f"ERROR: Port {port} and the next 49 ports are in use or blocked on this computer.")
        print(f"Port {port} is in use or blocked on this computer; using port {free} instead.")
        port = free
    url = f"http://{host}:{port}"
    print(f"Dashboard address: {url}")
    if s.get('open_browser'): webbrowser.open(url)
    create_app().run(host=host, port=port, debug=False)
