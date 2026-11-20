"""6.10.1: the Reforming operating-data reader returns each GC line's reactor, so parallel reactors (e.g. R2 and R6)
are kept apart on the Calculation page."""
from pathlib import Path

from backend.reforming.operating import read_operating_file

R08 = Path(__file__).parent / "fixtures" / "online" / "Result_R08-Ci-S4-27-Oct-24_1_3.txt"


def test_operating_rows_carry_gc_time_and_reactor():
    data = read_operating_file(R08)
    lines = [(row["GC Date/Time"], row["Sampled_reactor"]) for row in data["rows"] if row.get("Sampled_reactor")]
    assert lines[:4] == [("24.10.2024 14:45:44", "0"), ("24.10.2024 15:26:09", "1"),
                         ("24.10.2024 15:53:23", "5"), ("24.10.2024 16:20:35", "6")]
    assert {reactor for _, reactor in lines} == {"0", "1", "5", "6"}
