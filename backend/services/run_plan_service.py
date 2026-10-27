from datetime import datetime
from pathlib import Path
import math
import pandas as pd

from RunPlan import load_run_plan_data, read_excel_range


def _clean_val(val):
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return ""
    if pd.isna(val):
        return ""
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.strftime("%Y-%m-%d %H:%M:%S").replace(" 00:00:00", "")
    if isinstance(val, float):
        # Format floating numbers nicely
        if val.is_integer():
            return int(val)
        return round(val, 4)
    return str(val).strip()


def process_run_plan_file(file_path):
    """
    Processes a RunPlan Excel workbook and returns structured JSON for the frontend.
    """
    path = Path(file_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Selected RunPlan file does not exist: {file_path}")
    if path.suffix.lower() not in [".xlsx", ".xls"]:
        raise ValueError(f"Selected file must be an Excel spreadsheet (.xlsx or .xls), got {path.suffix}")

    data = load_run_plan_data(str(path))
    df_plan = data["df_plan"]
    df_loading = data["df_Loading_plan"]
    df_doe = data["df_DOE"]
    df_feed = data["df_feed"]

    # 1. Process Feed
    feed_columns = ["Component / Parameter", "Carbon No.", "Group", "Unit / Method", "Value (wt%)"]
    feed_rows = []
    for _, row in df_feed.iterrows():
        r_vals = [_clean_val(v) for v in row.tolist()]
        # Pad to 5 columns
        while len(r_vals) < 5:
            r_vals.append("")
        feed_rows.append({
            "component": r_vals[0],
            "carbon_no": r_vals[1],
            "group": r_vals[2],
            "unit": r_vals[3],
            "value": r_vals[4],
        })

    # 2. Process Plan (Objective & Loading Plan)
    objective_text = ""
    if not df_plan.empty and df_plan.shape[1] >= 2:
        objective_text = _clean_val(df_plan.iloc[0, 1])

    loading_columns = ["Parameter", "Units", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]
    loading_rows = []
    # In df_loading, Row 1 has ['Reactor', '--', 1, 2, 3, 4, 5, 6, 7, 8]
    # Rows 2 to 10 have the parameters (Catalyst, Shape & Size, volume, CBD, amount, etc.)
    if not df_loading.empty and df_loading.shape[0] >= 3:
        for idx in range(2, len(df_loading)):
            row = df_loading.iloc[idx].tolist()
            clean_row = [_clean_val(v) for v in row]
            while len(clean_row) < 10:
                clean_row.append("")
            loading_rows.append({
                "parameter": clean_row[0],
                "units": clean_row[1],
                "r1": clean_row[2],
                "r2": clean_row[3],
                "r3": clean_row[4],
                "r4": clean_row[5],
                "r5": clean_row[6],
                "r6": clean_row[7],
                "r7": clean_row[8],
                "r8": clean_row[9],
            })

    # 3. Process DOE
    # Row 0 contains headers
    doe_columns = []
    doe_rows = []
    doe_reactors = set()
    if not df_doe.empty and df_doe.shape[0] >= 1:
        raw_headers = df_doe.iloc[0].tolist()
        doe_columns = [
            str(h).replace("\n", " ").strip() if h is not None and not pd.isna(h) else f"Col_{i+1}"
            for i, h in enumerate(raw_headers)
        ]

        for idx in range(1, len(df_doe)):
            row = df_doe.iloc[idx].tolist()
            clean_row = [_clean_val(v) for v in row]
            while len(clean_row) < len(doe_columns):
                clean_row.append("")
            row_dict = {doe_columns[i]: clean_row[i] for i in range(len(doe_columns))}
            # Check reactor ID
            if "Reactor ID" in row_dict and row_dict["Reactor ID"]:
                doe_reactors.add(str(row_dict["Reactor ID"]).strip())
            doe_rows.append(row_dict)

    summary = {
        "file_name": path.name,
        "file_path": str(path),
        "feed_count": len(feed_rows),
        "doe_count": len(doe_rows),
        "reactor_count": len(doe_reactors) or 8,
        "reactors": sorted(list(doe_reactors)) if doe_reactors else [f"R{i}" for i in range(1, 9)],
    }

    return {
        "feed": {
            "columns": feed_columns,
            "rows": feed_rows,
            "count": len(feed_rows),
        },
        "plan": {
            "objective": objective_text,
            "columns": loading_columns,
            "rows": loading_rows,
            "count": len(loading_rows),
        },
        "doe": {
            "columns": doe_columns,
            "rows": doe_rows,
            "count": len(doe_rows),
        },
        "summary": summary,
    }
