"""Add molecular weights to a Run Plan workbook (universal template, Feed sheet).

usage:  python scripts/run_plan_examples/add_molecular_weights.py  RunPlan.xlsx  [RunPlan_with_MW.xlsx]

What it adds on the Feed sheet (nothing else in the workbook is touched; charts, formulas and comments are kept):
  * tbl_gas (gas feed composition, M14:P31) gets two columns: Q "MW (g/mol)" and R "Carbon #". Known gases are filled
    with the feed-gas molar masses of the MassBal workbook (Run_Plan row 37); other rows (e.g. a new molecule) stay
    empty for you to fill in.
  * a new Excel table tbl_MW "Molecular weights" at T14:W61: one row per component as it is named in the GC export
    (ESTD_<name>), with MW (g/mol), Carbon # and a note. It is pre-filled with the experimental standards of the MassBal
    workbook (R#_MB columns B and AD) and has 12 spare rows for new components.

The dashboard (6.9.1+) takes every molar mass and carbon number from these tables: first tbl_MW, then the gas table,
then the liquid components table (tbl_comp, columns B and F). Built-in values are only used for components the Run Plan
does not list, and are marked as such in Online Analysis → Conversion basis.
Run it again on the same file: it does nothing when tbl_MW already exists.
"""
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

# Feed gas molar masses (MassBal workbook Run_Plan row 37) and carbon numbers, by normalised component name
GAS = {"hydrogen": (2.016, 0), "h2": (2.016, 0), "nitrogen": (28.014, 0), "n2": (28.014, 0), "argon": (39.948, 0),
       "ar": (39.948, 0), "methane": (16.043, 1), "ethane": (30.07, 2), "ethylene": (28.054, 2),
       "acetylene": (26.038, 2), "propane": (44.097, 3), "propylene": (42.081, 3), "butane": (58.123, 4),
       "h2s": (34.081, 0), "co": (28.01, 1), "co2": (44.009, 1)}
# GC components (name as in the export) with the experimental standards of the MassBal workbook
COMPONENTS = [
    ("H2", 2.016, 0, "MassBal workbook"), ("N2", 28.0134, 0, "MassBal workbook"), ("Argon", 39.948, 0, "MassBal workbook"),
    ("CO", 28.01, 1, "MassBal workbook"), ("CO2", 44.01, 1, "MassBal workbook"), ("H2S", 34.081, 0, "standard value"),
    ("Methane", 16.04, 1, "MassBal workbook"), ("Ethane", 30.07, 2, "MassBal workbook"),
    ("Ethylene", 28.05, 2, "MassBal workbook"), ("Acetylene", 26.04, 2, "MassBal workbook"),
    ("Propane", 44.1, 3, "MassBal workbook"), ("Propylene", 42.08, 3, "MassBal workbook"),
    ("Propadiene", 40.064, 3, "standard value"), ("Isobutane", 58.12, 4, "MassBal workbook"),
    ("Butane", 58.12, 4, "MassBal workbook"), ("C4", 58.12, 4, "MassBal workbook"),
    ("Pentane", 72.15, 5, "MassBal workbook"), ("C5", 72.15, 5, "MassBal workbook"),
    ("Hexane", 86.18, 6, "MassBal workbook"), ("C6", 86.18, 6, "MassBal workbook"), ("C6s", 86.18, 6, "MassBal workbook"),
    ("C6 Unknowns", 86.18, 6, "MassBal workbook"), ("C6 Above", 100.21, 6, "MassBal workbook"),
    ("C7 Unknowns", 100.21, 7, "MassBal workbook"), ("C8 Unknowns", 114.23, 8, "MassBal workbook"),
    ("Benzene", 78.11, 6, "MassBal workbook"), ("Toluene", 92.14, 7, "MassBal workbook"),
    ("Ethylbenzene", 106.167, 8, "MassBal workbook"), ("p-Xylene", 106.167, 8, "MassBal workbook"),
    ("m-Xylene", 106.167, 8, "MassBal workbook"), ("o-Xylene", 106.167, 8, "MassBal workbook"),
    ("C3-C4", None, None, "lumped peak – enter an MW if used"), ("C4-C5", None, None, "lumped peak – enter an MW if used"),
    ("C5-C6", None, None, "lumped peak – enter an MW if used"), ("C6-C8", None, None, "lumped peak – enter an MW if used"),
]
SPARE = 12
FIRST, HEADER = 15, 14
LAST = FIRST + len(COMPONENTS) + SPARE - 1                     # 61
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def col_index(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def norm(name):
    return re.sub(r"[^a-z0-9]+", "", re.sub(r"\(gas\)", "", str(name or ""), flags=re.I).lower())


class Strings:
    """Shared strings of the workbook; workbooks saved without sharedStrings.xml get inline strings instead."""
    def __init__(self, xml):
        self.xml = xml
        self.inline = xml is None
        self.items = [] if self.inline else re.findall(r"<si>(.*?)</si>", xml, re.S)
        self.added = []

    def text(self, i):
        return "".join(re.findall(r"<t[^>]*>([^<]*)</t>", self.items[int(i)]))

    def index(self, text):
        self.added.append(text)
        return len(self.items) + len(self.added) - 1

    def result(self):
        if self.inline:
            return None
        xml = self.xml.replace("</sst>", "".join(f'<si><t xml:space="preserve">{escape(t)}</t></si>' for t in self.added) + "</sst>")
        total = len(self.items) + len(self.added)
        xml = re.sub(r'uniqueCount="\d+"', f'uniqueCount="{total}"', xml)
        count = re.search(r' count="(\d+)"', xml)
        if count:
            xml = xml.replace(count.group(0), f' count="{int(count.group(1)) + len(self.added)}"', 1)
        return xml


def cell_value(row_xml, ref, strings):
    m = re.search(rf'<c r="{ref}"([^>]*?)(?:/>|>(.*?)</c>)', row_xml, re.S)
    if not m or not m.group(2):
        return None
    if "inlineStr" in m.group(1):
        return "".join(re.findall(r"<t[^>]*>([^<]*)</t>", m.group(2)))
    v = re.search(r"<v>([^<]*)</v>", m.group(2))
    if not v:
        return None
    return strings.text(v.group(1)) if 't="s"' in m.group(1) else v.group(1)


def put_cell(sheet, row, col, xml_cell):
    """Insert or replace one cell in the sheet XML, creating the row if needed (cells kept in column order)."""
    ref = f"{col}{row}"
    m = re.search(rf'<row r="{row}"[^>]*?(?:/>|>.*?</row>)', sheet, re.S)
    if not m:
        rows = [(int(r.group(1)), r.start()) for r in re.finditer(r'<row r="(\d+)"', sheet)]
        pos = next((p for r, p in rows if r > row), sheet.index("</sheetData>"))
        return sheet[:pos] + f'<row r="{row}">{xml_cell}</row>' + sheet[pos:]
    row_xml = m.group(0)
    if row_xml.endswith("/>"):
        new = re.sub(r"\s*/>$", ">", row_xml) + xml_cell + "</row>"
    else:
        cells = list(re.finditer(r'<c r="([A-Z]+)\d+"[^>]*?(?:/>|>.*?</c>)', row_xml, re.S))
        same = next((c for c in cells if c.group(1) == col), None)
        if same:
            new = row_xml[:same.start()] + xml_cell + row_xml[same.end():]
        else:
            after = [c for c in cells if col_index(c.group(1)) < col_index(col)]
            pos = after[-1].end() if after else row_xml.index(">") + 1
            new = row_xml[:pos] + xml_cell + row_xml[pos:]
    new = re.sub(r' spans="[^"]*"', "", new, count=1)          # optional hint; drop it rather than keep it wrong
    return sheet[:m.start()] + new + sheet[m.end():]


def string_cell(ref, strings, text, style):
    if strings.inline:
        return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'
    return f'<c r="{ref}" s="{style}" t="s"><v>{strings.index(text)}</v></c>'


def number_cell(ref, value, style):
    return f'<c r="{ref}" s="{style}"><v>{value}</v></c>' if value is not None else f'<c r="{ref}" s="{style}"/>'


def style_of(sheet, ref, default="0"):
    m = re.search(rf'<c r="{ref}" s="(\d+)"', sheet)
    return m.group(1) if m else default


def add_molecular_weights(src, dst):
    work = Path(tempfile.mkdtemp())
    with zipfile.ZipFile(src) as z:
        z.extractall(work)
    wb = (work / "xl/workbook.xml").read_text(encoding="utf-8")
    rid = re.search(r'<sheet [^>]*name="Feed"[^>]*r:id="([^"]+)"', wb).group(1)
    rels = (work / "xl/_rels/workbook.xml.rels").read_text(encoding="utf-8")
    target = re.search(rf'Id="{rid}"[^>]*Target="([^"]+)"', rels) or re.search(rf'Target="([^"]+)"[^>]*Id="{rid}"', rels)
    sheet_path = work / "xl" / target.group(1).lstrip("/").replace("xl/", "")
    sheet_rels_path = sheet_path.parent / "_rels" / (sheet_path.name + ".rels")
    sheet = sheet_path.read_text(encoding="utf-8")
    sheet_rels = sheet_rels_path.read_text(encoding="utf-8")
    tables = {}
    for t in re.findall(r'Target="(?:\.\./|/xl/)tables/([^"]+)"', sheet_rels):
        xml = (work / "xl/tables" / t).read_text(encoding="utf-8")
        tables[re.search(r' name="([^"]+)"', xml).group(1)] = (t, xml)
    if "tbl_MW" in tables:
        print(f"{src}: tbl_MW already present – nothing to do")
        if Path(src) != Path(dst):
            shutil.copy(src, dst)
        return
    ss_path = work / "xl/sharedStrings.xml"
    strings = Strings(ss_path.read_text(encoding="utf-8") if ss_path.exists() else None)
    h_style, name_style = style_of(sheet, "M14", "0"), style_of(sheet, "M15", "0")
    unit_style, value_style = style_of(sheet, "N15", "0"), style_of(sheet, "O15", "0")
    title_style = style_of(sheet, "A13", h_style)

    # 1. tbl_gas: MW (g/mol) and Carbon # columns
    gas_file, gas_xml = tables["tbl_gas"]
    ref = re.search(r' ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"', gas_xml)
    c0, r0, c1, r1 = ref.group(1), int(ref.group(2)), ref.group(3), int(ref.group(4))
    mw_col, c_col = chr(ord(c1) + 1), chr(ord(c1) + 2)
    sheet = put_cell(sheet, r0, mw_col, string_cell(f"{mw_col}{r0}", strings, "MW (g/mol)", h_style))
    sheet = put_cell(sheet, r0, c_col, string_cell(f"{c_col}{r0}", strings, "Carbon #", h_style))
    for r in range(r0 + 1, r1 + 1):
        row = re.search(rf'<row r="{r}"[^>]*?(?:/>|>.*?</row>)', sheet, re.S)
        name = cell_value(row.group(0), f"{c0}{r}", strings) if row else None
        mw, carbons = GAS.get(norm(name), (None, None)) if name else (None, None)
        sheet = put_cell(sheet, r, mw_col, number_cell(f"{mw_col}{r}", mw, value_style))
        sheet = put_cell(sheet, r, c_col, number_cell(f"{c_col}{r}", carbons, value_style))
    new_ref = f"{c0}{r0}:{c_col}{r1}"
    gas_xml = gas_xml.replace(ref.group(0), f' ref="{new_ref}"').replace(f'<autoFilter ref="{c0}{r0}:{c1}{r1}"',
                                                                         f'<autoFilter ref="{new_ref}"')
    n = int(re.search(r'<tableColumns count="(\d+)"', gas_xml).group(1))
    gas_xml = gas_xml.replace(f'<tableColumns count="{n}">', f'<tableColumns count="{n + 2}">').replace(
        "</tableColumns>", f'<tableColumn id="{n + 1}" name="MW (g/mol)"/><tableColumn id="{n + 2}" name="Carbon #"/></tableColumns>')
    (work / "xl/tables" / gas_file).write_text(gas_xml, encoding="utf-8")

    # 2. tbl_MW: one row per analysed component (T14:W61) with a title in T13
    sheet = put_cell(sheet, HEADER - 1, "T", string_cell(f"T{HEADER - 1}", strings,
                                                         "Molecular weights (component name as in the GC export, ESTD_<name>)", title_style))
    for col, text in zip("TUVW", ("Component", "MW (g/mol)", "Carbon #", "Note")):
        sheet = put_cell(sheet, HEADER, col, string_cell(f"{col}{HEADER}", strings, text, h_style))
    rows = COMPONENTS + [("", None, None, "spare – new component")] * SPARE
    for k, (name, mw, carbons, note) in enumerate(rows):
        r = FIRST + k
        sheet = put_cell(sheet, r, "T", string_cell(f"T{r}", strings, name, name_style) if name else f'<c r="T{r}" s="{name_style}"/>')
        sheet = put_cell(sheet, r, "U", number_cell(f"U{r}", mw, value_style))
        sheet = put_cell(sheet, r, "V", number_cell(f"V{r}", carbons, value_style))
        sheet = put_cell(sheet, r, "W", string_cell(f"W{r}", strings, note, unit_style))
    ids = [int(re.search(r' id="(\d+)"', (work / "xl/tables" / f).read_text(encoding="utf-8")).group(1))
           for f in __import__("os").listdir(work / "xl/tables")]
    tid = max(ids) + 1
    table_name = f"table{tid}.xml"
    while (work / "xl/tables" / table_name).exists():
        tid += 1
        table_name = f"table{tid}.xml"
    (work / "xl/tables" / table_name).write_text(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="{tid}" name="tbl_MW" displayName="tbl_MW" '
        f'ref="T{HEADER}:W{LAST}" totalsRowShown="0"><autoFilter ref="T{HEADER}:W{LAST}"/><tableColumns count="4">'
        '<tableColumn id="1" name="Component"/><tableColumn id="2" name="MW (g/mol)"/><tableColumn id="3" name="Carbon #"/>'
        '<tableColumn id="4" name="Note"/></tableColumns><tableStyleInfo showFirstColumn="0" showLastColumn="0" '
        'showRowStripes="1" showColumnStripes="0"/></table>', encoding="utf-8")
    new_rid = "rIdMW1"
    sheet_rels = sheet_rels.replace("</Relationships>", f'<Relationship Id="{new_rid}" Type="{NS_R}/table" '
                                    f'Target="../tables/{table_name}"/></Relationships>')
    parts = re.search(r'<tableParts(?: count="(\d+)")?\s*>', sheet)
    count = int(parts.group(1)) if parts.group(1) else len(re.findall(r"<tablePart ", sheet))
    sheet = sheet.replace(parts.group(0), f'<tableParts count="{count + 1}">').replace(
        "</tableParts>", f'<tablePart xmlns:r="{NS_R}" r:id="{new_rid}"/></tableParts>')
    ct = (work / "[Content_Types].xml").read_text(encoding="utf-8")
    ct = ct.replace("</Types>", f'<Override PartName="/xl/tables/{table_name}" '
                    'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>')
    (work / "[Content_Types].xml").write_text(ct, encoding="utf-8")

    # column widths and sheet dimension
    cols = re.search(r"<cols>(.*?)</cols>", sheet, re.S)
    widths = {17: 11, 18: 9, 19: 2, 20: 22, 21: 11, 22: 9, 23: 30}
    used = [int(x) for x in re.findall(r'max="(\d+)"', cols.group(1))] if cols else []
    extra = "".join(f'<col min="{c}" max="{c}" width="{w}" customWidth="1"/>' for c, w in widths.items()
                    if not used or c > max(used))
    sheet = sheet.replace(cols.group(0), f"<cols>{cols.group(1)}{extra}</cols>") if cols else sheet
    dim = re.search(r'<dimension ref="A1:([A-Z]+)(\d+)"/>', sheet)
    if dim:
        sheet = sheet.replace(dim.group(0), f'<dimension ref="A1:W{max(int(dim.group(2)), LAST)}"/>')
    sheet_path.write_text(sheet, encoding="utf-8")
    sheet_rels_path.write_text(sheet_rels, encoding="utf-8")
    if not strings.inline:
        ss_path.write_text(strings.result(), encoding="utf-8")

    tmp = Path(dst).with_suffix(".tmp.xlsx")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            zout.write(work / item.filename, item.filename)
        for extra_part in (f"xl/tables/{table_name}",):
            zout.write(work / extra_part, extra_part)
    tmp.replace(dst)
    shutil.rmtree(work)
    print(f"{dst}: gas table + MW (g/mol), Carbon #; new table tbl_MW T{HEADER}:W{LAST} ({len(COMPONENTS)} components, "
          f"{SPARE} spare rows)")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    add_molecular_weights(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else sys.argv[1])
