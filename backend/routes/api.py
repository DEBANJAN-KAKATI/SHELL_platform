import json
import os
import re
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request
from backend.services.dashboard_service import process_directory
from backend.services.reactor_map_service import process_reactor_map_directory
from backend.services.online_analysis_service import process_online_file

api = Blueprint("api", __name__, url_prefix="/api")


@api.get("/health")
def health():
    return jsonify({"status": "ok", "version": current_app.config["APP_VERSION"]})


@api.get("/settings")
def settings():
    return jsonify(
        {
            "default_source_directory": current_app.config.get(
                "DEFAULT_SOURCE_DIRECTORY", ""
            ),
            "default_reactor_source_directory": current_app.config.get(
                "DEFAULT_REACTOR_SOURCE_DIRECTORY", ""
            ),
            "default_run_plan_file": current_app.config.get(
                "DEFAULT_RUN_PLAN_FILE", ""
            ),
            "run_number": current_app.config.get("RUN_NUMBER", ""),
        }
    )


@api.get("/run-number")
def get_run_number():
    return jsonify({"run_number": current_app.config.get("RUN_NUMBER", "")})


@api.post("/run-number")
def set_run_number():
    data = request.get_json(silent=True) or {}
    if "run_number" not in data:
        return jsonify({"error": "run_number field is required."}), 400

    raw_val = data["run_number"]
    if raw_val is None or raw_val == "":
        cleaned_val = ""
    else:
        val_str = str(raw_val).strip()
        if not val_str.isdigit():
            return jsonify({"error": "Run Number must be a numeric whole number."}), 400
        cleaned_val = str(int(val_str))

    current_app.config["RUN_NUMBER"] = cleaned_val

    # Keep settings.json on disk with run_number blank ("") so that
    # the application always starts with a blank Run Number on every fresh launch.
    base_dir = Path(__file__).resolve().parents[2]
    settings_file = base_dir / "config" / "settings.json"
    if settings_file.exists():
        try:
            s = json.loads(settings_file.read_text(encoding="utf-8"))
            s["run_number"] = ""
            settings_file.write_text(json.dumps(s, indent=2), encoding="utf-8")
        except Exception as e:
            current_app.logger.error(f"Failed to persist settings: {e}")

    return jsonify({"status": "ok", "run_number": cleaned_val})


from backend.services.dialog_service import browse_directory_dialog, browse_file_dialog


@api.post("/browse-folder")
def browse_folder():
    initial = (request.get_json(silent=True) or {}).get(
        "initial_directory"
    ) or current_app.config.get("DEFAULT_SOURCE_DIRECTORY", "")
    try:
        selected, cancelled = browse_directory_dialog(
            initial_dir=initial, title="Select DHA XLS folder"
        )
        return jsonify({"path": selected, "cancelled": cancelled})
    except Exception as e:
        return jsonify(
            {
                "error": "Native folder browser is unavailable. Enter the folder path manually.",
                "details": str(e),
            }
        ), 503


@api.post("/process")
def process():
    folder = (request.get_json(silent=True) or {}).get("path")
    if not folder:
        return jsonify({"error": "Folder path is required."}), 400
    try:
        return jsonify(process_directory(folder))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.post("/browse-reactor-folder")
def browse_reactor_folder():
    initial = (request.get_json(silent=True) or {}).get(
        "initial_directory"
    ) or current_app.config.get("DEFAULT_REACTOR_SOURCE_DIRECTORY", "")
    try:
        selected, cancelled = browse_directory_dialog(
            initial_dir=initial, title="Select Reactor Map CSV folder"
        )
        return jsonify({"path": selected, "cancelled": cancelled})
    except Exception as e:
        return jsonify(
            {
                "error": "Native folder browser is unavailable. Enter the folder path manually.",
                "details": str(e),
            }
        ), 503


@api.post("/process-reactor-map")
def process_reactor_map():
    folder = (request.get_json(silent=True) or {}).get("path")
    if not folder:
        return jsonify({"error": "Reactor Map source folder path is required."}), 400
    try:
        return jsonify(process_reactor_map_directory(folder))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.post("/browse-online-file")
def browse_online_file():
    initial = (request.get_json(silent=True) or {}).get("initial_file") or ""
    try:
        selected, cancelled = browse_file_dialog(
            initial_file=initial,
            title="Select Online Analysis text file",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        )
        return jsonify({"path": selected, "cancelled": cancelled})
    except Exception as e:
        return jsonify(
            {
                "error": "Native file browser is unavailable. Enter the file path manually.",
                "details": str(e),
            }
        ), 503


@api.post("/process-online")
def process_online():
    file_path = (request.get_json(silent=True) or {}).get("path")
    if not file_path:
        return jsonify({"error": "Online Analysis file path is required."}), 400
    try:
        current_app.config["ACTIVE_ONLINE_FILE"] = file_path
        return jsonify(process_online_file(file_path))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.post("/apply-online-reactor-map")
def apply_online_reactor_map():
    body = request.get_json(silent=True) or {}
    rows = body.get("rows")
    reactor_rows = body.get("reactor_rows")
    if not rows or not isinstance(rows, list):
        return jsonify({"error": "Online rows list is required."}), 400
    if not reactor_rows or not isinstance(reactor_rows, list):
        return jsonify({"error": "Reactor Map rows list is required."}), 400
    try:
        from backend.services.online_analysis_service import (
            apply_reactor_map_to_online_rows,
        )

        mapped = apply_reactor_map_to_online_rows(rows, reactor_rows)
        return jsonify({"rows": mapped, "record_count": len(mapped)})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.post("/browse-run-plan-file")
def browse_run_plan_file():
    initial = (request.get_json(silent=True) or {}).get(
        "initial_file"
    ) or current_app.config.get("DEFAULT_RUN_PLAN_FILE", "")
    try:
        selected, cancelled = browse_file_dialog(
            initial_file=initial,
            title="Select Run Plan Excel file",
            filetypes=[("Excel files", "*.xlsx;*.xls"), ("All files", "*.*")],
        )
        return jsonify({"path": selected, "cancelled": cancelled})
    except Exception as e:
        return jsonify(
            {
                "error": "Native file browser is unavailable. Enter the file path manually.",
                "details": str(e),
            }
        ), 503


@api.post("/process-run-plan")
def process_run_plan():
    file_path = (request.get_json(silent=True) or {}).get("path")
    if not file_path:
        return jsonify({"error": "Run Plan file path is required."}), 400
    try:
        from backend.services.run_plan_service import process_run_plan_file

        current_app.config["ACTIVE_RUN_PLAN_FILE"] = file_path
        return jsonify(process_run_plan_file(file_path))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.get("/feed-properties")
def feed_properties():
    run_plan_file = current_app.config.get(
        "ACTIVE_RUN_PLAN_FILE"
    ) or current_app.config.get("DEFAULT_RUN_PLAN_FILE")
    if not run_plan_file:
        from RunPlan import DEFAULT_RUN_PLAN_PATH

        run_plan_file = DEFAULT_RUN_PLAN_PATH

    path = Path(run_plan_file) if run_plan_file else None
    if not path or not path.exists():
        fallback = Path(r"C:\Users\sanka\Desktop\Python_Playground\RunPlan.xlsx")
        if fallback.exists():
            path = fallback

    if not path or not path.exists():
        return jsonify(
            {"properties": [], "rows": [], "error": "Run Plan file not found."}
        ), 404

    try:
        from backend.services.run_plan_service import process_run_plan_file

        res = process_run_plan_file(str(path))
        feed_rows = res.get("feed", {}).get("rows", [])
        return jsonify(
            {
                "source_file": str(path),
                "rows": feed_rows[:3],
                "all_rows": feed_rows,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e), "rows": []}), 400


@api.post("/process-calculation-base")
def process_calculation_base():
    body = request.get_json(silent=True) or {}
    file_path = body.get("path")
    rows = body.get("rows")
    columns = body.get("columns")
    carbon = body.get("carbon")
    molecular_weight = body.get("molecular_weight")

    try:
        from backend.services.calculation_table_service import (
            process_base_table_file,
            extract_base_table_data,
        )

        if not file_path and rows is None:
            active_file = current_app.config.get("ACTIVE_ONLINE_FILE")
            if active_file and os.path.exists(active_file):
                file_path = active_file

        if file_path:
            return jsonify(
                process_base_table_file(
                    file_path, carbon=carbon, molecular_weight=molecular_weight
                )
            )
        elif rows is not None:
            return jsonify(
                extract_base_table_data(
                    {
                        "rows": rows,
                        "columns": columns or [],
                        "source_file": body.get("source_file", ""),
                    },
                    carbon=carbon,
                    molecular_weight=molecular_weight,
                )
            )
        else:
            return jsonify(
                {
                    "error": "No Online Analysis data is currently loaded. Please load or import a SystemTxt file on the Online Analysis page first.",
                    "rows": [],
                    "columns": [],
                    "record_count": 0,
                }
            ), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@api.post("/calculate-yield-table")
def calculate_yield_table_api():
    body = request.get_json(silent=True) or {}
    try:
        from backend.calculations.yield_table import calculate_yield_table

        result = calculate_yield_table(
            body.get("carbon_rows", []),
            body.get("base_rows", []),
            carbon_columns=body.get("carbon_columns"),
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e), "columns": [], "rows": []}), 400


@api.post("/custom-table/validate-formula")
def custom_table_validate():
    body = request.get_json(silent=True) or {}
    formula = body.get("formula", "")
    available_columns = body.get("available_columns")
    try:
        from backend.services.custom_table_service import validate_formula_syntax

        res = validate_formula_syntax(formula, available_columns=available_columns)
        return jsonify(res)
    except Exception as e:
        return jsonify({"valid": False, "message": str(e), "dependencies": []}), 400


@api.post("/custom-table/calculate")
def custom_table_calculate():
    body = request.get_json(silent=True) or {}
    rows = body.get("rows", [])
    columns = body.get("columns", [])
    custom_columns = body.get("custom_columns", [])
    cross_context = body.get("cross_context")
    try:
        from backend.services.custom_table_service import compute_custom_table

        res = compute_custom_table(
            rows, columns, custom_columns, cross_context=cross_context
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e), "rows": rows, "columns": columns}), 400


@api.post("/export-xlsx")
def export_xlsx():
    """Multi-sheet Excel export (Yield Table + Online Analysis tab)."""
    from flask import send_file
    from backend.services.excel_export_service import build_workbook

    body = request.get_json(silent=True) or {}
    name = re.sub(r"[^\w.\- ]", "_", str(body.get("file_name") or "export.xlsx"))
    if not name.lower().endswith(".xlsx"):
        name += ".xlsx"
    try:
        buffer = build_workbook(body.get("sheets"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return send_file(
        buffer,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=name,
    )


@api.post("/custom-table/inspect-cell")
def custom_table_inspect():
    body = request.get_json(silent=True) or {}
    row = body.get("row", {})
    formula = body.get("formula", "")
    try:
        from backend.services.custom_table_service import SafeEvaluator

        evaluator = SafeEvaluator(formula)
        return jsonify(evaluator.inspect_row(row))
    except Exception as e:
        return jsonify({"error": str(e)}), 400

