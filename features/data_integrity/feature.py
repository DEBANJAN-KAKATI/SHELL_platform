import math
import re
from collections import defaultdict
from datetime import datetime, time, timezone
from pathlib import Path
from statistics import mean, median, quantiles, stdev

from flask import Blueprint, jsonify, request, send_from_directory


data_integrity = Blueprint("data_integrity", __name__)
BASE = Path(__file__).resolve().parent
MINIMUM_VALID_SAMPLES = 3


def parse_date(value, end=False):
    text = str(value or "").strip()
    if not text:
        return datetime.combine(datetime.now().date(), time.max) if end else None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        date_only = len(text) == 10
    except ValueError:
        parsed = None
        date_only = False
        for pattern in (
            "%d/%m/%Y",
            "%d-%m-%Y",
            "%d.%m.%Y",
            "%d/%m/%Y %H:%M:%S",
            "%d-%m-%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d-%m-%Y %H:%M",
        ):
            try:
                parsed = datetime.strptime(text, pattern)
                date_only = "%H" not in pattern
                break
            except ValueError:
                continue
        if parsed is None:
            return None
    if date_only and end:
        parsed = datetime.combine(parsed.date(), time.max, tzinfo=parsed.tzinfo)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def reactor_name(value):
    match = re.fullmatch(
        r"(?:R|Reactor\s*)?([1-8])(?:\.0)?", str(value or "").strip(), re.I
    )
    return f"R{match[1]}" if match else ""


def field(row, names):
    normalized = {
        re.sub(r"[^a-z0-9]", "", str(key).lower()): value for key, value in row.items()
    }
    return next((normalized[name] for name in names if name in normalized), None)


def number(value):
    if value is None or (isinstance(value, str) and not value.strip()):
        return None, "Missing value"
    if isinstance(value, bool):
        return None, "Non-numeric value"
    try:
        result = float(value)
    except (ValueError, TypeError, OverflowError):
        return None, "Non-numeric value"
    return (result, None) if math.isfinite(result) else (None, "Non-finite value")


def relative_standard_deviation(values):
    if len(values) < 2:
        return None
    average = mean(values)
    return 100 * stdev(values) / abs(average) if average != 0 else None


def reproducibility(statistics):
    conditions = defaultdict(dict)
    for group in statistics:
        if group["mean"] is not None:
            conditions[(group["run"], group["condition"], group["parameter"])][
                group["reactor"]
            ] = group["mean"]
    results = []
    for (run, condition, parameter), reactor_means in sorted(conditions.items()):
        block1 = [
            value for reactor, value in reactor_means.items() if int(reactor[1:]) <= 4
        ]
        block2 = [
            value for reactor, value in reactor_means.items() if int(reactor[1:]) >= 5
        ]
        block1_mean = mean(block1) if block1 else None
        block2_mean = mean(block2) if block2 else None
        values = list(reactor_means.values())
        reactor_rsd = relative_standard_deviation(values)
        block_rsd = (
            relative_standard_deviation([block1_mean, block2_mean])
            if block1 and block2
            else None
        )
        notes = []
        if len(values) < 8:
            notes.append(f"Partial reactor coverage ({len(values)}/8)")
        if len(values) < 2:
            notes.append("Reactor RSD needs at least 2 reactors")
        elif reactor_rsd is None:
            notes.append("Reactor mean is zero; RSD undefined")
        if not block1 or not block2:
            notes.append("Block RSD needs both blocks")
        elif block_rsd is None:
            notes.append("Block mean is zero; RSD undefined")
        results.append(
            {
                "run": run,
                "condition": condition,
                "parameter": parameter,
                "reactor_count": len(values),
                "reactor_mean": mean(values),
                "reactor_rsd_pct": reactor_rsd,
                "block1_count": len(block1),
                "block1_mean": block1_mean,
                "block1_reactor_rsd_pct": relative_standard_deviation(block1),
                "block2_count": len(block2),
                "block2_mean": block2_mean,
                "block2_reactor_rsd_pct": relative_standard_deviation(block2),
                "block_rsd_pct": block_rsd,
                "reactor_means": reactor_means,
                "rsd_matrix": [
                    {
                        "reactor": first,
                        **{
                            second: relative_standard_deviation(
                                [reactor_means[first], reactor_means[second]]
                            )
                            if first in reactor_means and second in reactor_means
                            else None
                            for second in (f"R{index}" for index in range(1, 9))
                        },
                    }
                    for first in (f"R{index}" for index in range(1, 9))
                ],
                "status": "; ".join(notes) or "Complete (8/8 reactors)",
            }
        )
    return results


def analyze(payload):
    rows = payload.get("rows")
    parameters = payload.get("parameters")
    if not isinstance(rows, list) or not rows or len(rows) > 100000:
        raise ValueError("Provide between 1 and 100000 source rows.")
    if not all(isinstance(row, dict) for row in rows):
        raise ValueError("Source rows must be objects with named columns.")
    if (
        not isinstance(parameters, list)
        or not parameters
        or len(parameters) > 30
        or not all(isinstance(item, str) for item in parameters)
    ):
        raise ValueError("Select between 1 and 30 numeric parameters.")
    parameters = list(dict.fromkeys(parameters))
    threshold = payload.get("threshold", 3.5)
    minimum = MINIMUM_VALID_SAMPLES
    if (
        isinstance(threshold, bool)
        or not isinstance(threshold, (int, float))
        or not math.isfinite(threshold)
        or not 1 <= threshold <= 10
    ):
        raise ValueError("MAD sensitivity must be between 1 and 10.")
    groups = defaultdict(list)
    flags = []
    duplicates = 0
    unassigned = 0
    missing = 0
    invalid = 0
    seen = set()
    run_default = str(payload.get("run") or "Current run")
    reactor_filter = str(payload.get("reactor") or "")
    condition_filter = str(payload.get("condition") or "")
    excluded = 0

    def flag(
        index, run, condition, reactor, stamp, parameter, value, reason, score=None
    ):
        flags.append(
            {
                "row": index + 1,
                "run": run,
                "condition": condition or "Unassigned",
                "reactor": reactor or "Unknown",
                "timestamp": stamp,
                "parameter": parameter,
                "value": value,
                "reason": reason,
                "score": score,
            }
        )

    for index, row in enumerate(rows):
        run = str(field(row, ["runnumber", "runno", "run"]) or run_default)
        reactor = reactor_name(field(row, ["reactor", "reactorid"]))
        stamp = str(field(row, ["datetime", "timestamp", "dateandtime"]) or "")
        date = parse_date(stamp)
        explicit = field(
            row, ["conditionno", "conditionnumber", "condition", "conditionid"]
        )
        condition = str(explicit).strip() if explicit is not None else ""
        if reactor_filter and reactor != reactor_filter:
            excluded += 1
            continue
        reason = None
        if not condition:
            reason = "Missing condition in source table"
        elif (
            isinstance(explicit, bool)
            or condition.upper().startswith("ERROR")
            or condition.casefold()
            in {
                "unassigned",
                "unknown",
                "none",
                "null",
                "nan",
                "inf",
                "infinity",
                "-inf",
                "-infinity",
            }
        ):
            condition = ""
            reason = "Invalid or ambiguous condition in source table"
        if not reactor:
            reason = "Missing or invalid reactor"
        elif not date:
            reason = "Missing or invalid timestamp"
        if condition_filter and condition and condition != condition_filter:
            excluded += 1
            continue
        if reason:
            unassigned += 1
            flag(index, run, condition, reactor, stamp, "-", None, reason)
            continue
        signature = (
            run,
            condition,
            reactor,
            date.isoformat(),
            tuple(repr(row.get(parameter)) for parameter in parameters),
        )
        duplicate = signature in seen
        if duplicate:
            duplicates += 1
            flag(
                index,
                run,
                condition,
                reactor,
                stamp,
                "-",
                None,
                "Duplicate selected measurements; excluded from statistics",
            )
        seen.add(signature)
        for parameter in parameters:
            value, error = number(row.get(parameter))
            if error:
                if error == "Missing value":
                    missing += 1
                else:
                    invalid += 1
                flag(
                    index,
                    run,
                    condition,
                    reactor,
                    stamp,
                    parameter,
                    row.get(parameter),
                    error,
                )
            if not duplicate:
                groups[(run, condition, reactor, parameter)].append(
                    {
                        "row": index + 1,
                        "timestamp": stamp,
                        "time": date.isoformat(),
                        "value": value,
                    }
                )

    statistics = []
    outliers = 0
    for (run, condition, reactor, parameter), records in sorted(groups.items()):
        values = [record["value"] for record in records if record["value"] is not None]
        center = median(values) if values else None
        mad = median(abs(value - center) for value in values) if values else None
        scored = len(values) >= minimum and mad is not None and mad > 0
        state = (
            "Scored"
            if scored
            else "Insufficient samples"
            if len(values) < minimum
            else "Zero MAD; not scored"
        )
        quartiles = (
            quantiles(values, n=4, method="inclusive")
            if len(values) >= 2
            else [center, center, center]
        )
        flagged = 0
        points = []
        for record in records:
            if record["value"] is None:
                continue
            score = (
                0.6744897501960817 * (record["value"] - center) / mad
                if scored
                else None
            )
            is_outlier = scored and abs(score) > threshold
            points.append({**record, "score": score, "outlier": is_outlier})
            if is_outlier:
                flagged += 1
                flag(
                    record["row"] - 1,
                    run,
                    condition,
                    reactor,
                    record["timestamp"],
                    parameter,
                    record["value"],
                    "Potential outlier (within-group modified Z score)",
                    score,
                )
        outliers += flagged
        statistics.append(
            {
                "run": run,
                "condition": condition,
                "reactor": reactor,
                "parameter": parameter,
                "count": len(values),
                "missing_or_invalid": len(records) - len(values),
                "mean": mean(values) if values else None,
                "median": center,
                "std": stdev(values) if len(values) >= 2 else None,
                "min": min(values) if values else None,
                "max": max(values) if values else None,
                "q1": quartiles[0],
                "q3": quartiles[2],
                "mad": mad,
                "outliers": flagged,
                "status": state,
                "points": points,
            }
        )
    return {
        "summary": {
            "source_rows": len(rows),
            "excluded_by_filter": excluded,
            "assigned_rows": len(rows) - excluded - unassigned,
            "unassigned_rows": unassigned,
            "duplicates": duplicates,
            "missing_values": missing,
            "invalid_values": invalid,
            "outlier_values": outliers,
            "groups": len(statistics),
            "unscored_groups": sum(group["status"] != "Scored" for group in statistics),
            "invalid_doe_windows": 0,
        },
        "statistics": statistics,
        "reproducibility": reproducibility(statistics),
        "flags": flags,
        "threshold": threshold,
        "minimum": minimum,
    }


@data_integrity.get("/api/data-integrity/config")
def config():
    return jsonify({"enabled": True})


@data_integrity.post("/api/data-integrity/analyze")
def analyze_request():
    if request.content_length and request.content_length > 20 * 1024 * 1024:
        return jsonify({"error": "Analysis request exceeds 20 MB."}), 413
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Provide a JSON analysis request."}), 400
    try:
        return jsonify(analyze(payload))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@data_integrity.get("/data-integrity")
def page():
    return send_from_directory(BASE, "index.html")


@data_integrity.get("/data-integrity/assets/<path:path>")
def asset(path):
    if path not in {"app.js", "styles.css"}:
        return jsonify({"error": "Unknown feature asset."}), 404
    return send_from_directory(BASE, path)
