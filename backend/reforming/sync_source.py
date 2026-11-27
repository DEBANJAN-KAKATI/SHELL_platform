"""Locate the OneDrive-synced SharePoint folder that receives reforming data.

The researcher's SharePoint folder "Online DHA Results" is synced by OneDrive to
this machine (for example C:\\Users\\<user>\\Shell\\<owner> - Online DHA Results).
The DHA .XLS files land in a sub-folder and the operating data is a .txt file.
The platform reads the synced copy from disk; it never calls SharePoint itself.
"""

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
CONFIG_FILE = BASE / "config" / "reforming_sync.json"
FOLDER_SUFFIX = "Online DHA Results"


def _read_config():
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_folder(folder):
    folder = str(folder or "").strip().strip('"')
    if folder and not Path(folder).is_dir():
        raise ValueError(f"Folder not found: {folder}")
    config = _read_config()
    config["sync_folder"] = folder
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return folder


def _detect_folder():
    """Look one and two levels under the user profile for '* Online DHA Results'."""
    home = Path(os.environ.get("USERPROFILE") or Path.home())
    roots = [home] + [p for p in home.iterdir() if p.is_dir() and (p.name.startswith("Shell") or p.name.startswith("OneDrive"))] if home.is_dir() else []
    for root in roots:
        try:
            for child in root.iterdir():
                if child.is_dir() and child.name.endswith(FOLDER_SUFFIX):
                    return child
        except OSError:
            continue
    return None


def _xls_files(folder):
    # .xls / .XLS (Windows matches either; Linux / Docker only the exact case)
    return [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".xls" and not p.name.startswith("~$")]


def _dha_folder(folder):
    """The folder itself if it holds .XLS files, else the sub-folder with the most."""
    best, count = folder, len(_xls_files(folder))
    if count:
        return best
    for child in sorted(p for p in folder.iterdir() if p.is_dir()):
        n = len(_xls_files(child))
        if n > count:
            best, count = child, n
    return best


def _txt_files(folder):
    return [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".txt"]


def _operating_source(folder):
    """6.12.0: the folder holding the operating exports (.txt): the synced folder itself, else its sub-folder with the
    most .txt files. The Online Analysis page merges every export in it (backend/reforming/operating_merge.py), so a
    new export from the server is picked up without copy-pasting it into one file."""
    if _txt_files(folder):
        return folder
    best, count = None, 0
    for child in sorted(p for p in folder.iterdir() if p.is_dir()):
        n = len(_txt_files(child))
        if n > count:
            best, count = child, n
    return best


def _run_plan_file(folder):
    """Newest RunPlan*.xlsx in the folder (6.10.0: the Run Plan page can load it from the synced folder)."""
    files = [p for p in folder.iterdir() if p.is_file() and not p.name.startswith("~$")
             and p.suffix.lower() in (".xlsx", ".xlsm") and re.search(r"run[\s_-]*plan", p.stem, re.IGNORECASE)]
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def _stamp(path):
    return datetime.fromtimestamp(path.stat().st_mtime).strftime("%d/%m/%Y %H:%M")


def _signature(files):
    digest = hashlib.sha1()
    for path in files:
        st = path.stat()
        digest.update(f"{path.name}|{st.st_size}|{int(st.st_mtime)};".encode("utf-8"))
    return digest.hexdigest()[:16]


def sync_status():
    configured = _read_config().get("sync_folder", "")
    folder = Path(configured) if configured else _detect_folder()
    status = {"configured_folder": configured, "found": False, "folder": str(folder or "")}
    if folder is None or not folder.is_dir():
        status["message"] = (
            f"Synced folder not found: {configured}" if configured
            else "No OneDrive-synced 'Online DHA Results' folder found. Sync it from SharePoint "
                 "(Add shortcut / Sync) or set the folder path."
        )
        return status

    dha_folder = _dha_folder(folder)
    dha_files = sorted(_xls_files(dha_folder), key=lambda p: p.name)
    latest = dha_files[-1] if dha_files else None  # file names start with UID + injection time
    operating = _operating_source(folder)
    texts = sorted(_txt_files(operating), key=lambda p: p.name) if operating else []
    newest = max(texts, key=lambda p: p.stat().st_mtime) if texts else None
    status.update({
        "found": True,
        "dha_folder": str(dha_folder),
        "dha_count": len(dha_files),
        "dha_latest_file": latest.name if latest else "",
        "dha_latest_modified": _stamp(latest) if latest else "",
        "dha_signature": _signature(dha_files),
        "operating_file": str(operating) if texts else "",          # a folder: all its exports are merged
        "operating_count": len(texts),
        "operating_modified": _stamp(newest) if newest else "",
        "operating_signature": _signature(texts) if texts else "",
    })
    run_plan = _run_plan_file(folder)
    status.update({
        "run_plan_file": str(run_plan) if run_plan else "",
        "run_plan_modified": _stamp(run_plan) if run_plan else "",
        "run_plan_signature": _signature([run_plan]) if run_plan else "",
    })
    return status
