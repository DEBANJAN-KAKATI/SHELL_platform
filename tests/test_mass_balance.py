"""General_MB mass balance (Calculation → Mass Balance): R08 export + filled R08 Run Plan + typed liquid samples."""
from pathlib import Path

import pytest

from backend.services.mass_balance import calculate_mass_balance
from backend.services.online_analysis_service import process_online_file
from backend.services.online_units import molecular_weights_from_feed
from backend.services.run_plan_service import process_run_plan_file

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def r08():
    rows = process_online_file(FIXTURES / "online" / "Result_R08-Ci-S4-27-Oct-24_1_3.txt")["rows"]
    plan = process_run_plan_file(FIXTURES / "run_plan" / "RunPlan_MassBalance_R08_filled.xlsx")
    tables = plan["feed"]["tables"]
    cut = next(i["value"] for i in plan["plan"]["info"] if i["parameter"] == "Feed Cut-In")
    return dict(rows=rows, feed_gas=tables["gas"]["rows"], feed_cut_in=cut, doe_rows=plan["doe"]["rows"],
                molecular_weights=molecular_weights_from_feed(tables))


def sample(reactor, hc, c_wt, feed=0.499, aq=0.0):
    return dict(sample="C1-S1", reactor=reactor, start="2024-10-24 20:00", end="2024-10-24 20:06", feed_flow_g_h=feed,
                hc_flow_g_h=hc, aq_flow_g_h=aq, c_wt_pct=c_wt, tos_h=6.05)


def run(r08, liquid=None, **options):
    return calculate_mass_balance(r08["rows"], feed_gas=r08["feed_gas"], feed_cut_in=r08["feed_cut_in"],
                                  doe_rows=r08["doe_rows"], internal_standard="Argon",
                                  molecular_weights=r08["molecular_weights"], liquid=liquid, options=options)


def test_balances_follow_the_definitions(r08):
    out = run(r08, {"feed_carbon": 85.6, "results": [sample("R1", 0.48, 85.2)]})
    assert out["reactant"] == "Acetylene" and out["product"] == "Ethylene"
    r1 = next(r for r in out["results"] if r["reactor"] == "R1" and r["sample"] == "C1-S1")
    assert r1["condition"] == "Block-1 · C1" and r1["lines"] == 10          # first line of the condition left out
    c_in = r1["c_gas_in_g_h"] + 0.499 * 0.856
    c_out = r1["c_gas_out_g_h"] + 0.48 * 0.852
    assert r1["c_balance_pct"] == pytest.approx(100 * c_out / c_in)
    assert r1["mass_balance_pct"] == pytest.approx(100 * (r1["gas_out_g_h"] + 0.48) / (r1["gas_in_g_h"] + 0.499))
    acetylene = next(c for c in r1["components"] if c["component"] == "Acetylene")
    assert r1["conversion_pct"] == pytest.approx(100 * (acetylene["in_g_h"] - acetylene["out_g_h"]) / acetylene["in_g_h"])
    assert r1["product_yield_pct"] == pytest.approx(r1["conversion_pct"] * r1["selectivity_pct"] / 100)
    # Feed of each molecule is scaled with the internal standard: Σ feed w/o IS = F_r − F_IS
    assert r1["gas_in_g_h"] > 0 and 95 < r1["gas_c_balance_pct"] < 105


def test_conditions_without_liquid_sample_are_gas_only_with_explicit_errors(r08):
    out = run(r08, {"feed_carbon": 85.6, "results": [sample("R1", 0.48, 85.2)]})
    gas_only = [r for r in out["results"] if r["sample"] == "gas only"]
    assert {(r["reactor"], r["condition"]) for r in gas_only} == {("R5", "Block-2 · C1"), ("R6", "Block-2 · C1"), ("R1", "Block-1 · C2")}
    for r in gas_only:
        assert r["c_balance_pct"].startswith("ERROR: no liquid sample")
        assert r["mass_balance_pct"].startswith("ERROR")
        assert isinstance(r["conversion_pct"], float) and isinstance(r["gas_c_balance_pct"], float)
    assert len(out["trends"]) == 107


def test_missing_liquid_feed_carbon_is_an_error_not_zero(r08):
    out = run(r08, {"feed_carbon": "", "results": [sample("R5", 0.495, 85.4)]})
    r5 = next(r for r in out["results"] if r["sample"] == "C1-S1")
    assert r5["c_balance_pct"].startswith("ERROR: Carbon wt% of the liquid feed")
    assert isinstance(r5["mass_balance_pct"], float)


def test_window_basis_uses_lines_around_the_sample(r08):
    out = run(r08, {"feed_carbon": 85.6, "results": [sample("R1", 0.48, 85.2)]}, basis="window", window_h=2)
    r1 = next(r for r in out["results"] if r["sample"] == "C1-S1")
    assert r1["line_basis"] == "window" and r1["lines"] == 2
