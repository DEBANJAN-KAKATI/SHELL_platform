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


def test_mass_balance_plan_in_the_template():
    """The R08 mass balance plan in the template: R1/R5/R6, GoR (Nl/ml) basis, Ar + mixed gas, Liq sheet kept."""
    out = process_run_plan_file(str(FIXTURES / "run_plan" / "RunPlan_MassBalance_SS.xlsx"))
    s = out["summary"]
    assert s["format"] == "template" and s["active_reactors"] == ["R1", "R5", "R6"]
    assert s["condition_count"] == 2 and s["pretreatment_steps"] == 0
    rows = {r["Reactor ID"]: r for r in out["doe"]["rows"]}
    assert rows["R1"]["Temperature (°C)"] == 200 and rows["R5"]["Temperature (°C)"] == 250
    assert rows["R1"]["Check"] == "OK" and rows["R6"]["Catalyst"] == "Cu5CBV500"
    assert abs(rows["R1"]["Liquid flow if fed (gms/h)"] - 0.499) < 0.001
    assert rows["R1"]["H2 Flow (gms/h)"] == "n/a"                # GoR basis: no H2/HC flow
    assert out["doe"]["planned"]["block_1_h"] == 76.5 and out["doe"]["planned"]["block_2_h"] == 66.5
    feed = out["feed"]["rows"]
    assert [r["value"] for r in feed[:3]] == [85.2, 13.4, 160]
    gas = out["feed"]["tables"]["gas"]
    assert gas["check"] == "OK" and abs(gas["total"] - 100) < 0.01
    assert {r["component"]: r["value"] for r in gas["rows"]}["Argon"] == 5


def test_step0_prerun_with_profile_and_charts():
    """DOE Step 0 pre-run (drying, reduction, feed cut-in): per-block times and dates, graph data and two charts."""
    import openpyxl
    path = FIXTURES / "run_plan" / "RunPlan_Isomerisation_Rheinland.xlsx"
    pre = process_run_plan_file(str(path))["doe"]["pretreatment"]
    assert len(pre["rows"]) == 18
    assert [t["value"] for t in pre["totals"]] == [24.3, 35.6]
    b1 = [r for r in pre["rows"] if r["Block"] == "Block-1"]
    assert [r["Phase"] for r in b1] == ["Drying"] * 3 + ["Reduction"] * 5 + ["Feed cut-in"]
    assert b1[-1]["Start (h)"] == 23.3 and b1[-1]["Start (date, time)"] == "2026-09-04 14:00:00"   # feed cut-in = condition 1
    assert all(r["Check"] == "OK" for r in pre["rows"])
    ws = openpyxl.load_workbook(path, data_only=True)["DOE"]
    assert ws["E148"].value.strftime("%Y-%m-%d %H:%M") == "2026-09-03 14:42"                     # Block-1 pre-run start
    assert ws["E159"].value == "Pressure (barg)"                                                   # chart right axis
    temps = [(ws[f"G{r}"].value, ws[f"E{r}"].value) for r in range(170, 197)]                     # Block-1 time, temperature
    assert temps[3:6] == [(2, 25), (7.5, 300), (9.5, 300)]
    press = [(ws[f"M{r}"].value, ws[f"N{r}"].value) for r in range(170, 197)]                     # Block-1 right axis
    assert (15.5, 5) in press and (22.3, 25) in press and (14.5, 1) in press
    assert len(openpyxl.load_workbook(path)["DOE"]._charts) == 2


def test_blank_template_has_an_empty_prerun_and_untouched_plan_and_feed():
    import openpyxl
    path = FIXTURES / "run_plan" / "RunPlan_Template_Feed_SS.xlsx"
    ws = openpyxl.load_workbook(path)["DOE"]
    assert ws["A108"].value.startswith("Step 0") and ws["B110"].value is None and ws["H110"].value is None
    assert len(ws._charts) == 2
    assert process_run_plan_file(str(path))["doe"]["pretreatment"]["rows"] == []
