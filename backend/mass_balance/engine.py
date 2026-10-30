"""Mass Balance calculation engine: the formulas of the MassBal workbook (Ver2.2) as plain functions.

Input is a JSON-like dict (see service.py / MASS_BALANCE_PROGRESS.md); nothing here reads files.
Cell references in comments point at the workbook so every value can be traced. Blank workbook cells are None.
"""
from datetime import datetime
from statistics import mean, stdev

from .constants import (AR_MW, C4PLUS_ROWS, C_ATOM, COX_ROWS, DEFAULT_C_WT_LIQUID_PRODUCT, FEED_CARBON, GAS_ELEMENTS,
                        GAS_PURE, HC_ROWS, MB_NAMES, MB_ROWS, MIX_GASES, REACTORS, SELECTIVITY_WEIGHTS, ZMB_GASES)

MB_MW = {name: mw for name, mw, _, _ in MB_ROWS}
MB_NC = {name: nc for name, _, nc, _ in MB_ROWS}


def to_dt(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d/%m/%Y %H:%M:%S",
                "%d/%m/%Y %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    raise ValueError(f"Unrecognised date/time: {value}")


def num(value):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def avg(values):
    values = [v for v in values if v is not None]
    return mean(values) if values else None


def minutes(start, finish):
    return (finish - start).total_seconds() / 60 if start and finish else None


def rkey(reactor):
    return str(reactor)


# ---------------------------------------------------------------- ZMB
def zmb_stage(zmb):
    """ZMB!B4:I13 (liquid reps) and the GC blocks rows 17-167."""
    liquid = {}
    for r in REACTORS:
        reps = []
        for rep in ("1", "2", "3"):
            entry = (zmb.get("liquid", {}).get(rep, {}) or {}).get(rkey(r), {}) or {}
            start, finish, mass = to_dt(entry.get("start")), to_dt(entry.get("finish")), num(entry.get("mass"))
            dur = minutes(start, finish)                                   # ZMB!B6 = (B5-B4)*1440
            hours = dur / 60 if dur is not None else None                  # ZMB!B7 = B6/60
            flow = mass / hours if mass is not None and hours else None    # ZMB!B11 = B10/B7
            reps.append({"rep": int(rep), "start": entry.get("start"), "finish": entry.get("finish"), "mass": mass,
                         "duration_min": dur, "hours": hours, "flow": flow})
        liquid[rkey(r)] = {"reps": reps, "verified": avg([x["flow"] for x in reps])}   # ZMB!B13 = AVERAGE(B11,L11,V11)

    gc = {}
    for stream, injections in (zmb.get("gc") or {}).items():
        excluded = set(int(i) for i in (zmb.get("excluded", {}) or {}).get(stream, []))   # 1-based injection numbers
        used = [inj for i, inj in enumerate(injections, start=1) if i not in excluded]
        averages = {name: avg([num((inj.get("estd") or {}).get(name)) for inj in used]) for name, _, _ in ZMB_GASES}
        mass = {name: (averages[name] or 0) * mw for name, _, mw in ZMB_GASES}      # ZMB!AC22 = B22*MW
        total = sum(mass.values())                                                   # ZMB!AC32
        weight = {name: 100 * mass[name] / total if total else None for name, _, _ in ZMB_GASES}   # ZMB!C22
        gc[stream] = {"count": len(used), "excluded": sorted(excluded), "average": averages, "wt": weight,
                      "times": [inj.get("time") for inj in injections],
                      "values": {name: [num((inj.get("estd") or {}).get(name)) for inj in injections] for name, _, _ in ZMB_GASES}}
    return {"liquid": liquid, "gc": gc}


def mixed_gas(zmb_result, source="1", target=None):
    """Run_Plan!B35:K46: mixed-gas composition = a ZMB GC block (workbook: Reactor-1 block, not normalised).
    source "feed", or a ZMB block without injections, uses the target composition of the Run Plan Feed sheet."""
    gc = zmb_result["gc"]
    if source == "mean":
        blocks = [gc[k] for k in gc if k != "0" and gc[k]["count"]]
        mol = {name: avg([b["average"][name] for b in blocks]) for name, *_ in MIX_GASES}
    elif source == "feed":
        mol = {name: num((target or {}).get(name)) for name, *_ in MIX_GASES}
    else:
        block = gc.get(str(source))
        mol = {name: (block["average"].get(name) if block else None) for name, *_ in MIX_GASES}
    if all(v is None for v in mol.values()) and target and any(num(v) is not None for v in target.values()):
        source = "feed"
        mol = {name: num(target.get(name)) for name, *_ in MIX_GASES}
    g38 = {name: (mol[name] or 0) * mw for name, mw, *_ in MIX_GASES}                 # Run_Plan!B38 = B35*B37
    total = sum(g38.values())
    mass = {name: 100 * g38[name] / total if total else None for name, *_ in MIX_GASES}   # Run_Plan!B36
    elements = {}
    for i, element in enumerate("CHON"):                                             # Run_Plan!L43:L46
        elements[element] = sum((mass[row[0]] or 0) * row[2 + i] / 100 for row in MIX_GASES)
    return {"source": source, "mol": mol, "mol_sum": sum(v or 0 for v in mol.values()), "mass": mass, "g38": g38,
            "mw": total / 100 if total else None, "elements": elements}


# ---------------------------------------------------------------- Gas
def gas_stage(gas, mix):
    """Gas sheet: verified feed gas composition (rows 35-38) and the split of 01i14FI01 over the reactors."""
    pure = {name: num((gas.get("pure_mol") or {}).get(name)) for name, _ in GAS_PURE}
    y_ar, y_mix = num(gas.get("ar_mol")), num(gas.get("mix_mol"))
    mw_mix = mix["mw"]                                                               # Gas!J36 = SUM(Run_Plan!B38:K38)/100
    m38 = {name: (pure[name] or 0) * mw for name, mw in GAS_PURE}
    m38["Argon"] = (y_ar or 0) * AR_MW
    m38["Mixed gas"] = (y_mix or 0) * (mw_mix or 0)
    total38 = sum(m38.values())
    w = {k: 100 * v / total38 if total38 else None for k, v in m38.items()}          # Gas!B37:J37
    fi01 = num(gas.get("fi01"))
    nml = {rkey(r): num((gas.get("nml") or {}).get(rkey(r))) for r in REACTORS}
    nml_sum = sum(v or 0 for v in nml.values())
    per = {}
    for r in REACTORS:
        v = nml[rkey(r)] or 0
        total = fi01 * v / nml_sum if fi01 is not None and nml_sum else None          # Gas!B12
        contained = {k: (total * w[k] / 100 if total is not None and w[k] is not None else None) for k in w}   # rows 13-21
        elemental = None
        if total is not None:
            c = h = o = n = 0.0
            for name, (pc, ph, po, pn) in GAS_ELEMENTS.items():
                flow = contained.get(name) or 0
                c, h, o, n = c + flow * pc / 100, h + flow * ph / 100, o + flow * po / 100, n + flow * pn / 100
            mixed = contained.get("Mixed gas") or 0
            # The sheet points the mixed-gas row at the empty J20:M20; the corrected value uses Run_Plan!L43:L46.
            elemental = {"C": c + mixed * mix["elements"]["C"] / 100, "H": h + mixed * mix["elements"]["H"] / 100,
                         "O": o + mixed * mix["elements"]["O"] / 100, "N": n + mixed * mix["elements"]["N"] / 100,
                         "Ar": contained.get("Argon") or 0}
        per[rkey(r)] = {"nml": nml[rkey(r)], "total": total, "argon": contained.get("Argon"), "contained": contained,
                        "elemental": elemental}
    totals = {e: sum((per[rkey(r)]["elemental"] or {}).get(e, 0) for r in REACTORS) for e in ("C", "H", "O", "N", "Ar")}
    return {"pure_mol": pure, "ar_mol": y_ar, "mix_mol": y_mix, "sum_mol": sum(v or 0 for v in pure.values()) + (y_ar or 0) + (y_mix or 0),
            "mw_mix": mw_mix, "mass": w, "fi01": fi01, "nml_sum": nml_sum, "reactors": per, "totals": totals}


# ---------------------------------------------------------------- Liq
def liq_stage(sample, run_start, zmb_result):
    out = {}
    for r in REACTORS:
        entry = (sample.get("liq") or {}).get(rkey(r), {}) or {}
        start, finish = to_dt(entry.get("start")), to_dt(entry.get("finish"))
        dur = minutes(start, finish)                                                    # Liq!B7
        tos = 24 * (((start - run_start) + (finish - run_start)).total_seconds() / 86400) / 2 \
            if start and finish and run_start else None                                 # Liq!B8
        tlp, hc, aq = num(entry.get("tlp")), num(entry.get("hc")), num(entry.get("aq"))
        # Hours the TLP was collected: Liq!B8 measures the average collection time from Run Start, which is right for the
        # first sample; later samples start at the previous collection (sample window start), so the same rule uses it.
        window_start = to_dt(((sample.get("window_used") or {}).get(rkey(r)) or [None])[0]) or run_start
        liquid_hours = 24 * (((start - window_start) + (finish - window_start)).total_seconds() / 86400) / 2 \
            if start and finish and window_start else None
        hc_flow = ((tlp or 0) - (aq or 0)) / liquid_hours if liquid_hours else None    # Liq!B40 (TLP / hours collected)
        aq_flow = (aq or 0) / (dur / 60) if dur else None                               # Liq!B41 (divides by sampling time)
        loss = 100 - 100 * ((hc or 0) + (aq or 0)) / tlp if tlp else None              # Liq!B20
        out[rkey(r)] = {"start": entry.get("start"), "finish": entry.get("finish"), "duration_min": dur, "tos_h": tos,
                        "liquid_hours": liquid_hours, "window_start": window_start.strftime("%Y-%m-%d %H:%M:%S") if window_start else None,
                        "tlp": tlp, "hc": hc, "aq": aq, "decantation_loss": loss, "hc_flow": hc_flow, "aq_flow": aq_flow,
                        "feed": zmb_result["liquid"][rkey(r)]["verified"],             # Liq!B13 = ZMB!B13
                        "analyses": entry.get("analyses") or {}}
    return out


# ---------------------------------------------------------------- Rx_MB
def reactor_stage(r, reps_in, gas_r, liq_r, gas, run_start, options):
    """One Rx_MB sheet. reps_in: [{time, y{row: mol%}, excluded}] in rep order."""
    ar_in = gas_r["argon"]                                                               # Rx_MB!F5 = Gas!B20
    nml_compat = gas["reactors"]["1"]["nml"] if options.get("workbook_compatible", True) else gas_r["nml"]
    reps = []
    first_time = to_dt(reps_in[0]["time"]) if reps_in and reps_in[0].get("time") else None
    previous_cum = None
    for j, rep in enumerate(reps_in):
        y = {name: num((rep.get("y") or {}).get(name)) for name in MB_NAMES}
        t = to_dt(rep.get("time"))
        cum = minutes(first_time, t) if t and first_time else None                      # Rx_MB!E17
        delta = cum - previous_cum if cum is not None and previous_cum is not None else None   # Rx_MB!E18
        previous_cum = cum if cum is not None else previous_cum
        entry = {"index": j + 1, "time": rep.get("time"), "cum_min": cum, "delta_min": delta,
                 "tos_h": 24 * (t - run_start).total_seconds() / 86400 if t and run_start else None,
                 "y": y, "excluded": bool(rep.get("excluded")), "source": rep.get("source")}
        y_ar = y.get("Argon")
        if sum(v or 0 for v in y.values()) == 0 or not y_ar or not ar_in:
            entry.update(m=None, hc=None, cox=None, hc_cox=None, vtot=None, vtot_nl=None, v=None, carbon=None, carbon_total=None)
            if sum(v or 0 for v in y.values()) and ar_in is not None and ar_in <= 0:
                # GC still samples the reactor but no gas was fed (01i14FIC0r = 0): a balance would be meaningless.
                entry["error"] = "ERROR: no gas feed to this reactor in the sample window (01i14FIC0r = 0)"
            elif not y_ar and sum(v or 0 for v in y.values()):
                entry["error"] = "ERROR: Argon is 0 or missing in this injection"
            reps.append(entry)
            continue
        m = {name: (y[name] or 0) * MB_MW[name] / (y_ar * AR_MW) * ar_in for name in MB_NAMES}   # Rx_MB!D52:D80
        hc = sum(m[n] for n in HC_ROWS)                                                    # D82
        cox = sum(m[n] for n in COX_ROWS)                                                  # D83
        vtot = m["Argon"] / gas["ar_mol"] * (nml_compat or 0) if gas["ar_mol"] else None   # D86 (as in workbook)
        vtot_nl = ((gas_r["nml"] or 0) / 1000 * gas["ar_mol"] / 100) / (y_ar / 100) if gas["ar_mol"] else None
        v = {name: (y[name] or 0) / 100 * vtot if vtot is not None else None for name in MB_NAMES}   # D88:D116
        carbon = {name: C_ATOM * MB_NC[name] / MB_MW[name] * m[name] for name in MB_NAMES}      # D121:D149
        entry.update(m=m, hc=hc if hc else None, cox=cox, hc_cox=(hc + cox) or None, vtot=vtot, vtot_nl=vtot_nl, v=v,
                     carbon=carbon, carbon_total=sum(carbon.values()) or None)                  # D150
        reps.append(entry)

    used = [rep for rep in reps if rep["m"] is not None and not rep["excluded"]]
    has_data = bool(used)
    mean_m = {name: avg([rep["m"][name] for rep in used]) for name in MB_NAMES} if has_data else None   # C52:C80
    mean_v = {name: avg([rep["v"][name] for rep in used]) for name in MB_NAMES} if has_data else None   # C88:C116
    carbon_mean = {name: C_ATOM * MB_NC[name] / MB_MW[name] * mean_m[name] for name in MB_NAMES} if has_data else None  # AC52:AC80

    # Outlier helpers AC20:AE49: STDEV.S / AVERAGE over reps 2..n (columns E:AB), limit = mean + 2 sd
    stats, outliers = {}, []
    for name in MB_NAMES:
        later = [rep["y"][name] for rep in reps[1:] if rep["y"][name] is not None and not rep["excluded"]]
        sd = stdev(later) if len(later) >= 2 else None
        mu = mean(later) if later else None
        limit = mu + 2 * sd if mu is not None and sd is not None else None
        stats[name] = {"sd": sd, "mean": mu, "limit": limit}
        if limit is not None:
            outliers += [[name, rep["index"]] for rep in reps if rep["y"][name] is not None and rep["y"][name] > limit]

    times = [to_dt(rep["time"]) for rep in reps if rep.get("time")]
    collection_finished = to_dt(liq_r.get("finish"))
    first, last = (min(times), max(times)) if times else (None, None)
    check = None
    if first and run_start and collection_finished:
        check = "Pass" if run_start < first and last < collection_finished else "Fail"   # Rx_MB!H6:K6

    header = {"ar_in": ar_in, "liq_feed": liq_r["feed"],
              "gas_feed": gas_r["total"] - ar_in if gas_r["total"] is not None and ar_in is not None else None,   # C9
              "hc_flow": liq_r["hc_flow"], "aq_flow": liq_r["aq_flow"]}
    if has_data:
        header["gas_product"] = sum(mean_m[n] for n in MB_NAMES if n != "Argon")       # C12 = SUM(C52:C74,C76:C80)
        denominator = (header["gas_feed"] or 0) + (header["liq_feed"] or 0)
        header["closure"] = 100 * (header["gas_product"] + (header["aq_flow"] or 0) + (header["hc_flow"] or 0)) / denominator \
            if denominator else None                                                     # C13
    else:
        header["gas_product"] = 0.0 if reps_in is not None else None
        header["closure"] = None
    return {"reactor": r, "has_data": has_data, "reps": reps, "mean_m": mean_m, "mean_v": mean_v,
            "carbon_mean": carbon_mean, "carbon_gas": sum(carbon_mean.values()) if has_data else None,   # C150 / SUM(AC52:AC80)
            "mean_vtot": avg([rep["vtot"] for rep in used]) if has_data else None,         # C86
            "mean_hc": avg([rep["hc"] for rep in used]) if has_data else None,
            "mean_cox": avg([rep["cox"] for rep in used]) if has_data else None,
            "stats": stats, "outliers": outliers, "header": header,
            "time_check": {"first": first.strftime("%Y-%m-%d %H:%M:%S") if first else None,
                           "last": last.strftime("%Y-%m-%d %H:%M:%S") if last else None, "result": check},
            "rep_count": len(used)}


# ---------------------------------------------------------------- C-Balance and Summary
def c_balance_stage(reactors, gas, mix, liq, run_plan, sample):
    out = {}
    feed_c = num(run_plan.get("liquid_feed_carbon_wt"))                                      # Run_Plan!B58
    w_mix = gas["mass"]["Mixed gas"] or 0
    for r in REACTORS:
        k = rkey(r)
        R, L, G = reactors[k], liq[k], gas["reactors"][k]["total"]
        x = {name: (mix["mass"].get(name) or 0) * w_mix / 100 for name, *_ in MIX_GASES}   # N4, N14, N21, N28
        helpers = {name: {"wt_mix": mix["mass"].get(name), "wt_gas": x[name], "c_fraction": frac,
                          "c_wt": x[name] * frac, "c_flow": G * x[name] * frac / 100 if G is not None else None,
                          "mass_flow": G * x[name] / 100 if G is not None else None}
                   for name, frac in FEED_CARBON}
        c_gas_in = sum(h["c_flow"] for h in helpers.values()) if G is not None else None  # C4 = N7+N17+N24+N31
        liq_feed = L["feed"]
        c_liq_in = liq_feed * (feed_c or 0) / 100 if liq_feed is not None else None        # C3
        c_wt = num((sample.get("c_wt_liquid_product") or {}).get(k))
        c_wt = DEFAULT_C_WT_LIQUID_PRODUCT if c_wt is None else c_wt                        # N34
        c_liq_out_g = (L["tlp"] or 0) * c_wt / 100                                           # N35
        c_liq_out = c_liq_out_g / L["liquid_hours"] if L["liquid_hours"] else None          # N36 -> C6
        c_gas_out = R["carbon_gas"]                                                          # C7
        denominator = (c_liq_in or 0) + (c_gas_in or 0)
        cbal = 100 * ((c_liq_out or 0) + c_gas_out) / denominator if c_gas_out is not None and denominator else None  # C9
        c4_liq_out = L["tlp"] / L["liquid_hours"] if L["tlp"] is not None and L["liquid_hours"] else None   # C12
        c4_gas_out = sum(R["mean_m"][n] for n in C4PLUS_ROWS) if R["has_data"] else None     # C14
        c4_feed = liq_feed
        c4_yield = (((c4_liq_out + (c4_gas_out or 0)) - (0 + (c4_feed or 0))) / (0 + c4_feed) * 100
                    if c4_liq_out is not None and c4_feed else None)                         # C15 (C13 = 0)
        acet_in = G * x["Acetylene"] / 100 if G is not None else None                       # C17
        acet_out = R["mean_m"]["Acetylene"] if R["has_data"] else None                       # C18
        conversion = (acet_in - acet_out) / acet_in * 100 if acet_out is not None and acet_in else None   # C19
        ratio = None
        if R["has_data"] and G is not None:
            den = R["mean_m"]["Ethane"] - helpers["Ethane"]["mass_flow"]
            ratio = (R["mean_m"]["Ethylene"] - helpers["Ethylene"]["mass_flow"]) / den if den else None  # C20
        selectivity = None
        if R["has_data"] and R["mean_v"]:
            v = R["mean_v"]
            den = sum(weight * (v[name] or 0) for name, weight in SELECTIVITY_WEIGHTS)
            selectivity = 100 * v["Ethylene"] / den if den else None                          # C21
        out[k] = {"c_liq_in": c_liq_in, "c_gas_in": c_gas_in, "c_liq_out": c_liq_out, "c_gas_out": c_gas_out,
                  "carbon_balance": cbal, "c4_liq_feed": c4_feed, "c4_liq_out": c4_liq_out, "c4_gas_feed": 0,
                  "c4_gas_out": c4_gas_out, "c4_yield": c4_yield, "acetylene_in": acet_in, "acetylene_out": acet_out,
                  "acetylene_conversion": conversion, "ethylene_ethane_ratio": ratio, "ethylene_selectivity": selectivity,
                  "c_wt_liquid_product": c_wt, "c_liq_out_g": c_liq_out_g, "helpers": helpers}
    return out


def summary_stage(reactors, cbal, liq):
    rows, cbal_rep, acet_rep = [], {}, {}
    for r in REACTORS:
        k = rkey(r)
        R, C = reactors[k], cbal[k]
        rows.append({"reactor": r, "carbon_balance": C["carbon_balance"], "mass_balance": R["header"]["closure"],
                     "tos_h": liq[k]["tos_h"], "acetylene_conversion": C["acetylene_conversion"],
                     "ethylene_selectivity": C["ethylene_selectivity"], "carbon_gas": R["carbon_gas"],
                     "c4_yield": C["c4_yield"], "rep_count": R["rep_count"]})
        cbal_rep[k] = [100 * rep["carbon_total"] / C["c_gas_in"] if rep["carbon_total"] and C["c_gas_in"] else None
                       for rep in R["reps"]]                                                 # Summary!P4:W28
        acet_rep[k] = [100 - rep["m"]["Acetylene"] / C["acetylene_in"] * 100 if rep["m"] and C["acetylene_in"] else None
                       for rep in R["reps"]]                                                 # Summary!F16:M40
    return {"rows": rows, "carbon_balance_by_rep": cbal_rep, "acetylene_conversion_by_rep": acet_rep,
            "tos_by_rep": {rkey(r): [rep["tos_h"] for rep in reactors[rkey(r)]["reps"]] for r in REACTORS}}


def calculate(common, sample, options=None):
    """common: run, run_plan, zmb, gas (verified composition); sample: name, liq, c_wt_liquid_product, gas (fi01, nml), gc."""
    options = options or {}
    run_start = to_dt((common.get("run") or {}).get("start"))
    zmb = zmb_stage(common.get("zmb") or {})
    mix = mixed_gas(zmb, options.get("mixed_gas_source", "1"), (common.get("run_plan") or {}).get("mixed_gas_target"))
    gas = gas_stage({**(common.get("gas") or {}), **(sample.get("gas") or {})}, mix)   # Gas sheet is per sample
    liq = liq_stage(sample, run_start, zmb)
    reactors = {rkey(r): reactor_stage(r, (sample.get("gc") or {}).get(rkey(r)) or [], gas["reactors"][rkey(r)],
                                       liq[rkey(r)], gas, run_start, options) for r in REACTORS}
    cbal = c_balance_stage(reactors, gas, mix, liq, common.get("run_plan") or {}, sample)
    return {"sample": sample.get("name"), "run_start": run_start.strftime("%Y-%m-%d %H:%M:%S") if run_start else None,
            "zmb": zmb, "mixed_gas": mix, "gas": gas, "liq": liq, "reactors": reactors, "c_balance": cbal,
            "summary": summary_stage(reactors, cbal, liq)}
