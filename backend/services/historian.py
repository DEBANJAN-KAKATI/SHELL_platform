"""Manual Historian: one SQLite file per Run Number, saved only on explicit user request.

File layout (Historian/Run_<N>.sqlite):
    metadata   (key, value_json)
    tables     (table_key, title, section, columns_json, row_count, position)
    table_rows (table_key, row_index, row_json)
    kpis       (kpi_key, section, label, value_num, value_text, position)
    raw_state  (state_key, value)   -- original dashboard state blobs for exact restore
"""

import json
import math
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
FILE_PREFIX = "Run_"
FILE_SUFFIX = ".sqlite"
DEFAULT_HISTORIAN_DIR = Path(__file__).resolve().parents[2] / "Historian"

_PLACEHOLDERS = {
    "",
    "none",
    "null",
    "unknown",
    "undefined",
    "nan",
    "na",
    "n_a",
    "n/a",
    "-",
}
_KEY_CANDIDATES = [
    "UID",
    "DateTime",
    "Component",
    "component",
    "Parameter",
    "parameter",
    "Reactor ID",
    "Reactor",
    "Sampled_reactor",
    "Active Reactor",
    "File Name",
    "TOS[h]",
    "TOS(h)",
    "Carbon",
    "Carbon No",
    "carbon_no",
]

# Only these tables take part in Run comparison: (key, title, section, legacy keys).
COMPARISON_TABLES = [
    ("run_plan.plan", "Plan", "Run Plan", ("run_plan.catalyst_loading",)),
    ("calculation.base_table", "Base Table", "Calculation table", ()),
    ("calculation.yield_table", "Yield Table", "Calculation table", ()),
]
_PLAN_LABELS = {
    "parameter": "Parameter",
    "units": "Units",
    **{f"r{i}": f"R{i}" for i in range(1, 9)},
}
_ROW_REACTOR_COLUMNS = ("Reactor", "Reactor ID", "Sampled_reactor", "Active Reactor")
_DATETIME_COLUMNS = ("DateTime", "Date/Time")
_CONDITION_COLUMNS = ("Condition", "Cond", "Cond No", "Cond_No", "condition", "Condition No", "Condition_No")
_REACTOR_COL_RE = re.compile(r"^R\d+$")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value_json TEXT);
CREATE TABLE IF NOT EXISTS tables (
    table_key TEXT PRIMARY KEY, title TEXT, section TEXT,
    columns_json TEXT, row_count INTEGER, position INTEGER);
CREATE TABLE IF NOT EXISTS table_rows (
    table_key TEXT, row_index INTEGER, row_json TEXT,
    PRIMARY KEY (table_key, row_index));
CREATE TABLE IF NOT EXISTS kpis (
    kpi_key TEXT PRIMARY KEY, section TEXT, label TEXT,
    value_num REAL, value_text TEXT, position INTEGER);
CREATE TABLE IF NOT EXISTS raw_state (state_key TEXT PRIMARY KEY, value TEXT);
"""


class HistorianError(Exception):
    pass


class InvalidRunNumberError(HistorianError):
    pass


class RunExistsError(HistorianError):
    def __init__(self, run_number):
        self.run_number = run_number
        super().__init__(
            f"A Historian file already exists for Run {run_number}. "
            "Do you want to replace the existing file?"
        )


class RunNotFoundError(HistorianError):
    pass


# --------------------------------------------------------------------------- #
# Run Number / paths
# --------------------------------------------------------------------------- #
def sanitize_run_number(value):
    """Return a filename-safe Run Number or raise InvalidRunNumberError."""
    if value is None:
        raise InvalidRunNumberError(
            "Run Number is missing. Enter a Run Number on the Run Plan page before saving."
        )
    text = str(value).strip()
    text = re.sub(r"^run[\s_\-#]*", "", text, flags=re.IGNORECASE)
    if text.lower() in _PLACEHOLDERS:
        raise InvalidRunNumberError(
            "Run Number is missing. Enter a Run Number on the Run Plan page before saving."
        )
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", text).strip("_-")
    if not safe or safe.lower() in _PLACEHOLDERS:
        raise InvalidRunNumberError(f"Run Number '{value}' is not valid.")
    if len(safe) > 64:
        raise InvalidRunNumberError("Run Number is too long (max 64 characters).")
    if safe.isdigit():
        safe = str(int(safe))
    return safe


def _dir(historian_dir):
    return Path(historian_dir) if historian_dir else DEFAULT_HISTORIAN_DIR


def history_file_path(run_number, historian_dir=None):
    return (
        _dir(historian_dir)
        / f"{FILE_PREFIX}{sanitize_run_number(run_number)}{FILE_SUFFIX}"
    )


def history_run_exists(run_number, historian_dir=None):
    return history_file_path(run_number, historian_dir).is_file()


# --------------------------------------------------------------------------- #
# Payload normalisation (tolerant of missing / malformed parts)
# --------------------------------------------------------------------------- #
def _columns_from_rows(rows):
    cols, seen = [], set()
    for row in rows:
        if isinstance(row, dict):
            for k in row:
                if k not in seen:
                    seen.add(k)
                    cols.append(k)
    return cols


def normalize_payload(payload):
    """Convert a dashboard payload into the same shape returned by load_run_history."""
    payload = payload if isinstance(payload, dict) else {}
    tables = {}
    raw_tables = payload.get("tables") or []
    if isinstance(raw_tables, dict):
        raw_tables = [
            dict(v, key=k) for k, v in raw_tables.items() if isinstance(v, dict)
        ]
    for t in raw_tables:
        if not isinstance(t, dict) or not t.get("key"):
            continue
        rows = [r for r in (t.get("rows") or []) if isinstance(r, dict)]
        cols = [
            str(c) for c in (t.get("columns") or []) if c is not None and str(c) != ""
        ]
        for extra in _columns_from_rows(rows):
            if extra not in cols:
                cols.append(extra)
        tables[str(t["key"])] = {
            "title": str(t.get("title") or t["key"]),
            "section": str(t.get("section") or ""),
            "columns": cols,
            "rows": rows,
        }

    kpis = {}
    raw_kpis = payload.get("kpis") or []
    if isinstance(raw_kpis, dict):
        raw_kpis = [
            dict(v, key=k) if isinstance(v, dict) else {"key": k, "value": v}
            for k, v in raw_kpis.items()
        ]
    for k in raw_kpis:
        if not isinstance(k, dict) or not k.get("key"):
            continue
        kpis[str(k["key"])] = {
            "section": str(k.get("section") or ""),
            "label": str(k.get("label") or k["key"]),
            "value": k.get("value"),
        }

    raw_state = payload.get("raw_state") or {}
    raw_state = (
        {
            str(k): v if isinstance(v, str) else json.dumps(v)
            for k, v in raw_state.items()
            if v is not None
        }
        if isinstance(raw_state, dict)
        else {}
    )
    metadata = (
        payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    )
    return {
        "run_number": payload.get("run_number"),
        "metadata": dict(metadata),
        "tables": tables,
        "kpis": kpis,
        "raw_state": raw_state,
    }


# --------------------------------------------------------------------------- #
# Save / load / list
# --------------------------------------------------------------------------- #
def save_run_history(
    run_number, payload, overwrite=False, historian_dir=None, app_version=""
):
    """Write ONE consolidated history file. Raises RunExistsError unless overwrite=True."""
    safe = sanitize_run_number(run_number)
    folder = _dir(historian_dir)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{FILE_PREFIX}{safe}{FILE_SUFFIX}"
    if target.exists() and not overwrite:
        raise RunExistsError(safe)

    data = normalize_payload(payload)
    now = datetime.now(timezone.utc).astimezone()
    metadata = dict(data["metadata"])
    metadata.update(
        {
            "run_number": safe,
            "saved_at": now.isoformat(timespec="seconds"),
            "schema_version": SCHEMA_VERSION,
            "app_version": app_version or metadata.get("app_version", ""),
        }
    )

    tmp = folder / f".{target.name}.tmp"
    if tmp.exists():
        tmp.unlink()
    try:
        with closing(sqlite3.connect(tmp)) as con:
            con.executescript(_SCHEMA)
            con.executemany(
                "INSERT INTO metadata VALUES (?, ?)",
                [(k, json.dumps(v, default=str)) for k, v in metadata.items()],
            )
            for pos, (key, t) in enumerate(data["tables"].items()):
                con.execute(
                    "INSERT INTO tables VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        key,
                        t["title"],
                        t["section"],
                        json.dumps(t["columns"]),
                        len(t["rows"]),
                        pos,
                    ),
                )
                con.executemany(
                    "INSERT INTO table_rows VALUES (?, ?, ?)",
                    [
                        (key, i, json.dumps(r, default=str))
                        for i, r in enumerate(t["rows"])
                    ],
                )
            for pos, (key, k) in enumerate(data["kpis"].items()):
                num = _to_number(k["value"])
                con.execute(
                    "INSERT INTO kpis VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        key,
                        k["section"],
                        k["label"],
                        num,
                        None
                        if k["value"] is None
                        else (
                            k["value"]
                            if isinstance(k["value"], str)
                            else json.dumps(k["value"], default=str)
                        ),
                        pos,
                    ),
                )
            con.executemany(
                "INSERT INTO raw_state VALUES (?, ?)", list(data["raw_state"].items())
            )
            con.commit()
        os.replace(tmp, target)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass

    return {
        "run_number": safe,
        "file": target.name,
        "saved_at": metadata["saved_at"],
        "table_count": len(data["tables"]),
        "kpi_count": len(data["kpis"]),
        "replaced": bool(overwrite),
    }


def _existing_tables(con):
    return {
        r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }


def _loads(text, default=None):
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return default if default is not None else text


def load_run_history(run_number, historian_dir=None):
    path = history_file_path(run_number, historian_dir)
    if not path.is_file():
        raise RunNotFoundError(
            f"No Historian file found for Run {sanitize_run_number(run_number)}."
        )
    result = {
        "run_number": sanitize_run_number(run_number),
        "metadata": {},
        "tables": {},
        "kpis": {},
        "raw_state": {},
    }
    with closing(sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)) as con:
        present = _existing_tables(con)
        if "metadata" in present:
            for key, value in con.execute("SELECT key, value_json FROM metadata"):
                result["metadata"][key] = _loads(value)
        if "tables" in present:
            rows_by_key = {}
            if "table_rows" in present:
                for key, row_json in con.execute(
                    "SELECT table_key, row_json FROM table_rows ORDER BY table_key, row_index"
                ):
                    row = _loads(row_json, {})
                    rows_by_key.setdefault(key, []).append(
                        row if isinstance(row, dict) else {"value": row}
                    )
            for key, title, section, cols in con.execute(
                "SELECT table_key, title, section, columns_json FROM tables ORDER BY position, table_key"
            ):
                rows = rows_by_key.get(key, [])
                columns = _loads(cols, [])
                if not isinstance(columns, list):
                    columns = []
                for extra in _columns_from_rows(rows):
                    if extra not in columns:
                        columns.append(extra)
                result["tables"][key] = {
                    "title": title or key,
                    "section": section or "",
                    "columns": columns,
                    "rows": rows,
                }
        if "kpis" in present:
            for key, section, label, num, text in con.execute(
                "SELECT kpi_key, section, label, value_num, value_text FROM kpis ORDER BY position, kpi_key"
            ):
                result["kpis"][key] = {
                    "section": section or "",
                    "label": label or key,
                    "value": num if num is not None else text,
                }
        if "raw_state" in present:
            result["raw_state"] = dict(
                con.execute("SELECT state_key, value FROM raw_state")
            )
    return result


def _run_sort_key(run):
    r = run["run_number"]
    return (0, int(r), "") if r.isdigit() else (1, 0, r.lower())


def list_available_runs(historian_dir=None):
    folder = _dir(historian_dir)
    if not folder.is_dir():
        return []
    runs = []
    for path in folder.glob(f"{FILE_PREFIX}*{FILE_SUFFIX}"):
        run = path.name[len(FILE_PREFIX) : -len(FILE_SUFFIX)]
        info = {"run_number": run, "file": path.name, "size_bytes": path.stat().st_size}
        try:
            with closing(
                sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
            ) as con:
                present = _existing_tables(con)
                meta = (
                    dict(con.execute("SELECT key, value_json FROM metadata"))
                    if "metadata" in present
                    else {}
                )
                info["saved_at"] = (
                    _loads(meta.get("saved_at"), "") if meta.get("saved_at") else ""
                )
                info["app_version"] = (
                    _loads(meta.get("app_version"), "")
                    if meta.get("app_version")
                    else ""
                )
                info["table_count"] = (
                    con.execute("SELECT COUNT(*) FROM tables").fetchone()[0]
                    if "tables" in present
                    else 0
                )
                info["kpi_count"] = (
                    con.execute("SELECT COUNT(*) FROM kpis").fetchone()[0]
                    if "kpis" in present
                    else 0
                )
        except sqlite3.Error as e:
            info["error"] = f"Unreadable Historian file: {e}"
        runs.append(info)
    return sorted(runs, key=_run_sort_key)


# --------------------------------------------------------------------------- #
# Comparison
# --------------------------------------------------------------------------- #
def _to_number(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            f = float(s)
        except ValueError:
            return None
        return f if math.isfinite(f) else None
    return None


def _values_equal(a, b):
    na, nb = _to_number(a), _to_number(b)
    if na is not None and nb is not None:
        return abs(na - nb) <= 1e-9 * max(1.0, abs(na), abs(nb))
    return ("" if a is None else str(a).strip()) == (
        "" if b is None else str(b).strip()
    )


def _diff(a, b):
    na, nb = _to_number(a), _to_number(b)
    if na is None or nb is None:
        return None, None
    delta = nb - na
    pct = (delta / abs(na) * 100.0) if na else None
    return delta, pct


def _key_value(row, cols):
    parts = []
    for c in cols:
        v = row.get(c)
        n = _to_number(v)
        parts.append(
            repr(n) if n is not None else ("" if v is None else str(v).strip())
        )
    return tuple(parts)


def _is_unique_key(rows, cols):
    seen = set()
    for r in rows:
        k = _key_value(r, cols)
        if all(p == "" for p in k) or k in seen:
            return False
        seen.add(k)
    return True


def detect_key_columns(rows_a, rows_b, common_columns):
    """Pick the smallest set of common columns that uniquely identifies rows in both tables."""
    candidates = [c for c in _KEY_CANDIDATES if c in common_columns]
    for c in common_columns:
        if c not in candidates and len(candidates) < 8:
            sample = next(
                (r.get(c) for r in rows_a if r.get(c) not in (None, "")), None
            )
            if isinstance(sample, str) and _to_number(sample) is None:
                candidates.append(c)
    if not rows_a or not rows_b:
        return candidates[:1]
    for c in candidates:
        if _is_unique_key(rows_a, [c]) and _is_unique_key(rows_b, [c]):
            return [c]
    for i, c1 in enumerate(candidates):
        for c2 in candidates[i + 1 :]:
            if _is_unique_key(rows_a, [c1, c2]) and _is_unique_key(rows_b, [c1, c2]):
                return [c1, c2]
    return []


def _reactor_tokens(value):
    return {f"R{int(t)}" for t in re.findall(r"\d+", str(value or ""))}


def _parse_dt(value):
    if value in (None, ""):
        return None
    s = str(value).strip().replace("T", " ")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        dt = None
        for fmt in (
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d.%m.%Y %H:%M:%S",
            "%d.%m.%Y %H:%M",
            "%d/%m/%Y",
        ):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                continue
    return dt.replace(tzinfo=None) if dt else None


def _apply_filters(rows, columns, filters):
    """Reactor filter selects rows (Base/Yield) or a reactor column (Plan); condition filter selects rows by condition number."""
    reactor = (
        next(iter(_reactor_tokens(filters.get("reactor"))), None)
        if filters.get("reactor")
        else None
    )
    condition = str(filters.get("condition") or "").strip()
    dfrom, dto = _parse_dt(filters.get("from")), _parse_dt(filters.get("to"))
    if dto and re.search(r"\d{2}:\d{2}$", str(filters.get("to")).strip()):
        dto = dto.replace(second=59)
    reactor_col = next((c for c in _ROW_REACTOR_COLUMNS if c in columns), None)
    cond_col = next((c for c in _CONDITION_COLUMNS if c in columns), None)
    dt_col = next((c for c in _DATETIME_COLUMNS if c in columns), None)
    info = {
        "reactor": reactor,
        "reactor_mode": None,
        "reactor_column": None,
        "condition": condition or None,
        "condition_applied": bool(cond_col and condition),
        "datetime_applied": bool(dt_col and (dfrom or dto)),
        "datetime_supported": bool(dt_col),
    }
    if reactor:
        if reactor_col:
            info["reactor_mode"] = "rows"
        elif reactor in columns:
            info["reactor_mode"], info["reactor_column"] = "column", reactor
    out = []
    for r in rows:
        if info["reactor_mode"] == "rows" and reactor not in _reactor_tokens(
            r.get(reactor_col)
        ):
            continue
        if info["condition_applied"]:
            cv = str(r.get(cond_col) or "").strip()
            if cv != condition:
                continue
        if info["datetime_applied"]:
            t = _parse_dt(r.get(dt_col))
            if t is None or (dfrom and t < dfrom) or (dto and t > dto):
                continue
        out.append(r)
    return out, info


def _filter_options(rows, columns):
    reactors = {c for c in columns if _REACTOR_COL_RE.match(str(c))}
    reactor_col = next((c for c in _ROW_REACTOR_COLUMNS if c in columns), None)
    cond_col = next((c for c in _CONDITION_COLUMNS if c in columns), None)
    conditions = set()
    for r in rows:
        if reactor_col:
            reactors |= _reactor_tokens(r.get(reactor_col))
        if cond_col:
            cv = str(r.get(cond_col) or "").strip()
            if cv:
                conditions.add(cv)
    def _cond_sort(x):
        try:
            return (0, float(x))
        except ValueError:
            return (1, x)
    return {
        "reactors": sorted(reactors, key=lambda x: int(x[1:])),
        "conditions": sorted(conditions, key=_cond_sort),
    }


def compare_tables(table_a, table_b, key_columns=None, max_rows=5000, filters=None):
    table_a = table_a or {"columns": [], "rows": []}
    table_b = table_b or {"columns": [], "rows": []}
    rows_a = [r for r in table_a.get("rows", []) if isinstance(r, dict)]
    rows_b = [r for r in table_b.get("rows", []) if isinstance(r, dict)]
    cols_a = list(table_a.get("columns") or _columns_from_rows(rows_a))
    cols_b = list(table_b.get("columns") or _columns_from_rows(rows_b))
    set_b = set(cols_b)
    common = [c for c in cols_a if c in set_b]

    all_cols = cols_a + [c for c in cols_b if c not in set(cols_a)]
    total_a, total_b = len(rows_a), len(rows_b)
    options = _filter_options(rows_a + rows_b, all_cols)
    rows_a, filter_info = _apply_filters(rows_a, all_cols, filters or {})
    rows_b, _ = _apply_filters(rows_b, all_cols, filters or {})

    detected = not key_columns
    keys = (
        [c for c in (key_columns or []) if c in common]
        if key_columns
        else detect_key_columns(rows_a, rows_b, common)
    )
    compare_cols = [c for c in common if c not in keys]
    if filter_info["reactor_column"]:
        compare_cols = [
            c
            for c in compare_cols
            if not _REACTOR_COL_RE.match(str(c)) or c == filter_info["reactor_column"]
        ]

    def index(rows):
        out, counts = {}, {}
        for i, r in enumerate(rows):
            k = _key_value(r, keys) if keys else (str(i + 1),)
            n = counts.get(k, 0)
            counts[k] = n + 1
            out[k + ((f"#{n + 1}",) if n else ())] = r
        return out

    idx_a, idx_b = index(rows_a), index(rows_b)
    order = list(idx_a) + [k for k in idx_b if k not in idx_a]

    stats = {
        c: {"changed": 0, "sum_a": 0.0, "n_a": 0, "sum_b": 0.0, "n_b": 0}
        for c in compare_cols
    }
    out_rows, counts = [], {"same": 0, "changed": 0, "only_a": 0, "only_b": 0}
    for k in order:
        ra, rb = idx_a.get(k), idx_b.get(k)
        status = "only_b" if ra is None else "only_a" if rb is None else "same"
        values = {}
        for c in compare_cols:
            va = ra.get(c) if ra else None
            vb = rb.get(c) if rb else None
            delta, pct = _diff(va, vb)
            changed = ra is not None and rb is not None and not _values_equal(va, vb)
            if changed:
                status = "changed"
                stats[c]["changed"] += 1
            na, nb = _to_number(va), _to_number(vb)
            if na is not None:
                stats[c]["sum_a"] += na
                stats[c]["n_a"] += 1
            if nb is not None:
                stats[c]["sum_b"] += nb
                stats[c]["n_b"] += 1
            values[c] = {
                "a": va,
                "b": vb,
                "delta": delta,
                "pct": pct,
                "changed": changed,
            }
        counts[status] += 1
        if len(out_rows) < max_rows:
            key_vals = {c: (ra or rb).get(c) for c in keys} if keys else {"Row": k[0]}
            out_rows.append({"key": key_vals, "status": status, "values": values})

    column_stats = []
    for c, s in stats.items():
        mean_a = s["sum_a"] / s["n_a"] if s["n_a"] else None
        mean_b = s["sum_b"] / s["n_b"] if s["n_b"] else None
        delta, pct = _diff(mean_a, mean_b)
        column_stats.append(
            {
                "column": c,
                "changed_rows": s["changed"],
                "numeric": bool(s["n_a"] or s["n_b"]),
                "mean_a": mean_a,
                "mean_b": mean_b,
                "mean_delta": delta,
                "mean_pct": pct,
            }
        )

    return {
        "key_columns": keys or ["Row"],
        "key_detected": detected,
        "row_matching": "key" if keys else "row_order",
        "columns_common": common,
        "columns_only_a": [c for c in cols_a if c not in set_b],
        "columns_only_b": [c for c in cols_b if c not in set(cols_a)],
        "compare_columns": compare_cols,
        "row_count_a": len(rows_a),
        "row_count_b": len(rows_b),
        "total_rows_a": total_a,
        "total_rows_b": total_b,
        "row_status_counts": counts,
        "rows": out_rows,
        "truncated": len(order) > max_rows,
        "column_stats": column_stats,
        "filters_applied": filter_info,
        "filter_options": options,
    }


def _flatten(d, prefix=""):
    out = {}
    for k, v in (d or {}).items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, key + "."))
        else:
            out[key] = v if not isinstance(v, list) else json.dumps(v, default=str)
    return out


def _normalize_plan_table(table):
    """Plan rows are saved with lowercase keys (parameter, r1..); present them as displayed."""
    rows = [
        {_PLAN_LABELS.get(k, k): v for k, v in r.items()} for r in table.get("rows", [])
    ]
    ordered = list(_PLAN_LABELS.values())
    extras = [c for c in _columns_from_rows(rows) if c not in ordered]
    present = set(_columns_from_rows(rows))
    return {
        **table,
        "rows": rows,
        "columns": [c for c in ordered if c in present] + extras,
    }


def comparison_tables(run):
    """Return only the tables used for comparison, keyed by their canonical key."""
    stored = (run or {}).get("tables") or {}
    out = {}
    for key, title, section, legacy in COMPARISON_TABLES:
        found = next((stored[k] for k in (key, *legacy) if k in stored), None)
        if found is None:
            continue
        table = {**found, "title": title, "section": section}
        out[key] = _normalize_plan_table(table) if key == "run_plan.plan" else table
    return out


def compare_history_runs(
    run_a, run_b, table_key=None, key_columns=None, max_rows=5000, filters=None
):
    """Compare two loaded runs on the Plan, Base Table and Yield Table only."""
    a, b = run_a or {}, run_b or {}
    ta, tb = comparison_tables(a), comparison_tables(b)

    tables = []
    for key, title, section, _ in COMPARISON_TABLES:
        xa, xb = ta.get(key), tb.get(key)
        ca, cb = (xa or {}).get("columns", []), (xb or {}).get("columns", [])
        status = (
            "missing"
            if xa is None and xb is None
            else "only_a"
            if xb is None
            else "only_b"
            if xa is None
            else "both"
        )
        tables.append(
            {
                "key": key,
                "title": title,
                "section": section,
                "status": status,
                "rows_a": len(xa["rows"]) if xa else None,
                "rows_b": len(xb["rows"]) if xb else None,
                "columns_common": len([c for c in ca if c in set(cb)]),
                "columns_only_a": [c for c in ca if c not in set(cb)],
                "columns_only_b": [c for c in cb if c not in set(ca)],
            }
        )

    ma, mb = _flatten(a.get("metadata")), _flatten(b.get("metadata"))
    metadata = [
        {
            "key": k,
            "a": ma.get(k),
            "b": mb.get(k),
            "same": _values_equal(ma.get(k), mb.get(k)),
        }
        for k in list(ma) + [k for k in mb if k not in ma]
    ]

    result = {
        "run_a": a.get("run_number"),
        "run_b": b.get("run_number"),
        "metadata": metadata,
        "tables": tables,
    }
    if table_key not in {t[0] for t in COMPARISON_TABLES}:
        table_key = next((t["key"] for t in tables if t["status"] != "missing"), None)
    if table_key:
        result["table_key"] = table_key
        result["table"] = compare_tables(
            ta.get(table_key), tb.get(table_key), key_columns, max_rows, filters
        )
        result["table"]["present_in_a"] = table_key in ta
        result["table"]["present_in_b"] = table_key in tb
    return result
