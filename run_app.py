import json
import os
import webbrowser
from pathlib import Path

from app import create_app

if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    settings = json.loads((base / "config/settings.json").read_text(encoding="utf-8"))
    host = os.environ.get("DASHBOARD_HOST", settings["host"])
    port = int(os.environ.get("DASHBOARD_PORT", settings["port"]))
    url = f"http://{host}:{port}"
    if settings.get("open_browser") and os.environ.get("DASHBOARD_OPEN_BROWSER", "1") != "0":
        webbrowser.open(url)
    create_app().run(host=host, port=port, debug=False)
