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
    assert convert_online_rows([row], "mass")["rows"][0]["Status"].startswith("ERROR: Ar in the feed gas is not set")
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


def test_export_without_flows_asks_for_the_gas_feed():
    rows = process_online_file(R3_EXPORT)["rows"]
    out = convert_online_rows(rows, "mass", ar_mol_pct=5)
    assert out["basis"]["export_has_flows"] is False and out["basis"]["flows_needed"] and out["basis"]["flows_missing"]
    assert out["ok_count"] == 0
    r1 = next(r for r in out["rows"] if reactor_number(r["Reactor"]) == 1)
    assert r1["Status"] == "ERROR: no gas feed for R1 (not in the export) – enter it under Conversion basis"
    assert "Ethylene [g/h]" in out["columns"] and not any("Etylene" in c for c in out["columns"])


def test_entered_gas_feed_like_the_workbook_gas_sheet():
    rows = process_online_file(R3_EXPORT)["rows"]
    gas = {f"R{k}": 3000 for k in range(1, 9)}
    out = convert_online_rows(rows, "mass", ar_mol_pct=5, gas_feed=gas)
    assert out["ok_count"] == 44 and out["basis"]["flow_sources"] == {"entered, molar volume": 44}
    line = out["rows"][2]                                                        # R2, 08.06.2023 18:09:40
    assert reactor_number(line["Reactor"]) == 2
    ar = 3.0 / 22.414 * 0.05 * 39.948                                           # n_Ar · MW_Ar from 3000 NmL/h
    assert line["Ar to reactor [g/h]"] == pytest.approx(ar)
    assert line["Ethylene [g/h]"] == pytest.approx(rows[2]["ESTD_Etylene"] * 28.05 / (rows[2]["ESTD_Argon"] * 39.948) * ar)
    # with 01i14FI01 the workbook route: FI01 · V_r/ΣV · w_Ar
    wb = convert_online_rows(rows, "mass", ar_mol_pct=5, ar_wt_pct=9.4, gas_feed=gas, total_feed_g_h=19.5)
    assert wb["rows"][2]["Ar to reactor [g/h]"] == pytest.approx(19.5 / 8 * 0.094)
    assert wb["basis"]["flow_sources"] == {"entered, 01i14FI01": 44}


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
