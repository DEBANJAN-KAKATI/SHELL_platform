import json, os, socket, sys, urllib.request, webbrowser
from pathlib import Path
from app import create_app


def port_free(host, port):
    with socket.socket() as s:
        try:
            s.bind((host, port))
            return True
        except OSError:  # in use, or reserved by Windows ("forbidden by its access permissions")
            return False


def running_dashboard(url):
    """The /api/health answer of a dashboard on this address, or None."""
    # No proxy: a corporate proxy would answer 403 for 127.0.0.1.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(url + "/api/health", timeout=2) as response:
            health = json.load(response)
            return health if health.get("status") == "ok" else None
    except Exception:
        return None


def same_folder(health, base):
    """True only when the running dashboard is this folder (older versions do not report their folder)."""
    root = health.get("root")
    try:
        return bool(root) and Path(root).resolve() == base.resolve()
    except OSError:
        return False


if __name__ == '__main__':
    b = Path(__file__).resolve().parent
    s = json.loads((b / 'config/settings.json').read_text(encoding="utf-8"))
    host = os.environ.get("DASHBOARD_HOST", s['host'])
    port = int(os.environ.get("DASHBOARD_PORT", s['port']))
    open_browser = s.get('open_browser') and os.environ.get("DASHBOARD_OPEN_BROWSER", "1") != "0"
    version = (b / 'VERSION').read_text(encoding="utf-8").strip() if (b / 'VERSION').exists() else ""
    if not port_free(host, port):
        url = f"http://{host}:{port}"
        health = running_dashboard(url)
        if health and same_folder(health, b):
            print(f"The dashboard is already running at {url}")
            if open_browser: webbrowser.open(url)
            sys.exit(0)
        if health:
            # Another copy (e.g. the previous version in its old folder) still runs on this port: do not open it.
            print(f"Another dashboard (version {health.get('version', '?')}"
                  f"{', folder ' + health['root'] if health.get('root') else ''}) is running at {url}.")
            print("Close its window to use the usual address again. This copy starts on the next free port.")
        free = next((p for p in range(port + 1, port + 50) if port_free(host, p)), None)
        if free is None:
            sys.exit(f"ERROR: Port {port} and the next 49 ports are in use or blocked on this computer.")
        print(f"Port {port} is in use or blocked on this computer; using port {free} instead.")
        port = free
    url = f"http://{host}:{port}"
    print(f"Dashboard {version} address: {url}")
    if open_browser: webbrowser.open(url)
    create_app().run(host=host, port=port, debug=False)
