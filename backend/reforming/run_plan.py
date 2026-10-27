"""Read the reforming Run Plan workbook (data/RunPlan_Reforming.xlsx layout).

Sheets are found by label, not fixed addresses: Plan (objective, run information,
catalyst loading with one column per catalyst), Conditions, DOE (flat rows), Feed
(first three rows Carbon / Hydrogen / Molecular Weight) and Feed DHA.

The result keeps the keys the rest of the platform reads from runPlanDashboardState:
feed rows {component, carbon_no, group, unit, value}, DOE rows with 'Condition No.',
'Start Date', 'End Date' and 'Reactor ID'.
"""

import math
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook


def _clean(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S").replace(" 00:00:00", "")
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return ""
        return int(value) if value.is_integer() else round(value, 6)
    if isinstance(value, str) and value.startswith("="):
        return ""  # formula without a cached value (file never saved by Excel)
    return value.strip() if isinstance(value, str) else value


def _number(value):
    value = _clean(value)
    if value == "" or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rows(ws):
    return [[_clean(v) for v in row] for row in ws.iter_rows(values_only=True)]


def _find(rows, label, column=0):
    target = label.strip().lower()
    for index, row in enumerate(rows):
        if len(row) > column and str(row[column]).strip().lower() == target:
            return index
    return None


def _block(rows, start):
    """Rows after a header row until the first row whose first cell is blank."""
    out = []
    for row in rows[start + 1:]:
        if not row or row[0] in ("", None):
            break
        out.append(row)
    return out


def process_reforming_run_plan(file_path):
    path = Path(file_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Selected Run Plan file does not exist: {file_path}")
    if path.suffix.lower() != ".xlsx":
        raise ValueError(f"The reforming Run Plan must be an .xlsx workbook, got {path.suffix}")

    workbook = load_workbook(path, data_only=True)
    try:
        missing = [name for name in ("Plan", "DOE", "Feed") if name not in workbook.sheetnames]
        if missing:
            raise ValueError(
                f"Not a reforming Run Plan workbook: sheet(s) {', '.join(missing)} not found. "
                "Use data/RunPlan_Reforming.xlsx as the template."
            )
        plan = _rows(workbook["Plan"])
        doe_sheet = _rows(workbook["DOE"])
        feed_sheet = _rows(workbook["Feed"])
        conditions_sheet = _rows(workbook["Conditions"]) if "Conditions" in workbook.sheetnames else []
        feed_dha_sheet = _rows(workbook["Feed DHA"]) if "Feed DHA" in workbook.sheetnames else []
    finally:
        workbook.close()

    # Plan: objective, run information, catalyst loading
    objective_row = _find(plan, "Objective")
    objective = plan[objective_row][1] if objective_row is not None and len(plan[objective_row]) > 1 else ""
    info_row = _find(plan, "Run Information")
    info = [
        {"parameter": r[0], "units": r[1] if len(r) > 1 else "", "value": r[2] if len(r) > 2 else ""}
        for r in (_block(plan, info_row) if info_row is not None else [])
    ]
    info_map = {str(r["parameter"]).lower(): r["value"] for r in info}

    loading_row = _find(plan, "Catalyst Loading Plan")
    catalyst_columns, loading = [], []
    if loading_row is not None:
        head = plan[loading_row]
        catalyst_columns = [str(h) for h in head[2:] if str(h).strip()]
        for r in _block(plan, loading_row):
            entry = {"parameter": r[0], "units": r[1] if len(r) > 1 else ""}
            for i, name in enumerate(catalyst_columns):
                entry[name] = r[2 + i] if len(r) > 2 + i else ""
            loading.append(entry)

    def loading_value(parameter, catalyst_column):
        row = next((r for r in loading if str(r["parameter"]).lower() == parameter.lower()), None)
        return row.get(catalyst_column, "") if row else ""

    # Derived loading values when the workbook was not recalculated by Excel
    for name in catalyst_columns:
        cbd, loi, volume = (_number(loading_value(p, name)) for p in ("CBD (as-is)", "LOI", "Catalyst volume"))
        for row in loading:
            label = str(row["parameter"]).lower()
            if row.get(name, "") == "" and label == "cbd (dry basis)" and cbd is not None and loi is not None:
                row[name] = round(cbd - cbd * loi / 100, 6)
            if row.get(name, "") == "" and label == "catalyst amount" and cbd is not None and volume is not None:
                row[name] = round(volume * cbd, 6)
    catalyst_names = {
        str(loading_value("Catalyst", column)): column for column in catalyst_columns if loading_value("Catalyst", column)
    }

    density = _number(info_map.get("feed density @ 15 oc"))
    feed_mw = _number(info_map.get("feed molecular weight"))

    # DOE
    doe_columns = [str(h) for h in (doe_sheet[0] if doe_sheet else []) if str(h).strip()]
    doe_rows = []
    for raw in doe_sheet[1:]:
        if not any(str(v).strip() for v in raw[: len(doe_columns)]):
            continue
        row = {column: raw[i] if i < len(raw) else "" for i, column in enumerate(doe_columns)}
        catalyst = str(row.get("Catalyst", ""))
        volume = _number(loading_value("Catalyst volume", catalyst_names.get(catalyst, "")))
        lhsv, h2hc = _number(row.get("LHSV (/h)")), _number(row.get("H2/Naphtha (mol.basis)"))
        naphtha = _number(row.get("Naphtha Flow (gms/h)"))
        if naphtha is None and None not in (volume, lhsv, density):
            naphtha = volume * lhsv * density
            row["Naphtha Flow (gms/h)"] = round(naphtha, 6)
        h2 = _number(row.get("H2 Flow (gms/h)"))
        if h2 is None and None not in (naphtha, feed_mw, h2hc) and feed_mw:
            h2 = naphtha / feed_mw * h2hc * 2
            row["H2 Flow (gms/h)"] = round(h2, 6)
        if _number(row.get("H2 Flow (NLPH)")) is None and h2 is not None:
            row["H2 Flow (NLPH)"] = round(h2 / 2 * 22.4 * (293 / 273), 6)
        doe_rows.append(row)

    # Feed (first three rows positional: Carbon, Hydrogen, Molecular Weight)
    feed_rows = [
        {
            "component": r[0],
            "carbon_no": "",
            "group": r[2] if len(r) > 2 else "",
            "unit": r[1] if len(r) > 1 else "",
            "value": r[3] if len(r) > 3 else "",
            "note": r[4] if len(r) > 4 else "",
        }
        for r in feed_sheet[1:]
        if r and str(r[0]).strip()
    ]

    feed_dha = {"columns": [], "rows": []}
    if feed_dha_sheet:
        feed_dha["columns"] = [str(h) for h in feed_dha_sheet[0] if str(h).strip()]
        width = len(feed_dha["columns"])
        for r in feed_dha_sheet[1:]:
            if not str(r[0]).strip() or str(r[0]).upper() == "TOTAL":
                continue
            entry = dict(zip(feed_dha["columns"], r[:width]))
            if entry.get("TOTAL", "") == "":
                entry["TOTAL"] = round(sum(_number(entry.get(c)) or 0 for c in feed_dha["columns"][1:-1]), 6)
            feed_dha["rows"].append(entry)

    conditions = {"columns": [], "rows": []}
    if conditions_sheet:
        conditions["columns"] = [str(h) for h in conditions_sheet[0] if str(h).strip()]
        conditions["rows"] = [
            dict(zip(conditions["columns"], r)) for r in conditions_sheet[1:] if r and str(r[0]).strip()
        ]

    reactors = sorted({str(r.get("Reactor ID", "")).strip() for r in doe_rows if str(r.get("Reactor ID", "")).strip()})
    return {
        "process": "reforming",
        "feed": {"rows": feed_rows, "count": len(feed_rows)},
        "feed_dha": feed_dha,
        "plan": {
            "objective": objective,
            "info": info,
            "columns": ["Parameter", "Units", *catalyst_columns],
            "catalyst_columns": catalyst_columns,
            "rows": loading,
            "count": len(loading),
        },
        "conditions": conditions,
        "doe": {"columns": doe_columns, "rows": doe_rows, "count": len(doe_rows)},
        "summary": {
            "process": "reforming",
            "source": "reforming_run_plan",
            "file_name": path.name,
            "file_path": str(path),
            "feed_count": len(feed_rows),
            "doe_count": len(doe_rows),
            "plan_count": len(loading),
            "catalyst_count": len(catalyst_columns),
            "catalysts": list(catalyst_names),
            "reactor_count": len(reactors) or 1,
            "reactors": reactors or ["R1"],
        },
    }
