"""Builds a multi-sheet .xlsx from table data sent by the frontend (Yield export + Online Analysis tab, and since 6.10.0
the "Export Complete" workbook: every Run Plan, Analysis, Calculation and Plot table of the run in its own sheet, with the
plot images embedded)."""
import base64
import math
import re
import struct
from io import BytesIO

from openpyxl import Workbook
from openpyxl.drawing.image import Image as _XlImage
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

_INVALID_SHEET_CHARS = re.compile(r"[\[\]:*?/\\]")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_HEADER_FILL = PatternFill("solid", fgColor="071A2D")
MAX_ROWS = 200000
MAX_COLUMNS = 500
MAX_IMAGES = 40
_NOTE_FONT = Font(italic=True, color="6F746F")
_TITLE_FONT = Font(bold=True, size=13, color="071A2D")
_DATA_URL = re.compile(r"^data:image/(png|jpe?g);base64,(.+)$", re.DOTALL)


class _RawImage(_XlImage):
    """PNG / JPEG embedded from its bytes, without Pillow (not in requirements.txt)."""

    def __init__(self, data, fmt, width, height):  # noqa: D401 - no super().__init__: it needs Pillow
        self.ref = None
        self._raw = data
        self.format = fmt
        self.width, self.height = width, height

    def _data(self):
        return self._raw


def _image_size(data, fmt):
    """Pixel size from the PNG IHDR or the JPEG SOF marker."""
    if fmt == "png" and data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if fmt == "jpeg":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    raise ValueError("Unreadable image.")


def decode_image(data_url, max_width=900):
    """data:image/png|jpeg;base64,… → _RawImage scaled to at most max_width pixels on the sheet."""
    match = _DATA_URL.match(str(data_url or "").strip())
    if not match:
        raise ValueError("Images must be PNG or JPEG data URLs.")
    fmt = "png" if match.group(1) == "png" else "jpeg"
    data = base64.b64decode(match.group(2))
    width, height = _image_size(data, fmt)
    scale = min(1.0, max_width / width) if width else 1.0
    return _RawImage(data, fmt, int(width * scale), int(height * scale))


def _sheet_title(name, used):
    title = _INVALID_SHEET_CHARS.sub(" ", str(name or "Sheet")).strip()[:31] or "Sheet"
    base, n = title, 2
    while title.lower() in used:
        suffix = f" ({n})"
        title = base[: 31 - len(suffix)] + suffix
        n += 1
    used.add(title.lower())
    return title


def _cell_value(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    return str(value)


def build_workbook(sheets):
    """sheets: [{name, columns: [str], rows: [[value...]], number_formats: {column: format}}]"""
    if not isinstance(sheets, list) or not sheets:
        raise ValueError("No sheets to export.")
    wb = Workbook()
    wb.remove(wb.active)
    used = set()
    for sheet in sheets:
        columns = [str(c) for c in (sheet.get("columns") or [])][:MAX_COLUMNS]
        rows = sheet.get("rows") or []
        if len(rows) > MAX_ROWS:
            raise ValueError(f"Sheet '{sheet.get('name')}' has too many rows ({len(rows)}).")
        formats = sheet.get("number_formats") or {}
        ws = wb.create_sheet(_sheet_title(sheet.get("name"), used))
        # Optional title and notes above the table (6.10.0)
        lead = 0
        if sheet.get("title"):
            ws.append([str(sheet["title"])])
            ws.cell(row=1, column=1).font = _TITLE_FONT
            lead += 1
        for note in sheet.get("notes") or []:
            ws.append([str(note)])
            ws.cell(row=ws.max_row, column=1).font = _NOTE_FONT
            lead += 1
        if lead:
            ws.append([])
            lead += 1
        header_row = lead + 1
        if columns:
            ws.append(columns)
            for cell in ws[header_row]:
                cell.font = _HEADER_FONT
                cell.fill = _HEADER_FILL
            # Optional second header row (6.10.3), e.g. C1…C15 / units under the family names of the Reforming raw data
            subheader = [str(c) if c is not None else "" for c in (sheet.get("subheader") or [])][: len(columns)]
            if subheader:
                ws.append(subheader)
                header_row += 1
                for cell in ws[header_row]:
                    cell.font = _HEADER_FONT
                    cell.fill = _HEADER_FILL
        widths = [len(c) for c in columns]
        for row in rows:
            values = [_cell_value(v) for v in list(row)[: len(columns)]]
            ws.append(values)
            for i, v in enumerate(values):
                if v is not None:
                    widths[i] = max(widths[i], len(str(v)) if isinstance(v, str) else 10)
        for i, column in enumerate(columns, start=1):
            letter = get_column_letter(i)
            ws.column_dimensions[letter].width = min(max(widths[i - 1] + 2, 8), 45)
            fmt = formats.get(column)
            if fmt and rows:
                for (cell,) in ws.iter_rows(min_row=header_row + 1, min_col=i, max_col=i):
                    if isinstance(cell.value, (int, float)):
                        cell.number_format = fmt
        ws.freeze_panes = f"B{header_row + 1}" if columns and rows else None
        if columns and rows:
            ws.auto_filter.ref = f"A{header_row}:{get_column_letter(len(columns))}{header_row + len(rows)}"
        # Images (plots) below the table, one under the other, each with its caption (6.10.0)
        images = (sheet.get("images") or [])[:MAX_IMAGES]
        row = ws.max_row + 2
        for item in images:
            try:
                image = decode_image(item.get("data_url"))
            except (ValueError, TypeError, struct.error, base64.binascii.Error) as error:
                ws.cell(row=row, column=1, value=f"{item.get('title') or 'Plot'}: image not readable ({error})").font = _NOTE_FONT
                row += 2
                continue
            ws.cell(row=row, column=1, value=str(item.get("title") or "Plot")).font = Font(bold=True)
            image.anchor = f"A{row + 1}"
            ws.add_image(image)
            row += 2 + int(image.height / 20) + 1
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer
