import json,webbrowser
from pathlib import Path
from app import create_app
if __name__=='__main__':
 b=Path(__file__).resolve().parent;s=json.loads((b/'config/settings.json').read_text());url=f"http://{s['host']}:{s['port']}"
 if s.get('open_browser'):webbrowser.open(url)
 create_app().run(host=s['host'],port=s['port'],debug=False)
