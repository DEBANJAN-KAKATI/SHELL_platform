"""Sheet-like tables for the dashboard pages and the .xlsx export, laid out like the MassBal workbook tabs.

A view is {id, title, sections: [{key, group, title, note, columns, rows: [{label, unit, zero, cells: [cell]}]}]}.
A cell is {v, f, in, flag, src}: value, format (mol, g, pct, num, date, text, int), input path (editable), flag, source.
Pages pick sections by `key` / `group` so only one table is shown at a time.
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
    """zero: the row has no non-zero value (constants such as the Mol Wt column do not count); such rows can be hidden."""
    values = [x for x in cells if x.get("flag") != "const"]
    zero = all(not isinstance(x["v"], (int, float)) or x["v"] == 0 for x in values) and not any(x.get("in") for x in cells)
    return {"label": label, "unit": unit, "cells": cells, "zero": zero}


def section(key, title, columns, rows, group=None, note=None, **extra):
    return {"key": key, "group": group or key, "title": title, "columns": columns, "rows": rows, "note": note, **extra}


def per_reactor(getter, f="num", inp=None, src=None):
    return [c(getter(str(r)), f, inp.format(r=r) if inp else None, src=src) for r in REACTORS]


def _avg(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


# ---------------------------------------------------------------- Run Plan: Plan / Liq / Gas
def plan_view(common, result):
    run, plan, mix = common.get("run") or {}, common.get("run_plan") or {}, result["mixed_gas"]
    info = [row("Run Number", [c(run.get("run_number"), "text", "common.run.run_number")]),
            row("Run objective", [c(run.get("objective"), "text", "common.run.objective")]),
            row("Run start date", [c(run.get("start"), "date", "common.run.start", src="Run_Plan!B3: TOS of samples and GC reps")]),
            row("Lab notebook reference", [c(run.get("notebook"), "text", "common.run.notebook")])]
    feed = [row("Hydrocarbon / solvent feed ID", [c(plan.get("liquid_feed_id"), "text", "common.run_plan.liquid_feed_id")]),
            row("Feed description", [c(plan.get("liquid_feed_description"), "text", "common.run_plan.liquid_feed_description")]),
            row("Density at 15 °C", [c(plan.get("liquid_feed_density"), "num", "common.run_plan.liquid_feed_density")], "g/mL"),
            row("Carbon", [c(plan.get("liquid_feed_carbon_wt"), "pct", "common.run_plan.liquid_feed_carbon_wt",
                             src="Run_Plan!B58, used by C-Balance C3")], "wt%"),
            row("Hydrogen", [c(plan.get("liquid_feed_hydrogen_wt"), "pct", "common.run_plan.liquid_feed_hydrogen_wt")], "wt%"),
            row("Oxygen", [c(plan.get("liquid_feed_oxygen_wt"), "pct", "common.run_plan.liquid_feed_oxygen_wt")], "wt%"),
            row("Sulfur", [c(plan.get("liquid_feed_sulfur_ppm"), "num", "common.run_plan.liquid_feed_sulfur_ppm")], "ppmw"),
            row("Nitrogen", [c(plan.get("liquid_feed_nitrogen_ppm"), "num", "common.run_plan.liquid_feed_nitrogen_ppm")], "ppmw")]
    catalysts = []
    for i, cat in enumerate(plan.get("catalysts") or []):
        for b, bed in enumerate(cat.get("beds") or []):
            if b and not bed.get("catalyst"):
                continue                       # middle/bottom beds only when used
            base = f"common.run_plan.catalysts.{i}.beds.{b}"
            catalysts.append(row(f"R{cat['reactor']} · {bed['bed']} bed", [
                c(bed.get("catalyst"), "text", base + ".catalyst"), c(bed.get("target_mg"), "num", base + ".target_mg"),
                c(bed.get("actual_mg"), "num", base + ".actual_mg"), c(bed.get("volume_ml"), "num", base + ".volume_ml")]))
    conditions = []
    labels = [("temperature_1", "Temperature block-1", "°C"), ("temperature_2", "Temperature block-2", "°C"),
              ("pressure_1", "Pressure block-1", "barg"), ("pressure_2", "Pressure block-2", "barg"),
              ("duration", "Target duration", ""), ("duration_unit", "Duration unit", "")]
    cond_list = plan.get("conditions") or []
    for key, label, unit in labels:
        conditions.append(row(label, [c(x.get(key), "text" if key == "duration_unit" else "num",
                                        f"common.run_plan.conditions.{i}.{key}") for i, x in enumerate(cond_list)], unit))
    source = mix["source"]
    src_label = {"mean": "mean of the reactor blocks", "0": "bypass block"}.get(str(source), f"ZMB Reactor-{source} block")
    columns = [name for name, *_ in MIX_GASES] + ["Total"]
    mix_rows = [row("Concentration", [c(mix["mol"][n], "mol") for n, *_ in MIX_GASES] + [c(mix["mol_sum"], "mol")], "mol%"),
                row("Concentration", [c(mix["mass"][n], "pct") for n, *_ in MIX_GASES] + [c(100 if mix["mw"] else None, "pct")], "mass%"),
                row("Mol Wt", [c(mw) for _, mw, *_ in MIX_GASES] + [c(mix["mw"])], "g/mol")]
    for i, element in enumerate(("Carbon", "Hydrogen", "Oxygen", "Nitrogen")):
        mix_rows.append(row(f"{element} in 100 kg gas", [c((mix["mass"][g[0]] or 0) * g[2 + i] / 100) for g in MIX_GASES] +
                            [c(mix["elements"][element[0]])], "kg"))
    return {"id": "plan", "title": "Plan", "sections": [
        section("run", "Run information", ["Value"], info),
        section("feed", "Hydrocarbon / solvent feed", ["Value"], feed),
        section("catalysts", "Catalyst loading", ["Catalyst ID", "Target [mg]", "Actual [mg]", "Volume [mL]"], catalysts,
                note="Top bed of every reactor; middle and bottom beds are listed when they have a catalyst."),
        section("conditions", "Target operating conditions", [f"Condition-{i + 1}" for i in range(len(cond_list))], conditions),
        section("mixed_gas", f"Mixed gas composition (from the {src_label})", columns, mix_rows,
                note="Run_Plan!B35:K35 = ZMB GC block averages (ESTD, not normalised), as in the workbook."),
    ]}


def liq_view(sample, result):
    i = sample.get("_index", 0)
    L = result["liq"]
    base = f"samples.{i}.liq"
    rows = [
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
    analyses = []
    for label, unit in (("Carbon [wt%]", "wt%"), ("Hydrogen [wt%]", "wt%"), ("Oxygen [wt%]", "wt%"), ("Nitrogen [ppmw]", "ppmw"),
                        ("Sulfur [ppmw]", "ppmw"), ("Density [g/mL]", "g/mL")):
        analyses.append(row(label.split(" [")[0], per_reactor(lambda k, n=label: (L[k].get("analyses") or {}).get(n), "num",
                                                             base + ".{r}.analyses." + label), unit))
    return {"id": "liq", "title": "Liq", "sections": [
        section("sample", f"Liquid sample {sample.get('name') or ''}", R_COLS, rows),
        section("analyses", "Analyses of the hydrocarbon liquid product", R_COLS, analyses, group="analyses"),
    ]}


def gas_view(sample, result):
    i = sample.get("_index", 0)
    g = result["gas"]
    manual = result.get("gas_source") != "txt"
    gas_path = f"samples.{i}.gas"
    feed_rows = [row("Verified Argon", [c(g["ar_mol"], "mol", "common.gas.ar_mol", src="Gas!I35")], "mol%"),
                 row("Verified mixed gas", [c(g["mix_mol"], "mol", "common.gas.mix_mol", src="Gas!J35")], "mol%"),
                 row("Total", [c(g["sum_mol"], "mol")], "mol%"),
                 row("Mixed gas MW", [c(g["mw_mix"])], "g/mol"),
                 row("Argon", [c(g["mass"]["Argon"], "pct")], "mass%"),
                 row("Mixed gas", [c(g["mass"]["Mixed gas"], "pct")], "mass%")]
    per = g["reactors"]
    flow_rows = [row("Average of 01i14FI01 (total gas feed)", [c(g["fi01"], "g", gas_path + ".fi01" if manual else None,
                                                                 src="entered" if manual else "mean of 01i14FI01 in the sample window")]
                     + [c(None, "text")] * 7, "g/h"),
                 row("Gas feed flow rate (01i14FIC0r)", per_reactor(lambda k: per[k]["nml"], "num", gas_path + ".nml.{r}" if manual else None), "NmL/h"),
                 row("Total gas feed flow rate", per_reactor(lambda k: per[k]["total"], "g", src="Gas!B12 = FI01 · V_r / ΣV"), "g/h"),
                 row("Flow rate of Argon contained", per_reactor(lambda k: per[k]["contained"].get("Argon"), "g", src="Gas!B20"), "g/h"),
                 row("Flow rate of mixed gas contained", per_reactor(lambda k: per[k]["contained"].get("Mixed gas"), "g", src="Gas!B21"), "g/h")]
    contained = [row(f"Flow rate of {n} contained", per_reactor(lambda k, n=n: per[k]["contained"].get(n), "g"), "g/h")
                 for n in ("Hydrogen", "Ethylene", "Methane", "Ethane", "Nitrogen", "CO2", "CO")]
    contained += [row(f"Elemental {label} contained", per_reactor(lambda k, e=e: (per[k]["elemental"] or {}).get(e), "g"), "g/h")
                  for e, label in (("C", "carbon"), ("H", "hydrogen"), ("O", "oxygen"), ("N", "nitrogen"), ("Ar", "argon"))]
    sections = [
        section("feed", "Verified feed gas composition", ["Value"], feed_rows,
                note="The ZMB page shows the measured Argon of the ZMB export as a suggestion."),
        section("flows", "Average gas flow into each reactor over the sampling window", R_COLS, flow_rows,
                note=("Means of 01i14FIC0r / 01i14FI01 over the sample window of the Online Analysis export." if not manual
                      else "Entered by hand (or from the workbook).")),
        section("contained", "Flows contained in the feed gas", R_COLS, contained, group="contained",
                note="Elemental rows include the mixed gas via Run_Plan L43:L46 (the workbook leaves it out; not used by C-Balance)."),
    ]
    operating = (result.get("gas_flows") or {}).get("operating")
    if operating:
        sections.append(section("operating", "Operating conditions in the window (means)", list(operating.keys()),
                                [row("Mean", [c(v) for v in operating.values()])], group="contained"))
    return {"id": "gas", "title": "Gas", "sections": sections}


# ---------------------------------------------------------------- ZMB
def zmb_views(common, result):
    z = result["zmb"]
    liquid = []
    for rep in range(3):
        base = f"common.zmb.liquid.{rep + 1}"
        get = lambda k, key, rep=rep: z["liquid"][k]["reps"][rep][key]
        liquid.append(section(f"rep{rep + 1}", f"Rep-{rep + 1}", R_COLS, [
            row("Sample collection started", per_reactor(lambda k: get(k, "start"), "date", base + ".{r}.start")),
            row("Sample collection finished", per_reactor(lambda k: get(k, "finish"), "date", base + ".{r}.finish")),
            row("Duration of sampling", per_reactor(lambda k: get(k, "duration_min")), "min"),
            row("TL collected mass", per_reactor(lambda k: get(k, "mass"), "g", base + ".{r}.mass"), "g"),
            row("Liq. flow rate mass", per_reactor(lambda k: get(k, "flow"), "g"), "g/h")], group="rep"))
    liquid.append(section("verified", "Verified liquid flow rate (average of the reps)", R_COLS, [
        row("Rep-1", per_reactor(lambda k: z["liquid"][k]["reps"][0]["flow"], "g"), "g/h"),
        row("Rep-2", per_reactor(lambda k: z["liquid"][k]["reps"][1]["flow"], "g"), "g/h"),
        row("Rep-3", per_reactor(lambda k: z["liquid"][k]["reps"][2]["flow"], "g"), "g/h"),
        row("Verified liq. flow rate mass", [dict(x, flag="kpi") for x in per_reactor(lambda k: z["liquid"][k]["verified"], "g")], "g/h")],
        note="ZMB!B13:I13 = AVERAGE(Rep-1, Rep-2, Rep-3); used as the liquid feed of every sample."))

    gc = []
    for stream in [str(r) for r in REACTORS] + ["0"]:
        block = z["gc"].get(stream)
        name = "Bypass" if stream == "0" else f"Reactor-{stream}"
        if not block:
            gc.append(section(stream, f"GC analysis · {name}", [], [], note="No ZMB injections for this stream."))
            continue
        n = len(block["times"])
        excluded = set(block["excluded"])
        flag = lambda j: "excluded" if j + 1 in excluded else None
        rows = [row("Date and time", [c(None, "text"), c(None, "text")] + [c(t, "date", flag=flag(j)) for j, t in enumerate(block["times"])])]
        for gas, _, _ in ZMB_GASES:
            rows.append(row(gas, [c(block["average"][gas], "mol", flag="kpi"), c(block["wt"][gas], "pct")] +
                            [c(v, "mol", flag=flag(j)) for j, v in enumerate(block["values"][gas])], "mol%"))
        gc.append(section(stream, f"GC analysis · {name}", ["Avg [mol%]", "wt%"] + [f"#{j + 1}" for j in range(n)], rows,
                          exclude_path=f"common.zmb.excluded.{stream}",
                          note=f"{block['count']} of {n} injections used (ESTD values). Click #n to exclude or include an injection."))

    streams = [str(r) for r in REACTORS] + ["0"]
    mix_source = str(result["mixed_gas"]["source"])
    mix_rows = [row("Injections used", [c((z["gc"].get(s) or {}).get("count"), "int") for s in streams])]
    for gas, _, _ in ZMB_GASES:
        mix_rows.append(row(gas, [c((z["gc"].get(s) or {}).get("average", {}).get(gas), "mol",
                                    flag="kpi" if s == mix_source else None) for s in streams], "mol%"))
    overview = section("overview", "Average composition of every ZMB block [mol%, ESTD]", [f"R{s}" if s != "0" else "Bypass" for s in streams],
                       mix_rows, note=f"Bold column = block used as the mixed-gas composition (Run Plan → Plan).")
    return [{"id": "zmb_liquid", "title": "Liquid verification", "sections": liquid},
            {"id": "zmb_gc", "title": "GC by reactor", "sections": gc},
            {"id": "zmb_overview", "title": "Overview", "sections": [overview]}]


# ---------------------------------------------------------------- R#_MB
def reactor_header_rows(R):
    h, tc = R["header"], R["time_check"]
    return [("Average Ar flow to reactor", h["ar_in"], "g", "g/h"), ("Flow rate of liquid feed", h["liq_feed"], "g", "g/h"),
            ("Flow rate of gas feed (without Ar)", h["gas_feed"], "g", "g/h"), ("Flow rate of HC TLP", h["hc_flow"], "g", "g/h"),
            ("Flow rate of aqueous TLP", h["aq_flow"], "g", "g/h"), ("Flow rate of gas product (without Ar)", h["gas_product"], "g", "g/h"),
            ("Mass balance closure", h["closure"], "pct", "%"), ("GC reps used", R["rep_count"], "int", ""),
            ("GC injection time check", tc["result"], "text", "")]


def mb_all_view(result):
    reactors = result["reactors"]
    head = []
    for k, (label, _, f, unit) in enumerate(reactor_header_rows(reactors["1"])):
        cells = []
        for r in REACTORS:
            value = reactor_header_rows(reactors[str(r)])[k][1]
            flag = "kpi" if label == "Mass balance closure" else ((value or "").lower() if label.startswith("GC injection") and value else None)
            cells.append(c(value, f, flag=flag))
        head.append(row(label, cells, unit))
    get = lambda key, name: [c((reactors[str(r)][key] or {}).get(name) if reactors[str(r)][key] else None,
                               "mol" if key == "mean_y" else "g") for r in REACTORS]
    for r in REACTORS:
        R = reactors[str(r)]
        used = [rep for rep in R["reps"] if rep["y"] and not rep["excluded"] and rep["m"] is not None]
        R["mean_y"] = {n: _avg([rep["y"][n] for rep in used]) for n in MB_NAMES} if used else None
    comp = [row(n, get("mean_y", n), "mol%") for n in MB_NAMES]
    mass = [row(n, get("mean_m", n), "g/h") for n in MB_NAMES]
    mass.append(row("Total gas product (without Ar)", [c(reactors[str(r)]["header"]["gas_product"], "g", flag="kpi") for r in REACTORS], "g/h"))
    vol = [row(n, [c((reactors[str(r)]["mean_v"] or {}).get(n) if reactors[str(r)]["mean_v"] else None) for r in REACTORS], "Nl/h") for n in MB_NAMES]
    carbon = [row(n, get("carbon_mean", n), "g/h") for n in MB_NAMES]
    carbon.append(row("Total carbon in gas product", [c(reactors[str(r)]["carbon_gas"], "g", flag="kpi") for r in REACTORS], "g/h"))
    return {"id": "mb_all", "title": "All reactors", "sections": [
        section("results", "Mass balance of every reactor", R_COLS, head, group="results",
                note="Rx_MB C8:C13 per reactor. Choose a reactor to see its GC reps."),
        section("composition", "Average outlet composition (ESTD mol%)", R_COLS, comp, group="composition"),
        section("mass", "Average mass flow of each molecule (Ar internal standard)", R_COLS, mass, group="mass",
                note="m_i = y_i · MW_i / (y_Ar · 39.948) · Ar flow into the reactor"),
        section("volumetric", "Average volumetric flow of each molecule", R_COLS, vol, group="volumetric"),
        section("carbon", "Average carbon mass flow of each molecule", R_COLS, carbon, group="carbon",
                note="C_i = 12.011 · nC_i / MW_i · m_i"),
    ]}


def reactor_view(sample, result, r):
    i = sample.get("_index", 0)
    R = result["reactors"][str(r)]
    reps = R["reps"]
    rep_cols = [f"#{rep['index']}" for rep in reps]
    outliers = {(name, idx) for name, idx in R["outliers"]}
    tc = R["time_check"]
    head = [row(label, [c(value, f, flag=("kpi" if label == "Mass balance closure" else
                                         ((value or "").lower() if label.startswith("GC injection") and value else None)),
                          src=(f"first {tc['first']} · last {tc['last']}" if label.startswith("GC injection") else None))], unit)
            for label, value, f, unit in reactor_header_rows(R)]
    blank2 = [c(None, "text"), c(None, "text")]
    ex = lambda rep: "excluded" if rep["excluded"] else None
    time_rows = [row("Date and time", blank2 + [c(rep["time"], "date", flag=ex(rep), src=rep.get("source")) for rep in reps]),
                 row("TOS", blank2 + [c(rep["tos_h"], flag=ex(rep)) for rep in reps], "h"),
                 row("Cumulative time lapsed", blank2 + [c(rep["cum_min"], flag=ex(rep)) for rep in reps], "min"),
                 row("Time elapsed between two reps", blank2 + [c(rep["delta_min"], flag=ex(rep)) for rep in reps], "min")]
    comp = []
    for name in MB_NAMES:
        st = R["stats"][name]
        comp.append(row(name, [c(MB_MW[name], flag="const"), c(st["mean"], "mol", src=f"sd {st['sd']} · limit {st['limit']}")] +
                        [c(rep["y"][name], "mol", flag="outlier" if (name, rep["index"]) in outliers else ex(rep)) for rep in reps], "mol%"))
    mass = [row(name, [c(R["mean_m"][name] if R["mean_m"] else None, "g", flag="kpi")] +
                [c(rep["m"][name] if rep["m"] else None, "g", flag=ex(rep)) for rep in reps], "g/h") for name in MB_NAMES]
    mass += [row("HC gases", [c(R["mean_hc"], "g")] + [c(rep["hc"], "g", flag=ex(rep)) for rep in reps], "g/h"),
             row("COx gases", [c(R["mean_cox"], "g")] + [c(rep["cox"], "g", flag=ex(rep)) for rep in reps], "g/h")]
    vol = [row("Total outlet flow (workbook D86)", [c(R["mean_vtot"])] + [c(rep["vtot"], flag=ex(rep)) for rep in reps], "as in workbook"),
           row("Total outlet flow (corrected)", [c(_avg([rep["vtot_nl"] for rep in reps if not rep["excluded"]]))] +
               [c(rep["vtot_nl"], flag=ex(rep)) for rep in reps], "NL/h")]
    vol += [row(name, [c(R["mean_v"][name] if R["mean_v"] else None)] + [c(rep["v"][name] if rep["v"] else None, flag=ex(rep)) for rep in reps], "Nl/h")
            for name in MB_NAMES]
    carbon = [row(name, [c(R["carbon_mean"][name] if R["carbon_mean"] else None, "g")] +
                  [c(rep["carbon"][name] if rep["carbon"] else None, "g", flag=ex(rep)) for rep in reps], "g/h") for name in MB_NAMES]
    carbon.append(row("Total", [c(R["carbon_gas"], "g", flag="kpi")] + [c(rep["carbon_total"], "g", flag=ex(rep)) for rep in reps], "g/h"))
    errors = [f"#{rep['index']}: {rep['error']}" for rep in reps if rep.get("error")]
    exclude = f"samples.{i}.excluded.{r}"
    return {"id": f"r{r}", "title": f"R{r}_MB", "reactor": r, "sections": [
        section("results", f"Reactor {r} · mass balance", ["Value"], head, group="results", note="; ".join(errors) or None),
        section("reps", "GC analysis reps (click #n to exclude or include a rep)", ["", ""] + rep_cols, time_rows, group="results",
                exclude_path=exclude),
        section("composition", "Normalized mol% (ESTD) · outliers: value > mean + 2·sd of reps 2…n", ["Mol Wt", "Mean (reps 2…n)"] + rep_cols,
                comp, group="composition", exclude_path=exclude),
        section("mass", "Mass flow rate of each molecule (Ar internal standard)", ["Average"] + rep_cols, mass, group="mass",
                exclude_path=exclude, note="m_i = y_i · MW_i / (y_Ar · 39.948) · Ar flow into the reactor"),
        section("volumetric", "Volumetric flow rate of each molecule", ["Average"] + rep_cols, vol, group="volumetric", exclude_path=exclude),
        section("carbon", "Carbon mass flow of each molecule", ["Average"] + rep_cols, carbon, group="carbon", exclude_path=exclude,
                note="C_i = 12.011 · nC_i / MW_i · m_i"),
    ]}


# ---------------------------------------------------------------- C-Balance and Summary
def c_balance_view(result):
    C = result["c_balance"]
    get = lambda key, f="g", src=None, flag=None: [dict(x, flag=flag) if flag else x for x in per_reactor(lambda k: C[k][key], f, src=src)]
    carbon = [row("C in liquid feed", get("c_liq_in", src="C3 = liquid feed · Run_Plan!B58 %"), "g/h"),
              row("C in gas feed", get("c_gas_in", src="C4 = C from C2H2 + CH4 + C2H6 + C2H4"), "g/h"),
              row("C in liquid product", get("c_liq_out", src="C6 = TLP · C wt% / TOS"), "g/h"),
              row("C in gas product", get("c_gas_out", src="C7 = Σ Rx_MB!AC52:AC80"), "g/h"),
              row("Carbon balance", get("carbon_balance", "pct", flag="kpi"), "%")]
    c4 = [row("C4+ in liquid feed", get("c4_liq_feed"), "g/h"), row("C4+ in liquid product", get("c4_liq_out"), "g/h"),
          row("C4+ in gas feed", get("c4_gas_feed"), "g/h"), row("C4+ in gas product", get("c4_gas_out"), "g/h"),
          row("C4+ yield", get("c4_yield", "pct", flag="kpi"), "%")]
    selectivity = [row("Acetylene in", get("acetylene_in"), "g/h"), row("Acetylene out", get("acetylene_out"), "g/h"),
                   row("Acetylene conversion", get("acetylene_conversion", "pct", flag="kpi"), "%"),
                   row("Ethylene to ethane selectivity (as in workbook)", get("ethylene_ethane_ratio", "num"), "mol/mol"),
                   row("Ethylene selectivity", get("ethylene_selectivity", "pct", flag="kpi"), "%")]
    helpers = []
    for name in ("Acetylene", "Methane", "Ethane", "Ethylene"):
        hp = lambda k, key, n=name: C[k]["helpers"][n][key]
        helpers += [row(f"{name} wt% in mixed gas feed", per_reactor(lambda k: hp(k, "wt_mix"), "pct"), "wt%"),
                    row(f"{name} wt% in gas feed", per_reactor(lambda k: hp(k, "wt_gas"), "pct"), "wt%"),
                    row(f"C wt fraction in {name}", per_reactor(lambda k: hp(k, "c_fraction"))),
                    row(f"C in feed from {name}", per_reactor(lambda k: hp(k, "c_flow"), "g"), "g/h"),
                    row(f"{name} mass flow rate in feed", per_reactor(lambda k: hp(k, "mass_flow"), "g"), "g/h")]
    helpers.append(row("Total C in liquid product", per_reactor(lambda k: C[k]["c_liq_out_g"], "g"), "g"))
    return {"id": "c_balance", "title": "C-Balance", "sections": [
        section("carbon", "Carbon balance", R_COLS, carbon, group="main"),
        section("c4", "C4+ yield", R_COLS, c4, group="main"),
        section("selectivity", "Acetylene conversion and ethylene selectivity", R_COLS, selectivity, group="main"),
        section("helpers", "Feed-gas carbon helpers (C-Balance N:U)", R_COLS, helpers, group="helpers"),
    ]}


def summary_view(result):
    s = result["summary"]
    rows = [row(f"R{x['reactor']}", [c(x["carbon_balance"], "pct", flag="kpi"), c(x["mass_balance"], "pct", flag="kpi"), c(x["tos_h"]),
                                      c(x["acetylene_conversion"], "pct"), c(x["ethylene_selectivity"], "pct"), c(x["carbon_gas"], "g"),
                                      c(x["c4_yield"], "pct"), c(x["rep_count"], "int")]) for x in s["rows"]]
    n = max([len(v) for v in s["carbon_balance_by_rep"].values()] + [0])
    by_rep = lambda key: [row(f"{j + 1}", [c(s[key][str(r)][j] if j < len(s[key][str(r)]) else None, "pct") for r in REACTORS]) for j in range(n)]
    return {"id": "summary", "title": "Summary", "sections": [
        section("summary", f"Summary · sample {result.get('sample') or ''}", ["C'Bal [%]", "M'Bal [%]", "TOS [h]", "Ac conv [%]",
                                                                            "Ethy sel [%]", "C'Bal_g [g/h]", "C4+ yield [%]", "GC reps"], rows, group="main"),
        section("cbal_rep", "Gas-phase C'Bal by GC rep [%]", R_COLS, by_rep("carbon_balance_by_rep"), group="cbal_rep"),
        section("acet_rep", "Acetylene conversion by GC rep [%]", R_COLS, by_rep("acetylene_conversion_by_rep"), group="acet_rep")]}


def build_views(common, sample, result, options):
    views = [plan_view(common, result), liq_view(sample, result), gas_view(sample, result), *zmb_views(common, result),
             mb_all_view(result)]
    views += [reactor_view(sample, result, r) for r in REACTORS]
    views += [c_balance_view(result), summary_view(result)]
    return views
