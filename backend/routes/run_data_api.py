from flask import Blueprint, current_app, jsonify, request, session

from backend.services import run_data


run_data_api = Blueprint("run_data_api", __name__, url_prefix="/api/run-data")


def _directory():
    return current_app.config.get("RUN_DATA_DIR") or run_data.DEFAULT_RUN_DATA_DIR


@run_data_api.get("/runs")
def list_saved_runs():
    return jsonify({"runs": run_data.list_runs(_directory())})


@run_data_api.get("/runs/<run_id>")
def load_saved_run(run_id):
    try:
        return jsonify(run_data.load_run(run_id, _directory()))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404


@run_data_api.post("/runs")
def save_current_run():
    try:
        result = run_data.save_run(
            request.get_json(silent=True), _directory(), editor=session.get("username")
        )
        return jsonify(result), 201
    except run_data.RunAlreadyExists as exc:
        return jsonify(
            {
                "error": str(exc),
                "run_number": exc.run_number,
                "existing_runs": exc.existing_runs,
            }
        ), 409
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 404
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except OSError as exc:
        return jsonify({"error": f"Could not save RunData: {exc}"}), 500
