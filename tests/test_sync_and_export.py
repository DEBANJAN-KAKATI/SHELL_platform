"""6.10.0: OneDrive-synced folder for Isomerization / General_MB and the Export Complete workbook."""
import base64
import os
import struct
import time
import zipfile
import zlib
from io import BytesIO

import openpyxl
import pytest

from backend.services import sync_source
from backend.services.excel_export_service import build_workbook, decode_image


@pytest.fixture()
def synced(tmp_path, monkeypatch):
    monkeypatch.setattr(sync_source, "CONFIG_FILE", tmp_path / "sync_sources.json")
    folder = tmp_path / "Run 42 - Shared"
    (folder / "DHA").mkdir(parents=True)
    for name in ("R42_C1_S1_001.XLS", "R42_C1_S1_002.xls", "~$open.xls"):
        (folder / "DHA" / name).write_bytes(b"x")
    (folder / "Result_R42.txt").write_text("a\tb\n", encoding="utf-8")
    (folder / "ZMB_blank_R42.txt").write_text("a\tb\n", encoding="utf-8")
    (folder / "RunPlan_R42.xlsx").write_bytes(b"x")
    (folder / "notes.xlsx").write_bytes(b"x")
    return folder


def test_sync_status_needs_a_folder(synced):
    status = sync_source.sync_status("isomerization")
    assert status["found"] is False and "Change folder" in status["message"]


def test_sync_status_finds_every_item(synced):
    sync_source.save_folder("general_mb", str(synced))
    status = sync_source.sync_status("general_mb")
    assert status["found"] is True
    assert status["dha_count"] == 2 and status["dha_folder"].endswith("DHA")
    assert status["online_file"].endswith("Result_R42.txt")
    assert status["zmb_file"].endswith("ZMB_blank_R42.txt")
    assert status["run_plan_file"].endswith("RunPlan_R42.xlsx")
    assert all(status[k] for k in ("dha_signature", "online_signature", "zmb_signature", "run_plan_signature"))
    # Isomerization has no ZMB page; its folder is saved separately
    assert sync_source.sync_status("isomerization")["found"] is False


def test_signature_changes_with_new_files(synced):
    sync_source.save_folder("isomerization", str(synced))
    before = sync_source.sync_status("isomerization")
    assert before["zmb_file"] == ""
    (synced / "DHA" / "R42_C1_S1_003.XLS").write_bytes(b"xy")
    newer = synced / "Result_R42_b.txt"
    newer.write_text("a\n", encoding="utf-8")
    later = time.time() + 5
    os.utime(newer, (later, later))
    after = sync_source.sync_status("isomerization")
    assert after["dha_count"] == 3 and after["dha_signature"] != before["dha_signature"]
    assert after["online_file"].endswith("Result_R42_b.txt")


def test_sync_rejects_unknown_process_and_missing_folder(synced):
    with pytest.raises(ValueError):
        sync_source.sync_status("reforming")
    with pytest.raises(ValueError):
        sync_source.save_folder("isomerization", str(synced / "missing"))


def _png(width, height):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def test_decode_image_scales_without_pillow():
    url = "data:image/png;base64," + base64.b64encode(_png(1800, 600)).decode()
    image = decode_image(url, max_width=900)
    assert (image.width, image.height, image.format) == (900, 300, "png")
    with pytest.raises(ValueError):
        decode_image("data:text/plain;base64,AAAA")


def test_export_complete_workbook_has_every_sheet():
    url = "data:image/png;base64," + base64.b64encode(_png(40, 20)).decode()
    sheets = [
        {"name": "Summary", "title": "ILS · Export Complete", "notes": ["Process: General_MB"],
         "columns": ["Section", "Sheet", "Status"], "rows": [["Run Plan", "RunPlan DOE", "Included"]]},
        {"name": "RunPlan DOE", "title": "Run Plan · DOE", "columns": ["Condition", "T"], "rows": [[1, 250.0], [2, 260.0]]},
        {"name": "Offline T1 Carbon", "notes": ["Not imported: process the DHA folder."], "columns": ["Status"], "rows": [["No data in this run"]]},
        {"name": "Plots", "title": "Plots", "columns": [], "rows": [], "images": [{"title": "Slot 1", "data_url": url}, {"title": "bad", "data_url": "x"}]},
    ]
    data = build_workbook(sheets).read()
    with zipfile.ZipFile(BytesIO(data)) as archive:  # the image is stored without Pillow
        assert [n for n in archive.namelist() if n.startswith("xl/media/")] == ["xl/media/image1.png"]
    wb = openpyxl.load_workbook(BytesIO(data))
    assert wb.sheetnames == ["Summary", "RunPlan DOE", "Offline T1 Carbon", "Plots"]
    doe = wb["RunPlan DOE"]
    assert doe["A1"].value == "Run Plan · DOE" and doe["A3"].value == "Condition" and doe["B5"].value == 260.0
    assert doe.auto_filter.ref == "A3:B5"
    assert wb["Offline T1 Carbon"]["A1"].value.startswith("Not imported")
    plots = wb["Plots"]
    assert any("image not readable" in str(c.value) for row in plots.iter_rows() for c in row if c.value)


def test_final_raw_data_sheet_has_two_header_rows_from_a1():
    """6.10.3: the Reforming "Final Raw_Data" layout (family names, then C1…C15 / units) starts at A1."""
    sheet = {"name": "Final Raw_Data", "columns": ["Date/Time", "Sampled_reactor", "DHA Date/Time", "Paraffins", "", "Carbon"],
             "subheader": ["", "", "", "C1", "C2", "wt%"],
             "rows": [["08.10.2026 16:06:39", 1, "08/10/2026 16:03", 0.0, 0.003, 85.1], [None, None, "08/10/2026 18:00", 0.1, 0.2, None]]}
    ws = openpyxl.load_workbook(BytesIO(build_workbook([sheet]).read()))["Final Raw_Data"]
    assert [c.value for c in ws[1]] == ["Date/Time", "Sampled_reactor", "DHA Date/Time", "Paraffins", None, "Carbon"]
    assert [c.value for c in ws[2]] == [None, None, None, "C1", "C2", "wt%"]
    assert ws["A3"].value == "08.10.2026 16:06:39" and ws["B3"].value == 1 and ws["E3"].value == 0.003
    assert ws.auto_filter.ref == "A2:F4" and ws.freeze_panes == "B3"
