"""Operating data for the reforming "Export Complete" CSV.

The Online Analysis parser drops the Name_/Conc_/Area_/RT_ columns, so the online
.txt file is read again here. Columns that hold error data in any row (the GC empty
marker, error text, Excel error codes, NaN) or are blank in every row are left out,
the same rule as the Yield "Online Analysis" export. Values stay as written in the file.

Column order: the operating tags (Date/Time up to the column before GC Date/Time),
then the ESTD_ columns, then the remaining valid columns in file order.
"""

import re
from pathlib import Path

import pandas as pd

EXCEL_ERROR = re.compile(r"^#(N/A|VALUE!|DIV/0!|REF!|NAME\?|NUM!|NULL!)", re.IGNORECASE)


def _is_error(text):
    text = str(text).strip()
    return "ÿ" in text or "error" in text.lower() or bool(EXCEL_ERROR.match(text)) or text.lower() == "nan"


def read_operating_file(file_path):
    path = Path(str(file_path or ""))
    if not path.is_file():
        raise ValueError("Operating data file not found. Load it on the Online Analysis page first.")
    if path.suffix.lower() != ".txt":
        raise ValueError("Operating data must be the tab-delimited .txt file used on the Online Analysis page.")
    try:
        frame = pd.read_csv(path, sep="\t", dtype=str, keep_default_na=False, encoding="mbcs")
    except (LookupError, UnicodeDecodeError):
        frame = pd.read_csv(path, sep="\t", dtype=str, keep_default_na=False, encoding="utf-8-sig")
    frame.columns = [str(column).strip() for column in frame.columns]
    for required in ("Date/Time", "GC Date/Time"):
        if required not in frame.columns:
            raise ValueError(f"Operating data file is missing column: {required}")

    valid = [
        column for column in frame.columns
        if not any(_is_error(value) for value in frame[column])
        and any(str(value).strip() for value in frame[column])
    ]
    names = list(frame.columns)
    tags = names[names.index("Date/Time"): names.index("GC Date/Time")]
    operating = [column for column in tags if column in valid]
    estd = [column for column in valid if column.startswith("ESTD_") and column not in operating]
    others = [column for column in valid if column not in operating and column not in estd]
    columns = operating + estd + others

    rows = [
        {column: str(record.get(column, "")).strip() for column in columns + ["GC Date/Time"]}
        for record in frame.to_dict(orient="records")
    ]
    return {
        "columns": columns,
        "rows": rows,
        "dropped_columns": [column for column in names if column not in valid],
        "source_file": str(path),
    }
