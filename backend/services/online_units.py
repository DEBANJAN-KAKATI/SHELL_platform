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
from datetime import datetime

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


def convert_online_rows(rows, unit, feed_gas=None, feed_cut_in=None, doe_rows=None, ar_mol_pct=None, ar_wt_pct=None):
    """Rows of the Online Analysis table (DateTime, Reactor, ESTD_*, flows) in the chosen unit.

    Everything comes from the export and the Run Plan: Ar in the feed gas from `feed_gas` (Run Plan Feed → Gas feed
    composition), the gas feed of a line from the export line (01i14FIC0r, 01i14FI01), else from the Run Plan DOE
    condition running at that time (`doe_rows`). `ar_mol_pct` / `ar_wt_pct` override the feed gas for scripts and tests
    only (the page does not send them).
    Argon to the reactor: with 01i14FI01 and the Ar wt% as in the workbook (F_r · w_Ar); without 01i14FI01 from the
    volume: FIC_r/1000 / molar volume · y_Ar,feed/100 · 39.948 (the same quantity: n_Ar · MW_Ar).
    """
    if unit not in UNITS or unit == "mol":
        raise ValueError(f"Unknown unit '{unit}'. Use one of: mass, volume, carbon.")
    suffix = UNITS[unit]["suffix"]
    feed = feed_argon(feed_gas)
    ar_mol = _num(ar_mol_pct) if _num(ar_mol_pct) else feed["ar_mol_pct"]
    ar_wt = _num(ar_wt_pct) if _num(ar_wt_pct) else feed["ar_wt_pct"]
    vm = MOLAR_VOLUME
    doe = doe_gas_flows(doe_rows)
    has_tags = any(_num(r.get(f"01i14FIC0{k}")) is not None or _num(r.get(f"02i2FIC0{k}")) is not None
                   for r in rows or [] for k in range(1, 9))
    basis = {"unit": unit, "label": UNITS[unit]["label"], "ar_feed_mol_pct": ar_mol, "ar_feed_wt_pct": ar_wt,
             "ar_source": "override" if (_num(ar_wt_pct) or _num(ar_mol_pct)) else "Run Plan feed gas",
             "excluded_feed_gas": feed["excluded"], "molar_volume": vm, "export_has_flows": has_tags,
             "doe_flows": len(doe)}
    missing = None
    if unit == "volume" and not ar_mol:
        missing = "ERROR: no Argon in the Run Plan feed gas (Run Plan → Feed → Gas feed composition)"
    if unit in ("mass", "carbon") and not ar_mol and not ar_wt:
        missing = "ERROR: no Argon in the Run Plan feed gas (Run Plan → Feed → Gas feed composition)"

    present = []
    for row in rows or []:
        for key in row:
            if key.startswith("ESTD_"):
                name = ALIASES.get(key[5:], key[5:])
                if name not in present:
                    present.append(name)
    order = list(COMPONENTS) + sorted(NO_MW)
    names = [n for n in order if n in present] + [n for n in present if n not in COMPONENTS and n not in NO_MW]
    if unit == "carbon":           # only molecules that contain carbon
        names = [n for n in names if n in NO_MW or n not in COMPONENTS or COMPONENTS[n][1] > 0]
    spelled = {n: [k for k, v in ALIASES.items() if v == n] + [n] for n in names}

    def value_of(row, name):
        for key in spelled[name]:
            v = _num(row.get(f"ESTD_{key}"))
            if v is not None:
                return v
        return None

    # Components that have a value in at least one row
    names = [n for n in names if any(value_of(r, n) is not None for r in rows or [])]

    times = [_date(r.get("DateTime")) for r in rows or []]
    t0 = _date(feed_cut_in) or min((t for t in times if t), default=None)
    basis["tos_zero"] = t0.strftime("%Y-%m-%d %H:%M:%S") if t0 else ""
    basis["tos_zero_source"] = "Run Plan Feed Cut-In" if _date(feed_cut_in) else "first record"

    extra = {"mass": ["Gas feed to reactor [NmL/h]", "Ar to reactor [g/h]", "Total w/o Ar [g/h]"],
             "volume": ["Gas feed to reactor [Nl/h]", "Total out [Nl/h]"],
             "carbon": ["Gas feed to reactor [NmL/h]", "Total C [g C/h]"]}[unit]
    columns = ["DateTime", "TOS (h)", "Reactor", "Status", "Flow source"] + [f"{n} [{suffix}]" for n in names] + extra
    sources = {}
    out_rows = []
    for row, when in zip(rows or [], times):
        out = {"DateTime": row.get("DateTime"), "TOS (h)": round((when - t0).total_seconds() / 3600, 4) if when and t0 else None,
               "Reactor": row.get("Reactor")}
        for column in columns[4:]:
            out[column] = None
        y = {n: value_of(row, n) for n in names}
        y_ar = _num(row.get("ESTD_Argon"))
        reactor = reactor_number(row.get("Reactor"))
        status, flow = "OK", None
        if all(v is None or v == 0 for v in y.values()) and not y_ar:
            status = "ERROR: no GC values in this line"
        elif missing:
            status = missing
        elif reactor is None or reactor == 0:
            status = "ERROR: no reactor (bypass or unknown) – no feed flow to scale with"
        elif not y_ar or y_ar <= 0:
            status = "ERROR: no argon peak (ESTD_Argon) – argon is the internal standard"
        else:
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
            elif unit != "volume" and not (fi01 and fi01 > 0 and ar_wt) and not ar_mol:
                status = "ERROR: no Argon mol% in the Run Plan feed gas (needed without 01i14FI01)"
        if status != "OK":
            out["Status"] = status
            out_rows.append(out)
            continue

        fi01, v_r, v_sum, source = flow
        if unit != "volume" and fi01 and fi01 > 0 and ar_wt:
            ar_r = fi01 * v_r / v_sum * ar_wt / 100            # workbook: Gas!G20 = 01i14FI01 · V_r/ΣV · w_Ar
            route = f"{source}, 01i14FI01"
        else:
            ar_r = v_r / 1000 / vm * (ar_mol or 0) / 100 * MW_AR   # n_Ar · MW_Ar from the volumetric feed
            route = f"{source}, molar volume" if unit != "volume" else source
        sources[route] = sources.get(route, 0) + 1
        out["Flow source"] = route
        v_out = v_r / 1000 * ar_mol / y_ar if ar_mol else None
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
                mass = value * mw / (y_ar * MW_AR) * ar_r
                result = mass if unit == "mass" else MW_C * carbons / mw * mass
                if unit == "mass" and n == "Argon":
                    out[f"{n} [{suffix}]"] = result
                    continue
            out[f"{n} [{suffix}]"] = result
            total += result
        if unit == "mass":
            out.update({"Gas feed to reactor [NmL/h]": v_r, "Ar to reactor [g/h]": ar_r, "Total w/o Ar [g/h]": total})
        elif unit == "volume":
            out.update({"Gas feed to reactor [Nl/h]": v_r / 1000, "Total out [Nl/h]": v_out})
        else:
            out.update({"Gas feed to reactor [NmL/h]": v_r, "Total C [g C/h]": total})
        out["Status"] = "OK" if not problems else f"ERROR: no MW for {', '.join(problems)} (total without them)"
        out_rows.append(out)

    basis["flow_sources"] = sources
    components = [{"component": n, "mw": COMPONENTS[n][0] if n in COMPONENTS else None,
                   "carbon_atoms": COMPONENTS[n][1] if n in COMPONENTS else None,
                   "source": (COMPONENTS[n][2] if n in COMPONENTS else "no MW (lumped peak)")
                             + (f"; export spelling {', '.join(k for k in spelled[n] if k != n)}" if len(spelled[n]) > 1 else "")}
                  for n in names]
    ok = sum(1 for r in out_rows if r["Status"] == "OK")
    flows_missing = any(r["Status"].startswith("ERROR: no gas feed for R") for r in out_rows)
    basis["flows_missing"] = flows_missing
    # The export has no flows and the Run Plan DOE has no gas flows: the gas feed is missing
    basis["flows_needed"] = not has_tags and not doe
    basis["argon_missing"] = bool(missing)
    return {"unit": unit, "label": UNITS[unit]["label"], "columns": columns, "rows": out_rows, "basis": basis,
            "components": components, "ok_count": ok, "error_count": len(out_rows) - ok}
