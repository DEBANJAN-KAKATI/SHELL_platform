"""Sheet-like tables for the frontend and the .xlsx export, laid out like the MassBal workbook tabs.

A view is {id, title, sections: [{title, note, columns, rows: [{label, unit, cells: [cell]}]}]}.
A cell is {v, f, in, flag, src}: value, format (mol, g, pct, num, date, text, int), input path (editable), flag, source.
"""
from .constants import MB_NAMES, MB_ROWS, MIX_GASES, REACTORS, ZMB_GASES

MB_MW = {name: mw for name, mw, _, _ in MB_ROWS}

R_COLS = [f"R{r}" for r in REACTORS]


def c(v, f="num", inp=None, flag=None, src=None):
    cell = {"v": v, "f": f}
    if inp:
        cell["in"] = inp
    if flag:
        cell["flag"] = flag
    if src:
        cell["src"] = src
    return cell


def row(label, cells, unit=""):
    return {"label": label, "unit": unit, "cells": cells}


def per_reactor(getter, f="num", inp=None, src=None):
    return [c(getter(str(r)), f, inp.format(r=r) if inp else None, src=src) for r in REACTORS]


def zmb_view(common, result):
    z = result["zmb"]
    sections = []
    rows = []
    for rep in range(3):
        base = f"common.zmb.liquid.{rep + 1}"
        get = lambda k, key: z["liquid"][k]["reps"][rep][key]
        rows += [row(f"Rep-{rep + 1} · Sample collection started", per_reactor(lambda k: get(k, "start"), "date", base + ".{r}.start")),
                 row(f"Rep-{rep + 1} · Sample collection finished", per_reactor(lambda k: get(k, "finish"), "date", base + ".{r}.finish")),
                 row(f"Rep-{rep + 1} · Duration of sampling", per_reactor(lambda k: get(k, "duration_min")), "min"),
                 row(f"Rep-{rep + 1} · TL collected mass", per_reactor(lambda k: get(k, "mass"), "g", base + ".{r}.mass"), "g"),
                 row(f"Rep-{rep + 1} · Liq. flow rate mass", per_reactor(lambda k: get(k, "flow"), "g"), "g/h")]
    rows.append(row("Verified liq. flow rate mass (average of the reps)",
                    per_reactor(lambda k: z["liquid"][k]["verified"], "g", src="ZMB!B13:I13 = AVERAGE(B11, L11, V11)"), "g/h"))
    sections.append({"title": "Liquid pump verification (3 reps)", "columns": R_COLS, "rows": rows})
    for stream in [str(r) for r in REACTORS] + ["0"]:
        block = z["gc"].get(stream)
        title = "GC analysis · Bypass" if stream == "0" else f"GC analysis · Reactor-{stream}"
        if not block:
            sections.append({"title": title, "note": "No ZMB injections for this stream.", "columns": [], "rows": []})
            continue
        n = len(block["times"])
        excluded = set(block["excluded"])
        columns = ["Avg [mol%]", "wt%"] + [f"#{i + 1}" for i in range(n)]
        rows = [row("Date and time", [c(None, "text"), c(None, "text")] +
                    [c(t, "date", flag="excluded" if i + 1 in excluded else None) for i, t in enumerate(block["times"])])]
        for name, _, _ in ZMB_GASES:
            rows.append(row(name, [c(block["average"][name], "mol"), c(block["wt"][name], "pct")] +
                            [c(v, "mol", flag="excluded" if i + 1 in excluded else None) for i, v in enumerate(block["values"][name])],
                            "mol%"))
        sections.append({"title": title, "columns": columns, "rows": rows, "stream": stream, "exclude_path": f"common.zmb.excluded.{stream}",
                         "note": f"{block['count']} of {n} injections used (ESTD values)."})
    return {"id": "zmb", "title": "ZMB", "sections": sections}


def run_plan_view(common, result, options):
    run, plan, mix = common.get("run") or {}, common.get("run_plan") or {}, result["mixed_gas"]
    info = [row("Run Number", [c(run.get("run_number"), "text", "common.run.run_number")]),
            row("Run objective", [c(run.get("objective"), "text", "common.run.objective")]),
            row("Run start date", [c(run.get("start"), "date", "common.run.start")]),
            row("Liquid feed ID", [c(plan.get("liquid_feed_id"), "text", "common.run_plan.liquid_feed_id")]),
            row("Liquid feed carbon", [c(plan.get("liquid_feed_carbon_wt"), "pct", "common.run_plan.liquid_feed_carbon_wt",
                                         src="Run_Plan!B58, used by C-Balance C3")], "wt%")]
    source = mix["source"]
    label = {"mean": "mean of the reactor blocks", "0": "bypass block"}.get(str(source), f"ZMB Reactor-{source} block")
    columns = [name for name, *_ in MIX_GASES] + ["Total"]
    mix_rows = [row("Concentration", [c(mix["mol"][n], "mol") for n, *_ in MIX_GASES] + [c(mix["mol_sum"], "mol")], "mol%"),
                row("Concentration", [c(mix["mass"][n], "pct") for n, *_ in MIX_GASES] + [c(100 if mix["mw"] else None, "pct")], "mass%"),
                row("Mol Wt", [c(mw) for _, mw, *_ in MIX_GASES] + [c(mix["mw"])], "g/mol"),
                row("g of gas in 100 gmol of gas", [c(mix["g38"][n]) for n, *_ in MIX_GASES] + [c(sum(mix["g38"].values()))], "g")]
    for i, element in enumerate(("Carbon", "Hydrogen", "Oxygen", "Nitrogen")):
        mix_rows.append(row(f"{element} contained in 100 kg gas",
                            [c((mix["mass"][g[0]] or 0) * g[2 + i] / 100) for g in MIX_GASES] + [c(mix["elements"][element[0]])], "kg"))
    catalysts = []
    for cat in plan.get("catalysts") or []:
        for bed in cat["beds"]:
            if bed.get("catalyst"):
                catalysts.append(row(f"R{cat['reactor']} · {bed['bed']} bed", [c(bed["catalyst"], "text"), c(bed["target_mg"]),
                                                                                c(bed["actual_mg"]), c(bed["volume_ml"])]))
    conditions = [row(f"Condition-{x['condition']}", [c(x["temperature_1"]), c(x["temperature_2"]), c(x["pressure_1"]),
                                                       c(x["pressure_2"]), c(x["duration"]), c(x["duration_unit"], "text")])
                  for x in plan.get("conditions") or [] if any(x.get(k) not in (None, "") for k in ("temperature_1", "pressure_1"))]
    sections = [{"title": "Run information", "columns": ["Value"], "rows": info},
                {"title": f"Mixed gas composition (from the {label})", "columns": columns, "rows": mix_rows,
                 "note": "Run_Plan!B35:K35 = ZMB GC block averages (ESTD, not normalised), as in the workbook."}]
    if catalysts:
        sections.append({"title": "Catalyst loading", "columns": ["Catalyst ID", "Target [mg]", "Actual [mg]", "Volume [mL]"],
                         "rows": catalysts})
    if conditions:
        sections.append({"title": "Target operating conditions", "columns": ["T block-1 [°C]", "T block-2 [°C]",
                                                                              "P block-1 [barg]", "P block-2 [barg]", "Duration", "Unit"],
                         "rows": conditions})
    return {"id": "run_plan", "title": "Run Plan", "sections": sections}


def liq_gas_view(common, sample, result):
    i = sample.get("_index", 0)
    L, g = result["liq"], result["gas"]
    base = f"samples.{i}.liq"
    liq_rows = [
        row("Sample collection started", per_reactor(lambda k: L[k]["start"], "date", base + ".{r}.start")),
        row("Sample collection finished", per_reactor(lambda k: L[k]["finish"], "date", base + ".{r}.finish")),
        row("Duration of sampling", per_reactor(lambda k: L[k]["duration_min"]), "min"),
        row("Average time-on-stream", per_reactor(lambda k: L[k]["tos_h"]), "h"),
        row("Feed flow rate (verified in ZMB)", per_reactor(lambda k: L[k]["feed"], "g", src="Liq!B13 = ZMB!B13"), "g/h"),
        row("TLP mass", per_reactor(lambda k: L[k]["tlp"], "g", base + ".{r}.tlp"), "g"),
        row("Hydrocarbon (top) phase mass", per_reactor(lambda k: L[k]["hc"], "g", base + ".{r}.hc"), "g"),
        row("Aqueous (bottom) phase mass", per_reactor(lambda k: L[k]["aq"], "g", base + ".{r}.aq"), "g"),
        row("Decantation loss", per_reactor(lambda k: L[k]["decantation_loss"], "pct"), "%"),
        row("Hydrocarbon (top) phase flow rate", per_reactor(lambda k: L[k]["hc_flow"], "g", src="Liq!B40 = (TLP − aqueous) / TOS"), "g/h"),
        row("Aqueous (bottom) phase flow rate", per_reactor(lambda k: L[k]["aq_flow"], "g", src="Liq!B41 = aqueous / sampling hours"), "g/h"),
        row("Carbon in liquid product", per_reactor(lambda k: result["c_balance"][k]["c_wt_liquid_product"], "pct",
                                                    f"samples.{i}.c_wt_liquid_product" + ".{r}", src="C-Balance!N34"), "wt%"),
    ]
    manual = result.get("gas_source") != "txt"
    gas_path = f"samples.{i}.gas"
    feed_rows = [row("Verified Argon", [c(g["ar_mol"], "mol", "common.gas.ar_mol", src="Gas!I35")], "mol%"),
                 row("Verified mixed gas", [c(g["mix_mol"], "mol", "common.gas.mix_mol", src="Gas!J35")], "mol%"),
                 row("Total", [c(g["sum_mol"], "mol")], "mol%"),
                 row("Mixed gas MW", [c(g["mw_mix"])], "g/mol"),
                 row("Argon", [c(g["mass"]["Argon"], "pct")], "mass%"),
                 row("Mixed gas", [c(g["mass"]["Mixed gas"], "pct")], "mass%"),
                 row("Average of 01i14FI01 (total gas feed)", [c(g["fi01"], "g", gas_path + ".fi01" if manual else None,
                                                                  src="manual" if manual else "mean of 01i14FI01 in the sample window")], "g/h")]
    per = g["reactors"]
    gas_rows = [row("Gas feed flow rate (01i14FIC0r)", per_reactor(lambda k: per[k]["nml"], "num", gas_path + ".nml.{r}" if manual else None), "NmL/h"),
                row("Total gas feed flow rate", per_reactor(lambda k: per[k]["total"], "g", src="Gas!B12 = FI01 · V_r / ΣV"), "g/h")]
    for name in ("Hydrogen", "Ethylene", "Methane", "Ethane", "Nitrogen", "CO2", "CO", "Argon", "Mixed gas"):
        gas_rows.append(row(f"Flow rate of {name} contained", per_reactor(lambda k, n=name: per[k]["contained"].get(n), "g"), "g/h"))
    for element, label in (("C", "carbon"), ("H", "hydrogen"), ("O", "oxygen"), ("N", "nitrogen"), ("Ar", "argon")):
        gas_rows.append(row(f"Elemental {label} contained", per_reactor(lambda k, e=element: (per[k]["elemental"] or {}).get(e), "g"), "g/h"))
    sections = [{"title": f"Liquid sample {sample.get('name') or ''}", "columns": R_COLS, "rows": liq_rows},
                {"title": "Verified feed gas composition", "columns": ["Value"], "rows": feed_rows,
                 "note": "ZMB measured Argon (ESTD average) is shown on the Import tab as a suggestion."},
                {"title": "Average gas flow into each reactor over the sampling window", "columns": R_COLS, "rows": gas_rows,
                 "note": ("Flows are the means of 01i14FIC0r / 01i14FI01 in the sample window." if not manual else
                          "Flows entered by hand (or from the workbook).") +
                         " Elemental rows include the mixed gas via Run_Plan L43:L46 (the workbook leaves it out; not used by C-Balance)."}]
    operating = (result.get("gas_flows") or {}).get("operating")
    if operating:
        sections.append({"title": "Operating conditions in the window (means)", "columns": list(operating.keys()),
                         "rows": [row("Mean", [c(v) for v in operating.values()])]})
    return {"id": "liq_gas", "title": "Liq & Gas", "sections": sections}


def reactor_view(sample, result, r):
    i = sample.get("_index", 0)
    R = result["reactors"][str(r)]
    reps = R["reps"]
    h = R["header"]
    rep_cols = [f"#{rep['index']}" for rep in reps]
    outliers = {(name, idx) for name, idx in R["outliers"]}
    tc = R["time_check"]
    head = [row("Average Ar flow to reactor", [c(h["ar_in"], "g")], "g/h"),
            row("Flow rate of liquid feed", [c(h["liq_feed"], "g")], "g/h"),
            row("Flow rate of gas feed (without Ar)", [c(h["gas_feed"], "g")], "g/h"),
            row("Flow rate of HC TLP", [c(h["hc_flow"], "g")], "g/h"),
            row("Flow rate of aqueous TLP", [c(h["aq_flow"], "g")], "g/h"),
            row("Flow rate of gas product (without Ar)", [c(h["gas_product"], "g")], "g/h"),
            row("Mass balance closure", [c(h["closure"], "pct", flag="kpi")], "%"),
            row("GC injection time check", [c(tc["result"] or "n/a", "text", flag=(tc["result"] or "").lower() or None,
                                              src=f"first {tc['first']} · last {tc['last']} (must lie after Run Start and before collection finished)")])]
    time_rows = [row("Date and time", [c(None, "text"), c(None, "text")] + [c(rep["time"], "date", flag="excluded" if rep["excluded"] else None) for rep in reps]),
                 row("TOS", [c(None, "text"), c(None, "text")] + [c(rep["tos_h"]) for rep in reps], "h"),
                 row("Cumulative time lapsed", [c(None, "text"), c(None, "text")] + [c(rep["cum_min"]) for rep in reps], "min"),
                 row("Time elapsed between two reps", [c(None, "text"), c(None, "text")] + [c(rep["delta_min"]) for rep in reps], "min")]
    mol_rows = []
    for name in MB_NAMES:
        st = R["stats"][name]
        mol_rows.append(row(name, [c(MB_MW[name]), c(st["mean"], "mol", src=f"sd {st['sd']} · limit {st['limit']}")] +
                            [c(rep["y"][name], "mol", flag="outlier" if (name, rep["index"]) in outliers else ("excluded" if rep["excluded"] else None),
                               src=rep.get("source")) for rep in reps], "mol%"))
    mass_rows = [row(f"{name}", [c(R["mean_m"][name] if R["mean_m"] else None, "g")] + [c(rep["m"][name] if rep["m"] else None, "g") for rep in reps], "g/h")
                 for name in MB_NAMES]
    mass_rows += [row("HC gases", [c(R["mean_hc"], "g")] + [c(rep["hc"], "g") for rep in reps], "g/h"),
                  row("COx gases", [c(R["mean_cox"], "g")] + [c(rep["cox"], "g") for rep in reps], "g/h"),
                  row("HC & COx gases", [c((R["mean_hc"] or 0) + (R["mean_cox"] or 0) if R["has_data"] else None, "g")] +
                      [c(rep["hc_cox"], "g") for rep in reps], "g/h")]
    vol_rows = [row("Total volumetric flow out (workbook D86)", [c(R["mean_vtot"])] + [c(rep["vtot"]) for rep in reps], "as in workbook"),
                row("Total volumetric flow out (corrected)", [c(_avg([rep["vtot_nl"] for rep in reps if not rep["excluded"]]))] +
                    [c(rep["vtot_nl"]) for rep in reps], "NL/h")]
    vol_rows += [row(name, [c(R["mean_v"][name] if R["mean_v"] else None)] + [c(rep["v"][name] if rep["v"] else None) for rep in reps], "Nl/h")
                 for name in MB_NAMES]
    carbon_rows = [row(name, [c(R["carbon_mean"][name] if R["carbon_mean"] else None, "g")] +
                       [c(rep["carbon"][name] if rep["carbon"] else None, "g") for rep in reps], "g/h") for name in MB_NAMES]
    carbon_rows.append(row("Total", [c(R["carbon_gas"], "g", flag="kpi")] + [c(rep["carbon_total"], "g") for rep in reps], "g/h"))
    errors = [f"#{rep['index']}: {rep['error']}" for rep in reps if rep.get("error")]
    return {"id": f"r{r}", "title": f"R{r}_MB", "reactor": r, "sections": [
        {"title": f"Reactor {r} · {R['rep_count']} GC reps used", "columns": ["Value"], "rows": head,
         "note": "; ".join(errors) if errors else None},
        {"title": "GC analysis reps", "columns": ["", ""] + rep_cols, "rows": time_rows, "exclude_path": f"samples.{i}.excluded.{r}",
         "rep_header": True},
        {"title": "Normalized mol% (ESTD) · outliers: value > mean + 2·sd of reps 2…n", "columns": ["Mol Wt", "Mean (reps 2…n)"] + rep_cols,
         "rows": mol_rows},
        {"title": "Mass flow rates of each molecule (Ar internal standard)", "columns": ["Average"] + rep_cols, "rows": mass_rows,
         "note": "m_i = y_i · MW_i / (y_Ar · 39.948) · Ar flow into the reactor"},
        {"title": "Volumetric flow rates of each molecule", "columns": ["Average"] + rep_cols, "rows": vol_rows},
        {"title": "Carbon mass flow of each molecule", "columns": ["Average"] + rep_cols, "rows": carbon_rows,
         "note": "C_i = 12.011 · nC_i / MW_i · m_i"},
    ]}


def _avg(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def c_balance_view(result):
    C = result["c_balance"]
    get = lambda key, f="g", src=None: per_reactor(lambda k: C[k][key], f, src=src)
    rows = [row("C in liquid feed", get("c_liq_in", src="C3 = liquid feed · Run_Plan!B58 %"), "g/h"),
            row("C in gas feed", get("c_gas_in", src="C4 = C from C2H2 + CH4 + C2H6 + C2H4"), "g/h"),
            row("C in liquid product", get("c_liq_out", src="C6 = TLP · C wt% / TOS"), "g/h"),
            row("C in gas product", get("c_gas_out", src="C7 = Σ Rx_MB!AC52:AC80"), "g/h"),
            row("Carbon balance", [dict(x, flag="kpi") for x in get("carbon_balance", "pct")], "%"),
            row("C4+ in liquid feed", get("c4_liq_feed"), "g/h"),
            row("C4+ in liquid product", get("c4_liq_out"), "g/h"),
            row("C4+ in gas feed", get("c4_gas_feed"), "g/h"),
            row("C4+ in gas product", get("c4_gas_out"), "g/h"),
            row("C4+ yield", get("c4_yield", "pct"), "%"),
            row("Acetylene in", get("acetylene_in"), "g/h"),
            row("Acetylene out", get("acetylene_out"), "g/h"),
            row("Acetylene conversion", [dict(x, flag="kpi") for x in get("acetylene_conversion", "pct")], "%"),
            row("Ethylene to ethane selectivity (as in workbook)", get("ethylene_ethane_ratio", "num"), "mol/mol"),
            row("Ethylene selectivity", [dict(x, flag="kpi") for x in get("ethylene_selectivity", "pct")], "%")]
    helpers = []
    for name in ("Acetylene", "Methane", "Ethane", "Ethylene"):
        hp = lambda k, key, n=name: C[k]["helpers"][n][key]
        helpers += [row(f"{name} wt% in mixed gas feed", per_reactor(lambda k: hp(k, "wt_mix"), "pct"), "wt%"),
                    row(f"{name} wt% in gas feed", per_reactor(lambda k: hp(k, "wt_gas"), "pct"), "wt%"),
                    row(f"C wt fraction in {name}", per_reactor(lambda k: hp(k, "c_fraction"))),
                    row(f"C in feed from {name}", per_reactor(lambda k: hp(k, "c_flow"), "g"), "g/h"),
                    row(f"{name} mass flow rate in feed", per_reactor(lambda k: hp(k, "mass_flow"), "g"), "g/h")]
    helpers += [row("Total C in liquid product", per_reactor(lambda k: C[k]["c_liq_out_g"], "g"), "g")]
    return {"id": "c_balance", "title": "C-Balance", "sections": [
        {"title": "Carbon balance, C4+ yield, acetylene conversion, ethylene selectivity", "columns": R_COLS, "rows": rows},
        {"title": "Feed-gas carbon helpers (C-Balance N:U)", "columns": R_COLS, "rows": helpers}]}


def summary_view(result):
    s = result["summary"]
    rows = [row(f"R{x['reactor']}", [c(x["carbon_balance"], "pct", flag="kpi"), c(x["mass_balance"], "pct", flag="kpi"), c(x["tos_h"]),
                                      c(x["acetylene_conversion"], "pct"), c(x["ethylene_selectivity"], "pct"), c(x["carbon_gas"], "g"),
                                      c(x["c4_yield"], "pct"), c(x["rep_count"], "int")]) for x in s["rows"]]
    n = max([len(v) for v in s["carbon_balance_by_rep"].values()] + [0])
    by_rep = lambda key: [row(f"{j + 1}", [c(s[key][str(r)][j] if j < len(s[key][str(r)]) else None, "pct") for r in REACTORS]) for j in range(n)]
    return {"id": "summary", "title": "Summary", "sections": [
        {"title": f"Summary · sample {result.get('sample') or ''}", "columns": ["C'Bal [%]", "M'Bal [%]", "TOS [h]", "Ac conv [%]",
                                                                               "Ethy sel [%]", "C'Bal_g [g/h]", "C4+ yield [%]", "GC reps"],
         "rows": rows},
        {"title": "Gas-phase C'Bal by GC rep [%]", "columns": R_COLS, "rows": by_rep("carbon_balance_by_rep")},
        {"title": "Acetylene conversion by GC rep [%]", "columns": R_COLS, "rows": by_rep("acetylene_conversion_by_rep")}]}


def build_views(common, sample, result, options):
    views = [zmb_view(common, result), run_plan_view(common, result, options), liq_gas_view(common, sample, result)]
    views += [reactor_view(sample, result, r) for r in REACTORS]
    views += [c_balance_view(result), summary_view(result)]
    return views
