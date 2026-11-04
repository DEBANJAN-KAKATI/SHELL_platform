"""Universal Run Plan template (Plan, DOE, Feed) — one workbook layout for every experiment.

Recognised by the Plan sheet's "Reactor role" row. Differences to the older RunPlan.xlsx:
- Plan: Run ID (B1), Start date (H1), Objective (B2), Lab notebook ref. (B3), Feed (B4); Catalyst Loading Plan from the
  "Reactor" row (7) down to the row before "Flow calculation basis" (rows 8-22, incl. Reactor role Catalyst/Inert/Not used).
- DOE: header row 10, conditions from row 11 (one row per condition, block and reactor; Block-1 = R1-R4, Block-2 = R5-R8),
  calculated flow columns up to "Check"; "Step 0 – Pretreatment / activation" table at the bottom (returned separately).
- Feed: four Excel tables — tbl_Feed (properties A1:F13), tbl_comp (liquid components A14:F45 with Total),
  tbl_compType (group-type summary H14:K22), tbl_gas (gas components M14:P31) — plus "Gas feed settings" (A46:E48).
Formula cells are read with the values Excel saved (data_only).
"""
import math
import re
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string, range_boundaries

FEED_COLUMNS = ["Component / Parameter", "Carbon No.", "Group", "Unit / Method", "Value (wt%)"]
LOADING_COLUMNS = ["Parameter", "Units", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]
# DOE headers used by the rest of the dashboard (Calculation table, Plots: condition dates)
DOE_HEADER_ALIASES = {"start (date, time)": "Start Date", "end (date, time)": "End Date"}
DEFAULT_TABLES = {"tbl_Feed": "A1:F13", "tbl_comp": "A14:F45", "tbl_compType": "H14:K22", "tbl_gas": "M14:P31"}


def clean(value):
    """Same conventions as run_plan_service._clean_val: '' for empty, dates as text, short floats."""
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return ""
        return int(value) if value.is_integer() else round(value, 4)
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S").replace(" 00:00:00", "")
    if isinstance(value, str):
        return value.strip()
    return value


def number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _label(value):
    return " ".join(str(value or "").split()).strip()


def is_template(path):
    """True for the universal template (Plan sheet has a "Reactor role" row)."""
    path = Path(path)
    if path.suffix.lower() != ".xlsx":
        return False
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        if "Plan" not in wb.sheetnames:
            return False
        for row in wb["Plan"].iter_rows(min_row=1, max_row=40, max_col=1, values_only=True):
            if _label(row[0]).lower() == "reactor role":
                return True
        return False
    finally:
        wb.close()


def _rows(ws):
    return [list(r) for r in ws.iter_rows(values_only=True)]


def _cell(rows, ref):
    col, row = re.match(r"([A-Z]+)(\d+)", ref).groups()
    r, c = int(row) - 1, column_index_from_string(col) - 1
    return rows[r][c] if r < len(rows) and c < len(rows[r]) else None


# ---------------------------------------------------------------- Plan
def parse_plan(ws):
    rows = _rows(ws)
    find = lambda text: next((i for i, r in enumerate(rows) if r and _label(r[0]).lower() == text), None)
    objective = clean(_cell(rows, "B2"))
    info = []
    for label, ref in (("Run ID", "B1"), ("Start date", "H1"), ("Lab notebook ref.", "B3"), ("Feed", "B4")):
        value = clean(_cell(rows, ref))
        if value != "":
            info.append({"parameter": label, "units": "", "value": value})
    reactor = find("reactor")
    loading = []
    if reactor is not None:
        for r in rows[reactor + 1:]:
            label = _label(r[0]) if r else ""
            if not label:
                if loading:
                    break
                continue
            values = [clean(r[i]) if i < len(r) else "" for i in range(1, 10)]
            loading.append({"parameter": label, "units": values[0], **{f"r{k + 1}": values[k + 1] for k in range(8)}})
    feed_mw = next((clean(r[2]) for r in rows if r and _label(r[0]).lower() == "feed molecular weight" and len(r) > 2), "")
    return {"objective": objective, "info": info, "rows": loading, "feed_mw": feed_mw}


# ---------------------------------------------------------------- DOE
def parse_doe(ws):
    rows = _rows(ws)
    header_index = next((i for i, r in enumerate(rows) if r and _label(r[0]).lower().startswith("condition")), 9)
    header = rows[header_index]
    last = max((i for i, h in enumerate(header) if _label(h)), default=12)
    columns = []
    for i in range(last + 1):
        name = _label(header[i]) or f"Col_{i + 1}"
        columns.append(DOE_HEADER_ALIASES.get(name.lower(), name))
    step0 = next((i for i, r in enumerate(rows) if r and _label(r[0]).lower().startswith("step 0")), len(rows))
    # A condition is shown when one of its entered values is filled; the start date alone is not enough because the
    # template chains it from the previous condition's end.
    entered = [i for i, c in enumerate(columns) if re.match(r"(temperature|pressure|whsv|lhsv)", c.lower())]
    react_i = next((i for i, c in enumerate(columns) if c.lower().startswith("reactor")), None)
    doe_rows = []
    for r in rows[header_index + 1:step0]:
        if not r or react_i is None or not re.fullmatch(r"R[1-8]", _label(r[react_i] if react_i < len(r) else "")):
            continue
        has_data = any(i < len(r) and clean(r[i]) != "" for i in entered)
        if not has_data:
            continue                     # conditions left blank in the template are not shown
        doe_rows.append({columns[i]: clean(r[i]) if i < len(r) else "" for i in range(len(columns))})
    planned = {}
    for r in rows[:header_index]:
        if r and _label(r[0]).lower().startswith("planned hours"):
            planned = {"block_1_h": clean(r[2]) if len(r) > 2 else "", "block_2_h": clean(r[4]) if len(r) > 4 else "",
                       "run_end": clean(r[6]) if len(r) > 6 else ""}
    pre = {"title": "", "columns": [], "rows": [], "total_h": "", "totals": []}
    if step0 < len(rows):
        pre["title"] = _label(rows[step0][0])
        head = rows[step0 + 1] if step0 + 1 < len(rows) else []
        width = max((i for i, h in enumerate(head) if _label(h)), default=-1) + 1
        pre["columns"] = [_label(h) for h in head[:width]]
        for r in rows[step0 + 2:]:
            if not r:
                continue
            tail = [clean(v) for v in r[:width + 2]]
            label = next((v for v in tail if isinstance(v, str) and "total" in v.lower()), None)
            if label:                    # "Total (h)", or one total per block ("Block-1 total (h)", "Block-2 total (h)")
                pre["totals"].append({"label": label, "value": next((v for v in tail if isinstance(v, (int, float))), "")})
                continue
            if pre["totals"]:
                break
            values = tail[:width]
            # a step counts when anything besides its number is filled in
            if any(v != "" for v in values[1:]):
                pre["rows"].append(dict(zip(pre["columns"], values)))
    if pre["totals"]:
        pre["total_h"] = pre["totals"][0]["value"] if len(pre["totals"]) == 1 else ""
    if step0 < len(rows):
        pre["settings"] = _prerun_settings(rows[step0:])
    if pre["rows"]:
        pre["profile"] = prerun_profile(pre["rows"], *_chart_settings(rows[step0:]))
    return {"columns": columns, "rows": doe_rows, "pretreatment": pre, "planned": planned}


# ---------------------------------------------------------------- Pre-run (DOE Step 0) profile for the charts
PRERUN_PHASES = ["Drying", "Reduction", "Sulfiding", "Feed cut-in", "Other"]
PRERUN_AXES = ["Pressure (barg)", "Gas flow (NLPH)", "Liquid flow (g/h)"]
BLOCK_LABELS = {"Block-1": "Block-1 (R1–R4)", "Block-2": "Block-2 (R5–R8)"}


PRERUN_SETTINGS = ("program name", "feed cut-in (date, time)", "start to feed cut-in (h)", "pre-run start (date, time)",
                   "program time (h)", "program end (date, time)")


def _prerun_settings(rows):
    """Pre-run settings per block (label in column A, Block-1 value in E, Block-2 value in H)."""
    out = {}
    for r in rows:
        label = _label(r[0]) if r else ""
        if label.lower() in PRERUN_SETTINGS:
            out[label] = {"Block-1": clean(r[4]) if len(r) > 4 else "", "Block-2": clean(r[7]) if len(r) > 7 else ""}
    return out


def _chart_settings(rows):
    """Phase names (rows "Phase 1".."Phase 5", value in column E) and the chosen right axis ("Chart right axis")."""
    phases, axis = list(PRERUN_PHASES), PRERUN_AXES[0]
    for r in rows:
        label = _label(r[0]).lower() if r else ""
        value = _label(r[4]) if r and len(r) > 4 else ""
        m = re.fullmatch(r"phase ([1-5])", label)
        if m and value:
            phases[int(m.group(1)) - 1] = value
        elif label == "chart right axis" and value:
            axis = value
    return phases, axis


def _pick(row, *names):
    """Value of the first column whose name starts with one of the names (headers carry units, e.g. 'Hold (h)')."""
    for name in names:
        for key, value in row.items():
            if key.lower().startswith(name.lower()):
                return value
    return ""


def prerun_profile(steps, phases=None, axis=None):
    """Temperature and right-axis profile per block, 3 points per step (start, end of ramp, end of hold).

    Computed from the entered values like the template's graph data: ramp time = |target - start| / ramp, step time =
    ramp time + hold, steps of a block follow each other. The pressure changes linearly over 'Pressure change (h)'
    (blank = at the start of the step); gas / liquid flows change at the start of the step. Temperature points are
    grouped by phase; None breaks a line where the phase changes.
    """
    phases = list(phases or PRERUN_PHASES)
    axis = axis if axis in PRERUN_AXES else PRERUN_AXES[0]
    blocks, order = {}, []
    for step in steps:
        block = _label(_pick(step, "Block")) or "All"
        phase = _label(_pick(step, "Phase")) or _label(_pick(step, "Gas")) or "Other"
        if phase not in phases:
            phases.append(phase)
        b = blocks.get(block)
        if b is None:
            b = blocks[block] = {"block": block, "label": BLOCK_LABELS.get(block, block), "t": 0.0, "last_T": None,
                                 "last_right": None, "points": [], "right": [], "feed_cut_in_h": None}
            order.append(block)
        t0, t1 = number(_pick(step, "Start T")), number(_pick(step, "Target T"))
        hold = number(_pick(step, "Hold")) or 0.0
        if t0 is None:
            t0 = b["last_T"] if b["last_T"] is not None else t1
        if t1 is None:
            t1 = t0
        if t0 is None and not hold:
            continue                                   # nothing to draw
        ramp = number(_pick(step, "Ramp ("))
        ramp_h = abs(t1 - t0) / ramp if t0 is not None and t1 != t0 and ramp and ramp > 0 else 0.0
        start, end = b["t"], b["t"] + ramp_h + hold
        if phase == phases[3] and b["feed_cut_in_h"] is None:
            b["feed_cut_in_h"] = round(start, 4)
        b["points"].append((phase, [(start, t0), (start + ramp_h, t1), (end, t1)]))
        column = {"Pressure (barg)": "Pressure (", "Gas flow (NLPH)": "Gas flow", "Liquid flow (g/h)": "Liquid flow"}[axis]
        value = number(_pick(step, column))
        if value is not None:
            change = number(_pick(step, "Pressure change")) if axis == PRERUN_AXES[0] else 0.0
            change = min(max(change or 0.0, 0.0), end - start)
            before = b["last_right"] if b["last_right"] is not None else value
            b["right"] += [(start, before), (start + change, value), (end, value)]
            b["last_right"] = value
        b["t"], b["last_T"] = end, t1
    out = []
    for name in order:
        b = blocks[name]
        series = {}
        for phase in phases:
            line, prev_in = [], False
            for ph, pts in b["points"]:
                if ph == phase:
                    line += [[round(x, 4), y] for x, y in pts]
                elif prev_in:
                    line.append(None)                  # break the line between separate parts of a phase
                prev_in = ph == phase
            if any(p for p in line):
                series[phase] = line[:-1] if line and line[-1] is None else line
        out.append({"block": name, "label": b["label"], "total_h": round(b["t"], 4), "feed_cut_in_h": b["feed_cut_in_h"],
                    "temperature": series, "right": [[round(x, 4), y] for x, y in b["right"]]})
    return {"phases": phases, "right_axis": axis, "blocks": out}


# ---------------------------------------------------------------- Feed
def _table_ranges(ws):
    ranges = dict(DEFAULT_TABLES)
    for name, table in getattr(ws, "tables", {}).items():
        ref = table if isinstance(table, str) else getattr(table, "ref", None)
        if ref:
            ranges[name] = ref
    return ranges


def _block(rows, ref):
    min_col, min_row, max_col, max_row = range_boundaries(ref)
    return [[rows[r - 1][c - 1] if r - 1 < len(rows) and c - 1 < len(rows[r - 1]) else None for c in range(min_col, max_col + 1)]
            for r in range(min_row + 1, max_row + 1)], min_row, min_col


def _check(total):
    if total is None:
        return ""
    return "OK" if abs(total - 100) <= 0.5 else "Not 100"


def parse_feed(ws_values, ws_formulas=None):
    rows = _rows(ws_values)
    ranges = _table_ranges(ws_formulas or ws_values)
    note = lambda r: clean(rows[r][6]) if r < len(rows) and len(rows[r]) > 6 else ""

    props_block, first, _ = _block(rows, ranges["tbl_Feed"])
    properties = []
    for k, r in enumerate(props_block):
        label = _label(r[0])
        if label:
            properties.append({"label": label, "unit": clean(r[3]) if len(r) > 3 else "", "value": clean(r[4]) if len(r) > 4 else "",
                               "note": note(first + k)})

    comp_block, first, _ = _block(rows, ranges["tbl_comp"])
    liquid, liquid_total, liquid_check = [], None, ""
    for r in comp_block:
        label = _label(r[0])
        if label.lower() == "total":
            liquid_total, liquid_check = number(r[4]), clean(r[5])
            continue
        liquid.append({"component": label, "carbon_no": clean(r[1]), "type": clean(r[2]), "unit": clean(r[3]) or "wt%",
                       "weight": clean(r[4]), "mw": clean(r[5])})
    weights = [number(x["weight"]) for x in liquid if number(x["weight"]) is not None]
    if liquid_total is None and weights:
        liquid_total = sum(weights)
    liquid_check = liquid_check or (_check(liquid_total) if weights else "")

    group_block, _, _ = _block(rows, ranges["tbl_compType"])
    groups = [{"group": _label(r[0]), "unit": clean(r[1]) or "wt%", "weight": clean(r[2]), "check": clean(r[3])} for r in group_block]
    group_weights = [number(g["weight"]) for g in groups if number(g["weight"]) is not None]
    group_total = sum(group_weights) if group_weights else None

    gas_block, _, _ = _block(rows, ranges["tbl_gas"])
    gas = [{"component": _label(r[0]), "unit": clean(r[1]) or "mol%", "value": clean(r[2]), "check": clean(r[3])} for r in gas_block]
    gas_values = [number(g["value"]) for g in gas if number(g["value"]) is not None]
    gas_total = sum(gas_values) if gas_values else None

    settings, start = [], next((i for i, r in enumerate(rows) if r and _label(r[0]).lower() == "gas feed settings"), None)
    if start is not None:
        for i in range(start + 1, len(rows)):
            label = _label(rows[i][0]) if rows[i] else ""
            if not label:
                break
            settings.append({"label": label, "unit": clean(rows[i][3]) if len(rows[i]) > 3 else "",
                             "value": clean(rows[i][4]) if len(rows[i]) > 4 else "", "note": note(i)})

    tables = {
        "properties": {"title": "Feed properties", "rows": properties},
        "liquid": {"title": "Liquid components", "unit": "wt%", "rows": liquid, "total": liquid_total, "check": liquid_check},
        "groups": {"title": "Group-type summary", "unit": "wt%", "rows": groups, "total": group_total,
                   "check": _check(group_total) if group_weights else ""},
        "gas": {"title": "Gas feed composition", "unit": "mol%", "rows": gas, "total": gas_total,
                "check": _check(gas_total) if gas_values else "", "settings": settings},
    }

    # Flat rows for the rest of the dashboard: Carbon, Hydrogen and Molecular Weight first (the Calculation table, Plots
    # and Custom table read Carbon from row 1 and MW from row 3), then the other properties, then filled components.
    by_label = {p["label"].lower(): p for p in properties}
    ordered = [by_label[k] for k in ("carbon", "hydrogen", "molecular weight") if k in by_label]
    ordered += [p for p in properties if p not in ordered]
    flat = [{"component": p["label"], "carbon_no": "", "group": "Property", "unit": p["unit"], "value": p["value"]} for p in ordered]
    flat += [{"component": x["component"], "carbon_no": x["carbon_no"], "group": x["type"], "unit": x["unit"], "value": x["weight"]}
             for x in liquid if x["component"] and x["weight"] != ""]
    flat += [{"component": g["group"], "carbon_no": "", "group": "Group type", "unit": g["unit"], "value": g["weight"]}
             for g in groups if g["group"] and g["weight"] != ""]
    flat += [{"component": f"{g['component']} (gas)" if "(gas)" not in g["component"] else g["component"], "carbon_no": "",
              "group": "Gas", "unit": g["unit"], "value": g["value"]} for g in gas if g["component"] and g["value"] != ""]
    return {"tables": tables, "rows": flat}


# ---------------------------------------------------------------- workbook
def process_template(path):
    path = Path(path).resolve()
    wb = load_workbook(path, data_only=True)
    wf = load_workbook(path)                    # table definitions (not in the data_only view of some files)
    try:
        plan = parse_plan(wb["Plan"])
        doe = parse_doe(wb["DOE"]) if "DOE" in wb.sheetnames else {"columns": [], "rows": [], "pretreatment": {}, "planned": {}}
        feed = parse_feed(wb["Feed"], wf["Feed"]) if "Feed" in wb.sheetnames else {"tables": {}, "rows": []}
    finally:
        wb.close()
        wf.close()

    props = {p["label"].lower(): p["value"] for p in feed["tables"].get("properties", {}).get("rows", [])}
    if props.get("feed id / sample id (sl id)"):
        plan["info"].append({"parameter": "Feed SL ID", "units": "", "value": props["feed id / sample id (sl id)"]})
    if plan["feed_mw"] != "" or props.get("molecular weight") not in (None, ""):
        plan["info"].append({"parameter": "Feed molecular weight", "units": "g/mol",
                             "value": plan["feed_mw"] if plan["feed_mw"] != "" else props.get("molecular weight")})

    roles = next((r for r in plan["rows"] if r["parameter"].lower() == "reactor role"), None)
    # Feed Cut-In (time zero of TOS, e.g. for Reforming): pre-run feed cut-in of the block of the first active reactor,
    # else the start of the first DOE condition of that block.
    first = next((f"R{k}" for k in range(1, 9) if roles and str(roles.get(f"r{k}", "")).strip().lower() in ("catalyst", "inert")), "R1")
    block = "Block-1" if int(first[1:]) <= 4 else "Block-2"
    cut_in = (doe["pretreatment"].get("settings", {}).get("Feed cut-in (date, time)", {}) or {}).get(block, "")
    if cut_in in ("", None):
        cut_in = next((r.get("Start Date", "") for r in doe["rows"] if r.get("Block") == block and r.get("Start Date")), "")
    if cut_in not in ("", None) and not any(i["parameter"].lower() == "feed cut-in" for i in plan["info"]):
        plan["info"].append({"parameter": "Feed Cut-In", "units": "", "value": cut_in})
    catalysts = next((r for r in plan["rows"] if r["parameter"].lower() == "catalyst"), {})
    for row in doe["rows"]:                     # DOE has no Catalyst column any more: take it from the Plan
        reactor = str(row.get("Reactor ID", "")).strip()
        if reactor and "Catalyst" not in row:
            row["Catalyst"] = catalysts.get(f"r{reactor[1:]}", "") if reactor[1:].isdigit() else ""
    if doe["rows"] and "Catalyst" not in doe["columns"]:
        doe["columns"].append("Catalyst")
    active = [f"R{k}" for k in range(1, 9)
              if roles and str(roles.get(f"r{k}", "")).strip().lower() in ("catalyst", "inert")]
    doe_reactors = sorted({str(r.get("Reactor ID", "")).strip() for r in doe["rows"] if str(r.get("Reactor ID", "")).strip()})
    liquid_filled = [x for x in feed["tables"].get("liquid", {}).get("rows", []) if x["weight"] != ""]
    summary = {
        "file_name": path.name, "file_path": str(path), "format": "template",
        "feed_count": len(liquid_filled), "doe_count": len(doe["rows"]),
        "condition_count": len({(r.get("Block"), r.get("Condition No.")) for r in doe["rows"]}),
        "reactor_count": len(doe_reactors) or 8,
        "reactors": doe_reactors or [f"R{i}" for i in range(1, 9)], "active_reactors": active,
        "pretreatment_steps": len(doe["pretreatment"].get("rows", [])),
    }
    return {
        "feed": {"columns": FEED_COLUMNS, "rows": feed["rows"], "count": len(feed["rows"]), "tables": feed["tables"]},
        "plan": {"objective": plan["objective"], "info": plan["info"], "columns": LOADING_COLUMNS, "rows": plan["rows"],
                 "count": len(plan["rows"])},
        "doe": {"columns": doe["columns"], "rows": doe["rows"], "count": len(doe["rows"]),
                "pretreatment": doe["pretreatment"], "planned": doe["planned"]},
        "summary": summary,
    }
