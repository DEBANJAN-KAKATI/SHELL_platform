"""Online Analysis: GC mol% (ESTD) → mass flow (g/h), volumetric flow (Nl/h) and carbon flow (g C/h) per molecule.

The formulas follow the MassBal workbook (Ver2.2, sheets R#_MB, Gas, Run_Plan); argon is the internal standard:

* Gas feed to reactor r   F_r [g/h]   = 01i14FI01 · V_r / ΣV            (Gas!B12; V = 01i14FIC01..08 [NmL/h])
* Argon to reactor r      F_Ar,r      = F_r · w_Ar / 100                (Gas!G20; w_Ar = Ar wt% of the feed gas, Gas!I37)
                          without 01i14FI01: F_Ar,r = V_r/1000 / Vm · y_Ar,feed/100 · 39.948 (Vm = 22.414 Nl/mol)
  V_r / 01i14FI01 come from the export line, else from the Run Plan DOE condition running at that time
  ("Total gas (Nl/h)" / "Gas Flow (NmL/h)"). Ar in the feed gas comes from the Run Plan (Feed → Gas feed composition).
* Mass flow               m_i [g/h]   = y_i·MW_i / (y_Ar·MW_Ar) · F_Ar,r (R#_MB rows 52-80)
* Volumetric flow         V_i [Nl/h]  = y_i/100 · V_out,  V_out = V_r/1000 · y_Ar,feed / y_Ar   (R#_MB rows 86-116)
* Carbon flow             C_i [g C/h] = 12.011 · nC_i / MW_i · m_i       (R#_MB rows 121-150, "TOS Carbon of Each Molecule")

y = ESTD mol% of the GC injection (not normalised, as in the workbook), y_Ar,feed = Ar mol% of the feed gas.
R#_MB!D86 computes V_out as m_Ar / Gas!I35 · Gas!B11, which mixes g/h and NmL/h (3 Nl/h of feed gives 159.7 Nl/h);
the argon balance above (feed volume × Ar in / Ar out) is what that row intends and is used here.
With flows on the export, every row uses the 01i14FI01 / 01i14FIC0r values of the same line (the workbook averages them
over the sampling window). Rows that cannot be calculated get an explicit "ERROR: ..." status, never zero.
"""
from datetime import datetime, timedelta
from statistics import pstdev

MW_AR = 39.948
MW_C = 12.011

# GC component (name after "ESTD_" in the export) → (MW g/mol, carbon atoms, source). MW and carbon atoms are the
# experimental standards of the MassBal workbook (R#_MB columns B and AD); "standard" = not in the workbook.
COMPONENTS = {
    "Methane": (16.04, 1, "workbook"), "CH4": (16.04, 1, "workbook (= Methane)"),
    "Ethane": (30.07, 2, "workbook"), "Ethylene": (28.05, 2, "workbook"), "Propane": (44.1, 3, "workbook"),
    "Propylene": (42.08, 3, "workbook"), "Butane": (58.12, 4, "workbook"), "Pentane": (72.15, 5, "workbook"),
    "C6s": (86.18, 6, "workbook"), "Hexane": (86.18, 6, "workbook"), "C4": (58.12, 4, "workbook"),
    "C5": (72.15, 5, "workbook"), "C6": (86.18, 6, "workbook"), "C6 Above": (100.21, 6, "workbook"),
    "Benzene": (78.11, 6, "workbook"), "Toluene": (92.14, 7, "workbook"), "Ethylbenzene": (106.167, 8, "workbook"),
    "p-Xylene": (106.167, 8, "workbook"), "m-Xylene": (106.167, 8, "workbook"), "o-Xylene": (106.167, 8, "workbook"),
    "C6 Unknowns": (86.18, 6, "workbook"), "C8 Unknowns": (114.23, 8, "workbook"), "C7 Unknowns": (100.21, 7, "workbook"),
    "CO2": (44.01, 1, "workbook"), "Argon": (MW_AR, 0, "workbook"), "CO": (28.01, 1, "workbook"),
    "H2": (2.016, 0, "workbook"), "Acetylene": (26.04, 2, "workbook"), "Isobutane": (58.12, 4, "workbook"),
    "N2": (28.0134, 0, "workbook"),
    "H2S": (34.081, 0, "standard (not in the workbook)"), "Propadiene": (40.064, 3, "standard (not in the workbook)"),
}
# Lumped GC peaks without a defined molecule: no MW, so a non-zero value cannot be converted.
NO_MW = {"C3-C4", "C4-C5", "C5-C6", "C6-C8"}

# Feed gas MWs of the workbook (Run_Plan row 37, Gas row 36), used for the Ar mass fraction of the feed gas.
FEED_GAS_MW = {
    "hydrogen": 2.016, "h2": 2.016, "ethylene": 28.054, "methane": 16.043, "ethane": 30.07, "nitrogen": 28.014,
    "n2": 28.014, "co2": 44.009, "co": 28.01, "acetylene": 26.038, "propylene": 42.081, "propane": 44.097,
    "argon": MW_AR, "ar": MW_AR, "butane": 58.123, "h2s": 34.081,
}

UNITS = {
    "mol": {"label": "Normalised mol%", "suffix": "mol%"},
    "mass": {"label": "Mass flow rates (g/h)", "suffix": "g/h"},
    "volume": {"label": "Volumetric flow rates (Nl/h)", "suffix": "Nl/h"},
    "carbon": {"label": "Carbon of each molecule (g C/h)", "suffix": "g C/h"},
}


def _num(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None          # NaN → None


def _date(value):
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def reactor_number(value):
    """1..8 from 1, 1.0, '1', 'R1'; 0 = bypass; None when unknown."""
    text = str(value if value is not None else "").strip().upper().lstrip("R")
    try:
        number = int(float(text))
    except ValueError:
        return None
    return number if 0 <= number <= 8 else None


def feed_argon(feed_gas):
    """Ar mol% and wt% of the feed gas from the Run Plan gas table [{component, value}] (total feed gas, mol%).

    As in the workbook (Gas!I37 from Run_Plan rows 35-38), the mass is Σ y_j·MW_j over the components with a known MW;
    'Other' rows have no MW and add no mass (the workbook treats the unanalysed rest of the mixed gas the same way).
    """
    ar_mol, mass, excluded = None, 0.0, []
    for row in feed_gas or []:
        name = str(row.get("component") or "").replace("(gas)", "").strip()
        value = _num(row.get("value"))
        if not name or not value:
            continue
        mw = FEED_GAS_MW.get(name.lower())
        if mw is None:
            excluded.append(f"{name} {value:g} mol%")
            continue
        mass += value * mw
        if name.lower() in ("argon", "ar"):
            ar_mol = value
    wt = 100 * ar_mol * MW_AR / mass if ar_mol and mass > 0 else None
    return {"ar_mol_pct": ar_mol, "ar_wt_pct": wt, "excluded": excluded}


# Spellings of GC method peak names → the molecule (the export of some methods writes "Etylene")
ALIASES = {"Etylene": "Ethylene"}
MOLAR_VOLUME = 22.414          # Nl/mol at 0 °C, 1.01325 bar (normal conditions of NmL/h)


def _line_flows(row, reactor):
    """Total gas feed 01i14FI01 [g/h], reactor flow FIC_r and ΣFIC [NmL/h] written on the export line (else None)."""
    flows = []
    for k in range(1, 9):
        value = _num(row.get(f"01i14FIC0{k}"))
        if value is None:
            value = _num(row.get(f"02i2FIC0{k}"))
        flows.append(value)
    if flows[reactor - 1] is None:
        return None
    return _num(row.get("01i14FI01")), flows[reactor - 1], sum(v for v in flows if v and v > 0)


def doe_gas_flows(doe_rows):
    """Gas feed per reactor and condition from the Run Plan DOE: [(reactor, start, end, NmL/h)].

    Universal template: "Total gas (Nl/h)"; older RunPlan.xlsx: "Gas Flow (NmL/h)".
    """
    out = []
    for row in doe_rows or []:
        reactor = reactor_number(row.get("Reactor ID"))
        if not reactor:
            continue
        value = None
        for key, raw in row.items():
            label = " ".join(str(key).split()).lower()
            if label.startswith("total gas") and "nl/h" in label:
                value = _num(raw) * 1000 if _num(raw) is not None else None
            elif label.startswith("gas flow") and "nml/h" in label:
                value = _num(raw)
            if value is not None:
                break
        start, end = _date(row.get("Start Date")), _date(row.get("End Date"))
        if value is not None and start:
            out.append((reactor, start, end, value))
    return out


def _doe_flow(doe, reactor, when):
    """NmL/h of the DOE condition running for this reactor at this time (start ≤ time < end)."""
    if not when:
        return None
    hits = [v for r, start, end, v in doe if r == reactor and start <= when and (end is None or when < end)]
    return hits[-1] if hits else None


# Internal Standard of the General_MB process (6.5.0): measured in the bypass (reactor 0) GC lines.
INTERNAL_STANDARDS = {"Argon": MW_AR, "N2": 28.0134}


def internal_standard_name(value):
    """'Argon' / 'N2' from argon, Ar, N2, nitrogen; None for '' / None / '—'."""
    text = str(value or "").strip().lower()
    if text in ("", "none", "—", "-"):
        return None
    if text in ("argon", "ar"):
        return "Argon"
    if text in ("n2", "nitrogen"):
        return "N2"
    raise ValueError(f"Unknown internal standard '{value}'. Use Argon or N2.")


def _label_number(value):
    number = _num(value)
    if number is not None and number == int(number):
        return str(int(number))
    return str(value or "").strip()


def doe_conditions(doe_rows, data_end=None):
    """DOE conditions with their time windows.

    Every DOE row is one reactor in one condition (Block, Condition No.). A reactor runs a condition from its Start Date
    until its End Date, else Start + Duration (h), else the start of the reactor's next condition, else the end of the
    data. The window of the condition (used for its bypass lines) spans all its reactors.
    Returns (conditions in time order, per-reactor windows [(reactor, start, end, key)]).
    """
    entries = []
    for row in doe_rows or []:
        reactor = reactor_number(row.get("Reactor ID"))
        start = _date(row.get("Start Date"))
        cond = _label_number(row.get("Condition No."))
        if not reactor or not start or not cond:
            continue
        end = _date(row.get("End Date"))
        if end is None:
            hours = next((_num(v) for k, v in row.items() if str(k).lower().startswith("duration") and _num(v)), None)
            if hours:
                end = start + timedelta(hours=hours)
        block = str(row.get("Block") or "").strip()
        entries.append([reactor, start, end, (block, cond)])
    for entry in entries:                       # open end → next condition of the same reactor, else end of data
        if entry[2] is None:
            later = [e[1] for e in entries if e[0] == entry[0] and e[1] > entry[1]]
            entry[2] = min(later) if later else data_end
    blocks = {key[0] for *_, key in entries}
    conditions = {}
    for reactor, start, end, key in entries:
        c = conditions.setdefault(key, {"key": key, "label": (f"{key[0]} · C{key[1]}" if len(blocks) > 1 and key[0]
                                                              else f"C{key[1]}"),
                                        "start": start, "end": end, "reactors": set()})
        c["start"] = min(c["start"], start)
        c["end"] = None if c["end"] is None or end is None else max(c["end"], end)
        c["reactors"].add(reactor)
    ordered = sorted(conditions.values(), key=lambda c: (c["start"], c["label"]))
    return ordered, [tuple(e) for e in entries]


def _in_window(when, start, end):
    return when is not None and start <= when and (end is None or when < end)


def bypass_feed_gas(rows, conditions, internal_standard, names, value_of, run_plan_argon=None):
    """Feed Gas Composition IS per DOE condition from the bypass (reactor 0) GC lines (raw ESTD averages).

    y_IS,feed = avg ESTD_IS;  y_mix,feed = avg Σ ESTD_j of every other gas (N2 counts for Argon-IS, Argon for N2-IS);
    MW_mix = Σ avg_j·MW_j / Σ avg_j (gases with a MW);  w_IS = y_IS·MW_IS / (y_IS·MW_IS + y_mix·MW_mix).
    """
    mw_is = INTERNAL_STANDARDS[internal_standard]
    out = []
    for c in conditions:
        lines = []
        for row in rows or []:
            if reactor_number(row.get("Reactor")) != 0 or not _in_window(_date(row.get("DateTime")), c["start"], c["end"]):
                continue
            values = {n: value_of(row, n) or 0.0 for n in names}
            if any(values.values()):
                lines.append(values)
        entry = {"condition": c["label"], "start": c["start"].strftime("%Y-%m-%d %H:%M"),
                 "end": c["end"].strftime("%Y-%m-%d %H:%M") if c["end"] else "",
                 "reactors": [f"R{r}" for r in sorted(c["reactors"])], "bypass_lines": len(lines),
                 "internal_standard": internal_standard, "is_mol_pct": None, "is_rsd_pct": None, "mixed_mol_pct": None,
                 "sum_mol_pct": None, "mixed_mw": None, "is_wt_pct": None, "run_plan_argon_mol_pct": run_plan_argon,
                 "no_mw": [], "composition": {}, "error": None}
        if not lines:
            entry["error"] = (f"no bypass (reactor 0) GC line in condition {c['label']} – feed gas "
                              f"{internal_standard} not measured")
            out.append(entry)
            continue
        avg = {n: sum(line[n] for line in lines) / len(lines) for n in names}
        y_is = avg.get(internal_standard, 0.0)
        others = {n: v for n, v in avg.items() if n != internal_standard and v}
        y_mix = sum(others.values())
        with_mw = {n: v for n, v in others.items() if n in COMPONENTS and n not in NO_MW}
        mix_mass = sum(v * COMPONENTS[n][0] for n, v in with_mw.items())
        mw_mix = mix_mass / sum(with_mw.values()) if with_mw else None
        series = [line.get(internal_standard, 0.0) for line in lines]
        entry.update({
            "is_mol_pct": y_is, "mixed_mol_pct": y_mix, "sum_mol_pct": y_is + y_mix, "mixed_mw": mw_mix,
            "is_rsd_pct": 100 * pstdev(series) / y_is if len(series) > 1 and y_is else None,
            "is_wt_pct": (100 * y_is * mw_is / (y_is * mw_is + y_mix * mw_mix)) if y_is and mw_mix else
                         (100.0 if y_is and not y_mix else None),
            "no_mw": sorted(n for n in others if n not in with_mw),
            "composition": {n: v for n, v in avg.items() if v},
        })
        if not y_is:
            entry["error"] = (f"no {internal_standard} peak (ESTD_{internal_standard}) in the bypass lines of "
                              f"condition {c['label']}")
        out.append(entry)
    return out


def convert_online_rows(rows, unit, feed_gas=None, feed_cut_in=None, doe_rows=None, ar_mol_pct=None, ar_wt_pct=None,
                        internal_standard=None):
    """Rows of the Online Analysis table (DateTime, Reactor, ESTD_*, flows) in the chosen unit.

    Without `internal_standard` (6.4.3 behaviour): argon is the internal standard and Ar in the feed gas comes from
    `feed_gas` (Run Plan Feed → Gas feed composition); `ar_mol_pct` / `ar_wt_pct` override it for scripts and tests.
    With `internal_standard` = Argon or N2 (process General_MB, 6.5.0): the IS mol% and wt% of the feed gas are measured
    in the bypass (reactor 0) GC lines of every Run Plan DOE condition (`feed_gas_is`), and each reactor line uses the
    values of the condition it belongs to. The Run Plan Argon is only reported for comparison.
    The gas feed of a line comes from the export line (01i14FIC0r, 01i14FI01), else from the Run Plan DOE condition
    running at that time (`doe_rows`).
    IS to the reactor: with 01i14FI01 and the IS wt% as in the workbook (F_r · w_IS); without 01i14FI01 from the volume:
    FIC_r/1000 / molar volume · y_IS,feed/100 · MW_IS (the same quantity: n_IS · MW_IS).
    """
    if unit not in UNITS or unit == "mol":
        raise ValueError(f"Unknown unit '{unit}'. Use one of: mass, volume, carbon.")
    is_name = internal_standard_name(internal_standard)
    general = is_name is not None
    ist = is_name or "Argon"
    mw_is = INTERNAL_STANDARDS[ist]
    suffix = UNITS[unit]["suffix"]
    feed = feed_argon(feed_gas)
    ar_mol = _num(ar_mol_pct) if _num(ar_mol_pct) else feed["ar_mol_pct"]
    ar_wt = _num(ar_wt_pct) if _num(ar_wt_pct) else feed["ar_wt_pct"]
    vm = MOLAR_VOLUME
    doe = doe_gas_flows(doe_rows)
    has_tags = any(_num(r.get(f"01i14FIC0{k}")) is not None or _num(r.get(f"02i2FIC0{k}")) is not None
                   for r in rows or [] for k in range(1, 9))
    basis = {"unit": unit, "label": UNITS[unit]["label"], "internal_standard": is_name,
             "ar_feed_mol_pct": None if general else ar_mol, "ar_feed_wt_pct": None if general else ar_wt,
             "run_plan_argon_mol_pct": feed["ar_mol_pct"],
             "ar_source": ("bypass (reactor 0) GC lines per DOE condition" if general else
                           "override" if (_num(ar_wt_pct) or _num(ar_mol_pct)) else "Run Plan feed gas"),
             "excluded_feed_gas": [] if general else feed["excluded"], "molar_volume": vm, "export_has_flows": has_tags,
             "doe_flows": len(doe)}
    missing = None
    if not general and unit == "volume" and not ar_mol:
        missing = "ERROR: no Argon in the Run Plan feed gas (Run Plan → Feed → Gas feed composition)"
    if not general and unit in ("mass", "carbon") and not ar_mol and not ar_wt:
        missing = "ERROR: no Argon in the Run Plan feed gas (Run Plan → Feed → Gas feed composition)"

    present = []
    for row in rows or []:
        for key in row:
            if key.startswith("ESTD_"):
                name = ALIASES.get(key[5:], key[5:])
                if name not in present:
                    present.append(name)
    order = list(COMPONENTS) + sorted(NO_MW)
    all_names = [n for n in order if n in present] + [n for n in present if n not in COMPONENTS and n not in NO_MW]
    spelled = {n: [k for k, v in ALIASES.items() if v == n] + [n] for n in all_names}

    def value_of(row, name):
        for key in spelled.get(name, [name]):
            v = _num(row.get(f"ESTD_{key}"))
            if v is not None:
                return v
        return None

    # Components that have a value in at least one row
    all_names = [n for n in all_names if any(value_of(r, n) is not None for r in rows or [])]
    names = list(all_names)
    if unit == "carbon":           # only molecules that contain carbon
        names = [n for n in names if n in NO_MW or n not in COMPONENTS or COMPONENTS[n][1] > 0]

    times = [_date(r.get("DateTime")) for r in rows or []]
    t0 = _date(feed_cut_in) or min((t for t in times if t), default=None)
    basis["tos_zero"] = t0.strftime("%Y-%m-%d %H:%M:%S") if t0 else ""
    basis["tos_zero_source"] = "Run Plan Feed Cut-In" if _date(feed_cut_in) else "first record"

    # General_MB: DOE conditions and the feed gas measured in their bypass lines
    conditions, reactor_windows, feed_is = [], [], []
    if general:
        data_end = max((t for t in times if t), default=None)
        conditions, reactor_windows = doe_conditions(doe_rows, data_end + timedelta(seconds=1) if data_end else None)
        feed_is = bypass_feed_gas(rows, conditions, ist, all_names, value_of, feed["ar_mol_pct"])
    feed_by_label = {f["condition"]: f for f in feed_is}

    def condition_of(reactor, when):
        hits = [(start, key) for r, start, end, key in reactor_windows if r == reactor and _in_window(when, start, end)]
        if not hits:
            return None
        key = max(hits)[1]
        return next(c["label"] for c in conditions if c["key"] == key)

    def bypass_condition(when):
        hits = [c["label"] for c in conditions if _in_window(when, c["start"], c["end"])]
        return ", ".join(hits) if hits else None      # parallel blocks share the bypass line

    is_col = f"{ist} to reactor [g/h]" if general else "Ar to reactor [g/h]"
    extra = {"mass": ["Gas feed to reactor [NmL/h]", is_col, f"Total w/o {ist} [g/h]" if general else "Total w/o Ar [g/h]"],
             "volume": ["Gas feed to reactor [Nl/h]", "Total out [Nl/h]"],
             "carbon": ["Gas feed to reactor [NmL/h]", "Total C [g C/h]"]}[unit]
    if general and unit != "mass":
        extra.append(is_col)
    lead = ["DateTime", "TOS (h)", "Reactor"] + (["Condition"] if general else []) + ["Status", "Flow source"]
    columns = lead + [f"{n} [{suffix}]" for n in names] + extra
    sources = {}
    out_rows = []
    is_flows = {}                  # (condition, reactor) → [F_IS of the calculated lines] / [errors]
    for row, when in zip(rows or [], times):
        out = {"DateTime": row.get("DateTime"), "TOS (h)": round((when - t0).total_seconds() / 3600, 4) if when and t0 else None,
               "Reactor": row.get("Reactor")}
        for column in columns[3:]:
            out[column] = None
        y = {n: value_of(row, n) for n in names}
        y_is = value_of(row, ist)
        reactor = reactor_number(row.get("Reactor"))
        status, flow, cond, line_mol, line_wt = "OK", None, None, ar_mol, ar_wt
        has_gc = not (all(v is None or v == 0 for v in y.values()) and not y_is)
        if general and reactor == 0:
            cond = bypass_condition(when)
            out["Condition"] = cond
            out["Status"] = (f"BYPASS – feed gas of {cond}" if cond else
                             "BYPASS – outside every Run Plan DOE condition") if has_gc else \
                "BYPASS – no GC values in this line (not used)"
            out_rows.append(out)
            continue
        if general and reactor:
            cond = condition_of(reactor, when)
            out["Condition"] = cond
        if not has_gc:
            status = "ERROR: no GC values in this line"
        elif missing:
            status = missing
        elif reactor is None or reactor == 0:
            status = "ERROR: no reactor (bypass or unknown) – no feed flow to scale with"
        elif not y_is or y_is <= 0:
            status = f"ERROR: no {ist} peak (ESTD_{ist}) – {ist} is the internal standard"
        elif general and cond is None:
            status = f"ERROR: no Run Plan DOE condition for R{reactor} at this time"
        elif general and (feed_by_label[cond]["error"] or not feed_by_label[cond]["is_wt_pct"]):
            status = "ERROR: " + (feed_by_label[cond]["error"] or f"{ist} wt% of the feed gas of condition {cond} "
                                  f"cannot be calculated")
        else:
            if general:
                line_mol, line_wt = feed_by_label[cond]["is_mol_pct"], feed_by_label[cond]["is_wt_pct"]
            flow = _line_flows(row, reactor)
            if flow is not None:
                fi01, v_r, v_sum = flow
                source = "export"
            else:
                v_r = _doe_flow(doe, reactor, when)
                fi01, source = None, "Run Plan DOE"
                v_sum = sum(v for v in (_doe_flow(doe, k, when) for k in range(1, 9)) if v and v > 0) if v_r else 0
            flow = (fi01, v_r, v_sum, source)
            if v_r is None:
                status = (f"ERROR: no gas feed for R{reactor} – not in the export and no Run Plan DOE condition "
                          f"with a gas flow at this time")
            elif v_r <= 0 or not v_sum:
                status = f"ERROR: no gas feed to R{reactor} ({source}: {v_r:g} NmL/h)"
            elif unit != "volume" and not (fi01 and fi01 > 0 and line_wt) and not line_mol:
                status = "ERROR: no Argon mol% in the Run Plan feed gas (needed without 01i14FI01)"
        if status != "OK":
            out["Status"] = status
            out_rows.append(out)
            if general and cond and reactor:
                is_flows.setdefault((cond, reactor), {"ok": [], "errors": []})["errors"].append(status)
            continue

        fi01, v_r, v_sum, source = flow
        use_fi01 = bool(fi01 and fi01 > 0 and line_wt) and (general or unit != "volume")
        if use_fi01:
            is_r = fi01 * v_r / v_sum * line_wt / 100            # workbook: Gas!G20 = 01i14FI01 · V_r/ΣV · w_IS
            route = f"{source}, 01i14FI01"
        else:
            is_r = v_r / 1000 / vm * (line_mol or 0) / 100 * mw_is   # n_IS · MW_IS from the volumetric feed
            route = f"{source}, molar volume" if unit != "volume" or general else source
        if unit == "volume":
            route = source
        sources[route] = sources.get(route, 0) + 1
        out["Flow source"] = route
        v_out = v_r / 1000 * line_mol / y_is if line_mol else None
        problems, total = [], 0.0
        for n in names:
            value = y[n]
            if value is None:
                continue
            if n in NO_MW or n not in COMPONENTS:
                if value:
                    problems.append(n)
                    out[f"{n} [{suffix}]"] = f"ERROR: no MW for {n}"
                else:
                    out[f"{n} [{suffix}]"] = 0.0
                continue
            mw, carbons, _ = COMPONENTS[n]
            if unit == "volume":
                result = value / 100 * v_out
            else:
                mass = value * mw / (y_is * mw_is) * is_r
                result = mass if unit == "mass" else MW_C * carbons / mw * mass
                if unit == "mass" and n == ist:
                    out[f"{n} [{suffix}]"] = result
                    continue
            out[f"{n} [{suffix}]"] = result
            total += result
        if unit == "mass":
            out.update({"Gas feed to reactor [NmL/h]": v_r, is_col: is_r, extra[2]: total})
        elif unit == "volume":
            out.update({"Gas feed to reactor [Nl/h]": v_r / 1000, "Total out [Nl/h]": v_out})
        else:
            out.update({"Gas feed to reactor [NmL/h]": v_r, "Total C [g C/h]": total})
        if general:
            out[is_col] = is_r
            is_flows.setdefault((cond, reactor), {"ok": [], "errors": []})["ok"].append(is_r)
        out["Status"] = "OK" if not problems else f"ERROR: no MW for {', '.join(problems)} (total without them)"
        out_rows.append(out)

    basis["flow_sources"] = sources
    components = [{"component": n, "mw": COMPONENTS[n][0] if n in COMPONENTS else None,
                   "carbon_atoms": COMPONENTS[n][1] if n in COMPONENTS else None,
                   "source": (COMPONENTS[n][2] if n in COMPONENTS else "no MW (lumped peak)")
                             + (f"; export spelling {', '.join(k for k in spelled[n] if k != n)}" if len(spelled[n]) > 1 else "")}
                  for n in names]
    ok = sum(1 for r in out_rows if r["Status"] == "OK")
    bypass = sum(1 for r in out_rows if str(r["Status"]).startswith("BYPASS"))
    flows_missing = any(r["Status"].startswith("ERROR: no gas feed for R") for r in out_rows)
    basis["flows_missing"] = flows_missing
    # The export has no flows and the Run Plan DOE has no gas flows: the gas feed is missing
    basis["flows_needed"] = not has_tags and not doe
    basis["argon_missing"] = bool(missing)
    result = {"unit": unit, "label": UNITS[unit]["label"], "columns": columns, "rows": out_rows, "basis": basis,
              "components": components, "ok_count": ok, "bypass_count": bypass,
              "error_count": len(out_rows) - ok - bypass}
    if general:
        # Average IS Flow to Reactor (workbook R#_MB!F5 = Gas!G20) per condition and reactor
        avg = []
        for c in conditions:
            cells = {}
            for r in range(1, 9):
                entry = is_flows.get((c["label"], r))
                if entry and entry["ok"]:
                    cells[f"R{r}"] = sum(entry["ok"]) / len(entry["ok"])
                elif entry:
                    cells[f"R{r}"] = entry["errors"][0]
                else:
                    cells[f"R{r}"] = None
            avg.append({"condition": c["label"], "lines": {f"R{r}": len(is_flows.get((c["label"], r), {}).get("ok", []))
                                                          for r in range(1, 9)}, **cells})
        basis["no_conditions"] = not conditions
        basis["no_bypass"] = [f["condition"] for f in feed_is if f["bypass_lines"] == 0]
        result["feed_gas_is"] = feed_is
        result["avg_is_flow"] = avg
    return result
