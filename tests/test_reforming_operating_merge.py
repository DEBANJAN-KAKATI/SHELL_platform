"""6.12.0: operating data from several exports (backend/reforming/operating_merge.py). Synthetic exports shaped like
Result_3 / _10 / _24_1 / _33 / _34_1 of run 19: overlapping periods, locale-damaged copies, hand-filled Sampled_reactor,
GC-only rows, a pause between exports."""
import os

import pytest

from backend.reforming.operating_merge import merge, merge_to_file, operating_files
from backend.reforming.reactor_calc import sequence_breaks, parse_time

COLUMNS = ["Date/Time", "Sampled_reactor", "10i1TIC02", "10i1PIC01", "GC Date/Time", "Name_H2", "Conc_H2", "ESTD_H2",
           "Area_H2", "Name_N2", "ESTD_N2", "Area_N2"]


def row(when, gc, reactor="0", h2="25.5", area="4500000", pressure="7.00521", n2="67.1"):
    return [when, reactor, "490", pressure, gc, "H2", h2, h2, area, "N2", n2, "320000000"]


def write(folder, name, rows, mtime):
    path = folder / name
    path.write_bytes("\r\n".join("\t".join(r) for r in [COLUMNS] + rows).encode("cp1252"))
    os.utime(path, (mtime, mtime))
    return path


@pytest.fixture()
def folder(tmp_path):
    a = [row("19.11.2026 00:56:50", "19.11.2026 02:37:43", "2"), row("19.11.2026 03:01:04", "19.11.2026 04:42:02", "6"),
         row("", "19.11.2026 04:42:03")]                                                   # GC-only copy of one injection
    damaged = [row("19.11.2026 00:56:50", "19.11.2026 02:37:43", "0", h2="25.735.885", pressure="699.942"),
               row("19.11.2026 03:01:04", "19.11.2026 04:42:02", "0", h2="28.955.478", pressure="700.087"),
               row("19.11.2026 05:05:22", "19.11.2026 06:46:17", "0")]
    later = [row("", "26.11.2026 09:13:17", "0"),                                           # GC result without operating line
             row("26.11.2026 11:24:45", "26.11.2026 13:05:42", "0"), row("26.11.2026 09:20:30", "26.11.2026 11:01:27", "0")]
    write(tmp_path, "Result (33).txt", a, 1_700_000_000)
    write(tmp_path, "Result (10).txt", damaged, 1_700_000_100)
    write(tmp_path, "Result (24).txt", later, 1_700_000_200)
    (tmp_path / "notes.txt").write_text("not an export", encoding="utf-8")
    return tmp_path


def test_one_line_per_record_readable_copy_wins_and_rows_are_sorted_by_gc_time(folder):
    out = merge(str(folder))
    rows = [r for r in out["rows"] if r["Date/Time"]]
    assert [r["Date/Time"] for r in rows] == ["19.11.2026 00:56:50", "19.11.2026 03:01:04", "19.11.2026 05:05:22",
                                               "26.11.2026 09:20:30", "26.11.2026 11:24:45"]
    assert rows[0]["ESTD_H2"] == "25.5" and rows[0]["10i1PIC01"] == "7.00521"           # not the damaged 699.942 copy
    assert rows[0]["Sampled_reactor"] == "2" and rows[1]["Sampled_reactor"] == "6"
    gcs = [parse_time(r["GC Date/Time"]) for r in out["rows"]]
    assert gcs == sorted(gcs)
    report = out["report"]
    assert report["lines"] == 5 and report["duplicates_removed"] == 3                   # 2 damaged copies + GC-only copy
    assert report["gc_only_same_injection"] == ["19.11.2026 04:42:03"] and report["gc_only_kept"] == ["26.11.2026 09:13:17"]
    assert report["gaps"][0]["from"] == "19.11.2026 06:46:17" and report["gaps"][0]["to"] == "26.11.2026 11:01:27"
    files = {f["file"]: f for f in report["files"]}
    assert files["notes.txt"]["skipped"].startswith("not an operating export")
    assert files["Result (10).txt"]["damaged_rows"] == 2 and files["Result (10).txt"]["used"] == 1


def test_a_label_of_another_copy_fills_sampled_reactor_0(tmp_path):
    write(tmp_path, "a.txt", [row("20.11.2026 08:00:55", "20.11.2026 09:41:52", "0", h2="28.986327")], 1_700_000_000)
    write(tmp_path, "b.txt", [row("20.11.2026 08:00:55", "20.11.2026 09:41:52", "6", h2="28.986.327")], 1_700_000_100)
    out = merge([str(tmp_path / "a.txt"), str(tmp_path / "b.txt")])
    assert out["rows"][0]["ESTD_H2"] == "28.986327" and out["rows"][0]["Sampled_reactor"] == "6"
    assert out["report"]["labels_copied"] == 1


def test_merged_file_is_a_normal_export_and_the_same_source_gives_the_same_file(folder, tmp_path_factory, monkeypatch):
    from backend.reforming import operating_merge
    from backend.reforming.operating import read_operating_table
    monkeypatch.setattr(operating_merge, "MERGED_DIR", tmp_path_factory.mktemp("merged"))
    first = merge_to_file(str(folder))
    again = merge_to_file(str(folder))
    path = first["report"]["merged_file"]
    assert path == again["report"]["merged_file"] and path.endswith(".txt")
    table = read_operating_table(path)
    assert table["columns"] == COLUMNS and len(table["rows"]) == 6
    assert all(str(p).endswith(".txt") for p in operating_files(str(folder)))
    assert path not in [str(p) for p in operating_files(str(folder))]


def test_errors_name_what_is_missing(tmp_path):
    with pytest.raises(ValueError, match="No .txt files"):
        merge(str(tmp_path))
    with pytest.raises(ValueError, match="Not found"):
        merge(str(tmp_path / "missing"))


def test_reactor_sequence_breaks_are_found():
    from datetime import datetime, timedelta
    t0 = datetime(2026, 11, 23)
    order = ["R2", "R6"] * 5 + ["R6", "R2", "R6", "R2"]                                     # R6 twice at line 11
    breaks = sequence_breaks([(t0 + timedelta(hours=2 * i), r) for i, r in enumerate(order)])
    assert breaks and breaks[0].startswith("23.11.2026 20:00 (R6 after R6)")
    assert sequence_breaks([(t0 + timedelta(hours=2 * i), r) for i, r in enumerate(["R2", "R6"] * 6)]) == []
