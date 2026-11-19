"""OneDrive / SharePoint synced folder for Isomerization and General_MB (6.10.0).

Same idea as the Reforming sync (backend/reforming/sync_source.py): a SharePoint folder is synced to this PC by
OneDrive and the dashboard reads the synced copy from disk (it never calls SharePoint itself). One folder per process,
saved in config/sync_sources.json. In the folder the dashboard finds:

- DHA reports (.XLS) for Offline Analysis: the folder itself, else the sub-folder holding the most .XLS files;
- the online GC / process export (.txt) for Online Analysis: "Operating Data.txt", else the newest .txt that is not a
  ZMB (blank-run) export;
- General_MB: the ZMB export: the newest .txt whose name contains "ZMB" or "blank";
- the Run Plan: the newest .xlsx whose name contains "RunPlan" / "Run Plan" / "Run_Plan".

Each item comes with a signature of its files (name, size, modification time) so the page can tell when new data arrived.
"""

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
CONFIG_FILE = BASE / "config" / "sync_sources.json"
PROCESSES = ("isomerization", "general_mb")
OPERATING_FILE = "Operating Data.txt"
_ZMB = re.compile(r"zmb|blank", re.IGNORECASE)
_RUN_PLAN = re.compile(r"run[\s_-]*plan", re.IGNORECASE)


def _process(process):
    process = str(process or "").strip().lower()
    if process not in PROCESSES:
        raise ValueError(f"Unknown process for the synced folder: {process or '(none)'}")
    return process


def _read_config():
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_folder(process, folder):
    process = _process(process)
    folder = str(folder or "").strip().strip('"')
    if folder and not Path(folder).is_dir():
        raise ValueError(f"Folder not found: {folder}")
    config = _read_config()
    config[process] = folder
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return folder


def _visible(paths):
    return [p for p in paths if p.is_file() and not p.name.startswith("~$")]


def _xls_files(folder):
    return _visible(p for p in folder.iterdir() if p.suffix.lower() == ".xls")


def _dha_folder(folder):
    """The folder itself if it holds .XLS files, else the sub-folder with the most."""
    best, count = folder, len(_xls_files(folder))
    if count:
        return best
    for child in sorted(p for p in folder.iterdir() if p.is_dir()):
        try:
            n = len(_xls_files(child))
        except OSError:
            continue
        if n > count:
            best, count = child, n
    return best


def _newest(files):
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def _texts(folder):
    return _visible(p for p in folder.iterdir() if p.suffix.lower() == ".txt")


def _online_file(folder):
    exact = folder / OPERATING_FILE
    if exact.is_file():
        return exact
    return _newest([p for p in _texts(folder) if not _ZMB.search(p.name)])


def _zmb_file(folder):
    return _newest([p for p in _texts(folder) if _ZMB.search(p.name)])


def run_plan_file(folder):
    """Newest RunPlan*.xlsx in the folder (also used by the Reforming sync)."""
    files = _visible(p for p in folder.iterdir() if p.suffix.lower() in (".xlsx", ".xlsm") and _RUN_PLAN.search(p.stem))
    return _newest(files)


def _stamp(path):
    return datetime.fromtimestamp(path.stat().st_mtime).strftime("%d/%m/%Y %H:%M")


def _signature(files):
    digest = hashlib.sha1()
    for path in files:
        st = path.stat()
        digest.update(f"{path.name}|{st.st_size}|{int(st.st_mtime)};".encode("utf-8"))
    return digest.hexdigest()[:16]


def _file_entry(prefix, path):
    return {
        f"{prefix}_file": str(path) if path else "",
        f"{prefix}_modified": _stamp(path) if path else "",
        f"{prefix}_signature": _signature([path]) if path else "",
    }


def sync_status(process):
    process = _process(process)
    configured = _read_config().get(process, "")
    status = {"process": process, "configured_folder": configured, "found": False, "folder": configured}
    if not configured:
        status["message"] = ("No synced folder set yet. Sync the SharePoint folder with OneDrive "
                             "(Add shortcut / Sync), then click 'Change folder' and paste its path.")
        return status
    folder = Path(configured)
    if not folder.is_dir():
        status["message"] = f"Synced folder not found: {configured}"
        return status

    dha_folder = _dha_folder(folder)
    dha_files = sorted(_xls_files(dha_folder), key=lambda p: p.name)
    latest = dha_files[-1] if dha_files else None
    status.update({
        "found": True,
        "dha_folder": str(dha_folder) if dha_files else "",
        "dha_count": len(dha_files),
        "dha_latest_file": latest.name if latest else "",
        "dha_latest_modified": _stamp(latest) if latest else "",
        "dha_signature": _signature(dha_files) if dha_files else "",
    })
    status.update(_file_entry("online", _online_file(folder)))
    status.update(_file_entry("zmb", _zmb_file(folder) if process == "general_mb" else None))
    status.update(_file_entry("run_plan", run_plan_file(folder)))
    return status
