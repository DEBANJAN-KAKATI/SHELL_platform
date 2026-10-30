"""Mass Balance Run Plan in the RunPlan.xlsx format (Plan, DOE, Feed + Liq) together with the run and ZMB exports."""
from pathlib import Path

from backend.mass_balance.run_plan import read_run_plan
from backend.mass_balance.service import run_calculation
from backend.services.run_plan_service import process_run_plan_file

FIXTURES = Path(__file__).parent / "fixtures" / "mass_balance"
RUN_PLAN = FIXTURES / "RunPlan_MassBalance_R08.xlsx"


def test_run_plan_is_read():
    data = read_run_plan(RUN_PLAN)
    common, samples = data["common"], data["samples"]
    assert data["format"] == "run_plan" and common["run"]["start"] == "2024-10-24 14:00:00"
    assert common["gas"]["ar_mol"] == 5 and common["gas"]["mix_mol"] == 95
    assert common["run_plan"]["liquid_feed_carbon_wt"] == 85.2 and common["run_plan"]["mixed_gas_target"]["Acetylene"] == 7.822
    assert [c["beds"][0]["catalyst"] for c in common["run_plan"]["catalysts"]] == \
        ["Ni2CBV-3014", None, None, None, "Ni5CBV-3014", "Cu5CBV500", None, None]
    cond = common["run_plan"]["conditions"][0]
    assert (cond["temperature_1"], cond["temperature_2"], cond["pressure_1"]) == (200, 250, 5)
    assert [s["name"] for s in samples] == ["C1-S1", "C1-S2", "C1-S3", "C1-S4"]
    assert samples[0]["gas"]["nml"]["5"] == 3126.2 and samples[0]["liq"]["1"]["tlp"] == 8.74
    assert set(common["zmb"]["liquid"]) == {"1", "2", "3"}


def test_shared_parser_still_reads_it():
    out = process_run_plan_file(str(RUN_PLAN))
    assert out["summary"]["active_reactors"] == ["R1", "R5", "R6"]
    assert out["doe"]["columns"][:7] == ["Condition No.", "Block", "Start Date", "End Date", "Temperature (°C)", "Pressure (barg)", "Reactor ID"]
    assert out["doe"]["columns"][-2:] == ["Remarks", "Catalyst"]


def test_run_plan_with_exports_gives_a_mass_balance():
    data = read_run_plan(RUN_PLAN)
    out = run_calculation({"common": data["common"], "samples": data["samples"],
                           "imports": {"zmb_path": str(FIXTURES / "Run6_ZMB_g_07_May_24_1.txt"),
                                       "run_path": str(FIXTURES / "Result_R08-Ci-S4-27-Oct-24_1_3.txt")}})
    s1, s2 = out["results"][0], out["results"][1]
    for res in (s1, s2):
        assert [r["reactor"] for r in res["summary"]["rows"] if r["rep_count"]] == [1, 5, 6]
        assert all(r["mass_balance"] and r["carbon_balance"] for r in res["summary"]["rows"] if r["rep_count"])
    # liquid flow uses the hours since the sample window start (previous collection), not since Run Start
    assert abs(s1["liq"]["1"]["liquid_hours"] - s1["liq"]["1"]["tos_h"]) < 1e-9
    assert abs(s2["liq"]["1"]["hc_flow"] - 11.04 / s2["liq"]["1"]["liquid_hours"]) < 1e-9 and 23 < s2["liq"]["1"]["liquid_hours"] < 25
    assert s1["liq"]["1"]["feed"] and abs(s1["liq"]["1"]["feed"] - 0.5) < 1e-9          # ZMB liquid reps from the Liq sheet
    assert s1["mixed_gas"]["source"] == "1"                                              # ZMB export loaded -> ZMB block


def test_without_zmb_export_the_feed_sheet_gives_the_mixed_gas():
    data = read_run_plan(RUN_PLAN)
    out = run_calculation({"common": data["common"], "samples": data["samples"][:1], "imports": {}})
    assert out["results"][0]["mixed_gas"]["source"] == "feed"
    assert out["results"][0]["mixed_gas"]["mol"]["Hydrogen"] == 20.904


def test_reactor_without_gas_feed_gets_an_error_not_a_balance():
    """R5/R6 gas stops on 27.10.2024 08:30 in the export; a window after that must not give a mass balance."""
    data = read_run_plan(RUN_PLAN)
    sample = dict(data["samples"][0], name="late", window={"start": "2024-10-27 09:00:00", "finish": "2024-10-27 17:30:00"},
                  liq={})
    out = run_calculation({"common": data["common"], "samples": [sample],
                           "imports": {"run_path": str(FIXTURES / "Result_R08-Ci-S4-27-Oct-24_1_3.txt")}})
    res = out["results"][0]
    assert res["reactors"]["5"]["rep_count"] == 0 and res["summary"]["rows"][4]["mass_balance"] is None
    assert "no gas feed" in res["reactors"]["5"]["reps"][0]["error"]
    assert res["reactors"]["1"]["rep_count"] > 0
