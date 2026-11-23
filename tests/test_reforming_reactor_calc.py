"""6.11.0: Reforming reactor sheet (ILS_Chemical Validation_Reforming, Method 2) — backend/reforming/reactor_calc.py.

Synthetic data only; every expected value is written out from the sheet's cell formulas:
  H2 / N2 vol% = (Area − intercept) / slope; Naphtha vol% = 100 − N2 − H2
  H2 out = N2/(N2%/100)·H2%/100·0.0416·2; Naphtha out = N2/(N2%/100)·Naphtha%/100·0.0416·MW(DHA)
  Naphtha feed = Naphtha out·C_naphtha/C_feed; H2 generation = 100·(feed − out)/feed; wof = wt·(100 − H2 gen)/100
  Gas = wof P C1-C4 + iP C4 + O C2-C4 + U C1-C4; C5+ = 100 − Gas − H2 gen
"""
import pytest

from backend.reforming.reactor_calc import CARBON_FRACTION, COMPONENTS, calculate

FEED_C, FEED_MW, DENSITY, CAT_VOL, N2, H2_IN = 85.0, 100.0, 0.73, 1.9, 4.5, 0.08


def run_plan(cut_in="2026-11-18 14:35:00"):
    doe = lambda r, b, n2: {"Condition No.": 1, "Block": b, "Reactor ID": r, "Start Date": "2026-11-18 00:00:00", "End Date": "",
                            "H2 Flow (gms/h)": H2_IN, "N2 dilution flow (NLPH)": n2}
    return {
        "feedTables": {"properties": {"rows": [{"label": "Carbon", "value": FEED_C}, {"label": "Molecular Weight", "value": FEED_MW},
                                               {"label": "Density @ 15 °C", "value": DENSITY}]}},
        "planData": {"rows": [{"parameter": "Catalyst", "r2": "PS-210", "r6": "R-434"},
                              {"parameter": "Catalyst volume", "r2": CAT_VOL, "r6": CAT_VOL}],
                     "info": [{"parameter": "Feed Cut-In", "value": cut_in}, {"parameter": "Feed SL ID", "value": "FEED01"}]},
        "doeData": {"rows": [doe("R2", "Block-1", N2), doe("R6", "Block-2", 3.8)]},
    }


def line(when, gc, reactor, area_h2, area_n2, t1=490, t2=495, p1=7.0, p2=7.1):
    return {"Date/Time": when, "GC Date/Time": gc, "Sampled_reactor": str(reactor), "Area_H2": str(area_h2), "Area_N2": str(area_n2),
            "10i1TIC02": str(t1), "10i2TIC02": str(t2), "10i1PIC01": str(p1), "10i2PIC01": str(p2), "ESTD_H2": "18.196.794"}


def sample(uid, dha_time, mw=85.0, **wt):
    row = {"UID": uid, "DateTime": dha_time, "Molecular Weight": mw, "RON": 95.0, "Specific Gravity": 0.75}
    row.update({c: 0.0 for c in COMPONENTS})
    row.update({k.replace("_", " "): v for k, v in wt.items()})
    return row


COMPOSITION = {"Paraffins_C1": 1.0, "Paraffins_C4": 2.0, "Iso Paraffins_C4": 1.5, "Iso Paraffins_C3": 0.7, "Olefins_C1": 0.3,
               "Olefins_C3": 0.4, "Unknowns_C2": 0.6, "Paraffins_C6": 10.0, "Aromatics_C7": 60.0, "Naphthenes_C6": 23.5}


@pytest.fixture()
def result():
    ops = [
        line("18.11.2026 12:31:11", "18.11.2026 14:12:05", 2, 3231860, 394418556),              # before cut-in
        line("19.11.2026 05:05:22", "19.11.2026 06:46:00", 2, 4380000, 323000000),              # 14.5 h after cut-in
        line("19.11.2026 05:30:00", "19.11.2026 07:10:00", 6, 4400000, 325000000),              # R6, no DHA sample
        line("19.11.2026 06:00:00", "19.11.2026 07:40:00", 0, 100000, 400000000),               # bypass
    ]
    samples = [sample("R18_C1_S1_001", "18/11/2026 14:12"), sample("R18_C1_S1_002", "19/11/2026 06:46", **COMPOSITION),
               sample("FEED01_A", "19/11/2026 07:40")]
    return calculate(ops, samples, run_plan())


def test_line_values_follow_the_sheet_formulas(result):
    r2 = [l for l in result["lines"] if l["reactor"] == "R2"]
    assert len(r2) == 2 and {l["reactor"] for l in result["lines"]} == {"R2", "R6"}      # bypass is not a reactor line
    x = r2[1]
    h2v, n2v = (4380000 - 180057) / 179209, (323000000 - 5710532) / 4716081
    nv = 100 - n2v - h2v
    carbon = sum(CARBON_FRACTION[k.split("_")[0]][int(k.split("_C")[1]) - 1] * v for k, v in COMPOSITION.items())
    h2_out = (N2 / (n2v / 100)) * (h2v / 100) * 0.0416 * 2
    n_out = (N2 / (n2v / 100)) * (nv / 100) * 0.0416 * 85.0
    n_feed = n_out * carbon / FEED_C
    h2gen = 100 * (n_feed - n_out) / n_feed
    f = (100 - h2gen) / 100
    gas = (1.0 + 2.0 + 1.5 + 0.4 + 0.6) * f              # P C1, P C4, iP C4, O C3, U C2 (iP C3 and O C1 are not in the sheet's sum)
    expected = {
        "h2_vol": h2v, "n2_vol": n2v, "naphtha_vol": nv, "carbon_naphtha": carbon, "hydrogen_naphtha": 100 - carbon,
        "h2_out": h2_out, "naphtha_out": n_out, "naphtha_feed": n_feed, "naphtha_h2": nv * 85.0 / (h2v * 2),
        "lhsv": n_feed / DENSITY / CAT_VOL, "h2_naphtha_mol": (h2_out / 2) / (n_feed / FEED_MW),
        "h2_generation": h2gen, "gas_yield": gas, "c5_yield": 100 - gas - h2gen,
        "naphtha_h2_inlet": n_feed / H2_IN, "h2_naphtha_inlet": (H2_IN / 2) / (n_feed / FEED_MW),
        "temperature": 490.0, "pressure": 7.0, "n2_nlph": N2,
    }
    for key, value in expected.items():
        assert x[key] == pytest.approx(value, rel=1e-12), key
    assert x["run_length_h"] == pytest.approx(14.5061111, rel=1e-6)
    assert x["duration_h"] == pytest.approx(x["run_length_h"] - r2[0]["run_length_h"], rel=1e-12)
    assert x["wof"]["Aromatics C7"] == pytest.approx(60.0 * f) and x["family_wof"]["Aromatics"] == pytest.approx(60.0 * f)
    assert x["total_incl_h2"] == pytest.approx(x["family_wof_total"] + h2gen) and x["yield_total"] == pytest.approx(100.0)
    assert x["date"] == "19.11.2026" and x["time"] == "05:05:22" and x["dha_uid"] == "R18_C1_S1_002" and x["catalyst"] == "PS-210"


def test_yields_start_12_h_after_cut_in_and_before_wof_equals_wt(result):
    first = [l for l in result["lines"] if l["reactor"] == "R2"][0]
    assert first["run_length_h"] < 0 and first["h2_generation"] == "" and first["gas_yield"] == ""
    assert first["wof"] == first["wt"]


def test_block_2_reactor_tags_and_missing_dha_are_explicit(result):
    r6 = [l for l in result["lines"] if l["reactor"] == "R6"][0]
    assert r6["temperature"] == 495.0 and r6["pressure"] == 7.1 and r6["n2_nlph"] == 3.8 and r6["block"] == "Block-2"
    assert r6["naphtha_out"].startswith("ERROR") and r6["mw"].startswith("ERROR") and r6["h2_generation"] == ""
    assert isinstance(r6["h2_vol"], float)
    reactors = {r["reactor"]: r for r in result["reactors"]}
    assert reactors["R6"]["catalyst"] == "R-434" and reactors["R2"]["feed_cut_in"] == "18.11.2026 14:35"


def test_missing_run_plan_inputs_give_error_text():
    ops = [line("19.11.2026 05:05:22", "19.11.2026 06:46:00", 2, 4380000, 323000000)]
    plan = run_plan()
    plan["feedTables"]["properties"]["rows"] = []
    plan["doeData"]["rows"] = []
    out = calculate(ops, [sample("S1", "19/11/2026 06:46", **COMPOSITION)], plan)
    x = out["lines"][0]
    assert x["n2_nlph"].startswith("ERROR") and x["h2_out"].startswith("ERROR") and x["naphtha_h2_inlet"].startswith("ERROR")
    assert set(out["missing"]) == {"feed Carbon wt%", "feed Molecular Weight", "feed Density @ 15 °C"}


def test_feed_carbon_is_normalised_with_hydrogen_as_the_workbook():
    """'Blend Feed Properties' H9 = 100*D9/SUM(D9:D10): CHN 85.33 / 14.89 → 85.1427 wt% (the reactor sheets' D2)."""
    plan = run_plan()
    plan["feedTables"]["properties"]["rows"] = [{"label": "Carbon", "value": 85.33}, {"label": "Hydrogen", "value": 14.89},
                                                {"label": "Molecular Weight", "value": FEED_MW}, {"label": "Density @ 15 °C", "value": DENSITY}]
    ops = [line("19.11.2026 05:05:22", "19.11.2026 06:46:00", 2, 4380000, 323000000)]
    out = calculate(ops, [sample("S1", "19/11/2026 06:46", **COMPOSITION)], plan)
    assert out["constants"]["feed_carbon"] == pytest.approx(85.14268609060068, rel=1e-15)
    assert out["constants"]["feed_hydrogen"] == pytest.approx(14.857313909399322, rel=1e-15)
    x = out["lines"][0]
    assert x["naphtha_feed"] == pytest.approx(x["naphtha_out"] * x["carbon_naphtha"] / 85.14268609060068, rel=1e-12)


# 6.11.2: Result_34 exports every line from 20.11.2026 08:00 with Sampled_reactor 0 although the GC kept sampling R2 / R6.
REACTOR_AREAS = (4380000, 323000000)                    # ~9 vol% naphtha: a reactor effluent
BYPASS_AREAS = (int(20 * 179209 + 180057), int(79.9 * 4716081 + 5710532))     # 20 % H2 + 79.9 % N2: 0.1 vol% naphtha


def test_lines_exported_as_reactor_0_with_naphtha_take_the_gc_cycle():
    from backend.reforming.reactor_calc import REACTOR_SOURCE_CYCLE, REACTOR_SOURCE_EXPORT, assign_reactors
    times = [f"20.11.2026 {h:02d}:00:00" for h in range(9)]
    labels = [2, 6, 2, 6, 0, 0, 0, 0, 0]
    areas = [REACTOR_AREAS] * 7 + [BYPASS_AREAS, REACTOR_AREAS]
    ops = [line(t, t, r, *a) for t, r, a in zip(times, labels, areas)]
    out = assign_reactors(list(reversed(ops)))[::-1]          # the order of the rows does not matter, time does
    assert [r for r, _ in out] == ["R2", "R6", "R2", "R6", "R2", "R6", "R2", "R0", "R6"]
    assert [s for _, s in out][:4] == [REACTOR_SOURCE_EXPORT] * 4 and out[4][1] == REACTOR_SOURCE_CYCLE
    assert out[7][1] == REACTOR_SOURCE_EXPORT                    # a real bypass line (H2 + N2 only) stays the bypass


def test_pre_run_lines_without_dha_are_left_out_and_early_lines_take_condition_1():
    ops = [
        line("17.11.2026 11:23:44", "17.11.2026 13:00:00", 2, *REACTOR_AREAS),      # drying / reduction: no DHA, no DOE
        line("17.11.2026 20:00:00", "17.11.2026 21:40:00", 2, *REACTOR_AREAS),      # before the DOE start, with a DHA sample
        line("19.11.2026 05:05:22", "19.11.2026 06:46:00", 2, *REACTOR_AREAS),
    ]
    samples = [sample("S0", "17/11/2026 21:40", **COMPOSITION), sample("S1", "19/11/2026 06:46", **COMPOSITION)]
    out = calculate(ops, samples, run_plan())
    r2 = [l for l in out["lines"] if l["reactor"] == "R2"]
    assert [l["dha_uid"] for l in r2] == ["S0", "S1"]
    assert r2[0]["n2_nlph"] == N2 and isinstance(r2[0]["h2_out"], float)
