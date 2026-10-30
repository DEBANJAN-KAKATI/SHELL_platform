"""Read the online GC/operating .txt exports (ZMB export: 152 columns, run export: 161 columns).

Columns are found by header name, never by position. Quirks of the export (checked on both files):
- 'ÿ' (0xFF) means "no value"; gases that are not configured have it in all five fields.
- C6 Above is shifted: Conc_ is empty, ESTD_ holds the normalised value and Area_ holds the raw ESTD.
- Conc_C8 Unknowns holds the GC raw total, not a component; ESTD_C8 Unknowns is 0.
- m-Xylene can have Conc 0 with ESTD > 0, so ESTD (raw mol%) is what the workbook uses.
"""
import csv
from datetime import datetime
from pathlib import Path

NO_VALUE = "\xff"
DATE_FORMAT = "%d.%m.%Y %H:%M:%S"
FLOW_TAGS = [f"01i14FIC0{r}" for r in range(1, 9)]
OP_TAGS = ["10i1TIC02", "10i2TIC02", "10i1PIC01", "10i2PIC01", *FLOW_TAGS, "01i14FI01"]


def _number(text):
    text = (text or "").strip()
    if not text or text == NO_VALUE:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _date(text):
    text = (text or "").strip()
    if not text or text == NO_VALUE:
        return None
    return datetime.strptime(text, DATE_FORMAT)


def iso(value):
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None


def read_export(path):
    """Return {kind, file, gases, rows, warnings}. Each row: time, gc_time, stream, op{tag}, estd{gas}, conc{gas}, gc_total."""
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"File not found: {path}")
    if path.suffix.lower() != ".txt":
        raise ValueError("The online export must be a tab-separated .txt file.")
    with open(path, encoding="latin-1", newline="") as handle:
        table = list(csv.reader(handle, delimiter="\t"))
    if not table:
        raise ValueError(f"{path.name} is empty.")
    header = [h.strip() for h in table[0]]
    index = {name: i for i, name in enumerate(header)}
    for required in ("Date/Time", "Sampled_reactor", "GC Date/Time"):
        if required not in index:
            raise ValueError(f"{path.name} is missing the column '{required}'.")
    gases = [h[5:] for h in header if h.startswith("Name_")]
    kind = "run" if "01i14FI01" in index else "zmb"
    warnings = []

    def cell(row, name):
        i = index.get(name)
        return row[i] if i is not None and i < len(row) else ""

    rows = []
    for line_no, row in enumerate(table[1:], start=2):
        if not any(c.strip() for c in row):
            continue
        try:
            op_time, gc_time = _date(cell(row, "Date/Time")), _date(cell(row, "GC Date/Time"))
        except ValueError:
            warnings.append(f"Line {line_no}: date is not DD.MM.YYYY HH:MM:SS, row skipped.")
            continue
        stream = _number(cell(row, "Sampled_reactor"))
        estd, conc = {}, {}
        for gas in gases:
            if gas == "C6 Above":
                estd[gas] = _number(cell(row, "Area_C6 Above"))
                conc[gas] = _number(cell(row, "ESTD_C6 Above"))
            else:
                estd[gas] = _number(cell(row, f"ESTD_{gas}"))
                conc[gas] = _number(cell(row, f"Conc_{gas}"))
        gc_total = conc.pop("C8 Unknowns", None) if "C8 Unknowns" in conc else None
        has_gc = any(v is not None for g, v in estd.items())
        rows.append({
            "line": line_no,
            "time": iso(op_time),
            "gc_time": iso(gc_time),
            "stream": int(stream) if stream is not None else None,
            "op": {tag: _number(cell(row, tag)) for tag in OP_TAGS if tag in index} if op_time else {},
            "estd": estd if has_gc else {},
            "conc": conc if has_gc else {},
            "gc_total": gc_total if has_gc else None,
        })
    if not rows:
        raise ValueError(f"{path.name} has no data rows.")
    streams, orphans = {}, 0
    for row in rows:
        if row["estd"] and row["stream"] is not None:
            streams[row["stream"]] = streams.get(row["stream"], 0) + 1
        elif row["estd"]:
            orphans += 1
    if orphans:
        warnings.append(f"{orphans} GC result(s) have no Sampled_reactor (operating data missing on that line) and are not used.")
    return {
        "kind": kind,
        "file": path.name,
        "path": str(path),
        "gases": gases,
        "columns": len(header),
        "rows": rows,
        "streams": {str(k): v for k, v in sorted(streams.items())},
        "first_gc": next((r["gc_time"] for r in rows if r["estd"]), None),
        "last_gc": next((r["gc_time"] for r in reversed(rows) if r["estd"]), None),
        "warnings": warnings,
    }
