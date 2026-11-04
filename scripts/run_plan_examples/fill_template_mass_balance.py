"""Fill the universal Run Plan template (SS) with the ILS-8 mass balance plan (R08, Oct 2024)."""
import sys
from copy import copy
from datetime import datetime
from openpyxl import load_workbook
from openpyxl.comments import Comment

template, source, out = sys.argv[1:4]
T, R = load_workbook(template), load_workbook(source)
isf = lambda v: isinstance(v, str) and v.startswith("=")
note = lambda cell, text: setattr(cell, "comment", Comment(text, "Run Plan"))
p, d, f = T["Plan"], T["DOE"], T["Feed"]
rp, rd, rf = R["Plan"], R["DOE"], R["Feed"]

def clear_inputs(ws, rows, cols):
    for r in rows:
        for col in cols:
            c = ws.cell(r, col)
            if c.value is not None and not isf(c.value) and type(c).__name__ == "Cell":
                c.value = None

# ---------------- Plan: header, catalyst loading plan, flow basis
p["B1"] = "R08 - ILS-8 mass balance (acetylene hydrogenation)"
p["H1"] = rp["C23"].value                                   # Run Start 24.10.2024 14:00
p["B2"] = rp["B2"].value
note(p["H1"], "Run Start = Feed Cut-In of the mass balance plan (time zero of TOS and of the first sample window).")
clear_inputs(p, range(8, 23), range(3, 11))
src_col = {1: "C", 5: "G", 6: "H"}                           # loaded reactors R1, R5, R6
for i in range(8):
    col = 3 + i
    s = src_col.get(i + 1)
    p.cell(8, col).value = "Catalyst" if s else "Not used"
    if not s:
        continue
    get = lambda row: rp[f"{s}{row}"].value
    p.cell(9, col).value = get(6)                           # catalyst
    p.cell(12, col).value = get(7)                          # shape & size
    p.cell(13, col).value = get(8)                          # volume, ml
    p.cell(14, col).value = get(9)                          # CBD as-is
    p.cell(18, col).value, p.cell(19, col).value, p.cell(20, col).value = get(11), get(12), get(13)
    p.cell(21, col).value = get(14)                         # loaded weight
p["C25"], p["C26"], p["C27"], p["C31"] = "LHSV", "GoR (Nl/ml)", "No", 0
note(p["C26"], "Mass balance: the gas is a mixed gas with 5 mol% argon internal standard, so the gas flow is set by GoR "
               "(total gas, Nl per ml liquid) and not by an H2/HC ratio. The H2 and N2 dilution columns of the DOE read n/a.")
note(p["C31"], "No separate N2 dilution in the mass balance run (N2 is part of the mixed gas).")

# ---------------- DOE: clear the template's example conditions, enter one condition per block
inputs = (3, 5, 6, 11, 12, 13, 14)                           # C, E, F, K, L, M, N
for r in range(11, 107):
    for col in inputs:
        c = d.cell(r, col)
        if c.value is not None and not isf(c.value):
            c.value = None
start = rd["C11"].value
blocks = {
    11: dict(T=rd["E11"].value, P=rd["F11"].value, sv=rd["J11"].value, gor=rd["K11"].value, end=rd["D11"].value,
             remark="Gas 1563.4 NmL/h"),
    59: dict(T=rd["E15"].value, P=rd["F15"].value, sv=rd["J15"].value, gor=rd["K15"].value, end=rd["D15"].value,
             remark="Gas 3126.2 NmL/h; stopped 27.10 08:30"),
}
for r, b in blocks.items():
    d.cell(r, 3).value = start
    d.cell(r, 5).value, d.cell(r, 6).value = b["T"], b["P"]
    d.cell(r, 11).value, d.cell(r, 12).value = b["sv"], b["gor"]
    d.cell(r, 13).value = b["remark"]
    d.cell(r, 14).value = round((b["end"] - start).total_seconds() / 3600, 2)
d["M60"] = "Gas 3126.7 NmL/h; stopped 27.10 08:30"
for r in (12, 13, 14, 61, 62):
    d.cell(r, 13).value = "Not loaded"
note(d["M11"], "Measured feed gas (Ar 5 % + mixed gas); liquid 0.5 g/h. The DOE Total gas column is the planned GoR value.")
note(d["N11"], "Block-1 (R1): 24.10.2024 14:00 to 27.10.2024 18:30 = 76.5 h (last liquid sample C1-S4 at 17:30).")
note(d["N59"], "Block-2 (R5, R6): 24.10.2024 14:00 to 27.10.2024 08:30 = 66.5 h (gas to R5/R6 stopped).")
note(d["L11"], "GoR = total gas / liquid volume: 1.5634 Nl/h / (0.5 g/h / 0.84 g/ml) = 2.6 Nl/ml.")
note(d["L59"], "GoR = 3.126 Nl/h / (0.5 g/h / 0.84 g/ml) = 5.3 Nl/ml (R5 and R6).")
note(d["K11"], "LHSV = 0.5 g/h / 0.84 g/ml / 3 ml = 0.198 /h (the Plan sheet of the source lists the target 0.17 /h).")
for r in range(110, 120):                                    # Step 0: no pretreatment in the source plan
    for col in range(2, 11):
        if not isf(d.cell(r, col).value):
            d.cell(r, col).value = None
note(d["A108"], "No pretreatment step is given in the mass balance plan - fill in the steps if the catalysts were reduced.")

# ---------------- Feed: liquid properties, no component analysis (diesel), gas = total feed gas mol%
for r in list(range(2, 14)) + list(range(15, 45)):
    if not isf(f[f"E{r}"].value):
        f[f"E{r}"].value = None
for r in range(15, 23):
    if not isf(f[f"J{r}"].value):
        f[f"J{r}"].value = None
for r in range(15, 32):
    if not isf(f[f"O{r}"].value):
        f[f"O{r}"].value = None
f["E2"], f["E3"], f["E4"] = rf["E9"].value, rf["E10"].value, "Single feed"
f["E5"], f["E6"], f["E7"], f["E8"] = rf["E8"].value, rf["E2"].value, rf["E3"].value, rf["E4"].value
f["E11"], f["E12"] = rf["E6"].value, rf["E7"].value
f["G6"] = "Carbon in the liquid feed (C-Balance). Oxygen 0 wt% (no separate row)"
f["G5"] = "Density of the liquid feed (g/mL in the source plan)"
note(f["E15"], "Diesel feed: no component (DHA) analysis in the mass balance plan, so the component and group tables are empty.")
ar, mixed = rf["E13"].value, rf["E14"].value                # 5 / 95 mol%
gas_rows = {"hydrogen": 15, "nitrogen": 16, "methane": 18, "ethane": 19, "ethylene": 20, "acetylene": 21}
mix = {}
for r in range(16, 22):
    name = str(rf[f"A{r}"].value).split("–")[-1].strip().lower()
    mix[name] = rf[f"E{r}"].value
for name, row in gas_rows.items():
    f[f"O{row}"].value = round(mix[name] * mixed / 100, 4)
f["O17"].value = ar
rest = round(100 - ar - sum(round(v * mixed / 100, 4) for v in mix.values()), 4)
f["O28"].value = rest
note(f["O15"], "Feed gas = 5 mol% Ar + 95 mol% mixed gas. Each component = mixed-gas mol% x 0.95 "
               "(mixed gas: H2 20.904, N2 59.798, CH4 2.535, C2H6 0.002, C2H4 1.613, C2H2 7.822 mol%).")
note(f["O28"], f"Balance to 100 mol%: the mixed-gas composition (ZMB GC, ESTD not normalised) adds up to "
               f"{sum(mix.values()):.3f} mol%; the rest x 0.95 = {rest} mol% is entered here as 'Other'.")
f["E47"], f["E48"] = "Ar", 100
f["G48"] = "100 %: the GoR on Plan/DOE is total gas (incl. Ar) per ml liquid"
note(f["E47"], "Argon 5 mol% is the internal standard of the mass balance. Total gas feed (01i14FI01) 6.775 g/h.")

# ---------------- Liq sheet: kept from the mass balance plan (samples + ZMB liquid reps), not read by the dashboard yet
lq = T.create_sheet("Liq")
src = R["Liq"]
for row in src.iter_rows():
    for c in row:
        n = lq.cell(c.row, c.column, c.value)
        if c.has_style:
            n._style = copy(c._style)
for k, dim in src.column_dimensions.items():
    lq.column_dimensions[k].width = dim.width
for k, dim in src.row_dimensions.items():
    lq.row_dimensions[k].height = dim.height
for m in src.merged_cells.ranges:
    lq.merge_cells(str(m))
T.save(out)
print("saved", out, "gas other", rest)
