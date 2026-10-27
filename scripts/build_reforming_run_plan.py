"""Build data/RunPlan_Reforming.xlsx from ILS_Chemical Validation_Reforming.xlsx.

Usage:  .venv\\Scripts\\python.exe scripts\\build_reforming_run_plan.py [source.xlsx] [target.xlsx]

Sources in the validation workbook:
  Exp. Plan                  catalyst loading (D/E = PS-210, R-434), Op.Conditions 1-3, feed density/MW
  Blend Feed Properties      feed properties (D6:D21), feed DHA carbon table (I9:Q24), SimTBP (A23:D73)
  Online DHA Validation_...  feed density / MW used for the online validation
  Reactor1                   Feed Cut-In date and time (G6, G7)

Reforming runs in Reactor 1 only; the two catalysts are tested one after the other.
Condition start/end dates are derived from the Feed Cut-In plus the planned durations
for the first catalyst; the second catalyst's dates are left blank until known.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

BASE = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / "ILS_Chemical Validation_Reforming.xlsx"
TARGET = Path(sys.argv[2]) if len(sys.argv) > 2 else BASE / "data" / "RunPlan_Reforming.xlsx"

HEAD = PatternFill("solid", fgColor="071A2D")
SUB = PatternFill("solid", fgColor="E8E2D6")
INPUT = PatternFill("solid", fgColor="FFF7E6")
CALC = PatternFill("solid", fgColor="EEF2F0")
THIN = Side(style="thin", color="BFB8AA")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def header(ws, row, values, fill=HEAD):
    for col, value in enumerate(values, 1):
        cell = ws.cell(row, col, value)
        cell.fill = fill
        cell.font = Font(bold=True, color="FFFFFF" if fill is HEAD else "071A2D")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BOX


def put(ws, row, col, value, fill=None, fmt=None, bold=False):
    cell = ws.cell(row, col, value)
    cell.border = BOX
    if fill:
        cell.fill = fill
    if fmt:
        cell.number_format = fmt
    if bold:
        cell.font = Font(bold=True)
    return cell


def widths(ws, values):
    for col, width in enumerate(values, 1):
        ws.column_dimensions[get_column_letter(col)].width = width


def main():
    src = load_workbook(SOURCE, data_only=True)
    plan = src["Exp. Plan"]
    feed = src["Blend Feed Properties"]
    online = src["Online DHA Validation_Reforming"]
    reactor = src["Reactor1"]

    cut_in_date, cut_in_time = reactor["G6"].value, reactor["G7"].value
    cut_in = datetime.combine(cut_in_date.date(), cut_in_time) if cut_in_date and cut_in_time else None

    catalysts = []
    for col in ("D", "E"):
        if plan[f"{col}8"].value:
            catalysts.append({
                "sci": plan[f"{col}6"].value,
                "cispro": plan[f"{col}7"].value,
                "name": plan[f"{col}8"].value,
                "shape": plan[f"{col}9"].value,
                "cbd": plan[f"{col}10"].value,
                "loi": plan[f"{col}11"].value,
                "volume": plan[f"{col}13"].value,
            })
    conditions = []
    for col in ("C", "D", "E", "F", "G", "H", "I", "J"):
        if plan[f"{col}19"].value in (None, ""):
            continue
        conditions.append({
            "no": plan[f"{col}19"].value,
            "pressure": plan[f"{col}20"].value,
            "temperature": plan[f"{col}21"].value,
            "lhsv": plan[f"{col}22"].value,
            "h2hc": plan[f"{col}23"].value,
            "duration": plan[f"{col}24"].value,
        })
    density = online["D8"].value or plan["C27"].value
    mw = online["D9"].value or plan["C28"].value

    wb = Workbook()

    # README
    ws = wb.active
    ws.title = "README"
    notes = [
        "ILS Reforming Run Plan (read by the platform when the process is set to Reforming)",
        f"Built {datetime.now():%d/%m/%Y %H:%M} from {SOURCE.name} (Exp. Plan, Blend Feed Properties, Online DHA Validation, Reactor1 Feed Cut-In).",
        "Reforming runs in Reactor 1 only. The two catalysts are tested one after the other in R1.",
        "Yellow cells are inputs; grey cells are calculated (the platform recalculates them if they are blank).",
        "Plan: run information + catalyst loading (one column per catalyst).",
        "DOE: one row per condition and catalyst. Start/End Date decide which Condition each sample belongs to.",
        "  Catalyst 1 dates = Feed Cut-In + planned durations (assumption, edit to the actual switch times).",
        "  Catalyst 2 dates are blank until its start is known.",
        "Feed: rows 1-3 must stay Carbon, Hydrogen, Molecular Weight (the Calculation page reads them by position).",
        "Feed DHA / Feed SimTBP: blend feed analysis, for reference.",
    ]
    for i, text in enumerate(notes, 1):
        ws.cell(i, 1, text).font = Font(bold=i == 1, size=12 if i == 1 else 11)
    ws.column_dimensions["A"].width = 120

    # Plan
    ws = wb.create_sheet("Plan")
    ws["A1"] = "ILS Reforming Run Plan"
    ws["A1"].font = Font(bold=True, size=14)
    put(ws, 2, 1, "Objective", SUB, bold=True)
    put(ws, 2, 2, plan["B2"].value or "Reforming catalyst test: "
        + " and ".join(str(c["name"]) for c in catalysts) + " in Reactor 1 on the Godorf/Pearl GTL blend feed", INPUT)
    ws.merge_cells("B2:E2")
    header(ws, 4, ["Run Information", "Units", "Value"])
    info = [
        ("Process", "--", "Reforming"),
        ("Unit", "--", "ILS"),
        ("Reactor", "--", "R1"),
        ("Feed", "--", str(feed["D1"].value or "").replace("\n", " ")),
        ("Feed SL ID", "--", feed["E4"].value or feed["D4"].value),
        ("Feed Cut-In", "dd/mm/yyyy hh:mm", cut_in.strftime("%d/%m/%Y %H:%M") if cut_in else ""),
        ("Feed Density @ 15 oC", "g/ml", density),
        ("Feed Molecular Weight", "g/mol", mw),
    ]
    for i, (name, unit, value) in enumerate(info, 5):
        put(ws, i, 1, name, bold=True)
        put(ws, i, 2, unit)
        put(ws, i, 3, value, INPUT)
    density_cell, mw_cell = "C11", "C12"

    top = 15
    header(ws, top, ["Catalyst Loading Plan", "Units", *[f"Catalyst {i + 1}" for i in range(len(catalysts))]])
    rows = [
        ("Reactor", "--", lambda c, col: "R1", INPUT, None),
        ("Run order", "--", lambda c, col: catalysts.index(c) + 1, INPUT, None),
        ("Catalyst", "--", lambda c, col: c["name"], INPUT, None),
        ("SCI number", "--", lambda c, col: c["sci"], INPUT, None),
        ("CISPRO label", "--", lambda c, col: c["cispro"], INPUT, None),
        ("Shape & Size", "mm", lambda c, col: c["shape"], INPUT, None),
        ("CBD (as-is)", "g/ml", lambda c, col: c["cbd"], INPUT, "0.0000"),
        ("LOI", "wt%", lambda c, col: c["loi"], INPUT, "0.00"),
        ("CBD (dry basis)", "g/ml", lambda c, col: f"={col}{top + 7}-({col}{top + 7}*({col}{top + 8}/100))", CALC, "0.0000"),
        ("Catalyst volume", "ml", lambda c, col: c["volume"], INPUT, "0.00"),
        ("Catalyst amount", "gms", lambda c, col: f"={col}{top + 10}*{col}{top + 7}", CALC, "0.0000"),
    ]
    for r, (name, unit, value, fill, fmt) in enumerate(rows, top + 1):
        put(ws, r, 1, name, bold=True)
        put(ws, r, 2, unit)
        for i, catalyst in enumerate(catalysts):
            col = get_column_letter(3 + i)
            put(ws, r, 3 + i, value(catalyst, col), fill, fmt)
    widths(ws, [28, 18, 22, 22, 22])

    # Conditions (the Exp. Plan Op.Conditions block)
    ws = wb.create_sheet("Conditions")
    header(ws, 1, ["Op.Conditions", "Units", *[f"Condition {c['no']}" for c in conditions]])
    for r, (name, unit, key, fmt) in enumerate([
        ("Pressure", "barg", "pressure", "0.0"),
        ("Temperature", "oC", "temperature", "0"),
        ("LHSV", "h-1", "lhsv", "0.00"),
        ("H2/Naphtha", "mol.basis", "h2hc", "0.00"),
        ("Duration", "hrs", "duration", "0"),
    ], 2):
        put(ws, r, 1, name, bold=True)
        put(ws, r, 2, unit)
        for i, condition in enumerate(conditions):
            put(ws, r, 3 + i, condition[key], INPUT, fmt)
    widths(ws, [20, 12, *[14] * len(conditions)])

    # DOE: one row per catalyst x condition, all in R1
    ws = wb.create_sheet("DOE")
    columns = [
        "Condition No.", "Catalyst", "Reactor ID", "Start Date", "End Date",
        "Temperature (°C)", "Pressure (barg)", "LHSV (/h)", "H2/Naphtha (mol.basis)", "Duration (h)",
        "Naphtha Flow (gms/h)", "H2 Flow (gms/h)", "H2 Flow (NLPH)", "Remarks",
    ]
    header(ws, 1, columns)
    row = 2
    number = 0
    for c_index, catalyst in enumerate(catalysts):
        start = cut_in if c_index == 0 else None
        volume_ref = f"Plan!{get_column_letter(3 + c_index)}{top + 10}"
        for condition in conditions:
            number += 1
            end = start + timedelta(hours=float(condition["duration"])) if start and condition["duration"] else None
            remark = "Dates = Feed Cut-In + planned durations (edit to actual)" if start else "Start/End dates to be filled"
            values = [
                number, catalyst["name"], "R1", start, end,
                condition["temperature"], condition["pressure"], condition["lhsv"], condition["h2hc"], condition["duration"],
                f"={volume_ref}*H{row}*Plan!{density_cell}",
                f"=(K{row}/Plan!{mw_cell})*I{row}*2",
                f"=(L{row}/2)*22.4*(293/273)",
                remark,
            ]
            for col, value in enumerate(values, 1):
                fill = CALC if col in (11, 12, 13) else INPUT
                fmt = "dd/mm/yyyy hh:mm" if col in (4, 5) else ("0.0000" if col in (11, 12, 13) else None)
                put(ws, row, col, value, fill, fmt)
            row += 1
            start = end
    widths(ws, [13, 12, 10, 17, 17, 15, 14, 10, 18, 12, 18, 15, 14, 52])
    ws.freeze_panes = "A2"

    # Feed: first three rows are positional (Carbon, Hydrogen, Molecular Weight)
    ws = wb.create_sheet("Feed")
    header(ws, 1, ["Property", "Units", "Method", "Value", "Note"])
    feed_rows = [
        ("Carbon", "wt%", feed["C9"].value, feed["D9"].value, "not normalized"),
        ("Hydrogen", "wt%", feed["C9"].value, feed["D10"].value, "not normalized"),
        ("Molecular Weight", "g/mol", "offline DHA", mw, "Online DHA Validation sheet"),
        ("Density @15 degC", "g/cc", feed["C8"].value, feed["D8"].value, ""),
        ("Water content", "wt%", feed["C11"].value, feed["D11"].value, ""),
        ("Sulfur", "ppmw", feed["C6"].value, feed["D6"].value, feed["F6"].value),
        ("Nitrogen", "ppmw", feed["C7"].value, feed["D7"].value, feed["F7"].value),
    ]
    for r in range(13, 22):
        label = feed[f"A{r}"].value
        if label:
            feed_rows.append((label, feed[f"B{r}"].value, feed["C12"].value if r < 20 else "", feed[f"D{r}"].value, ""))
    for r, values in enumerate(feed_rows, 2):
        for col, value in enumerate(values, 1):
            put(ws, r, col, value, INPUT if col == 4 else None, "0.0000" if col == 4 and isinstance(value, float) else None)
    widths(ws, [22, 10, 14, 14, 30])

    ws = wb.create_sheet("Feed DHA")
    header(ws, 1, ["CARBON#", "Paraffin", "I-Paraffins", "Aromatics", "Naphthenes", "Olefins", "Oxygenates", "Plus", "TOTAL"])
    r_out = 2
    for r in range(10, 22):
        carbon = feed[f"I{r}"].value
        if carbon is None:
            continue
        values = [feed.cell(r, c).value for c in range(10, 17)]
        values = [v if isinstance(v, (int, float)) else 0 for v in values]
        put(ws, r_out, 1, carbon, bold=True)
        for c, value in enumerate(values, 2):
            put(ws, r_out, c, value, None, "0.0000")
        put(ws, r_out, 9, f"=SUM(B{r_out}:H{r_out})", CALC, "0.0000")
        r_out += 1
    put(ws, r_out, 1, "TOTAL", bold=True)
    for c in range(2, 10):
        put(ws, r_out, c, f"=SUM({get_column_letter(c)}2:{get_column_letter(c)}{r_out - 1})", CALC, "0.0000")
    put(ws, r_out + 1, 8, "UNKNOWNS", bold=True)
    put(ws, r_out + 1, 9, f"=100-I{r_out}", CALC, "0.0000")
    widths(ws, [10, *[13] * 8])

    ws = wb.create_sheet("Feed SimTBP")
    header(ws, 1, ["Recovered (wt%)", "Temperature (degC)"])
    r_out = 2
    for r in range(23, 74):
        if feed[f"A{r}"].value is not None and feed[f"D{r}"].value is not None:
            put(ws, r_out, 1, feed[f"A{r}"].value)
            put(ws, r_out, 2, feed[f"D{r}"].value)
            r_out += 1
    widths(ws, [16, 18])

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    wb.save(TARGET)
    print(f"Wrote {TARGET} ({len(catalysts)} catalysts, {len(conditions)} conditions, {number} DOE rows)")


if __name__ == "__main__":
    main()
