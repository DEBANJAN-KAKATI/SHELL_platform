"""Operating data from several exports (6.12.0, Reforming).

The rig's server writes a new GC / operating export (.txt, e.g. "Result (34).txt", "Result (10).txt") again and again,
each covering a different, overlapping stretch of the run. Instead of copy-pasting them into one file, the dashboard
reads every export in a folder (or a list of files), keeps one line per operating record and writes one merged .txt
that the Online Analysis page, the Base table and the reactor calculation read as before.

Rules (checked on Result_3 / _10 / _24_1 / _33 / _34_1 / _34_1_2 of run 19):
- A file is an export when its header has "Date/Time" and "GC Date/Time"; other .txt files are listed and skipped.
- One line per operating record (its Date/Time); a GC-only row (no Date/Time) once per GC Date/Time, and not at all when
  an operating line has the same injection (GC Date/Time within GC_SAME_S seconds).
- The same line in several files: the copy whose numbers can be read wins. Some exports have locale-damaged numbers
  ("18.501.102" for 18.501102, "699.508" barg for 6.99508); a copy with more such values loses. Then: GC areas present,
  Sampled_reactor 1-8 filled, more numeric cells, newer file.
- Sampled_reactor 0 / blank on the chosen copy takes a 1-8 label of another copy of the same line (hand-filled exports).
- Rows are sorted by GC Date/Time (a row without it by its Date/Time).
- The report lists files, lines used per file, duplicates, unreadable copies, gaps between lines and lines that disagree.
"""

import hashlib
import re
from datetime import datetime
from pathlib import Path

from backend.reforming.operating import _read_frame
from backend.reforming.reactor_calc import parse_time, reactor_id

BASE = Path(__file__).resolve().parents[2]
MERGED_DIR = BASE / "data" / "operating_merged"
REQUIRED = ("Date/Time", "GC Date/Time")
GC_SAME_S = 5                     # GC Date/Time this close = the same injection
GAP_H = 4.0                       # a pause between lines longer than this is reported
DAMAGED = re.compile(r"^[-+]?\d{1,3}(\.\d{3}){2,}(\.\d+)?$|^[-+]?\d+\.\d+\.\d")   # 18.501.102, 16.083.333.492.279 (2+ dots)
NUMBER = re.compile(r"^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$")


def _fmt(when):
    return when.strftime("%d.%m.%Y %H:%M:%S") if when else ""


def operating_files(source):
    """Paths of a folder's .txt files (newest last) or of the listed files; source = folder, file, or list / ';'-text."""
    if isinstance(source, (list, tuple)):
        items = [str(s).strip().strip('"') for s in source]
    else:
        items = [s.strip().strip('"') for s in str(source or "").split(";")]
    items = [s for s in items if s]
    if not items:
        raise ValueError("Choose the folder with the operating data exports (.txt) or the .txt files.")
    paths = []
    for item in items:
        path = Path(item)
        if path.is_dir():
            paths += sorted((p for p in path.iterdir() if p.is_file() and p.suffix.lower() == ".txt"),
                            key=lambda p: (p.stat().st_mtime, p.name))
        elif path.is_file():
            paths.append(path)
        else:
            raise ValueError(f"Not found: {item}")
    if not paths:
        raise ValueError("No .txt files in the chosen folder.")
    unique, seen = [], set()
    for path in paths:
        key = str(path.resolve())
        if key not in seen and not str(path.resolve()).startswith(str(MERGED_DIR.resolve())):
            seen.add(key)
            unique.append(path)
    return unique


def _quality(row, columns):
    damaged = numeric = 0
    for column in columns:
        text = str(row.get(column, "")).strip()
        if not text:
            continue
        if DAMAGED.match(text):
            damaged += 1
        elif NUMBER.match(text):
            numeric += 1
    has_areas = bool(str(row.get("Area_H2", "")).strip() and str(row.get("Area_N2", "")).strip())
    labelled = reactor_id(row.get("Sampled_reactor")) not in ("", "R0")
    return damaged, has_areas, labelled, numeric


def merge(source):
    """{columns, rows, report} of all exports of a folder / list of files."""
    files = operating_files(source)
    columns, versions, report_files = [], {}, []
    for order, path in enumerate(files):
        info = {"file": path.name, "path": str(path), "modified": datetime.fromtimestamp(path.stat().st_mtime).strftime("%d.%m.%Y %H:%M"),
                "rows": 0, "lines": 0, "gc_only": 0, "damaged_rows": 0, "used": 0, "first": "", "last": "", "skipped": ""}
        report_files.append(info)
        try:
            _, frame = _read_frame(path)
        except ValueError as error:
            info["skipped"] = str(error)
            continue
        if not all(name in frame.columns for name in REQUIRED):
            info["skipped"] = "not an operating export (no Date/Time and GC Date/Time columns)"
            continue
        for column in frame.columns:
            if column not in columns:
                columns.append(column)
        numeric_columns = [c for c in frame.columns if c not in REQUIRED and not c.startswith("Name_")]
        times = []
        for record in frame.to_dict(orient="records"):
            row = {c: str(v).strip() for c, v in record.items()}
            when, gc = parse_time(row.get("Date/Time")), parse_time(row.get("GC Date/Time"))
            if when is None and gc is None:
                continue                                   # blank / separator row
            info["rows"] += 1
            info["lines" if when else "gc_only"] += 1
            damaged, has_areas, labelled, numeric = _quality(row, numeric_columns)
            info["damaged_rows"] += 1 if damaged else 0
            times.append(gc or when)
            key = ("line", when) if when else ("gc", gc)
            versions.setdefault(key, []).append({
                "row": row, "when": when, "gc": gc, "file": info, "order": order,
                "score": (-damaged, has_areas, labelled, numeric, path.stat().st_mtime, order),
            })
        if times:
            info["first"], info["last"] = _fmt(min(times)), _fmt(max(times))

    chosen, duplicates, labels_copied, conflicts, damaged_only = [], 0, 0, [], []
    for key, copies in versions.items():
        copies.sort(key=lambda c: c["score"], reverse=True)
        best = copies[0]
        duplicates += len(copies) - 1
        row = dict(best["row"])
        if reactor_id(row.get("Sampled_reactor")) in ("", "R0"):
            label = next((c["row"].get("Sampled_reactor") for c in copies[1:]
                          if reactor_id(c["row"].get("Sampled_reactor")) not in ("", "R0") and c["gc"] == best["gc"]), None)
            if label is not None:
                row["Sampled_reactor"] = label
                labels_copied += 1
        gcs = sorted({c["gc"] for c in copies if c["gc"]})
        if len(gcs) > 1:
            conflicts.append(f"{_fmt(best['when'])}: GC Date/Time {', '.join(_fmt(g) for g in gcs)} in different files – "
                             f"{_fmt(best['gc'])} kept (from {best['file']['file']})")
        if best["score"][0] < 0:
            damaged_only.append(_fmt(best["when"] or best["gc"]))
        best["file"]["used"] += 1
        chosen.append({"row": row, "when": best["when"], "gc": best["gc"], "kind": key[0]})

    # a GC-only row of an injection that an operating line already has is the same result twice
    line_gcs = sorted(c["gc"] for c in chosen if c["kind"] == "line" and c["gc"])
    def has_line(gc):
        return any(abs((gc - g).total_seconds()) <= GC_SAME_S for g in line_gcs)
    gc_only_dropped = [c for c in chosen if c["kind"] == "gc" and c["gc"] and has_line(c["gc"])]
    chosen = [c for c in chosen if c not in gc_only_dropped]
    chosen.sort(key=lambda c: (c["gc"] or c["when"], c["when"] or c["gc"]))

    lines = [c for c in chosen if c["kind"] == "line"]
    gaps = []
    for previous, current in zip(lines, lines[1:]):
        a, b = previous["gc"] or previous["when"], current["gc"] or current["when"]
        if (b - a).total_seconds() / 3600 > GAP_H:
            gaps.append({"from": _fmt(a), "to": _fmt(b), "hours": round((b - a).total_seconds() / 3600, 1)})
    gc_only = [c for c in chosen if c["kind"] == "gc"]
    report = {
        "files": report_files,
        "files_used": sum(1 for f in report_files if f["used"]),
        "lines": len(lines), "gc_only_rows": len(gc_only),
        "first": _fmt(lines[0]["gc"] or lines[0]["when"]) if lines else "",
        "last": _fmt(lines[-1]["gc"] or lines[-1]["when"]) if lines else "",
        "duplicates_removed": duplicates + len(gc_only_dropped),
        "labels_copied": labels_copied,
        "gc_only_same_injection": [_fmt(c["gc"]) for c in gc_only_dropped],
        "gc_only_kept": [_fmt(c["gc"]) for c in gc_only],
        "conflicts": conflicts,
        "damaged_only": damaged_only,
        "gaps": gaps,
    }
    return {"columns": columns, "rows": [c["row"] for c in chosen], "report": report}


def merged_path(source):
    """Stable file for a source (the same folder → the same merged file, so a re-merge replaces it)."""
    text = ";".join(sorted(str(Path(s).resolve()) for s in (source if isinstance(source, (list, tuple)) else str(source).split(";")) if str(s).strip()))
    first = Path(str(source[0] if isinstance(source, (list, tuple)) else str(source).split(";")[0]).strip().strip('"'))
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", first.stem if first.is_file() else first.name).strip("_")[:40] or "operating"
    return MERGED_DIR / f"Operating_merged_{slug}_{hashlib.sha1(text.encode('utf-8')).hexdigest()[:8]}.txt"


def merge_to_file(source, out_path=None):
    result = merge(source)
    out = Path(out_path) if out_path else merged_path(source)
    out.parent.mkdir(parents=True, exist_ok=True)
    columns = result["columns"]
    lines = ["\t".join(columns)] + ["\t".join(str(row.get(c, "")) for c in columns) for row in result["rows"]]
    # the GC's own encoding (Windows-1252, "ÿ" as its empty marker), Windows line ends as the exports
    out.write_bytes("\r\n".join(lines).encode("cp1252", errors="replace"))
    result["report"]["merged_file"] = str(out)
    return result
