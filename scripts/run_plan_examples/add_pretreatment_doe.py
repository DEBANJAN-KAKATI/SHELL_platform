"""Rebuild the DOE "Step 0 – Pretreatment" section of the universal Run Plan template (drying, reduction, feed cut-in).

usage: add_pretreatment_doe.py <in.xlsx> <out.xlsx> <program>
  program = "doe"     : keep the Step 0 steps already in the DOE sheet of <in.xlsx> (old 12-column table)
            "example" : the drying & reduction of the isomerisation catalyst in both blocks (Rheinland Block-1)
            "none"    : empty
Everything stays on the DOE sheet: step table (rows 108-131, still read by the dashboard as Step 0), settings per
block, graph data and one chart per block (temperature by phase + pressure vs time). Recalculate with LibreOffice.
"""
import sys
from copy import copy
from openpyxl import load_workbook
from openpyxl.chart import ScatterChart, Reference, Series
from openpyxl.chart.axis import NumericAxis
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

src, out, spec = sys.argv[1:4]
wb = load_workbook(src)
ws = wb["DOE"]

EXAMPLE = [  # gas, start T, target T, ramp, hold, pressure, remarks (= Rheinland Block-1, isomerisation catalyst)
    ("N2", 25, 25, 0, 2, 1, None),
    ("N2", 25, 300, 50, 2, 1, None),
    ("N2", 300, 150, 50, 0, 1, None),
    ("H2", 150, 150, 0, 2, 1, "Switch to H2 and flush until N2 < 0.5 vol% (online GC)"),
    ("H2", 150, 150, 0, 1, 5, "Increase pressure from 1 to 5 barg"),
    ("H2", 150, 300, 50, 2, 5, None),
    ("H2", 300, 210, 50, 0, 5, None),
    ("H2", 210, 210, 0, 1, 25, "Raise H2 pressure to the first operating pressure"),
    ("H2", 210, 210, 0, 1, 25, "Adjust H2 flow and introduce liquid feed as per condition 1"),
]
TOP = next((r for r in range(100, ws.max_row + 1)
            if str(ws.cell(r, 1).value or "").lower().startswith("step 0")), 108)


def old_steps():
    """Steps of the old Step 0 table (Step, Block, Gas, Start T, Target T, Ramp, Hold, Pressure, Gas flow, Reactors, Step time, Remarks)."""
    rows = []
    for r in range(TOP + 2, ws.max_row + 1):
        v = [ws.cell(r, c).value for c in range(1, 13)]
        if any(isinstance(x, str) and "total" in x.lower() for x in v if x):
            continue
        if any(x not in (None, "") for x in v[1:10] + v[11:12]):
            rows.append(dict(block=v[1], gas=v[2], t0=v[3], t1=v[4], ramp=v[5], hold=v[6], p=v[7], flow=v[8], rem=v[11]))
    return rows


if spec == "doe":
    steps = old_steps()
elif spec == "example":
    steps = [dict(block=b, gas=g, t0=a, t1=t, ramp=rr, hold=h, p=p, flow=None, rem=rem)
             for b in ("Block-1", "Block-2") for (g, a, t, rr, h, p, rem) in EXAMPLE]
else:
    steps = []
for i, s in enumerate(steps):                 # phase and pressure change from the step description
    last = i == len(steps) - 1 or steps[i + 1]["block"] != s["block"]
    s["phase"] = "Feed cut-in" if last and "feed" in str(s["rem"] or "").lower() else \
        {"N2": "Drying", "H2": "Reduction"}.get(str(s["gas"]).strip(), "Other")
    s["p_change"] = s["hold"] if s["rem"] and "1 to 5 barg" in s["rem"] else None   # as in the drying & reduction graph

# ---------------------------------------------------------------- styles of the template
S = {k: copy(ws[ref]._style) for k, ref in
     dict(sect="A108", text="A2", label="A9", head="A10", inp="K11", calc="H11", date_calc="D11", blank="A107").items()}
NUM = dict(T="0", h="0.0#", date=r"dd\-mmm\-yyyy\ hh:mm")

# ---------------------------------------------------------------- clear the old Step 0 section
for m in list(ws.merged_cells.ranges):
    if m.min_row >= TOP:
        ws.unmerge_cells(str(m))
for r in range(TOP, max(ws.max_row, 215) + 1):
    for c in range(1, 21):
        cell = ws.cell(r, c)
        cell.value = None
        cell._style = copy(S["blank"])
        cell.comment = None
    ws.row_dimensions[r].height = None
ws.data_validations.dataValidation = [dv for dv in ws.data_validations.dataValidation
                                      if min(rng.min_row for rng in dv.sqref.ranges) < TOP]
ws._charts = []


def put(ref, value, style, fmt=None, wrap=None):
    c = ws[ref]
    c.value = value
    c._style = copy(S[style])
    if fmt:
        c.number_format = fmt
    if wrap is not None:
        c.alignment = Alignment(wrap_text=wrap, vertical="center", horizontal=c.alignment.horizontal)
    return c


R0, R1 = TOP + 2, TOP + 21              # 20 step rows (110-129)
TOT = {"Block-1": R1 + 1, "Block-2": R1 + 2}
SET0 = R1 + 4                           # settings header (133)
SETCOL = {"Block-1": "E", "Block-2": "H"}
ROW = dict(name=SET0 + 1, cats=SET0 + 2, cutin=SET0 + 3, to_cut=SET0 + 4, start=SET0 + 5, time=SET0 + 6,
           end=SET0 + 7, steps=SET0 + 8)

# ---------------------------------------------------------------- Step 0 table (read by the dashboard)
put(f"A{TOP}", "Step 0 – Pretreatment / activation: drying, reduction and feed cut-in (runs before condition 1)", "sect")
HEAD = ["Step", "Block", "Start\n(date, time)", "End\n(date, time)", "Phase", "Gas", "Start T\n(°C)", "Target T\n(°C)",
        "Ramp\n(°C/h)", "Hold\n(h)", "Gas flow\n(NLPH)", "Pressure\n(barg)", "Remarks", "Pressure\nchange (h)",
        "Ramp time\n(h)", "Step time\n(h)", "Start\n(h)", "End\n(h)", "Check"]
for i, h in enumerate(HEAD):
    put(f"{chr(65 + i)}{TOP + 1}", h, "head")
ws.row_dimensions[TOP + 1].height = 39.75
for r in range(R0, R1 + 1):
    start_of = lambda col: (f'IF(B{r}="Block-1",IF(ISNUMBER($E${ROW["start"]}),$E${ROW["start"]}+{col}{r}/24,""),'
                            f'IF(B{r}="Block-2",IF(ISNUMBER($H${ROW["start"]}),$H${ROW["start"]}+{col}{r}/24,""),""))')
    put(f"A{r}", r - R0 + 1, "calc", "0")
    put(f"B{r}", None, "inp")
    put(f"C{r}", f'=IF(ISNUMBER(Q{r}),{start_of("Q")},"")', "date_calc", NUM["date"])
    put(f"D{r}", f'=IF(ISNUMBER(R{r}),{start_of("R")},"")', "date_calc", NUM["date"])
    put(f"E{r}", None, "inp"); put(f"F{r}", None, "inp")
    if r == R0:
        put(f"G{r}", None, "inp", NUM["T"])
    else:
        put(f"G{r}", f'=IF(AND(B{r}<>"",B{r}=B{r - 1},ISNUMBER(H{r - 1})),H{r - 1},"")', "calc", NUM["T"])
    for col, fmt in (("H", NUM["T"]), ("I", NUM["h"]), ("J", NUM["h"]), ("K", NUM["h"]), ("L", NUM["h"]), ("N", NUM["h"])):
        put(f"{col}{r}", None, "inp", fmt)
    put(f"M{r}", None, "inp", wrap=True)
    put(f"O{r}", f'=IF(AND(ISNUMBER(G{r}),ISNUMBER(H{r})),IF(G{r}=H{r},0,IF(AND(ISNUMBER(I{r}),I{r}>0),ABS(H{r}-G{r})/I{r},"")),"")',
        "calc", NUM["h"])
    put(f"P{r}", f'=IF(OR(B{r}="",AND(NOT(ISNUMBER(H{r})),NOT(ISNUMBER(J{r})))),"",IF(ISNUMBER(O{r}),O{r},0)+IF(ISNUMBER(J{r}),J{r},0))',
        "calc", NUM["h"])
    prev = f"SUMIF($B${R0}:B{r - 1},B{r},$P${R0}:P{r - 1})" if r > R0 else "0"
    put(f"Q{r}", f'=IF(ISNUMBER(P{r}),{prev},"")', "calc", NUM["h"])
    put(f"R{r}", f'=IF(ISNUMBER(P{r}),Q{r}+P{r},"")', "calc", NUM["h"])
    put(f"S{r}", f'=IF(ISNUMBER(P{r}),IF(E{r}="","Choose the phase",IF(F{r}="","Choose the gas",IF(NOT(ISNUMBER(L{r})),'
                 f'"Enter the pressure",IF(O{r}="","Enter the ramp rate","OK")))),IF(OR(E{r}<>"",F{r}<>"",M{r}<>"",'
                 f'ISNUMBER(H{r}),ISNUMBER(J{r})),IF(B{r}="","Choose the block","Enter target T or hold time"),""))', "calc")
for b, r in TOT.items():
    put(f"M{r}", f"{b} total (h)", "label")
    ws[f"M{r}"].alignment = Alignment(horizontal="right")
    put(f"P{r}", f'=IF(COUNTIFS($B${R0}:$B${R1},"{b}",$P${R0}:$P${R1},">=0")=0,"",SUMIF($B${R0}:$B${R1},"{b}",$P${R0}:$P${R1}))',
        "label", NUM["h"])

dvs = [DataValidation(type="list", formula1='"Block-1,Block-2"', allow_blank=True, sqref=f"B{R0}:B{R1}"),
       DataValidation(type="list", formula1='"Drying,Reduction,Sulfiding,Feed cut-in,Other"', allow_blank=True,
                      sqref=f"E{R0}:E{R1}"),
       DataValidation(type="list", formula1='"N2,H2,N2+H2,Air,Ar,H2S/H2,Other"', allow_blank=True, sqref=f"F{R0}:F{R1}"),
       DataValidation(type="decimal", operator="between", formula1="-50", formula2="1000", allow_blank=True,
                      sqref=f"G{R0}:H{R1}", errorTitle="Step 0", error="Temperature in °C"),
       DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                      sqref=f"I{R0}:L{R1} N{R0}:N{R1}", errorTitle="Step 0", error="Enter a number ≥ 0")]
for dv in dvs:
    ws.add_data_validation(dv)
ws.conditional_formatting.add(f"S{R0}:S{R1}", FormulaRule(formula=[f'AND($S{R0}<>"",$S{R0}<>"OK")'],
                              fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(color="9C0006")))
for s, r in zip(steps, range(R0, R1 + 1)):
    i = r - R0
    ws[f"B{r}"], ws[f"E{r}"], ws[f"F{r}"] = s["block"], s["phase"], s["gas"]
    if i == 0 or steps[i - 1]["block"] != s["block"] or steps[i - 1]["t1"] != s["t0"]:
        ws[f"G{r}"] = s["t0"]
    ws[f"H{r}"], ws[f"I{r}"], ws[f"J{r}"], ws[f"L{r}"] = s["t1"], s["ramp"], s["hold"], s["p"]
    ws[f"K{r}"] = s["flow"]
    ws[f"M{r}"] = s["rem"]
    if s["p_change"]:
        ws[f"N{r}"] = s["p_change"]

# ---------------------------------------------------------------- settings per block (feed cut-in, start, end)
put(f"A{SET0}", "Pretreatment settings", "head"); ws.merge_cells(f"A{SET0}:D{SET0}")
put(f"E{SET0}", "Block-1 (R1–R4)", "head"); ws.merge_cells(f"E{SET0}:G{SET0}")
put(f"H{SET0}", "Block-2 (R5–R8)", "head"); ws.merge_cells(f"H{SET0}:J{SET0}")
put(f"K{SET0}", "Note", "head"); ws.merge_cells(f"K{SET0}:M{SET0}")
labels = [
    ("name", "Program name", "inp", None, "e.g. Drying & reduction – isomerisation catalyst"),
    ("cats", "Catalysts (from Plan)", "calc", None, "Catalyst row of the Plan sheet"),
    ("cutin", "Feed cut-in (date, time)", "calc", NUM["date"], "Start of condition 1 of the block (DOE C11 / C59); overwrite if different"),
    ("to_cut", "Start to feed cut-in (h)", "calc", NUM["h"], "start of the 'Feed cut-in' step (end of the steps if none)"),
    ("start", "Pretreatment start (date, time)", "calc", NUM["date"], "feed cut-in − hours to feed cut-in"),
    ("time", "Program time (h)", "calc", NUM["h"], "sum of the step times of the block"),
    ("end", "Program end (date, time)", "calc", NUM["date"], None),
    ("steps", "Steps", "calc", "0", None),
]
for b, col in SETCOL.items():
    cond1 = "$C$11" if b == "Block-1" else "$C$59"
    cats = "Plan!$C$9:$F$9" if b == "Block-1" else "Plan!$G$9:$J$9"
    rng = lambda c: f"${c}${R0}:${c}${R1}"
    f = dict(
        name=None,
        cats=f'=_xlfn.TEXTJOIN(", ",TRUE,{cats})',
        cutin=f'=IF(ISNUMBER({cond1}),{cond1},"")',
        to_cut=(f'=IF(COUNTIFS({rng("B")},"{b}",{rng("E")},"Feed cut-in",{rng("P")},">=0")>0,'
                f'_xlfn.MINIFS({rng("Q")},{rng("B")},"{b}",{rng("E")},"Feed cut-in"),$P${TOT[b]})'),
        start=f'=IF(AND(ISNUMBER({col}{ROW["cutin"]}),ISNUMBER({col}{ROW["to_cut"]})),{col}{ROW["cutin"]}-{col}{ROW["to_cut"]}/24,"")',
        time=f"=$P${TOT[b]}",
        end=f'=IF(AND(ISNUMBER({col}{ROW["start"]}),ISNUMBER({col}{ROW["time"]})),{col}{ROW["start"]}+{col}{ROW["time"]}/24,"")',
        steps=f'=COUNTIFS({rng("B")},"{b}",{rng("P")},">=0")',
    )
    end_col = chr(ord(col) + 2)
    for key, label, style, fmt, note in labels:
        r = ROW[key]
        if b == "Block-1":
            put(f"A{r}", label, "label"); ws.merge_cells(f"A{r}:D{r}")
            put(f"K{r}", note, "text"); ws.merge_cells(f"K{r}:M{r}")
        for cc in range(ord(col), ord(end_col) + 1):
            put(f"{chr(cc)}{r}", None, style, fmt)
        ws[f"{col}{r}"].value = f[key]
        ws[f"{col}{r}"].alignment = Alignment(horizontal="center", vertical="center")
        ws.merge_cells(f"{col}{r}:{end_col}{r}")

NOTE0 = ROW["steps"] + 2
notes = [
    "Step 0 – how to use:",
    "1. One row per step and block (Block-1 = R1–R4, Block-2 = R5–R8: one heater per block). Enter the steps of a block one after "
    "the other; if both blocks follow the same program, enter it for each block.",
    "2. Phase: Drying, Reduction, Sulfiding, Feed cut-in or Other (colours of the chart). Start T is taken from the previous step "
    "of the same block (overwrite it if different). A step counts when a target temperature or a hold time is entered.",
    "3. Pressure change (h): blank = the pressure is set at the start of the step; a value = it changes linearly over that time "
    "(e.g. 1 → 5 barg over 1 h).",
    "4. The start of the 'Feed cut-in' step is the feed cut-in = start of condition 1 of the block; the step dates are counted "
    "back from it. Yellow = fill in, grey = calculated; the Check column must read OK.",
]
for i, t in enumerate(notes):
    put(f"A{NOTE0 + i}", t, "label" if i == 0 else "text")
    ws.merge_cells(f"A{NOTE0 + i}:S{NOTE0 + i}")
    if i:
        ws.row_dimensions[NOTE0 + i].height = 27
ws.merge_cells(f"A{TOP}:S{TOP}")

# ---------------------------------------------------------------- graph data: 3 points per step + charts
G_TITLE = NOTE0 + len(notes) + 1
GH, G0 = G_TITLE + 1, G_TITLE + 2
PHASES = ["Drying", "Reduction", "Sulfiding", "Feed cut-in", "Other"]
LEGEND = {"Drying": "Drying (N2)", "Reduction": "Reduction (H2)", "Sulfiding": "Sulfiding", "Feed cut-in": "Feed cut-in",
          "Other": "Other"}
COLOURS = {"Drying": "5B9BD5", "Reduction": "ED7D31", "Sulfiding": "FFC000", "Feed cut-in": "A5A5A5", "Other": "70AD47"}
put(f"A{G_TITLE}", "Step 0 graph data (calculated, used by the two charts – do not type; #N/A = not plotted)", "sect")
ws.merge_cells(f"A{G_TITLE}:U{G_TITLE}")
# A Step, B Block, C Phase, D Point, E Temperature | per block: time, 5 phases, pressure time, pressure (F-M, N-U)
GCOL = {"Block-1": 6, "Block-2": 14}
GHEAD = ["Step", "Block", "Phase", "Point", "Temperature\n(°C)"]
for blk in GCOL:
    b = "B1" if blk == "Block-1" else "B2"
    GHEAD += [f"{b} time\n(h)"] + [f"{b} {p}" for p in PHASES] + [f"{b} pressure\ntime (h)", f"{b} pressure\n(barg)"]
for k, h in enumerate(GHEAD):
    put(f"{get_column_letter(k + 1)}{GH}", h, "head")
ws.row_dimensions[GH].height = 39.75
for i in range(R1 - R0 + 1):
    s = R0 + i
    used = f"ISNUMBER($P${s})"
    tgt = f"IF(ISNUMBER($H${s}),$H${s},$G${s})"
    for p, name in enumerate(("Start", "Ramp end", "End")):
        g = G0 + 3 * i + p
        put(f"A{g}", i + 1, "calc", "0")
        put(f"B{g}", f'=IF({used},$B${s},"")', "calc")
        put(f"C{g}", f'=IF({used},$E${s},"")', "calc")
        put(f"D{g}", name, "calc")
        put(f"E{g}", f"=IF({used},{'$G$' + str(s) if p == 0 else tgt},NA())", "calc", NUM["T"])
        t = [f"$Q${s}", f"$Q${s}+IF(ISNUMBER($O${s}),$O${s},0)", f"$R${s}"][p]
        pt = [f"$Q${s}", f"$Q${s}+MIN(IF(ISNUMBER($N${s}),$N${s},0),$P${s})", f"$R${s}"][p]
        pv = f"IF(AND($B${s - 1}=$B${s},ISNUMBER($L${s - 1})),$L${s - 1},$L${s})" if p == 0 else f"$L${s}"
        for blk, c0 in GCOL.items():
            mine = f'$B{g}="{blk}"'
            put(f"{get_column_letter(c0)}{g}", f"=IF({mine},{t},NA())", "calc", NUM["h"])
            for k, ph in enumerate(PHASES):
                put(f"{get_column_letter(c0 + 1 + k)}{g}", f'=IF(AND({mine},$C{g}="{ph}"),$E{g},NA())', "calc", NUM["T"])
            put(f"{get_column_letter(c0 + 6)}{g}", f"=IF({mine},{pt},NA())", "calc", NUM["h"])
            put(f"{get_column_letter(c0 + 7)}{g}", f"=IF(AND({mine},ISNUMBER($L${s})),{pv},NA())", "calc", NUM["h"])
G1 = G0 + 3 * (R1 - R0 + 1) - 1
for c in "STU":
    ws.column_dimensions[c].width = 11

for n, (blk, anchor) in enumerate((("Block-1", f"W{TOP}"), ("Block-2", f"W{TOP + 24}"))):
    c0 = GCOL[blk]
    temp = ScatterChart()
    temp.title = f"{blk} (R{1 if n == 0 else 5}–R{4 if n == 0 else 8}) – Step 0 pretreatment"
    temp.style = 13
    temp.height, temp.width = 11.5, 22
    x = Reference(ws, min_col=c0, min_row=G0, max_row=G1)
    for k, ph in enumerate(PHASES):
        se = Series(Reference(ws, min_col=c0 + 1 + k, min_row=G0, max_row=G1), x, title=LEGEND[ph])
        se.marker.symbol = "none"
        se.smooth = False
        se.graphicalProperties.line.solidFill = COLOURS[ph]
        se.graphicalProperties.line.width = 28575
        temp.series.append(se)
    temp.x_axis.title = "Time, hrs"
    temp.y_axis.title = "Temperature, °C"
    temp.x_axis.scaling.min = 0
    temp.y_axis.scaling.min = 0
    temp.legend.position = "t"
    pres = ScatterChart()
    ps = Series(Reference(ws, min_col=c0 + 7, min_row=G0, max_row=G1), Reference(ws, min_col=c0 + 6, min_row=G0, max_row=G1),
                title="Pressure")
    ps.marker.symbol = "none"
    ps.smooth = False
    ps.graphicalProperties.line.solidFill = "404040"
    ps.graphicalProperties.line.dashStyle = "dash"
    ps.graphicalProperties.line.width = 22225
    pres.series.append(ps)
    temp.x_axis.axPos, temp.y_axis.axPos = "b", "l"
    pres.x_axis = NumericAxis(axId=500, crossAx=200, axPos="b", delete=True)   # hidden secondary time axis (same data range)
    pres.x_axis.scaling.min = 0
    pres.y_axis.axId = 200
    pres.y_axis.crossAx = 500
    pres.y_axis.axPos = "r"
    pres.y_axis.title = "Pressure, barg"
    pres.y_axis.crosses = "max"
    pres.y_axis.scaling.min = 0
    pres.y_axis.majorGridlines = None
    for ax in (temp.x_axis, temp.y_axis, pres.y_axis):
        ax.delete = False
    pres.x_axis.delete = True
    temp += pres
    ws.add_chart(temp, anchor)

if "Pretreatment" in wb.sheetnames:
    del wb["Pretreatment"]
wb.save(out)
print("saved", out, len(steps), "steps; rows", TOP, R0, R1, TOT, SET0, NOTE0, G_TITLE, G0, G1)
