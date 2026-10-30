"""Write the calculated tabs to an .xlsx workbook (values; sheet names and labels as in the MassBal workbook)."""
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

TITLE = Font(bold=True, size=12)
HEAD = Font(bold=True)
INPUT = PatternFill("solid", fgColor="DDEBF7")       # the workbook's blue input cells
OUTLIER = PatternFill("solid", fgColor="F8CBAD")

FORMULAS = [
    ("ZMB", "Liq. flow rate [g/h] = collected mass / (finished − started) in hours; verified = average of rep 1-3 (ZMB!B13)"),
    ("ZMB", "GC block average = mean ESTD of the stream's injections; wt% = 100·avg·MW / Σ(avg·MW)"),
    ("Run_Plan", "Mixed gas mol% B35:K35 = ZMB Reactor-1 block averages; mass% = 100·y·MW / Σ(y·MW)"),
    ("Gas", "Total gas feed G_r = 01i14FI01 · V_r / ΣV (Gas!B12); Ar_r = G_r · w_Ar% (Gas!B20)"),
    ("Liq", "TOS = 24·((started+finished)/2 − Run start); HC flow = (TLP − aqueous)/TOS; aqueous flow = aqueous / sampling h"),
    ("Rx_MB", "m_i = y_i·MW_i / (y_Ar·39.948) · Ar_r (D52:AB80); averages over the reps (C52:C80)"),
    ("Rx_MB", "Gas product = Σ m_i without Ar (C12); MB closure = 100·(gas product + aqueous + HC)/(gas feed w/o Ar + liquid feed) (C13)"),
    ("Rx_MB", "Carbon C_i = 12.011·nC_i/MW_i · m_i (AC52:AC80, D121:AB150)"),
    ("C-Balance", "C in gas feed = G_r·(x'C2H2·24/26.038 + x'CH4·12/16 + x'C2H6·24/30.07 + x'C2H4·24/28.05)/100 (C4)"),
    ("C-Balance", "Carbon balance = 100·(C liq product + C gas product)/(C liq feed + C gas feed) (C9)"),
    ("C-Balance", "Acetylene conversion = (in − out)/in·100 (C19); ethylene selectivity from mean Nl/h with weights 1,1,1.5,2,2,3,3,4 (C21)"),
    ("C-Balance", "C4+ yield = ((C4+ liq out + C4+ gas out) − (0 + liquid feed))/(liquid feed)·100 (C15)"),
    ("Summary", "Gas-phase C'Bal by rep = 100·carbon of rep / C in gas feed; acetylene conversion by rep = 100 − 100·m_C2H2 / acetylene in"),
]


def _value(cell):
    v = cell.get("v")
    return v if not isinstance(v, (list, dict)) else str(v)


def workbook_bytes(results):
    wb = Workbook()
    wb.remove(wb.active)
    multi = len(results) > 1
    for result in results:
        for view in result["views"]:
            name = view["title"] if not multi else f"{result.get('sample') or ''} {view['title']}"
            ws = wb.create_sheet(name[:31].replace("/", "-"))
            r = 1
            for section in view["sections"]:
                ws.cell(r, 1, section["title"]).font = TITLE
                r += 1
                if section.get("note"):
                    ws.cell(r, 1, section["note"]); r += 1
                if section["columns"]:
                    for j, col in enumerate(["", "Unit", *section["columns"]], start=1):
                        ws.cell(r, j, col).font = HEAD
                    r += 1
                for row in section["rows"]:
                    ws.cell(r, 1, row["label"]); ws.cell(r, 2, row.get("unit") or None)
                    for j, cell in enumerate(row["cells"], start=3):
                        target = ws.cell(r, j, _value(cell))
                        if cell.get("in"):
                            target.fill = INPUT
                        if cell.get("flag") == "outlier":
                            target.fill = OUTLIER
                    r += 1
                r += 1
            ws.column_dimensions["A"].width = 44
    trend = wb.create_sheet("Run trend")
    head = ["Sample", "Reactor", "C'Bal [%]", "M'Bal [%]", "TOS [h]", "Ac conv [%]", "Ethy sel [%]", "C'Bal_g [g/h]", "C4+ yield [%]", "GC reps"]
    for j, h in enumerate(head, start=1):
        trend.cell(1, j, h).font = HEAD
    r = 2
    for result in results:
        for row in result["summary"]["rows"]:
            values = [result.get("sample"), f"R{row['reactor']}", row["carbon_balance"], row["mass_balance"], row["tos_h"],
                      row["acetylene_conversion"], row["ethylene_selectivity"], row["carbon_gas"], row["c4_yield"], row["rep_count"]]
            for j, v in enumerate(values, start=1):
                trend.cell(r, j, v)
            r += 1
    sheet = wb.create_sheet("Formulas")
    for i, (tab, text) in enumerate(FORMULAS, start=1):
        sheet.cell(i, 1, tab).font = HEAD
        sheet.cell(i, 2, text)
    sheet.column_dimensions["B"].width = 140
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
