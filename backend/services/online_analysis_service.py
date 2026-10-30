from pathlib import Path

import pandas as pd


ONLINE_COLUMNS = [
    "Date/Time",
    "Sampled_reactor",
    "10i1TIC02",
    "10i2TIC02",
    "10i1PIC01",
    "10i2PIC01",
    "01i14FIC01",
    "01i14FIC02",
    "01i14FIC03",
    "01i14FIC04",
    "01i14FIC05",
    "01i14FIC06",
    "01i14FIC07",
    "01i14FIC08",
    "01i14FI01",
    "10i1FIC01",
    "10i1FIC02",
    "10i1FIC03",
    "10i1FIC04",
    "10i2FIC01",
    "10i2FIC02",
    "10i2FIC03",
    "10i2FIC04",
    "ESTD_H2",
    "ESTD_N2",
]


def process_online_file(file_path):
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        raise ValueError("Selected Online Analysis file does not exist.")
    if path.suffix.lower() != ".txt":
        raise ValueError("Online Analysis requires a tab-delimited .txt file.")

    # 'ÿ' (0xFF) is the export's "no value" marker; mbcs exists only on Windows, cp1252 reads the same bytes elsewhere.
    frame = None
    for encoding in ("mbcs", "cp1252", "utf-8-sig"):
        try:
            frame = pd.read_csv(path, delimiter="\t", encoding=encoding, na_values=["\xff"])
            break
        except (LookupError, UnicodeDecodeError):
            continue
    if frame is None:
        raise ValueError("Online Analysis file could not be decoded.")

    if "Date/Time" not in frame.columns:
        raise ValueError("Online Analysis file is missing column: Date/Time")

    frame = frame.copy()
    try:
        frame["Date/Time"] = pd.to_datetime(
            frame["Date/Time"], format="%d.%m.%Y %H:%M:%S"
        )
    except (TypeError, ValueError) as error:
        raise ValueError(
            "Date/Time values must use the format DD.MM.YYYY HH:MM:SS."
        ) from error

    frame = frame.sort_values(
        "Date/Time", kind="stable", na_position="last"
    ).reset_index(drop=True)
    frame = frame.rename(columns={"Date/Time": "DateTime"})
    if "Sampled_reactor" in frame.columns:
        frame = frame.rename(columns={"Sampled_reactor": "Reactor"})
    frame["DateTime"] = frame["DateTime"].dt.strftime("%Y-%m-%d %H:%M:%S")
    # Cast to object first; otherwise float columns keep NaN, which is invalid JSON.
    frame = frame.astype(object).where(pd.notna(frame), None)

    excluded_prefixes = ("Conc", "RT", "Name", "Area")
    columns = [
        "DateTime",
        *[
            column
            for column in frame.columns
            if column != "DateTime" and not column.startswith(excluded_prefixes)
        ],
    ]
    frame = frame[columns]
    return {
        "rows": frame.to_dict(orient="records"),
        "columns": columns,
        "record_count": len(frame),
        "source_file": str(path),
    }


def map_online_row_reactor(row_datetime, reactor_rows, reactor_columns=None):
    """Map an Online Analysis row datetime to an active reactor from reactor_rows.

    Extracts the hour, subtracts 1 hour (with date/hour rollover), matches against
    the Reactor Map, and returns the active reactor column header (where value == 1).
    Returns None if no matching hour/reactor is found.
    """
    if not row_datetime or not reactor_rows:
        return None

    if reactor_columns is None:
        reactor_columns = [f"R{i}" for i in range(1, 9)]

    from datetime import datetime, timedelta

    dt = None
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%d.%m.%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
    ):
        try:
            dt = datetime.strptime(str(row_datetime).strip(), fmt)
            break
        except ValueError:
            continue
    if dt is None:
        try:
            dt = pd.to_datetime(row_datetime)
        except Exception:
            return None

    target_dt = dt - timedelta(hours=1)
    target_date = target_dt.strftime("%Y-%m-%d")
    target_hour = target_dt.hour

    date_matches = []
    hour_matches = []
    for r in reactor_rows:
        r_dt_str = r.get("DateTime")
        if not r_dt_str:
            continue
        try:
            r_dt = datetime.strptime(str(r_dt_str).strip()[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            try:
                r_dt = pd.to_datetime(r_dt_str)
            except Exception:
                continue
        if r_dt.strftime("%Y-%m-%d") == target_date and r_dt.hour == target_hour:
            date_matches.append(r)
        elif r_dt.hour == target_hour:
            hour_matches.append(r)

    matches = date_matches if date_matches else hour_matches
    if not matches:
        return None

    votes = {}
    for m in matches:
        for col in reactor_columns:
            try:
                if int(m.get(col, 0)) == 1:
                    votes[col] = votes.get(col, 0) + 1
            except (ValueError, TypeError):
                continue

    if not votes:
        return None

    return max(votes.items(), key=lambda x: x[1])[0]


def apply_reactor_map_to_online_rows(online_rows, reactor_rows):
    """Apply Reactor Map hour - 1 matching row-by-row to Online Analysis rows.

    Preserves the original Reactor value if no active reactor is identified.
    """
    if not reactor_rows:
        return [dict(r) for r in online_rows]
    updated = []
    for row in online_rows:
        r_copy = dict(row)
        mapped = map_online_row_reactor(r_copy.get("DateTime"), reactor_rows)
        if mapped:
            r_copy["Reactor"] = mapped
        updated.append(r_copy)
    return updated
