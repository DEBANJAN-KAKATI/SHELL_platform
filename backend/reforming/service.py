"""Process a folder of reforming DHA files for the Offline Analysis page.

The response keeps the isomerization /api/process shape (rows, table2_rows,
table3_rows, ...) so the Offline page can show it, and adds the wide
"Reforming CARBON_TABULAR(%WGT)" rows used by the Calculation page.
"""

from datetime import datetime
from pathlib import Path

from backend.reforming.dha_loader import CARBON_NUMBERS, FAMILIES, extract_reforming_sample

PROPERTY_COLUMNS = ["Molecular Weight", "RON", "Carbon", "Hydrogen", "Specific Gravity"]

# Offline Table-1 keeps the isomerization component names so the page filter works.
TABLE1_COMPONENT = {
    "Paraffins": "Paraffin",
    "Iso Paraffins": "I-Paraffins",
    "Aromatics": "Aromatics",
    "Naphthenes": "Naphthenes",
    "Olefins": "Olefins",
    "Unknowns": "Unknown",
}
TABLE2_COLUMNS = [
    "File Name", "UID", "DateTime", "Component", "Peak Time (min)", "RI", "%WGT",
    "Previous Identified", "Next Identified", "Assigned Carbon#", "Basis",
]
TABLE3_COLUMNS = ["File Name", "UID", "DateTime", "TOS(h)", *PROPERTY_COLUMNS]


def reforming_columns():
    """Column keys of the wide table, in image order: family C1..C15 blocks, then totals."""
    return [f"{family} C{n}" for family in FAMILIES for n in CARBON_NUMBERS] + ["Total", *PROPERTY_COLUMNS]


def _timestamp(text):
    try:
        return datetime.strptime(str(text), "%d/%m/%Y %H:%M").timestamp()
    except ValueError:
        return float("inf")


def process_reforming_directory(folder):
    path = Path(folder)
    if not path.exists() or not path.is_dir():
        raise ValueError("Selected folder does not exist or is not a directory.")
    files = sorted(x for x in path.glob("*.xls") if not x.name.startswith("~$"))

    samples, log = [], []
    for file in files:
        try:
            sample = extract_reforming_sample(file)
            samples.append(sample)
            log.append({
                "File Name": file.name,
                "Status": "Success",
                "Message": " | ".join(sample["notes"]),
            })
        except Exception as error:
            log.append({"File Name": file.name, "Status": "Failed", "Message": str(error)})
    samples.sort(key=lambda s: _timestamp(s["DateTime"]))

    first = _timestamp(samples[0]["DateTime"]) if samples else None
    table1, table2, table3, wide = [], [], [], []
    for sample in samples:
        ident = {"File Name": sample["File Name"], "UID": sample["UID"], "DateTime": sample["DateTime"]}
        table = sample["table"]
        for family in FAMILIES:
            values = {f"C{n}": table[family][n] for n in CARBON_NUMBERS}
            table1.append({
                **ident,
                "Component": TABLE1_COMPONENT[family],
                **values,
                "Unknowns": sample["unknowns_total"],
            })
        table2.extend({**ident, **row} for row in sample["assignments"])
        stamp = _timestamp(sample["DateTime"])
        tos = round((stamp - first) / 3600.0, 2) if first not in (None, float("inf")) and stamp != float("inf") else None
        table3.append({**ident, "TOS(h)": tos, **sample["properties"]})

        row = {**ident}
        for family in FAMILIES:
            for n in CARBON_NUMBERS:
                row[f"{family} C{n}"] = table[family][n]
        row["Total"] = sum(table[family][n] for family in FAMILIES for n in CARBON_NUMBERS)
        row.update(sample["properties"])
        row["Unknowns (CARBON_TABULAR)"] = sample["unknowns_total"]
        wide.append(row)

    processed = len(samples)
    return {
        "process": "reforming",
        "rows": table1,
        "table2_rows": table2,
        "table2_columns": TABLE2_COLUMNS,
        "table3_rows": table3,
        "table3_columns": TABLE3_COLUMNS,
        "reforming_rows": wide,
        "reforming_columns": reforming_columns(),
        "processing_log": log,
        "summary": {
            "process": "reforming",
            "files_found": len(files),
            "processed": processed,
            "table1_processed": processed,
            "table2_processed": processed,
            "table3_processed": processed,
            "failed": len(files) - processed,
            "rows": len(table1),
            "table2_rows": len(table2),
            "table3_rows": len(table3),
            "reforming_rows": len(wide),
        },
        "source_directory": str(path),
    }
