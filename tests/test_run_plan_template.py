"""Universal Run Plan template (Plan, DOE with Step 0, Feed with 4 tables) and the older RunPlan.xlsx format."""
from pathlib import Path

from backend.services.run_plan_service import process_run_plan_file
from backend.services.run_plan_template import is_template

FIXTURES = Path(__file__).parent / "fixtures"
TEMPLATE = FIXTURES / "run_plan" / "RunPlan_Template.xlsx"
FILLED = FIXTURES / "run_plan" / "RunPlan_Template_Filled.xlsx"
OLD_FORMAT = FIXTURES / "mass_balance" / "RunPlan_MassBalance_R08.xlsx"      # Plan A4:J14 / DOE / Feed A2:E25 layout


def test_template_is_detected_and_old_files_are_not():
    assert is_template(TEMPLATE) and is_template(FILLED)
    assert not is_template(OLD_FORMAT)


def test_plan_reads_catalyst_loading_and_header():
    out = process_run_plan_file(str(FILLED))
    rows = {r["parameter"]: r for r in out["plan"]["rows"]}
    assert list(rows)[:2] == ["Reactor role", "Catalyst"] and "Loaded catalyst weight (actual)" in rows
    assert [rows["Reactor role"][f"r{k}"] for k in range(1, 9)] == ["Catalyst", "Catalyst", "Not used", "Not used", "Inert", "Catalyst", "Not used", "Not used"]
    assert rows["Catalyst amount"]["r1"] == 1.2426
    info = {i["parameter"]: i["value"] for i in out["plan"]["info"]}
    assert info["Run ID"] == "R08" and info["Feed SL ID"] == "B00010852001" and info["Feed molecular weight"] == 88.5
    assert out["summary"]["active_reactors"] == ["R1", "R2", "R5", "R6"] and out["summary"]["format"] == "template"


def test_doe_keeps_filled_conditions_and_separates_step0():
    out = process_run_plan_file(str(FILLED))
    doe = out["doe"]
    assert doe["count"] == 48 and out["summary"]["condition_count"] == 12           # 6 conditions x 2 blocks x 4 reactors
    assert {"Start Date", "End Date", "Reactor ID", "Check", "Catalyst"} <= set(doe["columns"])
    first = doe["rows"][0]
    assert (first["Block"], first["Reactor ID"], first["Start Date"], first["End Date"], first["Check"]) == \
        ("Block-1", "R1", "2026-11-03 08:00:00", "2026-11-04 08:00:00", "OK")
    assert not any("Step" in str(r.get("Condition No.")) for r in doe["rows"])
    pre = doe["pretreatment"]
    assert pre["title"].startswith("Step 0") and [r["Remarks"] for r in pre["rows"]] == ["Drying", "Reduction"]
    assert abs(pre["total_h"] - 16.3667) < 1e-3 and doe["planned"]["run_end"] == "2026-11-09 08:00:00"


def test_feed_has_four_tables_with_totals():
    tables = process_run_plan_file(str(FILLED))["feed"]["tables"]
    assert set(tables) == {"properties", "liquid", "groups", "gas"}
    liquid = [(r["component"], r["weight"]) for r in tables["liquid"]["rows"] if r["weight"] != ""]
    assert liquid == [("n-Hexane", 84.5), ("Methylcyclopentane", 0.5), ("n-Heptane", 10), ("n-Octane", 5)]
    assert (tables["liquid"]["total"], tables["liquid"]["check"]) == (100, "OK")
    assert (tables["groups"]["total"], tables["groups"]["check"]) == (100, "OK")
    assert (tables["gas"]["total"], tables["gas"]["check"]) == (100, "OK")
    assert [s["value"] for s in tables["gas"]["settings"]] == ["N2", 100]
    props = {p["label"]: p for p in tables["properties"]["rows"]}
    assert props["Molecular Weight"]["value"] == 88.5 and props["MW – calculated from components"]["value"] == 88.4949
    assert props["Density @ 15 °C"]["note"].startswith("Used by Plan / DOE")


def test_flat_feed_rows_keep_carbon_hydrogen_mw_first():
    """Calculation table, Plots and Custom table read Carbon from feed row 1 and MW from row 3."""
    for path in (TEMPLATE, FILLED):
        rows = process_run_plan_file(str(path))["feed"]["rows"]
        assert [r["component"] for r in rows[:3]] == ["Carbon", "Hydrogen", "Molecular Weight"]
        assert (rows[0]["value"], rows[2]["value"]) == (83.61, 88.5)


def test_empty_template_loads():
    out = process_run_plan_file(str(TEMPLATE))
    assert out["summary"]["feed_count"] == 0 and out["doe"]["pretreatment"]["rows"] == []
    assert out["feed"]["tables"]["liquid"]["check"] == ""


def test_old_format_still_uses_the_fixed_ranges():
    out = process_run_plan_file(str(OLD_FORMAT))
    assert "tables" not in out["feed"] and out["summary"]["active_reactors"] == ["R1", "R5", "R6"]
    assert out["feed"]["rows"][0]["component"] == "Carbon"


def test_rheinland_isomerisation_plan_in_the_template():
    """The Rheinland screening plan copied into the template: 11 conditions per block, 18 Step 0 steps, two totals."""
    out = process_run_plan_file(str(FIXTURES / "run_plan" / "RunPlan_Isomerisation_Rheinland.xlsx"))
    doe = out["doe"]
    assert doe["count"] == 88 and out["summary"]["condition_count"] == 22
    assert doe["planned"] == {"block_1_h": 528, "block_2_h": 528, "run_end": "2026-09-26 14:00:00"}
    assert all(r["Check"] == "OK" for r in doe["rows"])
    pre = doe["pretreatment"]
    assert len(pre["rows"]) == 18 and [t["value"] for t in pre["totals"]] == [24.3, 35.6]
    tables = out["feed"]["tables"]
    assert (tables["liquid"]["check"], tables["groups"]["check"], tables["gas"]["check"]) == ("OK", "OK", "OK")
    assert [(r["component"], r["value"]) for r in out["feed"]["rows"][:3]] == [("Carbon", 83.6), ("Hydrogen", 16.4), ("Molecular Weight", 89)]
    assert out["summary"]["active_reactors"] == [f"R{k}" for k in range(1, 9)]
