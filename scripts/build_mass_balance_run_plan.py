"""Build a Mass Balance Run Plan in the RunPlan.xlsx format (Plan, DOE, Feed) with the extra Liq sheet.

The example belongs to the run export tests/fixtures/mass_balance/Result_R08-Ci-S4-27-Oct-24_1_3.txt
(24-27 Oct 2024; gas fed to R1, R5 and R6): run start, DOE flows, sample windows and liquid masses fit that file, so
the Run Plan + Online Analysis (run export) + ZMB (Run6 ZMB export) give a complete mass balance.

    python scripts/build_mass_balance_run_plan.py [output.xlsx]
"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

HEAD = PatternFill("solid", fgColor="1F4E78")      # same colours as the shared RunPlan.xlsx
BLOCK1 = PatternFill("solid", fgColor="DDEBF7")
BLOCK2 = PatternFill("solid", fgColor="FCE4D6")
INPUT = PatternFill("solid", fgColor="E2EFDA")
TITLE = PatternFill("solid", fgColor="D9E1F2")
WHITE = Font(bold=True, color="FFFFFF")
BOLD = Font(bold=True)
THIN = Side(style="thin", color="A6A6A6")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="center", horizontal="center")
DATE = "dd/mm/yyyy hh:mm"

RUN_START = datetime(2024, 10, 24, 14, 0)
CATALYSTS = {1: ("Ni2CBV-3014", 3.0, 0.589), 5: ("Ni5CBV-3014", 3.0, 0.625), 6: ("Cu5CBV500", 3.0, 0.559)}
GAS_NML = {1: 1563.4, 5: 3126.2, 6: 3126.7}         # 01i14FIC0r of the run export
LIQ_FEED = {1: 0.5, 5: 0.5, 6: 0.5}                   # g/h (verified in the ZMB)
SAMPLES = [("C1-S1", datetime(2024, 10, 25, 9, 0)), ("C1-S2", datetime(2024, 10, 26, 9, 0)),
           ("C1-S3", datetime(2024, 10, 27, 9, 0)), ("C1-S4", datetime(2024, 10, 27, 17, 30))]
BLOCK2_END = datetime(2024, 10, 27, 8, 30)            # gas to R5 / R6 stopped (01i14FIC05/06 = 0 in the export)
LAST_SAMPLE_REACTORS = {1}                            # C1-S4: only R1 still had gas


def cell(ws, ref, value, fill=None, font=None, fmt=None, border=True, align=None):
    c = ws[ref]
    c.value = value
    if fill: c.fill = fill
    if font: c.font = font
    if fmt: c.number_format = fmt
    if border: c.border = BOX
    if align: c.alignment = align
    return c


def plan_sheet(wb):
    ws = wb.active
    ws.title = "Plan"
    cell(ws, "A2", "Objective", TITLE, BOLD)
    ws.merge_cells("B2:J2")
    cell(ws, "B2", "Mass balance of the ILS-8 unit: selective acetylene hydrogenation over Ni/Cu zeolite catalysts "
                   "(R1, R5, R6 with gas and liquid feed; argon internal standard).", align=Alignment(wrap_text=True, vertical="center"))
    ws.row_dimensions[2].height = 32
    cell(ws, "A4", "Catalyst Loading Plan", TITLE, BOLD); cell(ws, "B4", "Units", TITLE, BOLD)
    ws.merge_cells("C4:F4"); cell(ws, "C4", "Block 1", BLOCK1, BOLD, align=WRAP)
    ws.merge_cells("G4:J4"); cell(ws, "G4", "Block 2", BLOCK2, BOLD, align=WRAP)
    rows = [("Reactor", "--", lambda r: r), ("Catalyst", "--", lambda r: CATALYSTS.get(r, ("X",))[0]),
            ("Shape & Size", "mm", lambda r: "355-212 µm" if r in CATALYSTS else "X"),
            ("Catalyst volume", "ml", lambda r: CATALYSTS[r][1] if r in CATALYSTS else "X"),
            ("Catalyst CBD (as-is)", "g/ml", lambda r: CATALYSTS[r][2] if r in CATALYSTS else "X"),
            ("Catalyst amount", "gms", lambda r: round(CATALYSTS[r][1] * CATALYSTS[r][2], 3) if r in CATALYSTS else "X"),
            ("Loading-Preheating Zone", "mm", lambda r: 60 if r in CATALYSTS else None),
            ("Loading-Catalyst Bed Zone", "mm", lambda r: 45 if r in CATALYSTS else None),
            ("Loading-Post Heating Zone", "mm", lambda r: 60 if r in CATALYSTS else None),
            ("Loaded catalyst weight", "g", lambda r: round(CATALYSTS[r][1] * CATALYSTS[r][2] + 0.001, 3) if r in CATALYSTS else None)]
    for i, (label, unit, value) in enumerate(rows):
        row = 5 + i
        cell(ws, f"A{row}", label, TITLE if i == 0 else None, BOLD if i == 0 else None)
        cell(ws, f"B{row}", unit)
        for r in range(1, 9):
            col = chr(ord("C") + r - 1)
            cell(ws, f"{col}{row}", value(r), (BLOCK1 if r <= 4 else BLOCK2) if i == 0 else (INPUT if r in CATALYSTS else None),
                 BOLD if i == 0 else None, align=Alignment(horizontal="center"))
    cell(ws, "A16", "Op.Conditions", TITLE, BOLD); cell(ws, "B16", "Units", TITLE, BOLD)
    for k in range(6):
        cell(ws, f"{chr(ord('C') + k)}16", k + 1, TITLE, BOLD, align=Alignment(horizontal="center"))
    for i, (label, unit, value) in enumerate([("Pressure", "barg", 5), ("Temperature", "oC", 200), ("LHSV", "h-1", 0.17),
                                              ("GoR", "Nl/l", 3.1), ("Duration", "hrs", 77)]):
        row = 17 + i
        cell(ws, f"A{row}", label); cell(ws, f"B{row}", unit)
        cell(ws, f"C{row}", value, INPUT, align=Alignment(horizontal="center"))
    # Label rows: column A label, column C value (same convention as Feed SL ID / Feed Cut-In of the shared format)
    for row, (label, unit, value, fmt) in enumerate([
            ("Run Start", "dd/mm/yyyy", RUN_START, DATE), ("Feed Cut-In", "dd/mm/yyyy", RUN_START, DATE),
            ("Feed SL ID", "--", "B00003169001", None), ("Feed molecular weight", "g/mol", 160, None)], start=23):
        cell(ws, f"A{row}", label, TITLE, BOLD); cell(ws, f"B{row}", unit); cell(ws, f"C{row}", value, INPUT, fmt=fmt)
    cell(ws, "A28", "Note", border=False, font=BOLD)
    for row, text in enumerate([
            "Run Start (C23) is the time zero of the mass balance: TOS of the samples and GC reps, and the start of the first sample window.",
            "Gas and liquid feed flows per reactor and condition are in the DOE sheet; the feed gas and liquid feed in the Feed sheet; "
            "liquid samples and the ZMB liquid collection reps in the Liq sheet.",
            "R2, R3, R4, R7 and R8 are not loaded (X)."], start=29):
        ws.merge_cells(f"A{row}:R{row}")
        cell(ws, f"A{row}", text, border=False)
    ws.column_dimensions["A"].width = 28; ws.column_dimensions["B"].width = 12
    for col in "CDEFGHIJ":
        ws.column_dimensions[col].width = 15


def doe_sheet(wb):
    ws = wb.create_sheet("DOE")
    cell(ws, "A1", "ILS-8 Mass Balance – DOE / Run Plan (8 reactors, 2 blocks)", border=False, font=Font(bold=True, size=13))
    for row, text in enumerate([
            "How to use this sheet:",
            "1. Reactors are split into Block-1 (R1–R4) and Block-2 (R5–R8); Temperature and Pressure are set once per block and condition.",
            "2. Gas Flow (NmL/h) and Liquid Flow (g/h) are set per reactor (0 = no feed). Gas Flow is used as the feed flow of a sample "
            "when no Online Analysis export is loaded (the export's 01i14FIC0r are used otherwise).",
            "3. Green cells are the ones you fill in. Add condition blocks below if you need more conditions."], start=2):
        ws.merge_cells(f"A{row}:N{row}")
        cell(ws, f"A{row}", text, border=False)
    headers = ["Condition\nNo.", "Block", "Start Date", "End Date", "Temperature\n(°C)", "Pressure\n(barg)", "Reactor\nID",
               "Gas Flow\n(NmL/h)", "Liquid Flow\n(g/h)", "LHSV\n(/h)", "GoR\n(Nl/l)", "Feed Gas", "Remarks", "Catalyst"]
    for k, h in enumerate(headers):
        if h:
            cell(ws, f"{chr(ord('A') + k)}10", h, HEAD, WHITE, align=WRAP)
    ws.row_dimensions[10].height = 44
    blocks = [("Block-1", BLOCK1, 200, range(1, 5), SAMPLES[-1][1] + timedelta(hours=1)),
              ("Block-2", BLOCK2, 250, range(5, 9), BLOCK2_END)]
    row = 11
    for block, fill, temp, reactors, end in blocks:
        first = row
        for r in reactors:
            fed = r in GAS_NML
            cell(ws, f"G{row}", f"R{r}", fill, align=Alignment(horizontal="center"))
            cell(ws, f"H{row}", GAS_NML.get(r, 0), INPUT)
            cell(ws, f"I{row}", LIQ_FEED.get(r, 0), INPUT)
            cell(ws, f"J{row}", round(LIQ_FEED[r] / 0.84 / CATALYSTS[r][1], 3) if fed else None, INPUT)
            cell(ws, f"K{row}", round(GAS_NML[r] / 1000 / (LIQ_FEED[r] / 0.84), 1) if fed else None, INPUT)
            cell(ws, f"L{row}", "Ar 5 % + mixed gas" if fed else None, INPUT if fed else None)
            cell(ws, f"M{row}", ("gas + liquid feed" + ("; gas stopped 27.10.2024 08:30" if r >= 5 else "")) if fed else "not loaded")
            cell(ws, f"N{row}", CATALYSTS[r][0] if fed else None)
            row += 1
        for col, value, fmt in (("A", 1, None), ("B", block, None), ("C", RUN_START, DATE), ("D", end, DATE), ("E", temp, None), ("F", 5, None)):
            ws.merge_cells(f"{col}{first}:{col}{row - 1}")
            cell(ws, f"{col}{first}", value, fill if col in "AB" else INPUT, fmt=fmt, align=WRAP)
            for rr in range(first + 1, row):
                ws[f"{col}{rr}"].border = BOX
    for col, width in zip("ABCDEFGHIJKLMN", (11, 10, 17, 17, 12, 10, 9, 12, 12, 9, 9, 18, 20, 16)):
        ws.column_dimensions[col].width = width


def feed_sheet(wb):
    ws = wb.create_sheet("Feed")
    ws.merge_cells("A1:E1")
    cell(ws, "A1", "Liquid Feed", TITLE, BOLD)
    liquid = [("Carbon", "wt%", 85.2), ("Hydrogen", "wt%", 13.4), ("Molecular Weight", "g/mol", 160), ("Oxygen", "wt%", 0),
              ("Sulfur", "ppmw", 8), ("Nitrogen", "ppmw", 2), ("Density", "g/mL", 0.84), ("Feed ID", "--", "B00003169001"),
              ("Feed description", "--", "Diesel (2nd stage), toluene mixed")]
    gas = [("Argon (verified)", "mol%", 5.0), ("Mixed gas (verified)", "mol%", 95.0), ("Total gas feed (01i14FI01)", "g/h", 6.775),
           ("Mixed gas – Hydrogen", "mol%", 20.904), ("Mixed gas – Ethylene", "mol%", 1.613), ("Mixed gas – Methane", "mol%", 2.535),
           ("Mixed gas – Ethane", "mol%", 0.002), ("Mixed gas – Nitrogen", "mol%", 59.798), ("Mixed gas – Acetylene", "mol%", 7.822)]
    for row, (label, unit, value) in enumerate(liquid, start=2):
        ws.merge_cells(f"A{row}:C{row}")
        cell(ws, f"A{row}", label); cell(ws, f"D{row}", unit); cell(ws, f"E{row}", value, INPUT)
    ws.merge_cells("A12:E12")
    cell(ws, "A12", "Gas Feed (argon internal standard + mixed gas)", TITLE, BOLD)
    for row, (label, unit, value) in enumerate(gas, start=13):
        ws.merge_cells(f"A{row}:C{row}")
        cell(ws, f"A{row}", label); cell(ws, f"D{row}", unit); cell(ws, f"E{row}", value, INPUT)
    cell(ws, "A23", "Mixed gas – target composition: used when no ZMB export is loaded (otherwise the ZMB GC gives it).",
         border=False)
    ws.merge_cells("A23:E23")
    ws.column_dimensions["A"].width = 22; ws.column_dimensions["D"].width = 9; ws.column_dimensions["E"].width = 16


def liq_sheet(wb):
    ws = wb.create_sheet("Liq")
    cell(ws, "A1", "Liquid – samples and ZMB liquid verification", border=False, font=Font(bold=True, size=13))
    ws.merge_cells("A2:K2")
    cell(ws, "A2", "One row per sample and reactor. TLP mass is the liquid drained at the end of the sample; collection "
                   "finished closes the sample window (GC reps and feed flows are taken up to that time).", border=False)
    head = ["Sample", "Condition", "Reactor ID", "Collection Started", "Collection Finished", "TLP Mass\n(g)",
            "HC (Top) Phase\n(g)", "Aqueous (Bottom) Phase\n(g)", "C in Liquid Product\n(wt%)", "Density\n(g/mL)", "Remarks"]
    for k, h in enumerate(head):
        cell(ws, f"{chr(ord('A') + k)}4", h, HEAD, WHITE, align=WRAP)
    ws.row_dimensions[4].height = 44
    row, previous = 5, RUN_START
    for name, finish in SAMPLES:
        hours = (finish - previous).total_seconds() / 3600
        for r in sorted(CATALYSTS) if name != SAMPLES[-1][0] else sorted(LAST_SAMPLE_REACTORS):
            tlp = round(LIQ_FEED[r] * 0.92 * hours, 2)
            values = [name, 1, f"R{r}", finish - timedelta(minutes=6), finish, tlp, tlp, 0, 84.9, 0.83,
                      f"drained after {hours:.1f} h"]
            for k, v in enumerate(values):
                cell(ws, f"{chr(ord('A') + k)}{row}", v, INPUT if 3 <= k <= 9 else (BLOCK1 if k < 3 else None),
                     fmt=DATE if k in (3, 4) else None)
            row += 1
        previous = finish
    row += 2
    ws.merge_cells(f"A{row}:K{row}")
    cell(ws, f"A{row}", "ZMB liquid verification – liquid collected from each pump before the run (3 reps); "
                        "verified flow = average of mass / hours", TITLE, BOLD)
    row += 1
    for k, h in enumerate(["Rep", "Reactor ID", "Collection Started", "Collection Finished", "TL Collected Mass\n(g)"]):
        cell(ws, f"{chr(ord('A') + k)}{row}", h, HEAD, WHITE, align=WRAP)
    ws.row_dimensions[row].height = 32
    row += 1
    zmb_start = RUN_START - timedelta(days=3)
    for rep, delta in ((1, 0.004), (2, 0.0), (3, -0.004)):
        start = zmb_start + timedelta(hours=2 * (rep - 1))
        for r in sorted(CATALYSTS):
            values = [rep, f"R{r}", start, start + timedelta(hours=1), round(LIQ_FEED[r] * (1 + delta), 4)]
            for k, v in enumerate(values):
                cell(ws, f"{chr(ord('A') + k)}{row}", v, INPUT if k >= 2 else BLOCK1, fmt=DATE if k in (2, 3) else None)
            row += 1
    for col, width in zip("ABCDEFGHIJK", (10, 10, 10, 18, 18, 11, 13, 14, 14, 10, 22)):
        ws.column_dimensions[col].width = width


def build(path):
    wb = Workbook()
    plan_sheet(wb); doe_sheet(wb); feed_sheet(wb); liq_sheet(wb)
    wb.save(path)
    return path


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "data" / "RunPlan_MassBalance.xlsx"
    out.parent.mkdir(parents=True, exist_ok=True)
    print(build(out))
