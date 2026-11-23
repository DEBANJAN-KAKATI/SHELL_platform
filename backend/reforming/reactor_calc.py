"""Reforming reactor calculation (6.11.0): the "Reactor n (catalyst)" sheets of ILS_Chemical Validation_Reforming
(Method 2) for every reactor of the run, one result per GC line of the operating data (.txt of Online Analysis).

Sheet row → key (all per GC line of the reactor; the sheet takes the Raw Data lines whose Sampled_reactor is the reactor):
  19/20 Date, Injection Time ........ date, time          (the line's Date/Time)
  21 Duration (h) ................... duration_h          (time since the reactor's previous line; first line: since Feed Cut-In)
  22 Run length (h) ................. run_length_h        (time since the Feed Cut-In of the reactor's block)
  23 Pressure ....................... pressure            (10i1PIC01 for R1-R4, 10i2PIC01 for R5-R8, as written in the file)
  24 Temperature (°C) ............... temperature         (10i1TIC02 for R1-R4, 10i2TIC02 for R5-R8)
  25 LHSV (1/h) ..................... lhsv                = naphtha_feed / density / catalyst volume
  26 H2/Naphtha (mol) ............... h2_naphtha_mol      = (h2_out / 2) / (naphtha_feed / feed MW)
  27 N2 (Rx effluent, NLPH) ......... n2_nlph             (Run Plan DOE "N2 dilution flow (NLPH)" of the line's condition)
  28 H2 (Rx effluent, vol%) ......... h2_vol              = (Area_H2 − 180057) / 179209        (GC calibration)
  29 N2 (Rx effluent, vol%) ......... n2_vol              = (Area_N2 − 5710532) / 4716081      (GC calibration)
  30 Naphtha (Rx effluent, vol%) .... naphtha_vol         = 100 − N2 − H2
  32 Mol. Weight .................... mw                  (DHA Molecular Weight of the line's sample)
  33 Carbon_Naphtha (wt%) ........... carbon_naphtha      = Σ carbon fraction × wt% (90 components)
  34 Hydrogen_Naphtha (wt%) ......... hydrogen_naphtha    = 100 − carbon_naphtha
  35 H2 (Rx effluent, g/h) .......... h2_out              = N2/(N2%/100) × H2%/100 × 0.0416 × 2
  36 Naphtha (Rx effluent, g/h) ..... naphtha_out         = N2/(N2%/100) × Naphtha%/100 × 0.0416 × MW
  37 Naphtha (Feed Rate, g/h) ....... naphtha_feed        = naphtha_out × carbon_naphtha / feed Carbon wt%
                                                          (feed Carbon = 100·C/(C+H) of the Run Plan Feed Carbon and Hydrogen,
                                                          as the workbook's D2 = 'Blend Feed Properties' H9)
  38 Naphtha/H2 (Rx effluent, mass) . naphtha_h2          = (Naphtha% × MW) / (H2% × 2)
  39/40 Estimated RON, SG ........... ron, sg             (DHA)
  42-131 components wt% ............. wt[...]             (DHA families × C1-C15; 132 Total)
  134-223 components wof% ........... wof[...]            = wt × (100 − H2 generation) / 100  (224 Total)
  226-232 family wt% ................ family_wt[...]      (Paraffins … Unknowns, Total)
  234 H2 generation (wof%) .......... h2_generation       = 100 × (naphtha_feed − naphtha_out) / naphtha_feed
  235 Gas Yield (C1-C4, wof%) ....... gas_yield           = wof of P C1-C4 + iP C4 + O C2-C4 + U C1-C4 (the sheet's cells)
  236 C5+ yield (wof%) .............. c5_yield            = 100 − gas − H2 generation;  237 Total
  239-246 family wof% ............... family_wof[...]     = family wt × (100 − H2 generation)/100; Total; Total incl. H2 gen.
  251 Naphtha/H2 (Rx inlet, mass) ... naphtha_h2_inlet    = naphtha_feed / H2 inlet (DOE "H2 Flow (gms/h)")
  252 H2/Naphtha (Rx inlet, mol) .... h2_naphtha_inlet    = (H2 inlet / 2) / (naphtha_feed / feed MW)
Yields (234-246) are given for lines with a DHA sample from YIELD_START_H (12 h, adjustable) after the Feed Cut-In;
before that wof% = wt% (as the sheet, which starts its yields at the first line 12 h or more after cut-in).
Missing inputs give "ERROR: …" text, never 0.
"""

import re
from datetime import datetime

FAMILIES = ["Paraffins", "Iso Paraffins", "Naphthenes", "Aromatics", "Olefins", "Unknowns"]
FAMILY_SHORT = {"Paraffins": "P", "Iso Paraffins": "iP", "Naphthenes": "N", "Aromatics": "A", "Olefins": "O", "Unknowns": "U"}
CARBON_NUMBERS = range(1, 16)
_PARAFFIN = [0.7487, 0.7989, 0.8172, 0.8267, 0.8325, 0.8364, 0.8392, 0.8413, 0.843, 0.8443, 0.8454, 0.8463, 0.8471, 0.8478, 0.8484]
# "Carbon, wt%" column C of the reactor sheets (carbon mass fraction of each component group)
CARBON_FRACTION = {
    "Paraffins": _PARAFFIN,
    "Iso Paraffins": _PARAFFIN,
    "Naphthenes": [0, 0, 0, 0] + [0.8563] * 11,
    "Aromatics": [0, 0, 0, 0, 0, 0.9226, 0.9125, 0.9051, 0.8993, 0.8948, 0.8911, 0.888, 0.8854, 0.8831, 0.8811],
    "Olefins": [0] + [0.8563] * 14,
    "Unknowns": _PARAFFIN,
}
# Gas Yield (C1-C4) = the wof% cells the sheet adds (rows 134-137, 152, 195-197, 209-212)
GAS_CELLS = [("Paraffins", n) for n in (1, 2, 3, 4)] + [("Iso Paraffins", 4)] \
    + [("Olefins", n) for n in (2, 3, 4)] + [("Unknowns", n) for n in (1, 2, 3, 4)]
# GC calibration (workbook "GC Calibration Data", 7 Aug 2026): Area = slope × vol% + intercept
GC_CALIBRATION = {"H2": {"slope": 179209.0, "intercept": 180057.0}, "N2": {"slope": 4716081.0, "intercept": 5710532.0}}
MOLAR_VOLUME_FACTOR = 0.0416   # mol per NL at 20 °C (the sheet's 0.0416)
MATCH_BEFORE_S, MATCH_AFTER_S = 10 * 60, 60 * 60
# Yields (H2 generation, Gas, C5+, wof%) start this many hours after the Feed Cut-In: both reactor sheets start at the
# first GC line >= 12 h after cut-in (R2 14.5 h, R6 12.4 h; the lines before: 10.4 h and 8.3 h); before it wof% = wt%.
YIELD_START_H = 12.0


def component_key(family, n):
    return f"{family} C{n}"


COMPONENTS = [component_key(f, n) for f in FAMILIES for n in CARBON_NUMBERS]


# ---------------------------------------------------------------- parsing helpers
def parse_time(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip().strip('="')
    for pattern in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
                    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue
    return None


def number(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not re.fullmatch(r"[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?", text):
        return None   # e.g. GC text such as "18.196.794" or "ÿ"
    return float(text)


def reactor_id(value):
    match = re.fullmatch(r"R?\s*(\d+)(?:\.0+)?", str(value if value is not None else "").strip(), re.IGNORECASE)
    return f"R{int(match.group(1))}" if match else ""


def block_of(reactor, doe_rows=()):
    for row in doe_rows:
        if row["reactor"] == reactor and row["block"]:
            return row["block"]
    return "Block-1" if int(reactor[1:]) <= 4 else "Block-2"


def hours(later, earlier):
    return (later - earlier).total_seconds() / 3600.0


def _key(text):
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _get(row, *names, startswith=False):
    keys = {_key(k): k for k in row}
    for name in names:
        name = _key(name)
        if name in keys:
            return row[keys[name]]
        if startswith:
            for k, original in keys.items():
                if k.startswith(name):
                    return row[original]
    return None


# ---------------------------------------------------------------- Run Plan context
def plan_context(run_plan):
    """Feed properties, reactors (catalyst, volume, block), DOE rows and Feed Cut-In per block from the saved Run Plan."""
    run_plan = run_plan or {}
    props = {}
    for row in ((run_plan.get("feedTables") or {}).get("properties") or {}).get("rows") or []:
        props[_key(row.get("label"))] = row.get("value")
    for row in run_plan.get("feedRows") or []:   # older layout: flat rows
        props.setdefault(_key(row.get("component")), row.get("value"))
    density = next((v for k, v in props.items() if k.startswith("density")), None)
    carbon, hydrogen = number(props.get("carbon")), number(props.get("hydrogen"))
    # Feed carbon as the workbook uses it (6.11.1): CHN Carbon normalised with Hydrogen, 100·C/(C+H)
    # ('Blend Feed Properties' H9 = 100*D9/SUM(D9:D10): 85.33 / 14.89 → 85.1427 wt%, the reactor sheets' D2)
    normalised = carbon is not None and hydrogen is not None and (carbon + hydrogen) > 0
    feed = {"carbon": 100 * carbon / (carbon + hydrogen) if normalised else carbon,
            "hydrogen": 100 * hydrogen / (carbon + hydrogen) if normalised else hydrogen,
            "carbon_measured": carbon, "hydrogen_measured": hydrogen, "carbon_normalised": normalised,
            "mw": number(props.get("molecular weight")), "density": number(density)}

    plan_rows = (run_plan.get("planData") or {}).get("rows") or []
    def plan_row(name):
        return next((r for r in plan_rows if _key(r.get("parameter")) == name), {})
    catalyst, volume = plan_row("catalyst"), plan_row("catalyst volume")

    doe_rows = []
    for row in (run_plan.get("doeData") or {}).get("rows") or []:
        reactor = reactor_id(_get(row, "Reactor ID"))
        if not reactor:
            continue
        doe_rows.append({
            "reactor": reactor, "block": str(_get(row, "Block") or "").strip(),
            "condition": str(_get(row, "Condition No.") or "").strip(),
            "start": parse_time(_get(row, "Start Date")), "end": parse_time(_get(row, "End Date")),
            "h2_g_h": number(_get(row, "H2 Flow (gms/h)", "H2 Flow", startswith=True)),
            "n2_nlph": number(_get(row, "N2 dilution flow (NLPH)", "N2 dilution", startswith=True)),
        })

    info = {_key(i.get("parameter")): i.get("value") for i in (run_plan.get("planData") or {}).get("info") or []}
    settings = (((run_plan.get("doeData") or {}).get("pretreatment") or {}).get("settings") or {}).get("Feed cut-in (date, time)") or {}
    blocks = set(settings) | {r["block"] for r in doe_rows if r["block"]}
    cut_ins = {}
    for block in blocks:
        value = parse_time(settings.get(block))
        if value is None:
            starts = [r["start"] for r in doe_rows if r["block"] == block and r["start"]]
            value = min(starts) if starts else None
        if value is not None:
            cut_ins[block] = value
    single = parse_time(info.get("feed cut-in"))
    if single is not None and cut_ins and single not in cut_ins.values():
        cut_ins = {}          # a typed Plan "Feed Cut-In" applies to every block
    return {
        "feed": feed, "feed_id": str(info.get("feed sl id") or "").strip().upper(),
        "catalyst": {f"R{k}": str(catalyst.get(f"r{k}") or "").strip() for k in range(1, 9)},
        "catalyst_volume": {f"R{k}": number(volume.get(f"r{k}")) for k in range(1, 9)},
        "doe": doe_rows, "cut_ins": cut_ins, "cut_in": single,
    }


def condition_of(doe_rows, reactor, when):
    rows = [r for r in doe_rows if r["reactor"] == reactor and r["start"] and when is not None and r["start"] <= when
            and (r["end"] is None or when < r["end"])]
    rows.sort(key=lambda r: r["start"])
    return rows[-1] if rows else None


# ---------------------------------------------------------------- reactor of each GC line (6.11.2)
# Some exports write Sampled_reactor 0 (the bypass code) for reactor lines, e.g. Result_34.txt from 20.11.2026 08:00 on;
# the workbook's Raw Data has them relabelled by hand. A line marked 0 / blank that holds naphtha (>= NAPHTHA_MIN_VOL
# vol% from the GC areas, i.e. reactor effluent, not the H2/N2 feed gas of a bypass) gets the reactor that continues the
# GC's sampling cycle (the repeating sequence of the reactors before it, e.g. R2, R6, R2, R6 …). Real bypass lines keep 0.
NAPHTHA_MIN_VOL = 2.0
REACTOR_SOURCE_EXPORT, REACTOR_SOURCE_CYCLE = "export", "GC cycle (Sampled_reactor 0 in the export)"


def naphtha_vol(raw, calibration=GC_CALIBRATION):
    area_h2, area_n2 = number(raw.get("Area_H2")), number(raw.get("Area_N2"))
    if area_h2 is None or area_n2 is None:
        return None
    h2 = (area_h2 - calibration["H2"]["intercept"]) / calibration["H2"]["slope"]
    n2 = (area_n2 - calibration["N2"]["intercept"]) / calibration["N2"]["slope"]
    return 100 - h2 - n2


def assign_reactors(rows, calibration=GC_CALIBRATION):
    """[(reactor 'R1'…'R8' / 'R0' / '', source)] for the rows of the operating file (same order)."""
    order = sorted(range(len(rows)), key=lambda i: (parse_time(rows[i].get("Date/Time")) or datetime.max))
    result = [("", "")] * len(rows)
    history = []
    for i in order:
        raw = rows[i]
        reactor = reactor_id(raw.get("Sampled_reactor"))
        if reactor and reactor != "R0":
            result[i] = (reactor, REACTOR_SOURCE_EXPORT)
            history.append(reactor)
            continue
        nv = naphtha_vol(raw, calibration) if raw.get("GC Date/Time") else None
        predicted = None
        if nv is not None and nv >= NAPHTHA_MIN_VOL:
            for period in range(1, 9):
                if len(history) >= 2 * period and history[-period:] == history[-2 * period:-period]:
                    predicted = history[-period]
                    break
        if predicted:
            result[i] = (predicted, REACTOR_SOURCE_CYCLE)
            history.append(predicted)
        else:
            result[i] = (reactor, REACTOR_SOURCE_EXPORT if reactor else "")
    return result


# ---------------------------------------------------------------- pairing
def pair_samples(sample_times, line_times):
    """DHA sample → GC line: DHA time within −10..+60 min of the GC Date/Time, closest pairs first, each used once."""
    pairs = []
    for i, gc in enumerate(line_times):
        for j, at in enumerate(sample_times):
            if gc is None or at is None:
                continue
            diff = (at - gc).total_seconds()
            if -MATCH_BEFORE_S <= diff <= MATCH_AFTER_S:
                pairs.append((abs(diff), i, j))
    used, result = set(), {}
    for _, i, j in sorted(pairs):
        if i in used or j in result:
            continue
        used.add(i)
        result[j] = i
    return {line: sample for sample, line in result.items()}


# ---------------------------------------------------------------- calculation
def _err(text):
    return f"ERROR: {text}"


def _ok(*values):
    return all(isinstance(v, (int, float)) for v in values)


def calculate_line(line, sample, ctx, previous_time, calibration=GC_CALIBRATION, yield_start_h=YIELD_START_H):
    reactor = line["reactor"]
    block = block_of(reactor, ctx["doe"])
    cut_in = ctx["cut_ins"].get(block) or ctx["cut_in"]
    when = line["time"]
    feed = ctx["feed"]
    doe = condition_of(ctx["doe"], reactor, when)
    flows = doe
    if flows is None and when is not None:
        # A line before the reactor's first condition (e.g. just before the Feed Cut-In) takes condition 1's flows,
        # as the workbook's first column (N2 and H2 inlet of the run)
        firsts = sorted((r for r in ctx["doe"] if r["reactor"] == reactor and r["start"]), key=lambda r: r["start"])
        flows = firsts[0] if firsts and when < firsts[0]["start"] else None
    first = 1 if int(reactor[1:]) <= 4 else 2
    out = {
        "reactor": reactor, "block": block, "catalyst": ctx["catalyst"].get(reactor, ""),
        "date_time": line["date_time"], "gc_date_time": line["gc_date_time"],
        "date": when.strftime("%d.%m.%Y") if when else "", "time": when.strftime("%H:%M:%S") if when else "",
        "condition": doe["condition"] if doe else "",
        "dha_uid": sample.get("UID", "") if sample else "", "dha_date_time": sample.get("DateTime", "") if sample else "",
    }
    if when is None:
        out["duration_h"] = out["run_length_h"] = _err("line without Date/Time")
    elif cut_in is None:
        out["duration_h"] = out["run_length_h"] = _err("no Feed Cut-In in the Run Plan")
    else:
        out["run_length_h"] = hours(when, cut_in)
        out["duration_h"] = hours(when, previous_time) if previous_time else hours(when, cut_in)
    out["pressure"] = number(line["raw"].get(f"10i{first}PIC01"))
    out["temperature"] = number(line["raw"].get(f"10i{first}TIC02"))
    out["n2_nlph"] = (flows["n2_nlph"] if flows and flows["n2_nlph"] is not None
                      else _err("no DOE 'N2 dilution flow (NLPH)' for this reactor and time"))
    h2_inlet = flows["h2_g_h"] if flows and flows["h2_g_h"] is not None else None

    area_h2, area_n2 = number(line["raw"].get("Area_H2")), number(line["raw"].get("Area_N2"))
    out["h2_vol"] = (area_h2 - calibration["H2"]["intercept"]) / calibration["H2"]["slope"] if area_h2 is not None else _err("no Area_H2")
    out["n2_vol"] = (area_n2 - calibration["N2"]["intercept"]) / calibration["N2"]["slope"] if area_n2 is not None else _err("no Area_N2")
    out["naphtha_vol"] = 100 - out["n2_vol"] - out["h2_vol"] if _ok(out["h2_vol"], out["n2_vol"]) else _err("H2 / N2 vol% missing")
    out["total_vol"] = out["h2_vol"] + out["n2_vol"] + out["naphtha_vol"] if _ok(out["h2_vol"], out["n2_vol"], out["naphtha_vol"]) else None

    no_dha = _err("no DHA sample for this GC line")
    wt = {c: (number(sample.get(c)) or 0.0) for c in COMPONENTS} if sample else None
    out["mw"] = number(sample.get("Molecular Weight")) if sample else no_dha
    out["ron"] = number(sample.get("RON")) if sample else no_dha
    out["sg"] = number(sample.get("Specific Gravity")) if sample else no_dha
    if wt is not None:
        out["carbon_naphtha"] = sum(CARBON_FRACTION[f][n - 1] * wt[component_key(f, n)] for f in FAMILIES for n in CARBON_NUMBERS)
        out["hydrogen_naphtha"] = 100 - out["carbon_naphtha"]
    else:
        out["carbon_naphtha"] = out["hydrogen_naphtha"] = no_dha

    n2, n2v, h2v, nv = out["n2_nlph"], out["n2_vol"], out["h2_vol"], out["naphtha_vol"]
    gas_ok = _ok(n2, n2v, h2v) and n2v != 0
    out["h2_out"] = (n2 / (n2v / 100)) * (h2v / 100) * MOLAR_VOLUME_FACTOR * 2 if gas_ok else _err("N2 flow or GC H2 / N2 missing")
    if not sample:
        out["naphtha_out"] = out["naphtha_feed"] = out["naphtha_h2"] = no_dha
    else:
        out["naphtha_out"] = ((n2 / (n2v / 100)) * (nv / 100) * MOLAR_VOLUME_FACTOR * out["mw"]
                              if gas_ok and _ok(nv, out["mw"]) else _err("N2 flow, GC or DHA MW missing"))
        out["naphtha_feed"] = (out["naphtha_out"] * out["carbon_naphtha"] / feed["carbon"]
                               if _ok(out["naphtha_out"], out["carbon_naphtha"], feed["carbon"]) and feed["carbon"]
                               else _err("feed Carbon wt% missing in the Run Plan (Feed)"))
        out["naphtha_h2"] = (nv * out["mw"]) / (h2v * 2) if _ok(nv, out["mw"], h2v) and h2v else _err("GC H2 or DHA MW missing")
    nf = out["naphtha_feed"]
    out["lhsv"] = (nf / feed["density"] / ctx["catalyst_volume"][reactor]
                   if _ok(nf, feed["density"], ctx["catalyst_volume"].get(reactor)) and feed["density"] and ctx["catalyst_volume"][reactor]
                   else _err("naphtha feed, feed density or catalyst volume missing"))
    out["h2_naphtha_mol"] = ((out["h2_out"] / 2) / (nf / feed["mw"]) if _ok(out["h2_out"], nf, feed["mw"]) and nf and feed["mw"]
                             else _err("H2 out, naphtha feed or feed MW missing"))

    # Components wt% and wof%, yields
    after_cut_in = isinstance(out["run_length_h"], (int, float)) and out["run_length_h"] >= yield_start_h
    h2_gen = None
    if sample and after_cut_in:
        h2_gen = (100 * (nf - out["naphtha_out"]) / nf if _ok(nf, out["naphtha_out"]) and nf
                  else _err("naphtha feed / out missing"))
    out["h2_generation"] = h2_gen if h2_gen is not None else ""
    factor = (100 - h2_gen) / 100 if isinstance(h2_gen, (int, float)) else 1.0
    out["wt"] = wt or {}
    out["wof"] = {c: v * factor for c, v in wt.items()} if wt else {}
    out["total_wt"] = sum(wt.values()) if wt else ""
    out["total_wof"] = sum(out["wof"].values()) if wt else ""
    out["family_wt"] = {f: sum(wt[component_key(f, n)] for n in CARBON_NUMBERS) for f in FAMILIES} if wt else {}
    out["family_wt_total"] = sum(out["family_wt"].values()) if wt else ""
    if isinstance(h2_gen, (int, float)):
        out["gas_yield"] = sum(out["wof"][component_key(f, n)] for f, n in GAS_CELLS)
        out["c5_yield"] = 100 - out["gas_yield"] - h2_gen
        out["yield_total"] = h2_gen + out["gas_yield"] + out["c5_yield"]
        out["family_wof"] = {f: out["family_wt"][f] * factor for f in FAMILIES}
        out["family_wof_total"] = sum(out["family_wof"].values())
        out["total_incl_h2"] = out["family_wof_total"] + h2_gen
    else:
        out["gas_yield"] = out["c5_yield"] = out["yield_total"] = h2_gen if isinstance(h2_gen, str) else ""
        out["family_wof"] = {}
        out["family_wof_total"] = out["total_incl_h2"] = h2_gen if isinstance(h2_gen, str) else ""
    if h2_inlet is None:
        out["naphtha_h2_inlet"] = out["h2_naphtha_inlet"] = _err("no DOE 'H2 Flow (gms/h)' for this reactor and time")
    else:
        out["naphtha_h2_inlet"] = nf / h2_inlet if _ok(nf) and h2_inlet else _err("naphtha feed missing")
        out["h2_naphtha_inlet"] = ((h2_inlet / 2) / (nf / feed["mw"]) if _ok(nf, feed["mw"]) and nf and feed["mw"]
                                   else _err("naphtha feed or feed MW missing"))
    out["h2_inlet_g_h"] = h2_inlet if h2_inlet is not None else ""
    return out


def calculate(operating_rows, samples, run_plan, calibration=None, yield_start_h=YIELD_START_H):
    """operating_rows: rows of the operating .txt (all columns, as text); samples: Reforming DHA rows (UID, DateTime,
    'Paraffins C1' … 'Unknowns C15', Molecular Weight, RON, Specific Gravity); run_plan: the saved Run Plan payload."""
    calibration = calibration or GC_CALIBRATION
    ctx = plan_context(run_plan)
    lines = []
    assigned = assign_reactors(operating_rows, calibration)
    for raw, (reactor, source) in zip(operating_rows, assigned):
        gc = parse_time(raw.get("GC Date/Time"))
        if gc is None:
            continue
        lines.append({"raw": raw, "gc": gc, "time": parse_time(raw.get("Date/Time")),
                      "date_time": str(raw.get("Date/Time") or ""), "gc_date_time": str(raw.get("GC Date/Time") or ""),
                      "reactor": reactor, "reactor_source": source})
    feed_id = ctx["feed_id"]
    dha = [s for s in samples if not (feed_id and feed_id in str(s.get("UID", "")).upper())]
    line_to_sample = pair_samples([parse_time(s.get("DateTime")) for s in dha], [l["gc"] for l in lines])

    results, previous = [], {}
    for index, line in enumerate(sorted(range(len(lines)), key=lambda i: (lines[i]["time"] or lines[i]["gc"]))):
        line_obj = lines[line]
        reactor = line_obj["reactor"]
        if not reactor or reactor == "R0":
            continue    # bypass lines and lines without a reactor are not part of a reactor sheet
        sample = dha[line_to_sample[line]] if line in line_to_sample else None
        block = block_of(reactor, ctx["doe"])
        cut_in = ctx["cut_ins"].get(block) or ctx["cut_in"]
        if sample is None and cut_in is not None and line_obj["time"] is not None and line_obj["time"] < cut_in:
            continue    # pre-run line (activation) without a DHA sample: not part of the reactor sheet (as the workbook)
        result = calculate_line(line_obj, sample, ctx, previous.get(reactor), calibration, yield_start_h)
        result["reactor_source"] = line_obj["reactor_source"]
        previous[reactor] = line_obj["time"]
        results.append(result)

    reactors = []
    for reactor in sorted({r["reactor"] for r in results}, key=lambda r: int(r[1:])):
        block = block_of(reactor, ctx["doe"])
        cut_in = ctx["cut_ins"].get(block) or ctx["cut_in"]
        reactors.append({"reactor": reactor, "catalyst": ctx["catalyst"].get(reactor, ""), "block": block,
                         "catalyst_volume": ctx["catalyst_volume"].get(reactor),
                         "feed_cut_in": cut_in.strftime("%d.%m.%Y %H:%M") if cut_in else "",
                         "h2_inlet_g_h": next((r["h2_g_h"] for r in ctx["doe"] if r["reactor"] == reactor and r["h2_g_h"] is not None), None),
                         "lines": sum(1 for r in results if r["reactor"] == reactor),
                         "lines_from_cycle": sum(1 for r in results if r["reactor"] == reactor and r["reactor_source"] == REACTOR_SOURCE_CYCLE)})
    feed = ctx["feed"]
    return {
        "lines": results, "reactors": reactors, "components": COMPONENTS, "families": FAMILIES,
        "carbon_fraction": {c: CARBON_FRACTION[f][n - 1] for f in FAMILIES for n in CARBON_NUMBERS for c in [component_key(f, n)]},
        "constants": {"feed_carbon": feed["carbon"], "feed_hydrogen": feed["hydrogen"], "feed_mw": feed["mw"],
                      "feed_carbon_measured": feed["carbon_measured"], "feed_hydrogen_measured": feed["hydrogen_measured"],
                      "feed_carbon_normalised": feed["carbon_normalised"],
                      "feed_density": feed["density"], "calibration": calibration, "molar_volume_factor": MOLAR_VOLUME_FACTOR,
                      "yield_start_h": yield_start_h},
        "missing": [label for label, value in (("feed Carbon wt%", feed["carbon"]), ("feed Molecular Weight", feed["mw"]),
                                                ("feed Density @ 15 °C", feed["density"])) if value is None],
    }
