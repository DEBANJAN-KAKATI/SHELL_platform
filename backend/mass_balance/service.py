"""Glue between the imports (.txt exports, MassBal workbook, values typed in the dashboard) and the engine."""
import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from .constants import DEFAULT_GC_MAP, MB_NAMES, REACTORS, ZMB_GASES, MAX_WORKBOOK_REPS
from .engine import avg, calculate, to_dt
from .txt_loader import read_export
from .views import build_views

BASE = Path(__file__).resolve().parents[2]
GC_MAP_FILE = BASE / "config" / "mass_balance_gc_map.json"


# ---------------------------------------------------------------- imports
@lru_cache(maxsize=8)
def _cached_export(path, mtime, size):
    return read_export(path)


def load_export(path):
    path = str(Path(path).expanduser())
    stat = os.stat(path)
    return _cached_export(path, stat.st_mtime, stat.st_size)


def export_summary(export):
    rows = export["rows"]
    preview = [{"line": r["line"], "time": r["time"], "gc_time": r["gc_time"], "stream": r["stream"],
                "gc_total": r["gc_total"], "H2": r["estd"].get("H2"), "N2": r["estd"].get("N2"), "Argon": r["estd"].get("Argon"),
                "Ethylene": r["estd"].get("Ethylene"), "Acetylene": r["estd"].get("Acetylene"),
                **{tag: r["op"].get(tag) for tag in ("10i1TIC02", "10i2TIC02", "10i1PIC01", "01i14FI01")}}
               for r in rows]
    return {k: export[k] for k in ("kind", "file", "path", "gases", "columns", "streams", "first_gc", "last_gc", "warnings")} | {
        "row_count": len(rows), "preview": preview,
        "configured_gases": sorted({g for r in rows for g, v in r["estd"].items() if v is not None})}


def read_gc_map():
    try:
        saved = json.loads(GC_MAP_FILE.read_text(encoding="utf-8"))
        return {name: saved.get(name, DEFAULT_GC_MAP[name]) for name in MB_NAMES}
    except (OSError, ValueError):
        return dict(DEFAULT_GC_MAP)


def save_gc_map(mapping):
    clean = {name: (mapping.get(name) or None) for name in MB_NAMES}
    GC_MAP_FILE.write_text(json.dumps(clean, indent=2), encoding="utf-8")
    return clean


def zmb_gc_from_export(export):
    """ZMB GC blocks: ESTD of each Sampled_reactor (0 = bypass), in time order."""
    blocks = {}
    for row in export["rows"]:
        if row["estd"] and row["stream"] is not None:
            blocks.setdefault(str(row["stream"]), []).append({
                "time": row["gc_time"], "source": f"{export['file']} line {row['line']}",
                "estd": {name: row["estd"].get(tag) for name, tag, _ in ZMB_GASES}})
    return blocks


def _y_from_row(row, gc_map):
    """Rx_MB rows from one export row; a row may sum several txt gases ('C3-C4+C4-C5')."""
    y = {}
    for name in MB_NAMES:
        source = gc_map.get(name)
        if not source:
            y[name] = 0.0
            continue
        values = [row["estd"].get(part.strip()) for part in str(source).split("+")]
        y[name] = sum(v for v in values if v is not None) if any(v is not None for v in values) else 0.0
    return y


def sample_windows(common, samples):
    """Per sample and reactor: (previous collection finished or Run Start, this collection finished]."""
    run_start = to_dt((common.get("run") or {}).get("start"))
    windows, previous = [], {}
    for sample in samples:
        override = sample.get("window") or {}
        w = {}
        finishes = [to_dt(((sample.get("liq") or {}).get(str(r)) or {}).get("finish")) for r in REACTORS]
        latest = max([f for f in finishes if f], default=None)
        for r, finish in zip(REACTORS, finishes):
            start = to_dt(override.get("start")) or previous.get(r) or run_start
            end = to_dt(override.get("finish")) or finish or latest
            w[str(r)] = (start, end)
            if end:
                previous[r] = end
        windows.append(w)
    return windows


def gc_reps_from_export(export, window, gc_map, reactor):
    start, end = window
    reps = []
    for row in export["rows"]:
        if row["stream"] != reactor or not row["estd"] or not row["gc_time"]:
            continue
        t = to_dt(row["gc_time"])
        if (start and t <= start) or (end and t > end):
            continue
        reps.append({"time": row["gc_time"], "y": _y_from_row(row, gc_map), "source": f"{export['file']} line {row['line']}",
                     "gc_total": row["gc_total"]})
    return reps


def flows_from_export(export, windows):
    starts = [w[0] for w in windows.values() if w[0]]
    ends = [w[1] for w in windows.values() if w[1]]
    start, end = (min(starts) if starts else None), (max(ends) if ends else None)
    rows = [r for r in export["rows"] if r["op"] and r["time"]
            and (not start or to_dt(r["time"]) > start) and (not end or to_dt(r["time"]) <= end)]
    tag = lambda name: avg([r["op"].get(name) for r in rows])
    return {"fi01": tag("01i14FI01"), "nml": {str(r): tag(f"01i14FIC0{r}") for r in REACTORS},
            "operating": {name: tag(name) for name in ("10i1TIC02", "10i2TIC02", "10i1PIC01", "10i2PIC01")},
            "rows": len(rows), "start": start.strftime("%Y-%m-%d %H:%M:%S") if start else None,
            "end": end.strftime("%Y-%m-%d %H:%M:%S") if end else None, "source": "txt"}


# ---------------------------------------------------------------- calculation
def run_calculation(payload):
    """payload: {common, samples[], imports{zmb_path, run_path}, options{mixed_gas_source, workbook_compatible, gc_map}}"""
    common = json.loads(json.dumps(payload.get("common") or {}))
    samples = json.loads(json.dumps(payload.get("samples") or []))
    imports, options = payload.get("imports") or {}, payload.get("options") or {}
    gc_map = {**read_gc_map(), **(options.get("gc_map") or {})}
    warnings, info = [], {}
    if not samples:
        samples = [{"name": "S1"}]

    if imports.get("zmb_path"):
        export = load_export(imports["zmb_path"])
        common.setdefault("zmb", {})["gc"] = zmb_gc_from_export(export)
        info["zmb"] = {"file": export["file"], "streams": export["streams"]}
    run_export = load_export(imports["run_path"]) if imports.get("run_path") else None
    if run_export:
        info["run"] = {"file": run_export["file"], "streams": run_export["streams"],
                       "first_gc": run_export["first_gc"], "last_gc": run_export["last_gc"]}

    windows = sample_windows(common, samples)
    results = []
    for index, (sample, window) in enumerate(zip(samples, windows)):
        sample["_index"] = index
        sample.setdefault("gc", {})
        sample["window_used"] = {r: [w[0].strftime("%Y-%m-%d %H:%M:%S") if w[0] else None,
                                     w[1].strftime("%Y-%m-%d %H:%M:%S") if w[1] else None] for r, w in window.items()}
        if run_export and sample.get("gc_source", "txt") == "txt":
            sample["gc"] = {str(r): gc_reps_from_export(run_export, window[str(r)], gc_map, r) for r in REACTORS}
            sample["gc_source"] = "txt"
        if run_export and (sample.get("gas") or {}).get("source", "txt") == "txt":
            flows = flows_from_export(run_export, window)
            sample["gas"] = {**(sample.get("gas") or {}), **flows}
        excluded = sample.get("excluded") or {}
        for r, reps in sample["gc"].items():
            skip = set(int(i) for i in excluded.get(r, []))
            for i, rep in enumerate(reps, start=1):
                rep["excluded"] = i in skip
            if len(reps) > MAX_WORKBOOK_REPS:
                warnings.append(f"{sample.get('name')}: R{r} has {len(reps)} GC reps; the workbook has room for {MAX_WORKBOOK_REPS}.")
        result = calculate(common, sample, options)
        result["window"] = sample["window_used"]
        result["gc_source"] = sample.get("gc_source")
        result["gas_source"] = (sample.get("gas") or {}).get("source", "manual")
        result["gas_flows"] = {k: (sample.get("gas") or {}).get(k) for k in ("fi01", "nml", "operating", "rows", "start", "end")}
        result["views"] = build_views(common, sample, result, options)
        results.append(result)

    trend = [{"sample": res["sample"], **row} for res in results for row in res["summary"]["rows"]]
    return {"results": results, "trend": trend, "gc_map": gc_map, "info": info, "warnings": warnings,
            "zmb_suggestion": _zmb_argon_suggestion(imports), "calculated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


def _zmb_argon_suggestion(imports):
    """Average ESTD_Argon of the reactor streams in the ZMB export: a suggestion for Gas!I35."""
    if not imports.get("zmb_path"):
        return None
    export = load_export(imports["zmb_path"])
    values = [r["estd"].get("Argon") for r in export["rows"] if r["estd"] and r["stream"] not in (None, 0)]
    return avg(values)
