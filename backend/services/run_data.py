import gzip
import getpass
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path


DEFAULT_RUN_DATA_DIR = Path(__file__).resolve().parents[2] / "RunData"
RUN_ID = re.compile(r"^[a-f0-9]{32}$")
MAX_STATE_BYTES = 25 * 1024 * 1024


class RunAlreadyExists(ValueError):
    def __init__(self, run_number, existing_runs):
        super().__init__(
            f"Run {run_number} already has saved RunData. Choose replace or save a new version."
        )
        self.run_number = run_number
        self.existing_runs = existing_runs


def _path(run_id, directory):
    if not RUN_ID.fullmatch(run_id):
        raise ValueError("Invalid saved run ID")
    return Path(directory) / f"run_{run_id}.json.gz"


def save_run(payload, directory=DEFAULT_RUN_DATA_DIR, editor=None):
    if not isinstance(payload, dict) or not isinstance(payload.get("raw_state"), dict):
        raise ValueError("A run state is required")
    state = payload["raw_state"]
    if not state or any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in state.items()
    ):
        raise ValueError("Run state must contain saved browser data")
    number = str(payload.get("run_number") or "").strip()
    if number and not number.isdigit():
        raise ValueError("Run number must contain digits only")
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    save_mode = payload.get("save_mode")
    if save_mode not in (None, "replace", "new_version"):
        raise ValueError("Invalid RunData save mode")
    existing_runs = [
        run for run in list_runs(directory) if number and run["run_number"] == number
    ]
    if existing_runs and save_mode is None:
        raise RunAlreadyExists(number, existing_runs)
    if save_mode == "replace":
        run_id = payload.get("replace_id")
        if not isinstance(run_id, str):
            raise ValueError("Select a saved run to replace")
        previous = load_run(run_id, directory)
        if previous.get("run_number", "") != number:
            raise ValueError("Replacement must have the same run number")
    else:
        run_id = uuid.uuid4().hex
    edited_at = datetime.now().astimezone().isoformat(timespec="microseconds")
    snapshot = {
        "id": run_id,
        "run_number": number,
        "saved_at": edited_at,
        "last_edited_by": editor or getpass.getuser(),
        "last_edited_at": edited_at,
        "editor_source": "signed in" if editor else "system account",
        "metadata": metadata,
        "raw_state": state,
    }
    encoded = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    if len(encoded) > MAX_STATE_BYTES:
        raise ValueError("Run state exceeds the 25 MB limit")
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    destination = _path(run_id, folder)
    temporary = folder / f"run_{run_id}_{uuid.uuid4().hex}.tmp"
    try:
        with temporary.open("wb") as output:
            with gzip.GzipFile(
                fileobj=output, mode="wb", compresslevel=9, mtime=0
            ) as compressed:
                compressed.write(encoded)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {**_summary(snapshot), "size_bytes": destination.stat().st_size}


def _summary(snapshot):
    metadata = snapshot.get("metadata") or {}
    state = snapshot.get("raw_state") or {}
    return {
        "id": snapshot["id"],
        "run_number": snapshot.get("run_number", ""),
        "saved_at": snapshot["saved_at"],
        "last_edited_by": snapshot.get("last_edited_by", "Unknown"),
        "last_edited_at": snapshot.get("last_edited_at", snapshot["saved_at"]),
        "editor_source": snapshot.get("editor_source", ""),
        "saved_from_page": metadata.get("saved_from_page", ""),
        "source_files": metadata.get("source_files") or {},
        "state_keys": list(state),
    }


def load_run(run_id, directory=DEFAULT_RUN_DATA_DIR):
    path = _path(run_id, directory)
    if not path.is_file():
        raise FileNotFoundError("Saved run not found")
    with gzip.open(path, "rt", encoding="utf-8") as source:
        return json.load(source)


def list_runs(directory=DEFAULT_RUN_DATA_DIR):
    folder = Path(directory)
    runs = []
    for path in folder.glob("run_*.json.gz"):
        run_id = path.name.removeprefix("run_").removesuffix(".json.gz")
        try:
            snapshot = load_run(run_id, folder)
            runs.append({**_summary(snapshot), "size_bytes": path.stat().st_size})
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            continue
    return sorted(runs, key=lambda run: run["saved_at"], reverse=True)
