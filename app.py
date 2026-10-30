import json
import os
import secrets
from pathlib import Path
from flask import Flask, redirect, request, send_from_directory, session, url_for
from backend.routes.api import api
from backend.routes.historian_api import historian_api
from backend.routes.run_data_api import run_data_api
from backend.reforming.routes import reforming_api

BASE = Path(__file__).resolve().parent

# Login is enforced only when both env vars are set (e.g. before sharing via a tunnel)
AUTH_USER = os.environ.get("DASHBOARD_USER")
AUTH_PASS = os.environ.get("DASHBOARD_PASS")


def create_app(test_config=None):
    s = json.loads((BASE / "config/settings.json").read_text(encoding="utf-8"))
    app = Flask(__name__, static_folder=None)
    app.config.update(
        APP_VERSION=(BASE / "VERSION").read_text(encoding="utf-8").strip(),
        DEFAULT_SOURCE_DIRECTORY=os.environ.get(
            "DASHBOARD_SOURCE_DIRECTORY", s.get("default_source_directory", "")
        ),
        DEFAULT_REACTOR_SOURCE_DIRECTORY=os.environ.get(
            "DASHBOARD_REACTOR_SOURCE_DIRECTORY",
            s.get("default_reactor_source_directory", ""),
        ),
        DEFAULT_RUN_PLAN_FILE=os.environ.get(
            "DASHBOARD_RUN_PLAN_FILE", s.get("default_run_plan_file", "")
        ),
        RUN_NUMBER="",
        SECRET_KEY=os.environ.get("DASHBOARD_SECRET_KEY", secrets.token_hex(32)),
    )
    if test_config:
        app.config.update(test_config)
    app.register_blueprint(api)
    app.register_blueprint(historian_api)
    app.register_blueprint(run_data_api)
    app.register_blueprint(reforming_api)

    integrity_file = BASE / "features" / "data_integrity" / "feature.py"
    integrity_enabled = app.config.get(
        "DATA_INTEGRITY_ENABLED", os.environ.get("DASHBOARD_DATA_INTEGRITY", "1") != "0"
    )
    if integrity_enabled and integrity_file.is_file():
        from features.data_integrity.feature import data_integrity

        app.register_blueprint(data_integrity)

    @app.before_request
    def require_login():
        if not AUTH_USER or not AUTH_PASS:
            return None
        if request.path in ("/login", "/logout"):
            return None
        if session.get("authenticated"):
            return None
        if request.path.startswith("/api/"):
            return {"error": "Authentication required"}, 401
        return redirect(url_for("login", next=request.path))

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if not AUTH_USER or not AUTH_PASS:
            return redirect(url_for("run_home"))
        if request.method == "POST":
            u = request.form.get("username", "")
            p = request.form.get("password", "")
            if secrets.compare_digest(u, AUTH_USER) and secrets.compare_digest(
                p, AUTH_PASS
            ):
                session["authenticated"] = True
                session["username"] = u
                next_url = request.form.get("next") or url_for("run_home")
                return redirect(next_url)
            return redirect(
                url_for("login", error="1", next=request.form.get("next", ""))
            )
        return send_from_directory(BASE / "frontend", "login.html")

    @app.get("/logout")
    def logout():
        session.pop("authenticated", None)
        session.pop("username", None)
        return redirect(url_for("login"))

    @app.get("/")
    def run_home():
        return send_from_directory(BASE / "frontend", "run_data_home.html")

    @app.get("/run-plan")
    @app.get("/run_plan")
    def run_plan():
        return send_from_directory(BASE / "frontend", "run_plan.html")

    @app.get("/offline-analysis")
    @app.get("/offline_analysis")
    @app.get("/offline")
    def offline_analysis():
        return send_from_directory(BASE / "frontend", "index.html")

    @app.get("/online-analysis")
    @app.get("/online_analysis")
    def online_analysis():
        return send_from_directory(BASE / "frontend", "online_analysis.html")

    @app.get("/calculation-table")
    @app.get("/calculation_table")
    @app.get("/calculation")
    def calculation_table():
        return send_from_directory(BASE / "frontend", "calculation_table.html")

    @app.get("/custom-table")
    @app.get("/custom_table")
    @app.get("/custom")
    def custom_table():
        return send_from_directory(BASE / "frontend", "custom_table.html")

    @app.get("/plots")
    @app.get("/plots.html")
    def plots_view():
        return send_from_directory(BASE / "frontend", "plots.html")

    @app.get("/history")
    def history_view():
        return send_from_directory(BASE / "frontend", "history.html")

    @app.get("/frontend/<path:path>")
    def frontend(path):
        return send_from_directory(BASE / "frontend", path)

    return app


app = create_app()
