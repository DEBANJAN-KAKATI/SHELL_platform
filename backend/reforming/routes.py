"""Reforming API (/api/reforming/*). Isomerization routes stay in backend/routes/api.py."""

from pathlib import Path

from flask import Blueprint, jsonify, request

from backend.reforming.operating import read_operating_file
from backend.reforming.run_plan import process_reforming_run_plan
from backend.reforming.service import process_reforming_directory
from backend.reforming.sync_source import save_folder, sync_status

BASE = Path(__file__).resolve().parents[2]
DEFAULT_RUN_PLAN = BASE / "data" / "RunPlan_Reforming.xlsx"

reforming_api = Blueprint("reforming_api", __name__, url_prefix="/api/reforming")


@reforming_api.post("/process")
def process():
    folder = (request.get_json(silent=True) or {}).get("path")
    if not folder:
        return jsonify({"error": "Folder path is required."}), 400
    try:
        return jsonify(process_reforming_directory(folder))
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@reforming_api.get("/settings")
def settings():
    return jsonify({"default_run_plan_file": str(DEFAULT_RUN_PLAN) if DEFAULT_RUN_PLAN.exists() else ""})


@reforming_api.get("/sync-source")
def sync_source():
    try:
        return jsonify(sync_status())
    except Exception as error:
        return jsonify({"found": False, "message": str(error)})


@reforming_api.post("/sync-source")
def set_sync_source():
    folder = (request.get_json(silent=True) or {}).get("folder", "")
    try:
        save_folder(folder)
        return jsonify(sync_status())
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@reforming_api.post("/process-run-plan")
def process_run_plan():
    file_path = (request.get_json(silent=True) or {}).get("path")
    if not file_path:
        return jsonify({"error": "Run Plan file path is required."}), 400
    try:
        return jsonify(process_reforming_run_plan(file_path))
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@reforming_api.post("/operating-data")
def operating_data():
    file_path = (request.get_json(silent=True) or {}).get("path")
    if not file_path:
        return jsonify({"error": "Load the operating data (.txt) on the Online Analysis page first."}), 400
    try:
        return jsonify(read_operating_file(file_path))
    except Exception as error:
        return jsonify({"error": str(error)}), 400
