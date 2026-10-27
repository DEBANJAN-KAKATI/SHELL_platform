import re
import olefile
import xlrd
from datetime import datetime
import pandas as pd

from backend.calculations.constants import *
from backend.validators.values import clean_numeric_value, normalize_header
from backend.calculations.component_category import build_component_category

DT = re.compile(r"S1_\d+_(\d{4}-\d{2}-\d{2})\s+(\d{2})-(\d{2})-(\d{2})")

UID = re.compile(r"([A-Za-z0-9]+_C\d+_S\d+_\d+)_\d{4}-\d{2}-\d{2}")


def open_xls(path):
    with olefile.OleFileIO(str(path)) as ole:
        stream = (
            "Workbook"
            if ole.exists("Workbook")
            else "Book"
            if ole.exists("Book")
            else None
        )

        if not stream:
            raise ValueError("Workbook/Book OLE stream not found")

        raw = ole.openstream(stream).read()

    return xlrd.open_workbook(file_contents=raw, ignore_workbook_corruption=True)


def extract_metadata(workbook):

    if HEADER_SHEET not in workbook.sheet_names():
        raise ValueError("HEADER worksheet not found")

    header_sheet = workbook.sheet_by_name(HEADER_SHEET)

    date_value = header_sheet.cell_value(1, 1)
    metadata_text = str(header_sheet.cell_value(5, 1)).strip()

    uid_match = UID.search(metadata_text)

    if not uid_match:
        raise ValueError("UID pattern not found in HEADER!B6")

    if isinstance(date_value, datetime):
        dt = date_value
    elif isinstance(date_value, (int, float)) and not isinstance(date_value, bool):
        try:
            dt = xlrd.xldate.xldate_as_datetime(date_value, workbook.datemode)
        except (AttributeError, TypeError, ValueError):
            dt = None
    else:
        date_text = str(date_value).strip()
        dt = None
        for pattern in (
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d/%m/%Y",
            "%d/%m/%Y %I:%M:%S %p",
            "%d/%m/%Y %I:%M %p",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d",
            "%Y-%m-%d %I:%M:%S %p",
            "%Y-%m-%d %I:%M %p",
            "%d-%m-%Y %H:%M:%S",
            "%d-%m-%Y %H:%M",
            "%d-%m-%Y",
            "%d-%m-%Y %I:%M:%S %p",
            "%d-%m-%Y %I:%M %p",
        ):
            try:
                dt = datetime.strptime(date_text, pattern)
                break
            except ValueError:
                continue

        if dt is None:
            try:
                dt = pd.to_datetime(
                    date_text, dayfirst=True, errors="raise"
                ).to_pydatetime()
            except (TypeError, ValueError) as exc:
                raise ValueError("DateTime value not found in HEADER!B2") from exc

    return (uid_match.group(1), dt.strftime("%d/%m/%Y %H:%M"))


def canonical_header(value):

    header = normalize_header(value)

    text = (
        str(header).strip().upper().replace(" ", "").replace("-", "").replace("_", "")
    )

    aliases = {
        "PARAFFIN": "Paraffin",
        "PARAFFINS": "Paraffin",
        "IPARAFFINS": "I-Paraffins",
        "ISOPARAFFINS": "I-Paraffins",
        "AROMATIC": "Aromatics",
        "AROMATICS": "Aromatics",
        "NAPHTHENE": "Naphthenes",
        "NAPHTHENES": "Naphthenes",
        "OLEFIN": "Olefins",
        "OLEFINS": "Olefins",
        "UNKNOWN": "Unknown",
        "UNKNOWNS": "Unknown",
        "UNIDENTIFIED": "Unknown",
        "CARBON#": "CARBON#",
        "CARBON": "CARBON#",
    }

    return aliases.get(text, header)


def extract(path):

    workbook = open_xls(path)

    uid, dt = extract_metadata(workbook)

    if CARBON_SHEET not in workbook.sheet_names():
        raise ValueError(f"{CARBON_SHEET} worksheet not found")

    sheet = workbook.sheet_by_name(CARBON_SHEET)

    # K21 = row 20, column 10 (zero-based)
    try:
        unknowns_value = clean_numeric_value(sheet.cell_value(20, 10))
    except Exception:
        unknowns_value = None

    header_row = None
    column_index = None

    for r in range(min(sheet.nrows, 15)):
        headers = [canonical_header(sheet.cell_value(r, c)) for c in range(sheet.ncols)]

        current = {h: c for c, h in enumerate(headers) if h}

        if "CARBON#" in current and any(
            comp in current
            for comp in [
                "Paraffin",
                "I-Paraffins",
                "Aromatics",
                "Naphthenes",
                "Olefins",
            ]
        ):
            header_row = r
            column_index = current
            break

    if header_row is None:
        raise ValueError("Carbon table header row not found")

    required = [
        "CARBON#",
        "Paraffin",
        "I-Paraffins",
        "Aromatics",
        "Naphthenes",
        "Olefins",
    ]

    missing = [x for x in required if x not in column_index]

    if missing:
        raise ValueError(f"Missing required headers: {missing}")

    components = [
        "Paraffin",
        "I-Paraffins",
        "Aromatics",
        "Naphthenes",
        "Olefins",
        "Unknown",
    ]

    results = []

    for component in components:
        row = {
            "File Name": path.name,
            "UID": uid,
            "DateTime": dt,
            "Component": component,
            "Unknowns": unknowns_value,
        }

        row.update({f"C{n}": None for n in range(1, 16)})

        if component in column_index:
            for r in range(header_row + 1, sheet.nrows):
                carbon = clean_numeric_value(
                    sheet.cell_value(r, column_index["CARBON#"])
                )

                if carbon is not None and int(carbon) in range(1, 16):
                    row[f"C{int(carbon)}"] = clean_numeric_value(
                        sheet.cell_value(r, column_index[component])
                    )

        results.append(row)

    return results


def extract_component_list(path):

    workbook = open_xls(path)

    uid, dt = extract_metadata(workbook)

    sheet_name = "COMPONENT_LIST"

    if sheet_name not in workbook.sheet_names():
        raise ValueError("COMPONENT_LIST worksheet not found")

    sheet = workbook.sheet_by_name(sheet_name)

    header_row = None
    column_map = None

    for r in range(min(sheet.nrows, 30)):
        headers = {str(sheet.cell_value(r, c)).strip(): c for c in range(sheet.ncols)}

        if {"COMPONENT", "%WGT", "CARBON#"}.issubset(headers):
            header_row = r
            column_map = headers
            break

    if header_row is None:
        raise ValueError("COMPONENT_LIST headers not found")

    records = []

    for r in range(header_row + 1, sheet.nrows):
        component = str(sheet.cell_value(r, column_map["COMPONENT"])).strip()

        if not component:
            continue

        records.append(
            {
                "COMPONENT": component,
                "%WGT": sheet.cell_value(r, column_map["%WGT"]),
                "CARBON#": sheet.cell_value(r, column_map["CARBON#"]),
                # Retention index decides the Unidentified group (industrial format)
                "RI": sheet.cell_value(r, column_map["RI"]) if "RI" in column_map else None,
            }
        )

    df = pd.DataFrame(records, columns=["COMPONENT", "%WGT", "CARBON#", "RI"])

    values = build_component_category(df)

    return {"File Name": path.name, "UID": uid, "DateTime": dt, **values}


def extract_sample_properties(workbook):
    """Sample properties used by the Yield CSV export (industrial sheet columns BS:BX).

    Carbon, Hydrogen and Molecular Weight come from PHYSICAL_PROPERTIES; Specific
    Gravity is the sum of COMPONENT_LIST AVERAGE_SG. Missing values are None.
    """
    props = {"Carbon": None, "Hydrogen": None, "Molecular Weight": None, "Specific Gravity": None}
    names = workbook.sheet_names()

    if "PHYSICAL_PROPERTIES" in names:
        sheet = workbook.sheet_by_name("PHYSICAL_PROPERTIES")
        labels = {
            "CARBON (%WGT)": "Carbon",
            "HYDROGEN (%WGT)": "Hydrogen",
            "AVG MW": "Molecular Weight",
        }
        for row in range(sheet.nrows):
            if sheet.ncols < 2:
                break
            key = labels.get(str(sheet.cell_value(row, 0)).strip().upper())
            if key:
                props[key] = clean_numeric_value(sheet.cell_value(row, 1))

    if "COMPONENT_LIST" in names:
        sheet = workbook.sheet_by_name("COMPONENT_LIST")
        for header_row in range(min(sheet.nrows, 30)):
            headers = [str(sheet.cell_value(header_row, c)).strip().upper() for c in range(sheet.ncols)]
            if "AVERAGE_SG" in headers:
                col = headers.index("AVERAGE_SG")
                values = [
                    clean_numeric_value(sheet.cell_value(r, col))
                    for r in range(header_row + 1, sheet.nrows)
                ]
                values = [v for v in values if v is not None]
                props["Specific Gravity"] = sum(values) if values else None
                break

    return props


def extract_octane(path):
    """Extract per-file octane values from OCTANE_NUMBERS!B1:B4.

    Output fields are File Name, UID, DateTime, Lin-RON, Lin-MON, Cal-RON,
    and Cal-MON. Blank or nonnumeric cells are returned as None. The sample
    properties (Carbon, Hydrogen, Molecular Weight, Specific Gravity) ride along
    on the same row for the Yield CSV export; Table-3 does not display them.
    """
    workbook = open_xls(path)
    uid, dt = extract_metadata(workbook)
    sheet_name = "OCTANE_NUMBERS"
    if sheet_name not in workbook.sheet_names():
        raise ValueError("OCTANE_NUMBERS worksheet not found")
    sheet = workbook.sheet_by_name(sheet_name)
    if sheet.nrows < 4 or sheet.ncols < 2:
        raise ValueError("Required range OCTANE_NUMBERS!B1:B4 is incomplete")
    fields = ("Lin-RON", "Lin-MON", "Cal-RON", "Cal-MON")
    values = [clean_numeric_value(sheet.cell_value(row, 1)) for row in range(4)]
    return {
        "File Name": path.name,
        "UID": uid,
        "DateTime": dt,
        **dict(zip(fields, values)),
        **extract_sample_properties(workbook),
    }
