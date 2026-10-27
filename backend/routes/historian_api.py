from flask import Blueprint, current_app, jsonify, request

from backend.services import historian as h

historian_api = Blueprint("historian_api", __name__, url_prefix="/api/historian")


def _dir():
    return current_app.config.get("HISTORIAN_DIR") or h.DEFAULT_HISTORIAN_DIR


def _resolve_dataset(spec):
    """spec = {"run": "105"} or {"current": <dashboard payload>}."""
    spec = spec if isinstance(spec, dict) else {}
    if spec.get("current") is not None:
        data = h.normalize_payload(spec["current"])
        data["run_number"] = f"Current ({data.get('run_number') or 'unsaved'})"
        return data
    return h.load_run_history(spec.get("run"), _dir())


@historian_api.get("/runs")
def runs():
    return jsonify({"runs": h.list_available_runs(_dir())})


@historian_api.get("/runs/<run_number>/exists")
def exists(run_number):
    try:
        safe = h.sanitize_run_number(run_number)
        return jsonify(
            {"run_number": safe, "exists": h.history_run_exists(safe, _dir())}
        )
    except h.InvalidRunNumberError as e:
        return jsonify({"error": str(e)}), 400


@historian_api.get("/runs/<run_number>")
def load(run_number):
    try:
        return jsonify(h.load_run_history(run_number, _dir()))
    except h.InvalidRunNumberError as e:
        return jsonify({"error": str(e)}), 400
    except h.RunNotFoundError as e:
        return jsonify({"error": str(e)}), 404


@historian_api.post("/save")
def save():
    body = request.get_json(silent=True) or {}
    payload = body.get("payload") or {}
    run_number = (
        body.get("run_number")
        or payload.get("run_number")
        or current_app.config.get("RUN_NUMBER")
    )
    try:
        result = h.save_run_history(
            run_number,
            payload,
            overwrite=bool(body.get("overwrite")),
            historian_dir=_dir(),
            app_version=current_app.config.get("APP_VERSION", ""),
        )
        return jsonify({"status": "saved", **result})
    except h.InvalidRunNumberError as e:
        return jsonify({"error": str(e)}), 400
    except h.RunExistsError as e:
        return jsonify(
            {"exists": True, "run_number": e.run_number, "message": str(e)}
        ), 409
    except OSError as e:
        return jsonify({"error": f"Could not write Historian file: {e}"}), 500


@historian_api.post("/compare")
def compare():
    body = request.get_json(silent=True) or {}
    try:
        a = _resolve_dataset(body.get("a"))
        b = _resolve_dataset(body.get("b"))
        return jsonify(
            h.compare_history_runs(
                a,
                b,
                table_key=body.get("table_key"),
                key_columns=body.get("key_columns") or None,
                max_rows=int(body.get("max_rows") or 5000),
                filters=body.get("filters")
                if isinstance(body.get("filters"), dict)
                else None,
            )
        )
    except h.InvalidRunNumberError as e:
        return jsonify({"error": str(e)}), 400
    except h.RunNotFoundError as e:
        return jsonify({"error": str(e)}), 404
