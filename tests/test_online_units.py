"""Online Analysis units: GC mol% → g/h, Nl/h and g C/h with argon as internal standard (MassBal Ver2.2 formulas)."""
from collections import Counter
from pathlib import Path

import openpyxl
import pytest

from backend.services.online_analysis_service import process_online_file
from backend.services.online_units import convert_online_rows, feed_argon, reactor_number
from backend.services.run_plan_service import process_run_plan_file

FIXTURES = Path(__file__).parent / "fixtures"
WORKBOOK = FIXTURES / "online" / "R6-C1-S1-MassBal_Ver2.2.xlsx"
EXPORT = FIXTURES / "online" / "Result_R08-Ci-S4-27-Oct-24_1_3.txt"
MB_RUN_PLAN = FIXTURES / "run_plan" / "RunPlan_MassBalance_SS.xlsx"


@pytest.fixture(scope="module")
def workbook_case():
    """The five GC injections of R6_MB (D20:H48) with the workbook's feed inputs (Gas, Run_Plan)."""
    wb = openpyxl.load_workbook(WORKBOOK, data_only=True)
    ws, rp, gas = wb["R6_MB"], wb["Run_Plan"], wb["Gas"]
    names = [{"C6s (Isomers of hexane?)": "C6s"}.get(ws[f"A{r}"].value, ws[f"A{r}"].value) for r in range(20, 49)]
    mixed = gas["J35"].value
    feed = [{"component": rp.cell(34, c).value, "value": rp.cell(35, c).value * mixed / 100} for c in range(2, 12)]
    feed.append({"component": "Argon", "value": gas["I35"].value})
    rows = []
    for k, col in enumerate("DEFGH"):
        row = {"DateTime": f"2024-05-14 07:5{k}:00", "Reactor": 6, "01i14FI01": gas["E5"].value}
        row.update({f"01i14FIC0{i}": gas[f"{c}11"].value or 0 for i, c in enumerate("BCDEFGHI", start=1)})
        row.update({f"ESTD_{n}": ws[f"{col}{20 + i}"].value for i, n in enumerate(names)})
        rows.append(row)
    return ws, gas, names, feed, rows


def test_feed_gas_argon_mass_fraction_as_in_the_workbook(workbook_case):
    _, gas, _, feed, _ = workbook_case
    ar = feed_argon(feed)
    assert ar["ar_mol_pct"] == 4.3
    assert ar["ar_wt_pct"] == pytest.approx(gas["I37"].value, rel=1e-12)          # Gas!I37 = 8.2173 wt%


@pytest.mark.parametrize("unit,first_row,suffix", [("mass", 52, "g/h"), ("carbon", 121, "g C/h")])
def test_mass_and_carbon_flows_equal_the_workbook(workbook_case, unit, first_row, suffix):
    ws, _, names, feed, rows = workbook_case
    out = convert_online_rows(rows, unit, feed_gas=feed)
    checked = 0
    for k, col in enumerate("DEFGH"):
        row = out["rows"][k]
        assert row["Status"] == "OK"
        for i, name in enumerate(names):
            reference = ws[f"{col}{first_row + i}"].value
            if f"{name} [{suffix}]" not in row:          # all-empty component, or no carbon in the carbon view
                assert not reference
                continue
            assert row[f"{name} [{suffix}]"] == pytest.approx(reference, rel=1e-12, abs=1e-15)
            checked += 1
        if unit == "mass":
            assert row["Ar to reactor [g/h]"] == pytest.approx(ws["F5"].value, rel=1e-12)   # Gas!G20
        else:
            assert row["Total C [g C/h]"] == pytest.approx(ws[f"{col}150"].value, rel=1e-12)
    assert checked > 60


def test_volumetric_flows_follow_the_argon_balance(workbook_case):
    _, gas, _, feed, rows = workbook_case
    out = convert_online_rows(rows, "volume", feed_gas=feed)
    first = out["rows"][0]
    # 3000 NmL/h of feed with 4.3 mol% Ar; the GC sees 4.282234 mol% Ar → V_out = 3 · 4.3 / 4.282234 Nl/h
    assert first["Total out [Nl/h]"] == pytest.approx(3.0 * 4.3 / rows[0]["ESTD_Argon"], rel=1e-12)
    assert first["Methane [Nl/h]"] == pytest.approx(rows[0]["ESTD_Methane"] / 100 * first["Total out [Nl/h]"], rel=1e-12)
    assert first["Gas feed to reactor [Nl/h]"] == 3.0


def test_run_export_end_to_end_with_the_run_plan_feed_gas():
    online = process_online_file(EXPORT)
    assert online["notes"] and online["rows"][2]["ESTD_C6 Above"] == pytest.approx(0.102719)   # raw ESTD (Area_)
    plan = process_run_plan_file(str(MB_RUN_PLAN))
    gas = plan["feed"]["tables"]["gas"]["rows"]
    cut_in = next(i["value"] for i in plan["plan"]["info"] if i["parameter"] == "Feed Cut-In")
    mass = convert_online_rows(online["rows"], "mass", feed_gas=gas, feed_cut_in=cut_in)
    assert mass["basis"]["ar_feed_mol_pct"] == 5 and mass["basis"]["ar_feed_wt_pct"] == pytest.approx(9.48269, rel=1e-5)
    assert mass["basis"]["excluded_feed_gas"] == ["Other 6.9597 mol%"]
    assert mass["basis"]["tos_zero"] == "2024-10-24 14:00:00"
    status = Counter(r["Status"].split(" (")[0].split(" –")[0] for r in mass["rows"])
    assert mass["ok_count"] == 107 and status["ERROR: no reactor"] == 46
    assert status["ERROR: no GC values in this line"] == 3
    volume = convert_online_rows(online["rows"], "volume", feed_gas=gas, feed_cut_in=cut_in)
    r1 = next(r for r in volume["rows"] if r["Status"] == "OK" and reactor_number(r["Reactor"]) == 1)
    assert r1["Total out [Nl/h]"] == pytest.approx(r1["Gas feed to reactor [Nl/h]"], rel=0.02)   # argon balance closes
    carbon = convert_online_rows(online["rows"], "carbon", feed_gas=gas, feed_cut_in=cut_in)
    assert "H2 [g C/h]" not in carbon["columns"] and "Acetylene [g C/h]" in carbon["columns"]
    ok = next(r for r in carbon["rows"] if r["Status"] == "OK")
    assert ok["TOS (h)"] == pytest.approx(1.1564, abs=1e-4)


def test_errors_are_explicit():
    row = {"DateTime": "2024-01-01 10:00:00", "Reactor": "R2", "01i14FI01": 5, "01i14FIC02": 1000,
           "ESTD_Argon": 5, "ESTD_Methane": 1, "ESTD_C3-C4": 0.2}
    assert convert_online_rows([row], "mass")["rows"][0]["Status"] == \
        "ERROR: no Argon in the Run Plan feed gas (Run Plan → Feed → Gas feed composition)"
    out = convert_online_rows([row], "mass", ar_wt_pct=10)["rows"][0]
    assert out["C3-C4 [g/h]"] == "ERROR: no MW for C3-C4" and out["Status"].startswith("ERROR: no MW for C3-C4")
    assert out["Methane [g/h]"] == pytest.approx(1 * 16.04 / (5 * 39.948) * 5 * 0.10)
    stopped = dict(row, **{"01i14FIC02": 0})
    assert convert_online_rows([stopped], "mass", ar_wt_pct=10)["rows"][0]["Status"].startswith("ERROR: no gas feed to R2")
    bypass = dict(row, Reactor=0)
    assert convert_online_rows([bypass], "volume", ar_mol_pct=5)["rows"][0]["Status"].startswith("ERROR: no reactor")
    with pytest.raises(ValueError):
        convert_online_rows([row], "ppm")


def test_reactor_numbers():
    assert [reactor_number(v) for v in (1, 1.0, "1", "R6", "r8", 0, "", None, "R9")] == [1, 1, 1, 6, 8, 0, None, None, None]


R3_EXPORT = FIXTURES / "online" / "R3-C2-S1_9-06-23.txt"     # GC export without gas flow columns, "Etylene"


ARGON_5 = [{"component": "Argon", "value": 5}]                   # Run Plan feed gas with Ar 5 mol%


def test_export_without_flows_needs_the_run_plan_doe():
    rows = process_online_file(R3_EXPORT)["rows"]
    out = convert_online_rows(rows, "mass", feed_gas=ARGON_5)
    assert out["basis"]["export_has_flows"] is False and out["basis"]["flows_needed"] and out["basis"]["flows_missing"]
    assert out["ok_count"] == 0
    r1 = next(r for r in out["rows"] if reactor_number(r["Reactor"]) == 1)
    assert r1["Status"] == "ERROR: no gas feed for R1 – not in the export and no Run Plan DOE condition with a gas flow at this time"
    assert "Ethylene [g/h]" in out["columns"] and not any("Etylene" in c for c in out["columns"])


def test_gas_feed_from_the_run_plan_doe_for_an_export_without_flows():
    """R3 export: no flow columns → the DOE gas flow of the running condition (3 Nl/h per reactor), Ar from the Run Plan."""
    rows = process_online_file(R3_EXPORT)["rows"]
    doe = [{"Reactor ID": f"R{k}", "Start Date": "2023-06-08 00:00:00", "End Date": "", "Total gas (Nl/h)": 3.0}
           for k in range(1, 9)]
    out = convert_online_rows(rows, "mass", feed_gas=ARGON_5, doe_rows=doe)
    assert out["ok_count"] == 44 and out["basis"]["flow_sources"] == {"Run Plan DOE, molar volume": 44}
    assert not out["basis"]["flows_needed"] and not out["basis"]["argon_missing"]
    line = out["rows"][2]                                                        # R2, 08.06.2023 18:09:40
    assert reactor_number(line["Reactor"]) == 2
    ar = 3.0 / 22.414 * 0.05 * 39.948                                           # n_Ar · MW_Ar from 3 Nl/h
    assert line["Ar to reactor [g/h]"] == pytest.approx(ar)
    assert line["Ethylene [g/h]"] == pytest.approx(rows[2]["ESTD_Etylene"] * 28.05 / (rows[2]["ESTD_Argon"] * 39.948) * ar)
    before = [dict(r, DateTime="2023-06-07 10:00:00") for r in rows[1:3]]      # before the condition started
    assert convert_online_rows(before, "mass", feed_gas=ARGON_5, doe_rows=doe)["rows"][0]["Status"].startswith("ERROR: no gas feed for R")


def test_both_argon_routes_agree_for_consistent_inputs(workbook_case):
    """Workbook R6: 01i14FI01 = 19.5 g/h for 7 × 3000 NmL/h; the molar-volume route gives the same Ar flow (0 °C)."""
    _, gas, _, feed, rows = workbook_case
    no_fi01 = [{k: v for k, v in r.items() if k != "01i14FI01"} for r in rows]
    a = convert_online_rows(rows, "mass", feed_gas=feed)["rows"][0]["Ar to reactor [g/h]"]
    b = convert_online_rows(no_fi01, "mass", feed_gas=feed)["rows"][0]["Ar to reactor [g/h]"]
    assert b == pytest.approx(a, rel=0.01)


def test_gas_feed_from_the_run_plan_doe():
    doe = process_run_plan_file(str(FIXTURES / "run_plan" / "RunPlan_Old_Format.xlsx"))["doe"]["rows"]
    row = {"DateTime": "2024-10-25 10:00:00", "Reactor": 5, "ESTD_Argon": 5.4, "ESTD_Methane": 3.0}
    out = convert_online_rows([row], "volume", ar_mol_pct=5, doe_rows=doe)["rows"][0]
    assert out["Status"] == "OK" and out["Flow source"] == "Run Plan DOE"
    assert out["Gas feed to reactor [Nl/h]"] == pytest.approx(3.1262)            # DOE R5 Gas Flow 3126.2 NmL/h
    late = dict(row, DateTime="2024-10-28 10:00:00")                               # after the condition ended
    assert convert_online_rows([late], "volume", ar_mol_pct=5, doe_rows=doe)["rows"][0]["Status"].startswith("ERROR: no gas feed for R5")


R6_RUN_PLAN = FIXTURES / "run_plan" / "RunPlan_R6-C1-S1_MassBalance.xlsx"   # earlier template: gas block A50:E63


def test_run_plan_r6_earlier_layout_gives_feed_gas_and_doe_flows(workbook_case):
    """Run Plan of R6-C1-S1: gas composition block (Ar 5 mol% target), DOE 2.9999 Nl/h, Feed Cut-In 13.05.2024 14:00."""
    ws, _, names, _, rows = workbook_case
    plan = process_run_plan_file(str(R6_RUN_PLAN))
    gas = plan["feed"]["tables"]["gas"]
    assert {r["component"]: r["value"] for r in gas["rows"]}["Argon"] == 5 and gas["check"] == "Not 100"
    assert [s["label"] for s in gas["settings"]] == ["Diluent / internal standard", "Active gas fraction in feed gas"]
    assert not [r for r in plan["feed"]["tables"]["liquid"]["rows"] if r["weight"] != ""]      # header rows skipped
    cut = next(i["value"] for i in plan["plan"]["info"] if i["parameter"] == "Feed Cut-In")
    export = [{k: v for k, v in r.items() if not k.startswith("01i14")} for r in rows]      # GC only, like a GC export
    for r in export:
        r["DateTime"] = "2024-05-14 07:52:00"
    kw = dict(feed_gas=gas["rows"], feed_cut_in=cut, doe_rows=plan["doe"]["rows"])
    target = convert_online_rows(export, "mass", **kw)["rows"][0]
    assert target["Flow source"] == "Run Plan DOE, molar volume" and target["TOS (h)"] == pytest.approx(17.8667, abs=1e-4)
    assert target["Ar to reactor [g/h]"] == pytest.approx(2.9999 / 22.414 * 0.05 * 39.948)   # DOE 2.9999 Nl/h as read
    # with the verified Ar of the workbook (Gas!I35 = 4.3 mol%) the flows are within 0.5 % of R6_MB
    verified = convert_online_rows(export, "mass", ar_mol_pct=4.3, **kw)["rows"][0]
    assert verified["Acetylene [g/h]"] == pytest.approx(ws["D78"].value, rel=0.005)
    assert verified["N2 [g/h]"] == pytest.approx(ws["D80"].value, rel=0.005)


# ---------------------------------------------------------------- General_MB (6.5.0): Internal Standard from the bypass
from backend.services.online_units import internal_standard_name  # noqa: E402

R3_EXPORT = FIXTURES / "online" / "R3-C2-S1_9-06-23.txt"
MB_RUN_PLAN_FILLED = FIXTURES / "run_plan" / "RunPlan_MassBalance_SS_filled.xlsx"
GC_NAME = {"Hydrogen": "H2", "Nitrogen": "N2"}


def _doe_all(flow_nl_h=3, start="2023-01-01 00:00:00", end=""):
    return [{"Condition No.": 1, "Block": "", "Reactor ID": f"R{k}", "Start Date": start, "End Date": end,
             "Total gas (Nl/h)": flow_nl_h} for k in range(1, 9)]


def test_internal_standard_names():
    assert internal_standard_name("argon") == "Argon" and internal_standard_name("Ar") == "Argon"
    assert internal_standard_name("N2") == "N2" and internal_standard_name("nitrogen") == "N2"
    assert internal_standard_name("") is None and internal_standard_name(None) is None
    with pytest.raises(ValueError):
        internal_standard_name("helium")


def test_bypass_feed_gas_reproduces_the_workbook_gas_sheet(workbook_case):
    """A bypass line with the workbook feed gas (Gas!I35 Ar, mixed gas Run_Plan) gives Gas!I37 and Gas!G20 (R6)."""
    ws, gas, names, feed, rows = workbook_case
    bypass = {"DateTime": "2024-05-14 07:00:00", "Reactor": 0}
    bypass.update({f"ESTD_{GC_NAME.get(f['component'], f['component'])}": f["value"] for f in feed if f["value"]})
    doe = _doe_all(start="2024-05-14 06:00:00")
    out = convert_online_rows([bypass] + rows, "mass", doe_rows=doe, internal_standard="Argon")
    f = out["feed_gas_is"][0]
    assert f["bypass_lines"] == 1 and f["is_mol_pct"] == pytest.approx(gas["I35"].value)
    assert f["is_wt_pct"] == pytest.approx(gas["I37"].value, rel=1e-4)         # MWs: R#_MB vs Run_Plan row 37
    line = next(r for r in out["rows"] if r["Reactor"] == 6)
    assert line["Status"] == "OK" and line["Argon to reactor [g/h]"] == pytest.approx(ws["F5"].value, rel=2e-3)
    assert out["avg_is_flow"][0]["R6"] == pytest.approx(ws["F5"].value, rel=2e-3)


@pytest.mark.parametrize("ist, y_is, y_mix, mw_mix, w_is, f_is", [
    ("Argon", 5.1077, 96.0090, 27.911, 7.0757, 0.273103),
    ("N2", 88.5583, 12.5584, 32.082, 86.0285, 3.320451),
])
def test_r3_bypass_feed_gas_and_is_flow(ist, y_is, y_mix, mw_mix, w_is, f_is):
    rows = process_online_file(R3_EXPORT)["rows"]
    out = convert_online_rows(rows, "mass", doe_rows=_doe_all(3), internal_standard=ist)
    f = out["feed_gas_is"][0]
    assert f["bypass_lines"] == 1
    assert (f["is_mol_pct"], f["mixed_mol_pct"]) == (pytest.approx(y_is, abs=1e-4), pytest.approx(y_mix, abs=1e-4))
    assert f["sum_mol_pct"] == pytest.approx(101.1167, abs=1e-4)
    assert f["mixed_mw"] == pytest.approx(mw_mix, abs=1e-3) and f["is_wt_pct"] == pytest.approx(w_is, abs=1e-4)
    assert all(out["avg_is_flow"][0][f"R{k}"] == pytest.approx(f_is, abs=1e-6) for k in range(1, 9))
    assert out["bypass_count"] == 1 and out["ok_count"] == 44
    assert f"{ist} to reactor [g/h]" in out["columns"] and "Condition" in out["columns"]


@pytest.fixture(scope="module")
def r08_general_mb():
    rows = process_online_file(EXPORT)["rows"]
    plan = process_run_plan_file(str(MB_RUN_PLAN_FILLED))
    return rows, plan["feed"]["tables"]["gas"]["rows"], plan["doe"]["rows"]


def test_r08_feed_gas_per_block_condition(r08_general_mb):
    rows, gas, doe = r08_general_mb
    out = convert_online_rows(rows, "mass", feed_gas=gas, doe_rows=doe, internal_standard="Argon")
    b1, b2 = out["feed_gas_is"]
    assert (b1["condition"], b1["bypass_lines"], b2["condition"], b2["bypass_lines"]) == ("Block-1 · C1", 44, "Block-2 · C1", 36)
    assert b1["is_mol_pct"] == pytest.approx(5.1572, abs=1e-4) and b1["mixed_mol_pct"] == pytest.approx(95.9625, abs=1e-4)
    assert b1["is_wt_pct"] == pytest.approx(9.2933, abs=1e-4) and b2["is_mol_pct"] == pytest.approx(5.0994, abs=1e-4)
    assert b1["run_plan_argon_mol_pct"] == pytest.approx(5.1001)                         # filled Run Plan: measured
    avg = {r["condition"]: r for r in out["avg_is_flow"]}
    assert avg["Block-1 · C1"]["R1"] == pytest.approx(0.1267, abs=1e-4)
    assert avg["Block-2 · C1"]["R5"] == pytest.approx(0.2520, abs=1e-4)
    assert avg["Block-2 · C1"]["R6"] == pytest.approx(0.2455, abs=1e-4)
    assert avg["Block-1 · C1"]["R2"] is None                                            # not used
    assert (out["ok_count"], out["bypass_count"]) == (107, 45)
    statuses = Counter(r["Status"] for r in out["rows"])
    assert statuses["BYPASS – feed gas of Block-1 · C1, Block-2 · C1"] == 36            # parallel blocks share it


@pytest.mark.parametrize("unit, column, value", [
    ("mass", "Methane [g/h]", 0.02323), ("volume", "Methane [Nl/h]", 0.03703), ("carbon", "Methane [g C/h]", 0.01739),
])
def test_r08_reactor_line_in_every_unit(r08_general_mb, unit, column, value):
    rows, gas, doe = r08_general_mb
    out = convert_online_rows(rows, unit, feed_gas=gas, doe_rows=doe, internal_standard="Argon")
    line = next(r for r in out["rows"] if r["DateTime"] == "2024-10-24 15:09:23")
    assert line["Status"] == "OK" and line["Condition"] == "Block-1 · C1"
    assert line[column] == pytest.approx(value, abs=1e-5)
    assert out["avg_is_flow"][0]["R1"] == pytest.approx(0.1267, abs=1e-4)              # same in every unit


def test_r08_with_n2_as_internal_standard(r08_general_mb):
    rows, gas, doe = r08_general_mb
    out = convert_online_rows(rows, "mass", feed_gas=gas, doe_rows=doe, internal_standard="N2")
    b1 = out["feed_gas_is"][0]
    assert b1["is_mol_pct"] == pytest.approx(58.3231, abs=1e-4) and b1["mixed_mol_pct"] == pytest.approx(42.7966, abs=1e-4)
    assert b1["is_wt_pct"] == pytest.approx(73.6999, abs=1e-4)
    assert "N2 to reactor [g/h]" in out["columns"] and "Total w/o N2 [g/h]" in out["columns"]


def test_general_mb_errors_are_explicit():
    base = {"DateTime": "2024-01-01 10:00:00", "Reactor": 1, "01i14FIC01": 3000, "ESTD_Argon": 5.0, "ESTD_Methane": 1.0}
    # no DOE conditions at all
    out = convert_online_rows([base], "mass", internal_standard="Argon")
    assert out["basis"]["no_conditions"] and out["rows"][0]["Status"] == "ERROR: no Run Plan DOE condition for R1 at this time"
    # a condition without a bypass line
    out = convert_online_rows([base], "mass", doe_rows=_doe_all(start="2024-01-01 09:00:00"), internal_standard="Argon")
    assert out["feed_gas_is"][0]["bypass_lines"] == 0
    assert out["rows"][0]["Status"].startswith("ERROR: no bypass (reactor 0) GC line in condition C1")
    assert out["avg_is_flow"][0]["R1"].startswith("ERROR: no bypass")
    # IS peak missing in the reactor line, empty cells and bypass lines without values never crash
    bypass = {"DateTime": "2024-01-01 09:30:00", "Reactor": 0.0, "ESTD_Argon": 5.0, "ESTD_N2": 95.0}
    empty_bypass = {"DateTime": "2024-01-01 09:40:00", "Reactor": "0", "ESTD_Argon": None, "ESTD_N2": ""}
    no_is = dict(base, ESTD_Argon=None, ESTD_Ethane="")
    for unit in ("mass", "volume", "carbon"):
        out = convert_online_rows([bypass, empty_bypass, base, no_is], unit,
                                  doe_rows=_doe_all(start="2024-01-01 09:00:00"), internal_standard="Argon")
        status = [r["Status"] for r in out["rows"]]
        assert status[0] == "BYPASS – feed gas of C1" and status[1] == "BYPASS – no GC values in this line (not used)"
        assert status[2] == "OK"
        assert status[3] == "ERROR: no Argon peak (ESTD_Argon) – Argon is the internal standard"
