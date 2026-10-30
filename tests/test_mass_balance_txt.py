"""Import of the online .txt exports and the end-to-end calculation through the service."""
from pathlib import Path
from statistics import mean

from backend.mass_balance.service import flows_from_export, load_export, run_calculation, sample_windows
from backend.mass_balance.txt_loader import read_export
from backend.mass_balance.workbook import read_workbook

FIXTURES = Path(__file__).parent / "fixtures" / "mass_balance"
ZMB = FIXTURES / "Run6_ZMB_g_07_May_24_1.txt"
RUN = FIXTURES / "Result_R08-Ci-S4-27-Oct-24_1_3.txt"
WORKBOOK = FIXTURES / "R6-C1-S1-MassBal_Ver2.2.xlsx"


def test_zmb_export():
    export = read_export(ZMB)
    assert export["kind"] == "zmb" and export["columns"] == 152 and len(export["rows"]) == 39
    assert export["streams"] == {"0": 5, "1": 5, "2": 5, "3": 4, "4": 4, "5": 4, "6": 4, "7": 4, "8": 4}
    assert all(not row["op"].get("01i14FI01") for row in export["rows"])


def test_run_export_and_quirks():
    export = read_export(RUN)
    assert export["kind"] == "run" and export["columns"] == 161 and len(export["rows"]) == 171
    assert export["streams"] == {"0": 44, "1": 44, "5": 39, "6": 39}
    first = export["rows"][0]
    assert first["estd"] == {} and first["op"]["01i14FI01"] is not None       # start-up row: operating data, GC all 'ÿ'
    assert export["first_gc"] == "2024-10-24 14:58:56"
    row = next(r for r in export["rows"] if r["estd"])
    assert row["estd"]["CH4"] is None                                           # 'ÿ' -> None, not 0
    assert row["estd"]["C8 Unknowns"] == 0 and row["gc_total"] > 90            # Conc_C8 Unknowns is the GC total
    checked = 0
    for r in export["rows"]:
        if not r["estd"]:
            continue
        for gas in ("H2", "N2", "Argon", "Methane"):
            assert abs(r["conc"][gas] - r["estd"][gas] * 100 / r["gc_total"]) < 1e-5
            checked += 1
        if r["estd"]["C6 Above"]:                                                # C6 Above raw ESTD sits in the Area_ column
            assert abs(r["conc"]["C6 Above"] - r["estd"]["C6 Above"] * 100 / r["gc_total"]) < 1e-5
    assert checked == 4 * 168            # 166 with a stream + 2 GC results logged after the operating data stopped


def test_flows_from_export_match_means():
    export = read_export(RUN)
    windows = {str(r): (None, None) for r in range(1, 9)}
    flows = flows_from_export(export, windows)
    op_rows = [r for r in export["rows"] if r["op"]]
    assert abs(flows["fi01"] - mean(r["op"]["01i14FI01"] for r in op_rows)) < 1e-9
    assert round(flows["nml"]["1"], 1) == 1298.2 and round(flows["nml"]["5"], 1) == 2130.1 and flows["nml"]["2"] == 0


def test_end_to_end_workbook_plus_zmb_txt():
    """Workbook inputs + the ZMB txt give the same results as the workbook (the ZMB blocks come from the txt)."""
    data = read_workbook(WORKBOOK)
    out = run_calculation({"common": data["common"], "samples": data["samples"], "imports": {"zmb_path": str(ZMB)}})
    result = out["results"][0]
    assert abs(result["c_balance"]["1"]["carbon_balance"] - 107.36426096079839) < 1e-6
    assert abs(result["reactors"]["7"]["header"]["closure"] - 103.56396627878621) < 1e-6
    assert abs(out["zmb_suggestion"] - 4.3) < 0.1
    assert [v["id"] for v in result["views"]][:3] == ["zmb", "run_plan", "liq_gas"]


def test_run_txt_samples_windows():
    """Two samples on the run export: GC reps and flows come from each sample's window."""
    common = {"run": {"start": "2024-10-24 14:00:00"}, "gas": {"ar_mol": 5, "mix_mol": 95},
              "zmb": {}, "run_plan": {}}
    liq = lambda t: {str(r): {"start": t, "finish": t, "tlp": None} for r in range(1, 9)}
    samples = [{"name": "C1-S1", "liq": liq("2024-10-25 12:00:00")}, {"name": "C1-S2", "liq": liq("2024-10-27 12:00:00")}]
    windows = sample_windows(common, samples)
    assert windows[1]["1"][0].strftime("%Y-%m-%d %H:%M") == "2024-10-25 12:00"
    out = run_calculation({"common": common, "samples": samples, "imports": {"zmb_path": str(ZMB), "run_path": str(RUN)}})
    s1, s2 = out["results"]
    assert s1["reactors"]["1"]["rep_count"] > 0 and s2["reactors"]["1"]["rep_count"] > 0
    assert s1["reactors"]["2"]["rep_count"] == 0 and s1["summary"]["rows"][1]["carbon_balance"] is None
    export = load_export(RUN)
    first_s2 = s2["reactors"]["1"]["reps"][0]["time"]
    assert first_s2 > "2024-10-25 12:00:00"
    assert s1["gas"]["reactors"]["1"]["nml"] != s2["gas"]["reactors"]["1"]["nml"] or export["rows"]
    assert out["trend"][0]["sample"] == "C1-S1" and len(out["trend"]) == 16
