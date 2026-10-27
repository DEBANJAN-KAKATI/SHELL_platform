"""Read a reforming DHA workbook (.XLS, Hydrocarbon Expert export).

Self-contained on purpose: it does not import the isomerization loader, so either
process can change its reader without affecting the other.

Two HEADER layouts are accepted:
  * Hydrocarbon Expert 5.x (reforming): label/value rows such as
    INJECTION_TIME_DATE = 'OCT 09, 2026 - 12:39:52' and SAMPLE_ID = 'B00010852001'.
  * The isomerization layout: HEADER!B2 = date/time, HEADER!B6 contains the UID.
"""

import re
from datetime import datetime

import olefile
import pandas as pd
import xlrd

from backend.reforming.unknowns import assign_unknown_carbon_numbers, given_carbon, is_unidentified

CARBON_SHEET = "CARBON_TABULAR(%WGT)"
COMPONENT_SHEET = "COMPONENT_LIST"
CARBON_NUMBERS = range(1, 16)

# CARBON_TABULAR header -> family name used in the reforming table (image order is
# Paraffins, Iso Paraffins, Naphthenes, Aromatics, Olefins, Unknowns).
FAMILY_HEADERS = {
    "PARAFFIN": "Paraffins",
    "PARAFFINS": "Paraffins",
    "IPARAFFINS": "Iso Paraffins",
    "IPARAFFIN": "Iso Paraffins",
    "ISOPARAFFINS": "Iso Paraffins",
    "NAPHTHENES": "Naphthenes",
    "NAPHTHENE": "Naphthenes",
    "AROMATICS": "Aromatics",
    "AROMATIC": "Aromatics",
    "OLEFINS": "Olefins",
    "OLEFIN": "Olefins",
    "OXYGENATES": "Oxygenates",
    "PLUS": "Plus",
}
FAMILIES = ["Paraffins", "Iso Paraffins", "Naphthenes", "Aromatics", "Olefins", "Unknowns"]
# Families in CARBON_TABULAR that the reforming table does not show (reported as a check).
EXTRA_FAMILIES = ["Oxygenates", "Plus"]

MISSING = {"", "--", "-", "N/A", "n/a", "NA", "na", "None"}
UID_PATTERN = re.compile(r"([A-Za-z0-9]+_C\d+_S\d+_\d+)_\d{4}-\d{2}-\d{2}")
DATE_PATTERNS = (
    "%b %d, %Y - %H:%M:%S",
    "%b %d, %Y - %H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d.%m.%Y %H:%M:%S",
    "%d.%m.%Y %H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d-%m-%Y %H:%M:%S",
    "%d-%m-%Y %H:%M",
)


def number(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str) and value.strip() in MISSING:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result else None


def open_workbook(path):
    with olefile.OleFileIO(str(path)) as ole:
        stream = "Workbook" if ole.exists("Workbook") else "Book" if ole.exists("Book") else None
        if not stream:
            raise ValueError("Workbook/Book OLE stream not found")
        raw = ole.openstream(stream).read()
    return xlrd.open_workbook(file_contents=raw, ignore_workbook_corruption=True)


def _parse_date(value, datemode):
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0:
        try:
            return xlrd.xldate.xldate_as_datetime(value, datemode)
        except (TypeError, ValueError):
            return None
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return None
    for pattern in DATE_PATTERNS:
        try:
            return datetime.strptime(text.title() if pattern.startswith("%b") else text, pattern)
        except ValueError:
            continue
    try:
        return pd.to_datetime(text, dayfirst=True, errors="raise").to_pydatetime()
    except (TypeError, ValueError):
        return None


def read_metadata(workbook, path):
    """Return (UID, 'dd/mm/YYYY HH:MM') for the sample."""
    if "HEADER" not in workbook.sheet_names():
        raise ValueError("HEADER worksheet not found")
    sheet = workbook.sheet_by_name("HEADER")
    labels = {}
    for row in range(sheet.nrows):
        if sheet.ncols < 2:
            break
        key = str(sheet.cell_value(row, 0)).strip().upper()
        if key:
            labels.setdefault(key, sheet.cell_value(row, 1))

    stamp = None
    for key in ("INJECTION_TIME_DATE", "INJECTION_DATE_TIME", "INJECTION_TIME"):
        if key in labels:
            stamp = _parse_date(labels[key], workbook.datemode)
            if stamp:
                break
    if stamp is None and sheet.nrows > 1 and sheet.ncols > 1:
        stamp = _parse_date(sheet.cell_value(1, 1), workbook.datemode)
    if stamp is None:
        raise ValueError("Injection date/time not found in HEADER")

    uid = str(labels.get("SAMPLE_ID", "") or "").strip()
    match = UID_PATTERN.search(uid)
    if match:  # 'R18_C1_S1_004_2026-10-12 19-5' (SAMPLE_ID is cut at 29 chars)
        uid = match.group(1)
    if not uid and sheet.nrows > 5 and sheet.ncols > 1:
        match = UID_PATTERN.search(str(sheet.cell_value(5, 1)))
        uid = match.group(1) if match else ""
    return uid or path.stem, stamp.strftime("%d/%m/%Y %H:%M")


def read_carbon_tabular(workbook):
    """Family x Carbon# wt% from CARBON_TABULAR(%WGT) plus the sheet's UNKNOWNS total."""
    if CARBON_SHEET not in workbook.sheet_names():
        raise ValueError(f"{CARBON_SHEET} worksheet not found")
    sheet = workbook.sheet_by_name(CARBON_SHEET)

    header_row, columns = None, {}
    for row in range(min(sheet.nrows, 20)):
        found = {}
        for col in range(sheet.ncols):
            key = re.sub(r"[\s_\-]", "", str(sheet.cell_value(row, col))).upper()
            if key in ("CARBON#", "CARBON"):
                found["CARBON#"] = col
            elif key in FAMILY_HEADERS:
                found[FAMILY_HEADERS[key]] = col
        if "CARBON#" in found and len(found) > 1:
            header_row, columns = row, found
            break
    if header_row is None:
        raise ValueError("Carbon table header row not found")

    table = {family: {n: 0.0 for n in CARBON_NUMBERS} for family in FAMILIES + EXTRA_FAMILIES}
    unknowns_total = None
    for row in range(header_row + 1, sheet.nrows):
        values = [sheet.cell_value(row, col) for col in range(sheet.ncols)]
        labels = [str(v).strip().upper() for v in values]
        if "UNKNOWNS" in labels:
            index = labels.index("UNKNOWNS")
            unknowns_total = next((number(v) for v in values[index + 1:] if number(v) is not None), None)
            continue
        carbon = number(values[columns["CARBON#"]])
        if carbon is None or int(carbon) != carbon or int(carbon) not in CARBON_NUMBERS:
            continue
        for family, col in columns.items():
            if family == "CARBON#":
                continue
            table[family][int(carbon)] = number(values[col]) or 0.0
    return table, unknowns_total


def read_component_list(workbook):
    """Peaks in elution order: TIME, RI, GROUP, CARBON#, COMPONENT, %WGT."""
    if COMPONENT_SHEET not in workbook.sheet_names():
        raise ValueError(f"{COMPONENT_SHEET} worksheet not found")
    sheet = workbook.sheet_by_name(COMPONENT_SHEET)
    header_row, columns = None, {}
    for row in range(min(sheet.nrows, 30)):
        headers = {str(sheet.cell_value(row, c)).strip().upper(): c for c in range(sheet.ncols)}
        if {"COMPONENT", "%WGT", "CARBON#"}.issubset(headers):
            header_row, columns = row, headers
            break
    if header_row is None:
        raise ValueError("COMPONENT_LIST headers not found")

    def cell(row, name):
        return sheet.cell_value(row, columns[name]) if name in columns else None

    peaks = []
    for row in range(header_row + 1, sheet.nrows):
        component = str(cell(row, "COMPONENT") or "").strip()
        if not component:
            continue
        peaks.append({
            "row": row + 1,
            "time": number(cell(row, "TIME")),
            "ri": number(cell(row, "RI")),
            "group": str(cell(row, "GROUP") or "").strip(),
            "carbon": number(cell(row, "CARBON#")),
            "component": component,
            "wt": number(cell(row, "%WGT")) or 0.0,
            "mw": number(cell(row, "AVERAGE_MW")),
            "sg": number(cell(row, "AVERAGE_SG")),
        })
    if any(p["time"] is not None for p in peaks):
        peaks.sort(key=lambda p: (p["time"] is None, p["time"] or 0.0, p["row"]))
    return peaks


def read_properties(workbook, peaks):
    """RON, Molecular Weight, Carbon, Hydrogen and Specific Gravity of the sample.

    OCTANE_NUMBERS / PHYSICAL_PROPERTIES are used when the export has them (the online
    DHA template). Otherwise MW and SG are the COMPONENT_LIST sums of AVERAGE_MW and
    AVERAGE_SG; RON, Carbon and Hydrogen stay blank.
    """
    names = workbook.sheet_names()
    props = {"RON": None, "Molecular Weight": None, "Carbon": None, "Hydrogen": None, "Specific Gravity": None}
    sources = {}

    if "OCTANE_NUMBERS" in names:
        sheet = workbook.sheet_by_name("OCTANE_NUMBERS")
        if sheet.ncols >= 2:
            labelled = {}
            for row in range(sheet.nrows):
                labelled[str(sheet.cell_value(row, 0)).strip().upper()] = number(sheet.cell_value(row, 1))
            # Same cells as isomerization Table-3: B1 Lin-RON, B2 Lin-MON, B3 Cal-RON, B4 Cal-MON
            by_position = [number(sheet.cell_value(r, 1)) for r in range(min(sheet.nrows, 4))]
            cal_ron = next((v for k, v in labelled.items() if "RON" in k and "CAL" in k), None)
            lin_ron = next((v for k, v in labelled.items() if "RON" in k and "LIN" in k), None)
            if cal_ron is None and len(by_position) >= 3:
                cal_ron = by_position[2]
            if lin_ron is None and by_position:
                lin_ron = by_position[0]
            if cal_ron is not None:
                props["RON"], sources["RON"] = cal_ron, "OCTANE_NUMBERS Cal-RON"
            elif lin_ron is not None:
                props["RON"], sources["RON"] = lin_ron, "OCTANE_NUMBERS Lin-RON"

    if "PHYSICAL_PROPERTIES" in names:
        sheet = workbook.sheet_by_name("PHYSICAL_PROPERTIES")
        labels = {"CARBON (%WGT)": "Carbon", "HYDROGEN (%WGT)": "Hydrogen", "AVG MW": "Molecular Weight"}
        for row in range(sheet.nrows):
            if sheet.ncols < 2:
                break
            key = labels.get(str(sheet.cell_value(row, 0)).strip().upper())
            value = number(sheet.cell_value(row, 1))
            if key and value is not None:
                props[key], sources[key] = value, "PHYSICAL_PROPERTIES"

    if props["Molecular Weight"] is None:
        values = [p["mw"] for p in peaks if p["mw"] is not None]
        if values:
            props["Molecular Weight"], sources["Molecular Weight"] = sum(values), "COMPONENT_LIST sum of AVERAGE_MW"
    values = [p["sg"] for p in peaks if p["sg"] is not None]
    if values:
        props["Specific Gravity"], sources["Specific Gravity"] = sum(values), "COMPONENT_LIST sum of AVERAGE_SG"
    return props, sources


def _split_counted_unknowns(peaks, table, unknowns_total):
    """Drop lumped unknown rows that CARBON_TABULAR already counts in a family.

    Hydrocarbon Expert files "Below C4 Uknowns" under Olefins C4 and leaves it out of
    the sheet's UNKNOWNS total. Such a row is detected only when the peaks would
    otherwise exceed UNKNOWNS and its %WGT equals a family cell at its Carbon#;
    it then stays in that family and is not added to Unknowns a second time.
    """
    lumped = [p for p in peaks if given_carbon(p) is not None]
    if unknowns_total is None or not lumped:
        return peaks, []
    excess = sum(p["wt"] for p in peaks if is_unidentified(p)) - unknowns_total
    skipped, audit = set(), []
    for peak in lumped:
        if excess <= 0.0001:
            break
        carbon = min(max(given_carbon(peak), 1), 15)
        family = next(
            (f for f in FAMILIES[:-1] + EXTRA_FAMILIES
             if peak["wt"] > 0 and abs(table[f][carbon] - peak["wt"]) <= 1e-6 * max(1.0, peak["wt"])),
            None,
        )
        if family is None:
            continue
        skipped.add(id(peak))
        excess -= peak["wt"]
        audit.append({
            "Component": peak["component"],
            "Peak Time (min)": peak["time"],
            "RI": peak["ri"],
            "%WGT": peak["wt"],
            "Previous Identified": "",
            "Next Identified": "",
            "Assigned Carbon#": f"C{carbon}",
            "Basis": f"Already counted by CARBON_TABULAR as {family} C{carbon}; not added to Unknowns",
        })
    return [p for p in peaks if id(p) not in skipped], audit


def extract_reforming_sample(path):
    """One reforming DHA file -> carbon table (with Unknowns by Carbon#), properties, peak audit."""
    workbook = open_workbook(path)
    uid, stamp = read_metadata(workbook, path)
    table, unknowns_total = read_carbon_tabular(workbook)
    peaks = read_component_list(workbook)
    peaks, counted = _split_counted_unknowns(peaks, table, unknowns_total)
    assignments, unknown_by_carbon = assign_unknown_carbon_numbers(peaks)
    assignments.extend(counted)
    table["Unknowns"] = unknown_by_carbon
    props, sources = read_properties(workbook, peaks)

    unknown_sum = sum(unknown_by_carbon.values())
    notes = []
    if unknowns_total is not None and abs(unknown_sum - unknowns_total) > 0.01:
        notes.append(
            f"Unknown peaks sum to {unknown_sum:.4f} wt% but CARBON_TABULAR UNKNOWNS is {unknowns_total:.4f}"
        )
    extra = sum(sum(table[f].values()) for f in EXTRA_FAMILIES)
    if extra > 0.0001:
        notes.append(f"Oxygenates/Plus hold {extra:.4f} wt% (not part of the reforming table)")

    return {
        "File Name": path.name,
        "UID": uid,
        "DateTime": stamp,
        "table": table,
        "unknowns_total": unknowns_total,
        "unknown_sum": unknown_sum,
        "properties": props,
        "property_sources": sources,
        "assignments": assignments,
        "notes": notes,
    }
