from pathlib import Path
import pandas as pd
from backend.services.online_analysis_service import process_online_file, ONLINE_COLUMNS

EXCLUDED_ONLINE_COLUMNS = [
    "01i14FIC01",
    "01i14FIC02",
    "01i14FIC03",
    "01i14FIC04",
    "01i14FIC05",
    "01i14FIC06",
    "01i14FIC07",
    "01i14FIC08",
]

EXCLUDED_SET = set(EXCLUDED_ONLINE_COLUMNS)

FIC_MAPPING = {
    1: "10i1FIC01",
    2: "10i1FIC02",
    3: "10i1FIC03",
    4: "10i1FIC04",
    5: "10i2FIC01",
    6: "10i2FIC02",
    7: "10i2FIC03",
    8: "10i2FIC04",
}

TEMPERATURE_MAPPING = {
    1: "10i1TIC02",
    2: "10i1TIC02",
    3: "10i1TIC02",
    4: "10i1TIC02",
    5: "10i2TIC02",
    6: "10i2TIC02",
    7: "10i2TIC02",
    8: "10i2TIC02",
}

PRESSURE_MAPPING = {
    1: "10i1PIC01",
    2: "10i1PIC01",
    3: "10i1PIC01",
    4: "10i1PIC01",
    5: "10i2PIC01",
    6: "10i2PIC01",
    7: "10i2PIC01",
    8: "10i2PIC01",
}

COLUMNS_TO_REMOVE = [
    "10i1FIC01",
    "10i1FIC02",
    "10i1FIC03",
    "10i1FIC04",
    "10i2FIC01",
    "10i2FIC02",
    "10i2FIC03",
    "10i2FIC04",
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
]


def filter_base_table_columns(columns):
    """Return columns after excluding raw multi-sensor columns."""
    return [
        col
        for col in columns
        if col not in EXCLUDED_SET and col not in COLUMNS_TO_REMOVE
    ]


def get_default_feed_carbon_and_mw():
    """Retrieve Carbon and Molecular Weight from the active or default Run Plan feed analysis."""
    from flask import current_app

    run_plan_file = None
    try:
        run_plan_file = current_app.config.get(
            "ACTIVE_RUN_PLAN_FILE"
        ) or current_app.config.get("DEFAULT_RUN_PLAN_FILE")
    except RuntimeError:
        pass

    if not run_plan_file:
        try:
            from RunPlan import DEFAULT_RUN_PLAN_PATH

            run_plan_file = DEFAULT_RUN_PLAN_PATH
        except Exception:
            pass

    path = Path(run_plan_file) if run_plan_file else None
    if not path or not path.exists():
        fallback = Path(r"C:\Users\sanka\Desktop\Python_Playground\RunPlan.xlsx")
        if fallback.exists():
            path = fallback

    if path and path.exists():
        try:
            from backend.services.run_plan_service import process_run_plan_file

            res = process_run_plan_file(str(path))
            rows = res.get("feed", {}).get("rows", [])
            carbon_val = rows[0].get("value") if len(rows) > 0 else 83.61
            mw_val = rows[2].get("value") if len(rows) > 2 else 88.55
            return float(carbon_val or 83.61), float(mw_val or 88.55)
        except Exception:
            pass

    return 83.61, 88.55


def reconstruct_base_table(df, carbon=None, molecular_weight=None):
    """
    Reconstructs the Base Table (Reactor Conditions) from the current online analysis dataframe.
    Maps N2[SLPH], Temperature, and Pressure from reactor index, drops raw sensor columns,
    and calculates Naphtha_online, H2_out, Naphtha_out, Carbon_out, Naphtha_in, and Naphtha/H2.
    """
    if df is None or df.empty:
        return pd.DataFrame(
            columns=[
                "DateTime",
                "TOS[h]",
                "Reactor",
                "ESTD_H2",
                "ESTD_N2",
                "N2[SLPH]",
                "Temperature",
                "Pressure",
                "Naphtha_online",
                "H2_out",
                "Naphtha_out",
                "Carbon_out",
                "Naphtha_in",
                "Naphtha/H2",
            ]
        )

    df = df.copy()

    # Determine carbon and molecular weight
    if carbon is None or molecular_weight is None:
        def_carbon, def_mw = get_default_feed_carbon_and_mw()
        if carbon is None:
            carbon = def_carbon
        if molecular_weight is None:
            molecular_weight = def_mw
    else:
        try:
            carbon = float(carbon)
        except (ValueError, TypeError):
            carbon = 83.61
        try:
            molecular_weight = float(molecular_weight)
        except (ValueError, TypeError):
            molecular_weight = 88.55

    date_col = (
        "DateTime"
        if "DateTime" in df.columns
        else ("Date/Time" if "Date/Time" in df.columns else "DateTime")
    )
    reactor_col = (
        "Reactor"
        if "Reactor" in df.columns
        else ("Sampled_reactor" if "Sampled_reactor" in df.columns else "Reactor")
    )
    if date_col in df.columns:
        df = df.sort_values(
            date_col,
            key=lambda values: pd.to_datetime(
                values, format="mixed", dayfirst=True, errors="coerce"
            ),
            kind="stable",
            na_position="last",
        ).reset_index(drop=True)

    def parse_reactor_num(val):
        if pd.isna(val) or val is None:
            return None
        s = str(val).strip().upper()
        if s.startswith("R"):
            s = s[1:].strip()
        try:
            num = int(float(s))
            return num if 1 <= num <= 8 else None
        except (ValueError, TypeError):
            return None

    if reactor_col in df.columns:
        reactor_nums = df[reactor_col].apply(parse_reactor_num)
    else:
        reactor_nums = pd.Series([None] * len(df), index=df.index)

    # Convert raw FIC flow from SL/h to kSL/h for N2[SLPH].
    fic_mapped_cols = reactor_nums.map(FIC_MAPPING)
    df["N2[SLPH]"] = [
        pd.to_numeric(df.loc[idx, col], errors="coerce") / 1000.0
        if pd.notna(col) and col in df.columns
        else None
        for idx, col in fic_mapped_cols.items()
    ]

    # 2. TIC -> Temperature
    temp_mapped_cols = reactor_nums.map(TEMPERATURE_MAPPING)
    df["Temperature"] = [
        pd.to_numeric(df.loc[idx, col], errors="coerce")
        if pd.notna(col) and col in df.columns
        else None
        for idx, col in temp_mapped_cols.items()
    ]

    # 3. PIC -> Pressure
    pressure_mapped_cols = reactor_nums.map(PRESSURE_MAPPING)
    df["Pressure"] = [
        pd.to_numeric(df.loc[idx, col], errors="coerce")
        if pd.notna(col) and col in df.columns
        else None
        for idx, col in pressure_mapped_cols.items()
    ]

    # Numeric conversion for calculation columns
    estd_h2 = pd.to_numeric(df.get("ESTD_H2"), errors="coerce")
    estd_n2 = pd.to_numeric(df.get("ESTD_N2"), errors="coerce")
    n2_slph = pd.to_numeric(df.get("N2[SLPH]"), errors="coerce")

    # 4. Remove original multi-sensor columns
    cols_to_drop = [c for c in COLUMNS_TO_REMOVE if c in df.columns]
    df.drop(columns=cols_to_drop, inplace=True)

    # 5. Calculate derived columns
    date_times = (
        pd.to_datetime(df[date_col], format="mixed", dayfirst=True, errors="coerce")
        if date_col in df.columns
        else pd.Series(index=df.index, dtype="datetime64[ns]")
    )
    first_time = date_times.iloc[0] if len(date_times) else pd.NaT
    df["TOS[h]"] = (date_times - first_time).dt.total_seconds() / 3600.0
    if len(df):
        df.iloc[0, df.columns.get_loc("TOS[h]")] = 0.0

    # Naphtha_online = 100 - (ESTD_H2 + ESTD_N2)
    naphtha_online = 100.0 - (estd_h2 + estd_n2)
    df["Naphtha_online"] = naphtha_online

    # H2_out = ((N2[SLPH]) / (ESTD_N2 / 100)) * (ESTD_H2 / 100) * 0.0416 * 2
    h2_ratio = estd_h2 / 100.0
    n2_ratio = estd_n2 / 100.0
    df["H2_out"] = ((n2_slph / n2_ratio) * h2_ratio * 0.0416 * 2.0).where(
        n2_ratio != 0, None
    )

    # Naphtha_out = ((N2[SLPH]) / (ESTD_N2 / 100)) * (Naphtha_online / 100) * 0.0416 * Molecular Weight
    naphtha_ratio = naphtha_online / 100.0
    df["Naphtha_out"] = (
        (n2_slph / n2_ratio) * naphtha_ratio * 0.0416 * molecular_weight
    ).where(n2_ratio != 0, None)

    # Carbon_out = Naphtha_out * Carbon / 100
    df["Carbon_out"] = df["Naphtha_out"] * carbon / 100.0

    # Naphtha_in = Carbon_out / (Carbon / 100)
    df["Naphtha_in"] = (
        df["Carbon_out"] / (carbon / 100.0) if carbon != 0 else df["Naphtha_out"]
    )

    # Naphtha/H2 = (Naphtha_online * Molecular Weight) / (ESTD_H2 * 2)
    h2_denom = estd_h2 * 2.0
    df["Naphtha/H2"] = ((naphtha_online * molecular_weight) / h2_denom).where(
        h2_denom != 0, None
    )

    # Final ordered columns
    key_cols = []
    if date_col in df.columns:
        key_cols.append(date_col)
    if reactor_col in df.columns:
        key_cols.append(reactor_col)

    derived_cols = [
        "TOS[h]",
        "ESTD_H2",
        "ESTD_N2",
        "N2[SLPH]",
        "Temperature",
        "Pressure",
        "Naphtha_online",
        "H2_out",
        "Naphtha_out",
        "Carbon_out",
        "Naphtha_in",
        "Naphtha/H2",
    ]
    final_cols = key_cols + [c for c in derived_cols if c in df.columns]
    remaining = [c for c in df.columns if c not in final_cols]
    final_cols = final_cols + remaining

    df = df[final_cols]
    df = df.replace([float("inf"), float("-inf")], None)
    df = df.where(pd.notna(df), None)

    return df


def extract_base_table_data(online_data, carbon=None, molecular_weight=None):
    """
    Extracts and reconstructs Base table data from an Online Analysis payload dictionary.
    """
    if not online_data or not isinstance(online_data, dict):
        return {
            "columns": [],
            "rows": [],
            "record_count": 0,
            "source_file": "",
            "carbon": carbon,
            "molecular_weight": molecular_weight,
        }

    raw_rows = online_data.get("rows", [])
    if not raw_rows:
        return {
            "columns": [],
            "rows": [],
            "record_count": 0,
            "source_file": online_data.get("source_file", ""),
            "carbon": carbon,
            "molecular_weight": molecular_weight,
        }

    df = pd.DataFrame(raw_rows)
    reconstructed_df = reconstruct_base_table(
        df, carbon=carbon, molecular_weight=molecular_weight
    )

    columns = reconstructed_df.columns.tolist()
    records = reconstructed_df.to_dict(orient="records")

    return {
        "columns": columns,
        "rows": records,
        "record_count": len(records),
        "source_file": online_data.get("source_file", ""),
        "carbon": carbon,
        "molecular_weight": molecular_weight,
    }


def process_base_table_file(file_path, carbon=None, molecular_weight=None):
    """
    Directly processes an Online Analysis SystemTxt file and extracts
    the reconstructed Base Table dataset.
    """
    online_data = process_online_file(file_path)
    rows = online_data.get("rows", [])
    # If reactors are unmapped (e.g. 0), apply reactor map from settings if available
    if rows and all(
        str(r.get("Reactor", "0")).strip() in ("0", "", "None") for r in rows[:10]
    ):
        try:
            from flask import current_app

            r_dir = current_app.config.get("DEFAULT_REACTOR_SOURCE_DIRECTORY")
            if r_dir and Path(r_dir).exists():
                from backend.services.reactor_map_service import (
                    process_reactor_map_directory,
                )
                from backend.services.online_analysis_service import (
                    apply_reactor_map_to_online_rows,
                )

                reactor_res = process_reactor_map_directory(r_dir)
                if reactor_res and reactor_res.get("rows"):
                    online_data["rows"] = apply_reactor_map_to_online_rows(
                        rows, reactor_res["rows"]
                    )
        except Exception:
            pass

    return extract_base_table_data(
        online_data, carbon=carbon, molecular_weight=molecular_weight
    )
