"""General_MB mass balance, carbon balance, conversion, selectivity and yield (workbook C-Balance and Summary).

Inputs: the Online Analysis export (gas, via convert_online_rows with an internal standard), the Run Plan (DOE conditions,
feed gas flows, molecular weights) and the Liquid tab of Online Analysis (liquid samples and the liquid feed).

Per liquid sample and reactor (or per DOE condition and reactor when no liquid sample was entered):

* GC lines averaged: the reactor's calculated lines in the sample's DOE condition (the first line after the condition
  start left out by default), or the lines within ± `window_h` of the sample.
* Gas feed of molecule j   F_j,in  = F_IS · y_j,feed·MW_j / (y_IS,feed·MW_IS)       (bypass lines of the condition)
  Gas product of molecule i m_i     = y_i·MW_i / (y_IS·MW_IS) · F_IS                 (reactor lines)
  Carbon                    C       = 12.011 · nC / MW · m
* Mass balance closure [%] = (gas out w/o IS + HC product + aqueous product) / (gas in w/o IS + liquid feed) · 100
* Carbon balance [%]       = (C gas out + C liquid product) / (C gas in + C liquid feed) · 100
* Conversion of the key reactant [%] = (in − out) / in · 100
* Carbon selectivity to product group g [%] = (C_g,out − C_g,in) / (C_reactant,in − C_reactant,out) · 100
  Carbon yield of group g [%]               = (C_g,out − C_g,in) / C_reactant,in · 100          (= conversion × selectivity)
  "Liquid (net)" = C liquid product − C liquid feed.
* Workbook ethylene selectivity (C-Balance row 21) on Nl/h of the products: V_C2H4 / Σ V_i · nC_i / 2 (i = hydrocarbons
  with nC ≥ 2 except the reactant).
* C4+ yield (workbook C-Balance row 15, mass): ((HC product + C4+ gas out) − (C4+ gas in + liquid feed)) /
  (C4+ gas in + liquid feed) · 100.

Missing inputs give explicit "ERROR: …" texts, never zero.
"""
from datetime import timedelta

from backend.services.online_units import (MW_C, _date, _key, _num, convert_online_rows, doe_conditions,
                                           internal_standard_name, reactor_number)

GROUP_ORDER = ["Ethylene", "Ethane", "Methane", "C3", "C4+ (gas)", "CO + CO2", "Other gas", "Liquid (net)"]


def _group(name, carbons, reactant):
    key = _key(name)
    if key == _key(reactant):
        return None
    if not carbons:
        return None
    if key in ("ethylene",):
        return "Ethylene"
    if key in ("ethane",):
        return "Ethane"
    if key in ("methane",):
        return "Methane"
    if key in ("co", "co2"):
        return "CO + CO2"
    if carbons == 3:
        return "C3"
    if carbons >= 4:
        return "C4+ (gas)"
    return "Other gas"


def _avg(values):
    values = [v for v in values if isinstance(v, (int, float))]
    return sum(values) / len(values) if values else None


def _pct(num, den):
    return 100.0 * num / den if num is not None and den else None


def _status_c(value):
    if value is None:
        return "missing"
    deviation = abs(value - 100)
    return "good" if deviation <= 5 else "warning" if deviation <= 10 else "serious"


def calculate_mass_balance(rows, feed_gas=None, feed_cut_in=None, doe_rows=None, internal_standard="Argon",
                           molecular_weights=None, liquid=None, options=None, reactor_roles=None):
    options = options or {}
    liquid = liquid or {}
    ist = internal_standard_name(internal_standard) or "Argon"
    basis = options.get("basis") or "condition"
    skip_first = options.get("skip_first", True)
    window_h = _num(options.get("window_h")) or 2.0

    common = dict(feed_gas=feed_gas, feed_cut_in=feed_cut_in, doe_rows=doe_rows, internal_standard=ist,
                  molecular_weights=molecular_weights)
    mass = convert_online_rows(rows, "mass", **common)
    volume = convert_online_rows(rows, "volume", **common)
    comps = {c["component"]: c for c in mass["components"]}
    names = [n for n, c in comps.items() if c["mw"]]
    feeds = {f["condition"]: f for f in mass.get("feed_gas_is", [])}
    is_col = f"{ist} to reactor [g/h]"

    feed_names = {n for f in feeds.values() for n in (f.get("composition") or {})}
    carbon_feed = [n for n in names if n in feed_names and (comps[n]["carbon_atoms"] or 0) > 0]

    def c_of(name, grams):
        c = comps.get(name)
        return MW_C * (c["carbon_atoms"] or 0) / c["mw"] * grams if c and c["mw"] and grams is not None else None

    # Calculated reactor lines
    lines = []
    for m_row, v_row in zip(mass["rows"], volume["rows"]):
        reactor = reactor_number(m_row.get("Reactor"))
        if m_row.get("Status") != "OK" or not reactor:
            continue
        cond = m_row.get("Condition")
        feed = feeds.get(cond)
        f_is = _num(m_row.get(is_col))
        if not feed or not f_is or not feed.get("is_mol_pct"):
            continue
        out = {n: _num(m_row.get(f"{n} [g/h]")) for n in names}
        vol = {n: _num(v_row.get(f"{n} [Nl/h]")) for n in names}
        y_is_feed, mw_is = feed["is_mol_pct"], comps[ist]["mw"] if ist in comps else None
        comp_feed = feed.get("composition") or {}
        f_in = {n: f_is * comp_feed.get(n, 0) * comps[n]["mw"] / (y_is_feed * mw_is) for n in names if mw_is}
        lines.append({"time": _date(m_row.get("DateTime")), "datetime": m_row.get("DateTime"), "tos": m_row.get("TOS (h)"),
                      "reactor": reactor, "condition": cond, "f_is": f_is, "out": out, "vol": vol, "in": f_in})

    # Default key reactant / target product (no chemistry is assumed): the carbon-containing molecule with the largest
    # net carbon consumption over all calculated lines, and the one with the largest net carbon formation.
    net_c = {}
    for ln in lines:
        for n in names:
            if n == ist or not (comps[n]["carbon_atoms"] or 0):
                continue
            net_c[n] = net_c.get(n, 0.0) + (c_of(n, ln["out"].get(n) or 0) or 0) - (c_of(n, ln["in"].get(n) or 0) or 0)
    reactant = options.get("reactant") or (min(net_c, key=net_c.get) if net_c and min(net_c.values()) < 0 else None)
    product = options.get("product") or (max((n for n in net_c if n != reactant), key=net_c.get, default=None)
                                         if net_c and max(net_c.values()) > 0 else None)

    # Trends: one point per GC injection
    trends = []
    for ln in lines:
        c_in = sum(c_of(n, v) or 0 for n, v in ln["in"].items() if n != ist)
        c_out = sum(c_of(n, v) or 0 for n, v in ln["out"].items() if n != ist and v is not None)
        r_in = c_of(reactant, ln["in"].get(reactant)) if reactant else None
        r_out = c_of(reactant, ln["out"].get(reactant)) if reactant else None
        conv = _pct(r_in - r_out, r_in) if r_in and r_out is not None else None
        sel = None
        if product and conv is not None and r_in - r_out > 0:
            p = (c_of(product, ln["out"].get(product)) or 0) - (c_of(product, ln["in"].get(product)) or 0)
            sel = _pct(p, r_in - r_out)
        trends.append({"reactor": f"R{ln['reactor']}", "condition": ln["condition"], "datetime": ln["datetime"],
                       "tos_h": ln["tos"], "gas_c_balance": _pct(c_out, c_in), "conversion": conv, "selectivity": sel,
                       "in": {n: v for n, v in ln["in"].items() if n != ist and v},
                       "out": {n: v for n, v in ln["out"].items() if n != ist and v is not None}})

    # Conditions and their per-reactor windows (to place liquid samples)
    times = [ln["time"] for ln in lines if ln["time"]]
    data_end = max(times) + timedelta(seconds=1) if times else None
    conditions, windows = doe_conditions(doe_rows, data_end)
    label_of = {c["key"]: c["label"] for c in conditions}

    def condition_at(reactor, when):
        hits = [(start, key) for r, start, end, key in windows
                if r == reactor and when and start <= when and (end is None or when < end)]
        return label_of.get(max(hits)[1]) if hits else None

    def pick_lines(reactor, cond, mid):
        chosen = [ln for ln in lines if ln["reactor"] == reactor and ln["condition"] == cond]
        chosen.sort(key=lambda ln: ln["time"] or 0)
        if basis == "window" and mid:
            span = timedelta(hours=window_h)
            return [ln for ln in chosen if ln["time"] and abs(ln["time"] - mid) <= span], "window"
        if skip_first and len(chosen) > 1:
            chosen = chosen[1:]
        return chosen, "condition"

    roles = {str(k).upper(): v for k, v in (reactor_roles or {}).items()}
    feed_c_wt = _num(liquid.get("feed_carbon"))
    samples = [s for s in liquid.get("results") or [] if s.get("reactor")]
    units = []
    covered = set()
    for s in samples:
        reactor = reactor_number(s["reactor"])
        start, end = _date(s.get("start")), _date(s.get("end"))
        mid = start + (end - start) / 2 if start and end and end > start else None
        cond = condition_at(reactor, mid) if mid else None
        units.append({"sample": s.get("sample") or "", "reactor": reactor, "condition": cond, "mid": mid, "liquid": s})
        if cond:
            covered.add((cond, reactor))
    for cond in [c["label"] for c in conditions]:
        for reactor in sorted({ln["reactor"] for ln in lines if ln["condition"] == cond}):
            if (cond, reactor) not in covered:
                units.append({"sample": "", "reactor": reactor, "condition": cond, "mid": None, "liquid": None})

    results = []
    for u in units:
        reactor, cond, liq = u["reactor"], u["condition"], u["liquid"]
        res = {"sample": u["sample"] or "gas only", "has_liquid": bool(liq), "reactor": f"R{reactor}",
               "role": roles.get(f"R{reactor}", ""), "condition": cond or "", "errors": [], "explain": {}}
        results.append(res)
        if not cond:
            res["errors"].append("ERROR: the sample window is not inside a Run Plan DOE condition of this reactor")
            continue
        chosen, how = pick_lines(reactor, cond, u["mid"])
        res.update({"lines": len(chosen), "line_basis": how,
                    "first_line": chosen[0]["datetime"] if chosen else "", "last_line": chosen[-1]["datetime"] if chosen else "",
                    "tos_h": liq.get("tos_h") if liq else _avg([ln["tos"] for ln in chosen])})
        if not chosen:
            res["errors"].append(f"ERROR: no calculated GC line of R{reactor} in {cond}"
                                 + (f" within ±{window_h:g} h of the sample" if how == "window" else ""))
            continue
        f_is = _avg([ln["f_is"] for ln in chosen])
        out = {n: _avg([ln["out"][n] for ln in chosen]) for n in names}
        vol = {n: _avg([ln["vol"][n] for ln in chosen]) for n in names}
        f_in = {n: _avg([ln["in"][n] for ln in chosen]) for n in names}
        components = []
        for n in names:
            if n == ist:
                continue
            components.append({"component": n, "carbon_atoms": comps[n]["carbon_atoms"], "mw": comps[n]["mw"],
                               "in_g_h": f_in.get(n), "out_g_h": out.get(n), "out_nl_h": vol.get(n),
                               "c_in_g_h": c_of(n, f_in.get(n)), "c_out_g_h": c_of(n, out.get(n)),
                               "group": _group(n, comps[n]["carbon_atoms"], reactant or "") if n != reactant else "reactant"})
        gas_in = sum(c["in_g_h"] or 0 for c in components)
        gas_out = sum(c["out_g_h"] or 0 for c in components)
        c_gas_in = sum(c["c_in_g_h"] or 0 for c in components)
        c_gas_out = sum(c["c_out_g_h"] or 0 for c in components)
        res.update({"is_flow_g_h": f_is, "gas_in_g_h": gas_in, "gas_out_g_h": gas_out,
                    "c_gas_in_g_h": c_gas_in, "c_gas_out_g_h": c_gas_out, "components": components,
                    "gas_c_balance_pct": _pct(c_gas_out, c_gas_in)})
        res["explain"]["gas_c_balance_pct"] = f"C gas out / C gas in = {c_gas_out:.5g} / {c_gas_in:.5g} g C/h"

        # Liquid side
        liq_in = hc = aq = c_liq_in = c_liq_out = None
        if liq:
            liq_in, hc, aq = _num(liq.get("feed_flow_g_h")), _num(liq.get("hc_flow_g_h")), _num(liq.get("aq_flow_g_h"))
            c_wt = _num(liq.get("c_wt_pct"))
            c_liq_out = hc * c_wt / 100 if hc is not None and c_wt is not None else None
            c_liq_in = liq_in * feed_c_wt / 100 if liq_in is not None and feed_c_wt is not None else None
            if liq.get("error"):
                res["errors"].append(f"Liquid tab: {liq['error']}")
        res.update({"liq_in_g_h": liq_in, "hc_out_g_h": hc, "aq_out_g_h": aq, "c_liq_in_g_h": c_liq_in,
                    "c_liq_out_g_h": c_liq_out})
        missing_mass = [w for w, v in (("liquid feed flow", liq_in), ("HC product flow", hc), ("aqueous product flow", aq)) if v is None]
        if not liq:
            res["mass_balance_pct"] = "ERROR: no liquid sample for this condition (Online Analysis → Liquid)"
            res["c_balance_pct"] = "ERROR: no liquid sample for this condition (Online Analysis → Liquid)"
        else:
            if missing_mass:
                res["mass_balance_pct"] = f"ERROR: liquid {', '.join(missing_mass)} missing (Online Analysis → Liquid)"
            else:
                den = gas_in + liq_in
                res["mass_balance_pct"] = _pct(gas_out + hc + aq, den)
                res["explain"]["mass_balance_pct"] = (f"(gas out {gas_out:.5g} + HC {hc:.5g} + aqueous {aq:.5g}) / "
                                                      f"(gas in {gas_in:.5g} + liquid feed {liq_in:.5g}) g/h")
            if c_liq_in is None or c_liq_out is None:
                need = [w for w, v in (("Carbon wt% of the liquid feed", c_liq_in), ("Carbon wt% / HC flow of the product", c_liq_out)) if v is None]
                res["c_balance_pct"] = f"ERROR: {', '.join(need)} missing (Online Analysis → Liquid)"
            else:
                res["c_balance_pct"] = _pct(c_gas_out + c_liq_out, c_gas_in + c_liq_in)
                res["explain"]["c_balance_pct"] = (f"(C gas out {c_gas_out:.5g} + C liquid {c_liq_out:.5g}) / "
                                                   f"(C gas in {c_gas_in:.5g} + C liquid feed {c_liq_in:.5g}) g C/h")
        c_total_out = c_gas_out + (c_liq_out or 0)
        res["c_out_gas_share_pct"] = _pct(c_gas_out, c_total_out) if c_liq_out is not None else None
        res["c_out_liquid_share_pct"] = _pct(c_liq_out, c_total_out) if c_liq_out is not None else None
        res["c_balance_status"] = _status_c(res["c_balance_pct"] if isinstance(res["c_balance_pct"], float) else None)

        # Conversion, selectivity, yield (carbon basis)
        r = next((c for c in components if c["component"] == reactant), None)
        if not reactant or not r or not r["c_in_g_h"]:
            msg = f"ERROR: no {reactant or 'carbon reactant'} in the feed gas of {cond}"
            res["conversion_pct"] = res["selectivity_pct"] = msg
            res["selectivity"], res["yield"] = {}, {}
        else:
            converted = r["c_in_g_h"] - (r["c_out_g_h"] or 0)
            res["conversion_pct"] = _pct(converted, r["c_in_g_h"])
            res["explain"]["conversion_pct"] = (f"({reactant} in {r['in_g_h']:.5g} − out {r['out_g_h'] or 0:.5g}) / "
                                                f"in {r['in_g_h']:.5g} g/h")
            groups = {}
            for c in components:
                if c["group"] in (None, "reactant"):
                    continue
                groups[c["group"]] = groups.get(c["group"], 0) + (c["c_out_g_h"] or 0) - (c["c_in_g_h"] or 0)
            if c_liq_in is not None and c_liq_out is not None:
                groups["Liquid (net)"] = c_liq_out - c_liq_in
            res["formed_c_g_h"] = {g: groups[g] for g in GROUP_ORDER if g in groups}
            res["converted_c_g_h"] = converted
            res["selectivity"] = {g: _pct(v, converted) if converted > 0 else None for g, v in res["formed_c_g_h"].items()}
            res["yield"] = {g: _pct(v, r["c_in_g_h"]) for g, v in res["formed_c_g_h"].items()}
            if product and converted > 0:
                p = next((c for c in components if c["component"] == product), None)
                formed = ((p["c_out_g_h"] or 0) - (p["c_in_g_h"] or 0)) if p else None
                res["selectivity_pct"] = _pct(formed, converted) if p else f"ERROR: no {product} in the GC lines"
                if p:
                    res["explain"]["selectivity_pct"] = (f"C {product} formed {formed:.5g} / C {reactant} converted "
                                                         f"{converted:.5g} g C/h")
            else:
                res["selectivity_pct"] = f"ERROR: no {reactant} converted" if converted <= 0 else "ERROR: no target product"
            res["product_yield_pct"] = _pct(((next((c for c in components if c["component"] == product), {}).get("c_out_g_h") or 0)
                                             - (next((c for c in components if c["component"] == product), {}).get("c_in_g_h") or 0)),
                                            r["c_in_g_h"]) if product else None
            # Workbook ethylene selectivity on the Nl/h of the products
            hydro = [c for c in components if (c["carbon_atoms"] or 0) >= 2 and c["component"] != reactant and c["out_nl_h"]]
            den = sum(c["out_nl_h"] * c["carbon_atoms"] / 2 for c in hydro)
            p_v = next((c["out_nl_h"] for c in hydro if c["component"] == product), None)
            res["selectivity_workbook_pct"] = _pct(p_v, den) if p_v is not None and den else None

        # C4+ yield (workbook definition, mass)
        c4_out = sum(c["out_g_h"] or 0 for c in components if (c["carbon_atoms"] or 0) >= 4)
        c4_in = sum(c["in_g_h"] or 0 for c in components if (c["carbon_atoms"] or 0) >= 4)
        if liq and liq_in is not None and hc is not None and (c4_in + liq_in):
            res["c4_yield_pct"] = _pct((hc + c4_out) - (c4_in + liq_in), c4_in + liq_in)
            res["explain"]["c4_yield_pct"] = (f"((HC {hc:.5g} + C4+ gas out {c4_out:.5g}) − (C4+ gas in {c4_in:.5g} + "
                                              f"liquid feed {liq_in:.5g})) / (C4+ gas in + liquid feed) g/h")
        else:
            res["c4_yield_pct"] = "ERROR: liquid feed / HC product missing (Online Analysis → Liquid)"
        res["c4_gas_out_g_h"], res["c4_gas_in_g_h"] = c4_out, c4_in

    order = {c["label"]: i for i, c in enumerate(conditions)}
    results.sort(key=lambda r: (order.get(r["condition"], 99), r["sample"] == "gas only", r["sample"], r["reactor"]))
    return {
        "internal_standard": ist, "reactant": reactant, "product": product,
        "reactant_options": carbon_feed, "product_options": [n for n in names if (comps[n]["carbon_atoms"] or 0) > 0],
        "groups": GROUP_ORDER, "conditions": [c["label"] for c in conditions],
        "components": [{"component": n, "mw": comps[n]["mw"], "carbon_atoms": comps[n]["carbon_atoms"]} for n in names if n != ist],
        "options": {"basis": basis, "skip_first": bool(skip_first), "window_h": window_h},
        "results": results, "trends": trends,
        "notes": {"mw_missing": mass["basis"].get("mw_missing", []), "lines_ok": mass["ok_count"],
                  "lines_error": mass["error_count"], "bypass": mass["bypass_count"]},
    }
