"""DOE "Step 0 – Pre-run" section of the universal Run Plan template (drying, reduction, sulfiding, feed cut-in ...).

usage: prerun_doe_v2.py <in.xlsx> <out.xlsx> [blank|doe]
  blank (default): empty step table (the template)
  doe            : keep the steps of an old 12-column Step 0 table of <in.xlsx> (to convert a filled Run Plan)
Only DOE rows from the "Step 0" title down are rebuilt; Plan, Feed and the DOE conditions are not touched.
"""
import sys
from copy import copy
from openpyxl import load_workbook
from openpyxl.chart import ScatterChart, Reference, Series
from openpyxl.chart.axis import NumericAxis
from openpyxl.chart.data_source import StrRef
from openpyxl.chart.series import SeriesLabel
from openpyxl.chart.text import Text
from openpyxl.chart.title import Title
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

src, out = sys.argv[1:3]
mode = sys.argv[3] if len(sys.argv) > 3 else "blank"
wb = load_workbook(src)
ws = wb["DOE"]
TOP = next((r for r in range(100, ws.max_row + 1)
            if str(ws.cell(r, 1).value or "").lower().startswith("step 0")), 108)

# ------------------------------------------------------------- steps to keep (conversion of an old Step 0 table only)
steps = []
if mode == "doe":
    for r in range(TOP + 2, ws.max_row + 1):
        v = [ws.cell(r, c).value for c in range(1, 13)]
        if any(isinstance(x, str) and "total" in x.lower() for x in v if x):
            continue
        if any(x not in (None, "") for x in v[1:10] + v[11:12]):
            steps.append(dict(block=v[1], gas=v[2], t0=v[3], t1=v[4], ramp=v[5], hold=v[6], p=v[7], flow=v[8], rem=v[11]))
    for i, s in enumerate(steps):
        last = i == len(steps) - 1 or steps[i + 1]["block"] != s["block"]
        s["phase"] = "Feed cut-in" if last and "feed" in str(s["rem"] or "").lower() else \
            {"N2": "Drying", "H2": "Reduction"}.get(str(s["gas"]).strip(), "Other")
        s["p_change"] = s["hold"] if s["rem"] and "1 to 5 barg" in s["rem"] else None

# ------------------------------------------------------------- styles of the template
S = {k: copy(ws[ref]._style) for k, ref in
     dict(sect="A108", text="A2", label="A9", head="A10", inp="K11", calc="H11", date_calc="D11", blank="A107").items()}
NUM = dict(T="0", h="0.0#", date=r"dd\-mmm\-yyyy\ hh:mm")

# ------------------------------------------------------------- clear the old Step 0 section (rows TOP..)
for m in list(ws.merged_cells.ranges):
    if m.min_row >= TOP:
        ws.unmerge_cells(str(m))
for r in range(TOP, max(ws.max_row, 270) + 1):
    for c in range(1, 26):
        cell = ws.cell(r, c)
        cell.value = None
        cell._style = copy(S["blank"])
        cell.comment = None
    ws.row_dimensions[r].height = None
ws.data_validations.dataValidation = [dv for dv in ws.data_validations.dataValidation
                                      if min(rng.min_row for rng in dv.sqref.ranges) < TOP]
ws._charts = []


def put(ref, value, style, fmt=None, wrap=None, align=None):
    c = ws[ref]
    c.value = value
    c._style = copy(S[style])
    if fmt:
        c.number_format = fmt
    if wrap is not None or align:
        c.alignment = Alignment(wrap_text=bool(wrap), vertical="center", horizontal=align or c.alignment.horizontal)
    return c


N_STEPS = 30
R0, R1 = TOP + 2, TOP + 1 + N_STEPS                      # 110-139
TOT = {"Block-1": R1 + 1, "Block-2": R1 + 2}             # 140, 141
SET0 = R1 + 4                                            # 143
ROW = {k: SET0 + 1 + i for i, k in enumerate(("name", "cats", "cutin", "to_cut", "start", "time", "end", "steps"))}
CH0 = ROW["steps"] + 2                                   # chart settings header (153)
PH_ROWS = list(range(CH0 + 1, CH0 + 6))                  # 5 phase names (154-158)
AXIS_ROW = CH0 + 6                                       # right axis choice (159)
PHASES = ["Drying", "Reduction", "Sulfiding", "Feed cut-in", "Other"]
COLOURS = ["5B9BD5", "ED7D31", "FFC000", "A5A5A5", "70AD47"]
COLOUR_NAMES = ["blue", "orange", "yellow", "grey", "green"]
AXIS_OPTIONS = ["Pressure (barg)", "Gas flow (NLPH)", "Liquid flow (g/h)"]
PH = [f"$E${r}" for r in PH_ROWS]                        # phase name cells
CUTIN = PH[3]
AX = f"$E${AXIS_ROW}"

# ------------------------------------------------------------- step table (read by the dashboard as "Step 0")
put(f"A{TOP}", "Step 0 – Pre-run: drying, reduction, sulfiding, feed cut-in … (runs before condition 1)", "sect")
ws.merge_cells(f"A{TOP}:T{TOP}")
HEAD = ["Step", "Block", "Start\n(date, time)", "End\n(date, time)", "Phase", "Gas", "Start T\n(°C)", "Target T\n(°C)",
        "Ramp\n(°C/h)", "Hold\n(h)", "Pressure\n(barg)", "Pressure\nchange (h)", "Remarks", "Gas flow\n(NLPH)",
        "Liquid flow\n(g/h)", "Ramp time\n(h)", "Step time\n(h)", "Start\n(h)", "End\n(h)", "Check"]
for i, h in enumerate(HEAD):
    put(f"{get_column_letter(i + 1)}{TOP + 1}", h, "head")
ws.row_dimensions[TOP + 1].height = 39.75
for r in range(R0, R1 + 1):
    def date_of(col):
        return (f'IF(B{r}="Block-1",IF(ISNUMBER($E${ROW["start"]}),$E${ROW["start"]}+{col}{r}/24,""),'
                f'IF(B{r}="Block-2",IF(ISNUMBER($H${ROW["start"]}),$H${ROW["start"]}+{col}{r}/24,""),""))')
    put(f"A{r}", r - R0 + 1, "calc", "0")
    put(f"B{r}", None, "inp")
    put(f"C{r}", f'=IF(ISNUMBER(R{r}),{date_of("R")},"")', "date_calc", NUM["date"])
    put(f"D{r}", f'=IF(ISNUMBER(S{r}),{date_of("S")},"")', "date_calc", NUM["date"])
    put(f"E{r}", None, "inp"); put(f"F{r}", None, "inp")
    if r == R0:
        put(f"G{r}", None, "inp", NUM["T"])
    else:   # start T = target T of the previous step of the same block (can be overwritten)
        put(f"G{r}", f'=IF(AND(B{r}<>"",B{r}=B{r - 1},ISNUMBER(H{r - 1})),H{r - 1},"")', "inp", NUM["T"])
    for col, fmt in (("H", NUM["T"]), ("I", NUM["h"]), ("J", NUM["h"]), ("K", NUM["h"]), ("L", NUM["h"]),
                     ("N", NUM["h"]), ("O", NUM["h"])):
        put(f"{col}{r}", None, "inp", fmt)
    put(f"M{r}", None, "inp", wrap=True)
    put(f"P{r}", f'=IF(AND(ISNUMBER(G{r}),ISNUMBER(H{r})),IF(G{r}=H{r},0,IF(AND(ISNUMBER(I{r}),I{r}>0),ABS(H{r}-G{r})/I{r},"")),"")',
        "calc", NUM["h"])
    put(f"Q{r}", f'=IF(OR(B{r}="",AND(NOT(ISNUMBER(H{r})),NOT(ISNUMBER(J{r})))),"",IF(ISNUMBER(P{r}),P{r},0)+IF(ISNUMBER(J{r}),J{r},0))',
        "calc", NUM["h"])
    prev = f"SUMIF($B${R0}:B{r - 1},B{r},$Q${R0}:Q{r - 1})" if r > R0 else "0"
    put(f"R{r}", f'=IF(ISNUMBER(Q{r}),{prev},"")', "calc", NUM["h"])
    put(f"S{r}", f'=IF(ISNUMBER(Q{r}),R{r}+Q{r},"")', "calc", NUM["h"])
    put(f"T{r}", f'=IF(ISNUMBER(Q{r}),IF(E{r}="","Choose the phase",IF(F{r}="","Choose the gas",IF(NOT(ISNUMBER(K{r})),'
                 f'"Enter the pressure",IF(P{r}="","Enter the ramp rate","OK")))),IF(OR(E{r}<>"",F{r}<>"",M{r}<>"",'
                 f'ISNUMBER(H{r}),ISNUMBER(J{r})),IF(B{r}="","Choose the block","Enter target T or hold time"),""))', "calc")
for b, r in TOT.items():
    put(f"M{r}", f"{b} total (h)", "label", align="right")
    put(f"Q{r}", f'=IF(COUNTIFS($B${R0}:$B${R1},"{b}",$Q${R0}:$Q${R1},">=0")=0,"",SUMIF($B${R0}:$B${R1},"{b}",$Q${R0}:$Q${R1}))',
        "label", NUM["h"])
for s, r in zip(steps, range(R0, R1 + 1)):          # conversion only
    i = r - R0
    ws[f"B{r}"], ws[f"E{r}"], ws[f"F{r}"] = s["block"], s["phase"], s["gas"]
    if i == 0 or steps[i - 1]["block"] != s["block"] or steps[i - 1]["t1"] != s["t0"]:
        ws[f"G{r}"] = s["t0"]
    ws[f"H{r}"], ws[f"I{r}"], ws[f"J{r}"], ws[f"K{r}"] = s["t1"], s["ramp"], s["hold"], s["p"]
    ws[f"N{r}"], ws[f"M{r}"] = s["flow"], s["rem"]
    if s["p_change"]:
        ws[f"L{r}"] = s["p_change"]

for dv in (
    DataValidation(type="list", formula1='"Block-1,Block-2"', allow_blank=True, sqref=f"B{R0}:B{R1}"),
    DataValidation(type="list", formula1=f"$E${PH_ROWS[0]}:$E${PH_ROWS[-1]}", allow_blank=True, sqref=f"E{R0}:E{R1}",
                   showErrorMessage=False),
    DataValidation(type="list", formula1='"N2,H2,N2+H2,Air,Ar,H2S/H2,Other"', allow_blank=True, sqref=f"F{R0}:F{R1}",
                   showErrorMessage=False),
    DataValidation(type="decimal", operator="between", formula1="-50", formula2="1000", allow_blank=True,
                   sqref=f"G{R0}:H{R1}", errorTitle="Step 0", error="Temperature in °C"),
    DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                   sqref=f"I{R0}:L{R1} N{R0}:O{R1}", errorTitle="Step 0", error="Enter a number ≥ 0"),
    DataValidation(type="list", formula1='"' + ",".join(AXIS_OPTIONS) + '"', allow_blank=False, sqref=AX.replace("$", "")),
):
    ws.add_data_validation(dv)
ws.conditional_formatting.add(f"T{R0}:T{R1}", FormulaRule(formula=[f'AND($T{R0}<>"",$T{R0}<>"OK")'],
                              fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(color="9C0006")))
ws.conditional_formatting.add(f"G{R0 + 1}:G{R1}", FormulaRule(formula=[f"AND(G{R0 + 1}<>\"\",NOT(_xlfn.ISFORMULA(G{R0 + 1})))"],
                              fill=PatternFill("solid", fgColor="F4B183")))
ws.column_dimensions["T"].width = 22

# ------------------------------------------------------------- settings per block
def table_head(row, first, b1, b2, note):
    put(f"A{row}", first, "head"); ws.merge_cells(f"A{row}:D{row}")
    put(f"E{row}", b1, "head"); ws.merge_cells(f"E{row}:G{row}")
    put(f"H{row}", b2, "head"); ws.merge_cells(f"H{row}:J{row}")
    put(f"K{row}", note, "head"); ws.merge_cells(f"K{row}:M{row}")


def value_cells(row, col, value, style, fmt=None):
    end = get_column_letter(ws[f"{col}1"].column + 2)
    for c in range(ws[f"{col}1"].column, ws[f"{col}1"].column + 3):
        put(f"{get_column_letter(c)}{row}", None, style, fmt)
    ws[f"{col}{row}"].value = value
    ws[f"{col}{row}"].alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells(f"{col}{row}:{end}{row}")


def label_row(row, label, note):
    put(f"A{row}", label, "label"); ws.merge_cells(f"A{row}:D{row}")
    put(f"K{row}", note, "text"); ws.merge_cells(f"K{row}:M{row}")


table_head(SET0, "Pre-run settings", "Block-1 (R1–R4)", "Block-2 (R5–R8)", "Note")
labels = [
    ("name", "Program name", "inp", None, "Free text, e.g. drying & reduction of catalyst …"),
    ("cats", "Catalysts (from Plan)", "calc", None, "Catalyst row of the Plan sheet (read only)"),
    ("cutin", "Feed cut-in (date, time)", "calc", NUM["date"], "Start of condition 1 of the block (DOE C11 / C59); overwrite if different"),
    ("to_cut", "Start to feed cut-in (h)", "calc", NUM["h"], "Start of the feed cut-in step (phase 4); end of the steps if there is none"),
    ("start", "Pre-run start (date, time)", "calc", NUM["date"], "Feed cut-in − hours to feed cut-in"),
    ("time", "Program time (h)", "calc", NUM["h"], "Sum of the step times of the block"),
    ("end", "Program end (date, time)", "calc", NUM["date"], ""),
    ("steps", "Steps", "calc", "0", ""),
]
for b, col in (("Block-1", "E"), ("Block-2", "H")):
    cond1 = "$C$11" if b == "Block-1" else "$C$59"
    cats = "Plan!$C$9:$F$9" if b == "Block-1" else "Plan!$G$9:$J$9"
    rng = lambda c: f"${c}${R0}:${c}${R1}"
    f = dict(
        name=None,
        cats=f'=_xlfn.TEXTJOIN(", ",TRUE,{cats})',
        cutin=f'=IF(ISNUMBER({cond1}),{cond1},"")',
        to_cut=(f'=IF(COUNTIFS({rng("B")},"{b}",{rng("E")},{CUTIN},{rng("Q")},">=0")>0,'
                f'_xlfn.MINIFS({rng("R")},{rng("B")},"{b}",{rng("E")},{CUTIN}),$Q${TOT[b]})'),
        start=f'=IF(AND(ISNUMBER({col}{ROW["cutin"]}),ISNUMBER({col}{ROW["to_cut"]})),{col}{ROW["cutin"]}-{col}{ROW["to_cut"]}/24,"")',
        time=f"=$Q${TOT[b]}",
        end=f'=IF(AND(ISNUMBER({col}{ROW["start"]}),ISNUMBER({col}{ROW["time"]})),{col}{ROW["start"]}+{col}{ROW["time"]}/24,"")',
        steps=f'=COUNTIFS({rng("B")},"{b}",{rng("Q")},">=0")',
    )
    for key, label, style, fmt, note in labels:
        if b == "Block-1":
            label_row(ROW[key], label, note)
        value_cells(ROW[key], col, f[key], style, fmt)

# chart settings: phase names (drop-down of the Phase column, chart legend) and right axis
table_head(CH0, "Chart settings", "Value", "Chart colour", "Note")
for i, r in enumerate(PH_ROWS):
    label_row(r, f"Phase {i + 1}", "Rename if needed (drop-down of the Phase column and chart legend)" if i == 0 else
              ("The start of this phase is the feed cut-in" if i == 3 else ""))
    value_cells(r, "E", PHASES[i], "inp")
    value_cells(r, "H", COLOUR_NAMES[i], "calc")
    ws[f"H{r}"].font = Font(b=True, color=COLOURS[i])
label_row(AXIS_ROW, "Chart right axis", "Pressure, gas flow or liquid flow against time (dashed line)")
value_cells(AXIS_ROW, "E", AXIS_OPTIONS[0], "inp")
value_cells(AXIS_ROW, "H", "dashed", "calc")

NOTE0 = AXIS_ROW + 2
notes = [
    "Step 0 – how to use:",
    "1. One row per step: choose the block (Block-1 = R1–R4, Block-2 = R5–R8; one heater per block), then fill phase, gas, "
    "temperatures, ramp, hold, pressure and – if used – gas / liquid flow. Enter the steps of a block one after the other; "
    "if both blocks follow the same program, enter it for each block. 30 rows; do not insert rows (the graph data refers to them).",
    "2. Start T is taken from the previous step of the same block (overwrite it if different: the cell turns orange). "
    "A step counts when a target temperature or a hold time is entered. Ramp time = |target − start| / ramp.",
    "3. Pressure change (h): blank = the pressure is set at the start of the step; a value = it changes linearly over that "
    "time (e.g. 1 → 5 barg over 1 h). Gas and liquid flows change at the start of the step.",
    "4. Phases and their chart colours are set under Chart settings (rename them if needed). The start of phase 4 "
    "(Feed cut-in) is the feed cut-in = start of condition 1 of the block; the step dates are counted back from it.",
    "5. Yellow = fill in, grey = calculated. The Check column must read OK. The charts on the right show temperature by "
    "phase and the chosen right-axis value against time for each block.",
]
for i, t in enumerate(notes):
    put(f"A{NOTE0 + i}", t, "label" if i == 0 else "text")
    ws.merge_cells(f"A{NOTE0 + i}:T{NOTE0 + i}")
    if i:
        ws.row_dimensions[NOTE0 + i].height = 27

# ------------------------------------------------------------- graph data: 3 points per step
G_TITLE = NOTE0 + len(notes) + 1
GH, G0 = G_TITLE + 1, G_TITLE + 2
put(f"A{G_TITLE}", "Step 0 graph data (calculated, used by the two charts – do not type; #N/A = not plotted)", "sect")
ws.merge_cells(f"A{G_TITLE}:T{G_TITLE}")
GCOL = {"Block-1": 7, "Block-2": 15}         # per block: time, 5 phases, right-axis time, right-axis value
GHEAD = ["Step", "Block", "Phase", "Point", "Temperature\n(°C)", "Right axis\nvalue"]
for blk in GCOL:
    b = "B1" if blk == "Block-1" else "B2"
    GHEAD += [f"{b} time\n(h)"] + [f"{b} phase {k + 1}" for k in range(5)] + [f"{b} right\ntime (h)", f"{b} right\nvalue"]
for k, h in enumerate(GHEAD):
    put(f"{get_column_letter(k + 1)}{GH}", h, "head")
ws.row_dimensions[GH].height = 39.75


def right_value(s):
    return (f'IF({AX}="{AXIS_OPTIONS[1]}",$N${s},IF({AX}="{AXIS_OPTIONS[2]}",$O${s},$K${s}))')


for i in range(N_STEPS):
    s = R0 + i
    used = f"ISNUMBER($Q${s})"
    tgt = f"IF(ISNUMBER($H${s}),$H${s},$G${s})"
    rv = right_value(s)
    prev = f"IF(AND($B${s - 1}=$B${s},ISNUMBER({right_value(s - 1)})),{right_value(s - 1)},{rv})" if i else rv
    change = f'IF(AND({AX}="{AXIS_OPTIONS[0]}",ISNUMBER($L${s})),MIN($L${s},$Q${s}),0)'
    for p, name in enumerate(("Start", "Ramp end", "End")):
        g = G0 + 3 * i + p
        put(f"A{g}", i + 1, "calc", "0")
        put(f"B{g}", f'=IF({used},$B${s},"")', "calc")
        put(f"C{g}", f'=IF({used},$E${s},"")', "calc")
        put(f"D{g}", name, "calc")
        put(f"E{g}", f"=IF({used},{'$G$' + str(s) if p == 0 else tgt},NA())", "calc", NUM["T"])
        put(f"F{g}", f"=IF({used},IF(ISNUMBER({rv}),{prev if p == 0 else rv},NA()),NA())", "calc", NUM["h"])
        t = [f"$R${s}", f"$R${s}+IF(ISNUMBER($P${s}),$P${s},0)", f"$S${s}"][p]
        rt = [f"$R${s}", f"$R${s}+{change}", f"$S${s}"][p]
        for blk, c0 in GCOL.items():
            mine = f'$B{g}="{blk}"'
            put(f"{get_column_letter(c0)}{g}", f"=IF({mine},{t},NA())", "calc", NUM["h"])
            for k in range(5):
                put(f"{get_column_letter(c0 + 1 + k)}{g}", f"=IF(AND({mine},$C{g}={PH[k]}),$E{g},NA())", "calc", NUM["T"])
            put(f"{get_column_letter(c0 + 6)}{g}", f"=IF({mine},{rt},NA())", "calc", NUM["h"])
            put(f"{get_column_letter(c0 + 7)}{g}", f"=IF({mine},$F{g},NA())", "calc", NUM["h"])
G1 = G0 + 3 * N_STEPS - 1
for c in ("U", "V"):
    ws.column_dimensions[c].width = 11

# ------------------------------------------------------------- charts (one per block)
def cell_title(ref):
    return Title(tx=Text(strRef=StrRef(f"'DOE'!{ref}")), overlay=False)


for n, (blk, anchor) in enumerate((("Block-1", f"X{TOP}"), ("Block-2", f"X{TOP + 25}"))):
    c0 = GCOL[blk]
    temp = ScatterChart()
    temp.title = f"{blk} (R{1 if n == 0 else 5}–R{4 if n == 0 else 8}) – Step 0 pre-run"
    temp.style = 13
    temp.height, temp.width = 12, 22
    x = Reference(ws, min_col=c0, min_row=G0, max_row=G1)
    for k in range(5):
        se = Series(Reference(ws, min_col=c0 + 1 + k, min_row=G0, max_row=G1), x)
        se.tx = SeriesLabel(strRef=StrRef(f"'DOE'!{PH[k]}"))
        se.marker.symbol = "none"
        se.smooth = False
        se.graphicalProperties.line.solidFill = COLOURS[k]
        se.graphicalProperties.line.width = 28575
        temp.series.append(se)
    temp.x_axis.title = "Time, hrs"
    temp.y_axis.title = "Temperature, °C"
    temp.x_axis.scaling.min = 0
    temp.y_axis.scaling.min = 0
    temp.x_axis.axPos, temp.y_axis.axPos = "b", "l"
    temp.legend.position = "t"
    right = ScatterChart()
    rs = Series(Reference(ws, min_col=c0 + 7, min_row=G0, max_row=G1), Reference(ws, min_col=c0 + 6, min_row=G0, max_row=G1))
    rs.tx = SeriesLabel(strRef=StrRef(f"'DOE'!{AX}"))
    rs.marker.symbol = "none"
    rs.smooth = False
    rs.graphicalProperties.line.solidFill = "404040"
    rs.graphicalProperties.line.dashStyle = "dash"
    rs.graphicalProperties.line.width = 22225
    right.series.append(rs)
    right.x_axis = NumericAxis(axId=500, crossAx=200, axPos="b", delete=True)   # hidden secondary time axis
    right.x_axis.scaling.min = 0
    right.y_axis.axId = 200
    right.y_axis.crossAx = 500
    right.y_axis.axPos = "r"
    right.y_axis.crosses = "max"
    right.y_axis.scaling.min = 0
    right.y_axis.majorGridlines = None
    right.y_axis.title = "Pressure, barg / flow (see legend)"
    for ax in (temp.x_axis, temp.y_axis, right.y_axis):
        ax.delete = False
    temp += right
    ws.add_chart(temp, anchor)

wb.calculation.fullCalcOnLoad = True
wb.save(out)
print("saved", out, mode, len(steps), "steps; rows: steps", R0, R1, "totals", TOT, "settings", SET0, "chart", CH0,
      "notes", NOTE0, "graph", G0, G1)
