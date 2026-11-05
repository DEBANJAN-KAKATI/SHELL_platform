# Implementation plan — remove the "no gas feed to Rr (01i14FIC0r = empty)" errors (6.4.2 → 6.4.3)

## 1. The problem (from the screenshot)

| What you see | Cause |
|---|---|
| Every line: `ERROR: no gas feed to R1 (01i14FIC01 = empty)` | The GC export (e.g. `R3-C2-S1_9-06-23.txt`) has the GC columns but **no gas flow columns** (`01i14FIC01…08`, `01i14FI01`). 6.4.2 only takes the gas feed from the export line. |
| No **Ethylene** column in the table | The GC method writes `ESTD_Etylene`; 6.4.2 does not know that name. |
| Mass flows need Ar in the feed gas, but the Run Plan's gas is not read | Run Plans of the earlier template keep the gas in a "Gas composition (mol%)" block; 6.4.2 reads only the template's `tbl_gas`. |
| First line `ERROR: no reactor (bypass …)` | Correct — `Sampled_reactor = 0` (bypass). This one stays. |

## 2. The solution in one picture

```
gas feed of a GC line  =  export line (01i14FIC0r, 01i14FI01)          ← as before
                       →  else values typed per reactor (R1–R8 NmL/h)   ← like the workbook's Gas!B11:I11 (+ E5)
                       →  else Run Plan DOE flow of the running condition
argon to reactor r     =  01i14FI01 · FIC_r/ΣFIC · w_Ar                 (when 01i14FI01 and Ar wt% are known — workbook)
                       =  FIC_r/1000 / 22.414 · Ar mol%/100 · 39.948     (otherwise — moles of Ar × MW_Ar)
mass flow m_i          =  y_i · MW_i / (y_Ar · 39.948) · F_Ar,r         (unchanged)
```

Result with `R3-C2-S1_9-06-23.txt`, Ar 5 mol% and 3000 NmL/h per reactor: **44 lines calculated, 2 ERROR**
(bypass + empty GC line); Flow source "entered, molar volume".

## 3. Before you start (10 min)

1. Close the dashboard; back up the folder (`ILS_App\backups\<date>_before_6.4.3\`).
2. Your version must be **6.4.2** (`VERSION` file, menu bar shows v6.4.2).
3. Fastest route: copy `files/` of `ILS_6.4.3_Online_gas_feed_update.zip` over the folder (or
   `git apply --binary --whitespace=nowarn ILS_6.4.2_to_6.4.3.patch`) and go to **Phase 6**. Use Phases 1–5 when you
   implement by hand or have changed these files yourself. `-` lines are removed, `+` lines added.

---

## Phase 1 — Backend: the conversion (`backend/services/online_units.py`)

**Goal:** find the gas feed of each line in the order export → entered → Run Plan DOE, calculate the Ar flow from the
volume when there is no `01i14FI01`, read `Etylene` as Ethylene, and report what is missing.

Steps:
1. Module docstring: describe the two Ar routes and the three flow sources.
2. Add `ALIASES = {"Etylene": "Ethylene"}` and `MOLAR_VOLUME = 22.414` (Nl/mol at 0 °C — the normal litre of NmL/h).
3. Replace `_flows()` by `_line_flows()` (returns `None` when the export line has no `FIC_r`), add `doe_gas_flows()`
   (DOE rows → reactor, start, end, NmL/h; template "Total gas (Nl/h)" × 1000, older "Gas Flow (NmL/h)") and
   `_doe_flow()` (condition running at that time, start ≤ t < end; open end = until the next one).
4. `convert_online_rows(...)` gets the arguments `gas_feed`, `total_feed_g_h`, `molar_volume`, `doe_rows`:
   * Ar check: mass/carbon need Ar mol% **or** wt%; volume needs Ar mol%;
   * components: map aliases; a component can come from `ESTD_Etylene` or `ESTD_Ethylene`;
   * per line: flow source export → entered → DOE; status `ERROR: no gas feed for Rr (not in the export) – enter it
     under Conversion basis` when none; Ar route 1 or 2; new column **Flow source**;
   * mass/carbon extras: "Gas feed to reactor [NmL/h]";
   * `basis`: `molar_volume`, `export_has_flows`, `entered_flows`, `doe_flows`, `flow_sources`, `flows_missing`,
     `flows_needed`, `argon_missing` (the page uses them to open the Conversion basis block).

```diff
--- a/backend/services/online_units.py
+++ b/backend/services/online_units.py
@@ -4,6 +4,9 @@ The formulas follow the MassBal workbook (Ver2.2, sheets R#_MB, Gas, Run_Plan);
 
 * Gas feed to reactor r   F_r [g/h]   = 01i14FI01 · V_r / ΣV            (Gas!B12; V = 01i14FIC01..08 [NmL/h])
 * Argon to reactor r      F_Ar,r      = F_r · w_Ar / 100                (Gas!G20; w_Ar = Ar wt% of the feed gas, Gas!I37)
+                          without 01i14FI01: F_Ar,r = V_r/1000 / Vm · y_Ar,feed/100 · 39.948 (Vm = 22.414 Nl/mol)
+  V_r / 01i14FI01 come from the export line, else from the values entered per reactor (Gas!B11:I11, Gas!E5),
+  else from the Run Plan DOE condition running at that time ("Total gas (Nl/h)" / "Gas Flow (NmL/h)").
 * Mass flow               m_i [g/h]   = y_i·MW_i / (y_Ar·MW_Ar) · F_Ar,r (R#_MB rows 52-80)
 * Volumetric flow         V_i [Nl/h]  = y_i/100 · V_out,  V_out = V_r/1000 · y_Ar,feed / y_Ar   (R#_MB rows 86-116)
 * Carbon flow             C_i [g C/h] = 12.011 · nC_i / MW_i · m_i       (R#_MB rows 121-150, "TOS Carbon of Each Molecule")
@@ -11,8 +14,8 @@ The formulas follow the MassBal workbook (Ver2.2, sheets R#_MB, Gas, Run_Plan);
 y = ESTD mol% of the GC injection (not normalised, as in the workbook), y_Ar,feed = Ar mol% of the feed gas.
 R#_MB!D86 computes V_out as m_Ar / Gas!I35 · Gas!B11, which mixes g/h and NmL/h (3 Nl/h of feed gives 159.7 Nl/h);
 the argon balance above (feed volume × Ar in / Ar out) is what that row intends and is used here.
-Every row is calculated with the 01i14FI01 / 01i14FIC0r values of the same line (the workbook averages them over the
-sampling window). Rows that cannot be calculated get an explicit "ERROR: ..." status, never zero.
+With flows on the export, every row uses the 01i14FI01 / 01i14FIC0r values of the same line (the workbook averages them
+over the sampling window). Rows that cannot be calculated get an explicit "ERROR: ..." status, never zero.
 """
 from datetime import datetime
 
@@ -108,68 +111,137 @@ def feed_argon(feed_gas):
     return {"ar_mol_pct": ar_mol, "ar_wt_pct": wt, "excluded": excluded}
 
 
-def _flows(row, reactor):
-    """Total gas feed 01i14FI01 [g/h], reactor flow V_r and ΣV [NmL/h] of one line (01i14FIC0r, else 02i2FIC0r)."""
-    fi01 = _num(row.get("01i14FI01"))
+# Spellings of GC method peak names → the molecule (the export of some methods writes "Etylene")
+ALIASES = {"Etylene": "Ethylene"}
+MOLAR_VOLUME = 22.414          # Nl/mol at 0 °C, 1.01325 bar (normal conditions of NmL/h)
+
+
+def _line_flows(row, reactor):
+    """Total gas feed 01i14FI01 [g/h], reactor flow FIC_r and ΣFIC [NmL/h] written on the export line (else None)."""
     flows = []
     for k in range(1, 9):
         value = _num(row.get(f"01i14FIC0{k}"))
         if value is None:
             value = _num(row.get(f"02i2FIC0{k}"))
         flows.append(value)
-    total = sum(v for v in flows if v and v > 0)
-    return fi01, flows[reactor - 1], total
+    if flows[reactor - 1] is None:
+        return None
+    return _num(row.get("01i14FI01")), flows[reactor - 1], sum(v for v in flows if v and v > 0)
+
+
+def doe_gas_flows(doe_rows):
+    """Gas feed per reactor and condition from the Run Plan DOE: [(reactor, start, end, NmL/h)].
+
+    Universal template: "Total gas (Nl/h)"; older RunPlan.xlsx: "Gas Flow (NmL/h)".
+    """
+    out = []
+    for row in doe_rows or []:
+        reactor = reactor_number(row.get("Reactor ID"))
+        if not reactor:
+            continue
+        value = None
+        for key, raw in row.items():
+            label = " ".join(str(key).split()).lower()
+            if label.startswith("total gas") and "nl/h" in label:
+                value = _num(raw) * 1000 if _num(raw) is not None else None
+            elif label.startswith("gas flow") and "nml/h" in label:
+                value = _num(raw)
+            if value is not None:
+                break
+        start, end = _date(row.get("Start Date")), _date(row.get("End Date"))
+        if value is not None and start:
+            out.append((reactor, start, end, value))
+    return out
+
 
+def _doe_flow(doe, reactor, when):
+    """NmL/h of the DOE condition running for this reactor at this time (start ≤ time < end)."""
+    if not when:
+        return None
+    hits = [v for r, start, end, v in doe if r == reactor and start <= when and (end is None or when < end)]
+    return hits[-1] if hits else None
+
+
+def convert_online_rows(rows, unit, feed_gas=None, ar_mol_pct=None, ar_wt_pct=None, feed_cut_in=None,
+                        gas_feed=None, total_feed_g_h=None, molar_volume=None, doe_rows=None):
+    """Rows of the Online Analysis table (DateTime, Reactor, ESTD_*, flows) in the chosen unit.
 
-def convert_online_rows(rows, unit, feed_gas=None, ar_mol_pct=None, ar_wt_pct=None, feed_cut_in=None):
-    """Rows of the Online Analysis table (DateTime, Reactor, ESTD_*, 01i14FI01, 01i14FIC0r) in the chosen unit."""
+    Gas feed of a line, in this order: the export line (01i14FIC0r, 01i14FI01) → the values entered per reactor
+    (`gas_feed` {"R1": NmL/h, ...}, `total_feed_g_h` = 01i14FI01) → the Run Plan DOE condition running at that time.
+    Argon to the reactor: with 01i14FI01 and the Ar wt% as in the workbook (F_r · w_Ar); without 01i14FI01 from the
+    volume: FIC_r/1000 / molar volume · y_Ar,feed/100 · 39.948 (the same quantity: n_Ar · MW_Ar).
+    """
     if unit not in UNITS or unit == "mol":
         raise ValueError(f"Unknown unit '{unit}'. Use one of: mass, volume, carbon.")
     suffix = UNITS[unit]["suffix"]
     feed = feed_argon(feed_gas)
     ar_mol = _num(ar_mol_pct) if _num(ar_mol_pct) else feed["ar_mol_pct"]
     ar_wt = _num(ar_wt_pct) if _num(ar_wt_pct) else feed["ar_wt_pct"]
+    vm = _num(molar_volume) or MOLAR_VOLUME
+    entered = {}
+    for key, value in (gas_feed or {}).items():
+        reactor = reactor_number(key)
+        if reactor and _num(value) is not None:
+            entered[reactor] = _num(value)
+    entered_total = _num(total_feed_g_h)
+    doe = doe_gas_flows(doe_rows)
+    has_tags = any(_num(r.get(f"01i14FIC0{k}")) is not None or _num(r.get(f"02i2FIC0{k}")) is not None
+                   for r in rows or [] for k in range(1, 9))
     basis = {"unit": unit, "label": UNITS[unit]["label"], "ar_feed_mol_pct": ar_mol, "ar_feed_wt_pct": ar_wt,
              "ar_source": "entered" if (_num(ar_wt_pct) or _num(ar_mol_pct)) else "Run Plan feed gas",
-             "excluded_feed_gas": feed["excluded"]}
+             "excluded_feed_gas": feed["excluded"], "molar_volume": vm, "export_has_flows": has_tags,
+             "entered_flows": {f"R{k}": v for k, v in sorted(entered.items())}, "entered_total_g_h": entered_total,
+             "doe_flows": len(doe)}
     missing = None
-    if unit in ("mass", "carbon") and not ar_wt:
-        missing = "ERROR: Ar wt% of the feed gas is not set (Run Plan Feed → Gas feed composition, or enter it)"
     if unit == "volume" and not ar_mol:
         missing = "ERROR: Ar mol% of the feed gas is not set (Run Plan Feed → Gas feed composition, or enter it)"
+    if unit in ("mass", "carbon") and not ar_mol and not ar_wt:
+        missing = "ERROR: Ar in the feed gas is not set (Run Plan Feed → Gas feed composition, or enter mol% / wt%)"
 
     present = []
     for row in rows or []:
         for key in row:
-            if key.startswith("ESTD_") and key[5:] not in present:
-                present.append(key[5:])
+            if key.startswith("ESTD_"):
+                name = ALIASES.get(key[5:], key[5:])
+                if name not in present:
+                    present.append(name)
     order = list(COMPONENTS) + sorted(NO_MW)
     names = [n for n in order if n in present] + [n for n in present if n not in COMPONENTS and n not in NO_MW]
     if unit == "carbon":           # only molecules that contain carbon
         names = [n for n in names if n in NO_MW or n not in COMPONENTS or COMPONENTS[n][1] > 0]
+    spelled = {n: [k for k, v in ALIASES.items() if v == n] + [n] for n in names}
+
+    def value_of(row, name):
+        for key in spelled[name]:
+            v = _num(row.get(f"ESTD_{key}"))
+            if v is not None:
+                return v
+        return None
+
     # Components that have a value in at least one row
-    names = [n for n in names if any(_num(r.get(f"ESTD_{n}")) is not None for r in rows or [])]
+    names = [n for n in names if any(value_of(r, n) is not None for r in rows or [])]
 
     times = [_date(r.get("DateTime")) for r in rows or []]
     t0 = _date(feed_cut_in) or min((t for t in times if t), default=None)
     basis["tos_zero"] = t0.strftime("%Y-%m-%d %H:%M:%S") if t0 else ""
     basis["tos_zero_source"] = "Run Plan Feed Cut-In" if _date(feed_cut_in) else "first record"
 
-    extra = {"mass": ["Gas feed to reactor [g/h]", "Ar to reactor [g/h]", "Total w/o Ar [g/h]"],
+    extra = {"mass": ["Gas feed to reactor [NmL/h]", "Ar to reactor [g/h]", "Total w/o Ar [g/h]"],
              "volume": ["Gas feed to reactor [Nl/h]", "Total out [Nl/h]"],
-             "carbon": ["Total C [g C/h]"]}[unit]
-    columns = ["DateTime", "TOS (h)", "Reactor", "Status"] + [f"{n} [{suffix}]" for n in names] + extra
+             "carbon": ["Gas feed to reactor [NmL/h]", "Total C [g C/h]"]}[unit]
+    columns = ["DateTime", "TOS (h)", "Reactor", "Status", "Flow source"] + [f"{n} [{suffix}]" for n in names] + extra
+    sources = {}
     out_rows = []
     for row, when in zip(rows or [], times):
         out = {"DateTime": row.get("DateTime"), "TOS (h)": round((when - t0).total_seconds() / 3600, 4) if when and t0 else None,
                "Reactor": row.get("Reactor")}
         for column in columns[4:]:
             out[column] = None
-        y = {n: _num(row.get(f"ESTD_{n}")) for n in names}
+        y = {n: value_of(row, n) for n in names}
         y_ar = _num(row.get("ESTD_Argon"))
         reactor = reactor_number(row.get("Reactor"))
-        status = "OK"
-        if all(v is None for v in y.values()) and y_ar is None:
+        status, flow = "OK", None
+        if all(v is None or v == 0 for v in y.values()) and not y_ar:
             status = "ERROR: no GC values in this line"
         elif missing:
             status = missing
@@ -178,19 +250,38 @@ def convert_online_rows(rows, unit, feed_gas=None, ar_mol_pct=None, ar_wt_pct=No
         elif not y_ar or y_ar <= 0:
             status = "ERROR: no argon peak (ESTD_Argon) – argon is the internal standard"
         else:
-            fi01, v_r, v_sum = _flows(row, reactor)
-            if not v_r or v_r <= 0 or not v_sum:
-                status = f"ERROR: no gas feed to R{reactor} (01i14FIC0{reactor} = {v_r if v_r is not None else 'empty'})"
-            elif unit != "volume" and (not fi01 or fi01 <= 0):
-                status = f"ERROR: no total gas feed (01i14FI01 = {fi01 if fi01 is not None else 'empty'})"
+            flow = _line_flows(row, reactor)
+            if flow is not None:
+                fi01, v_r, v_sum = flow
+                source = "export"
+            elif reactor in entered:
+                fi01, v_r, v_sum = entered_total, entered[reactor], sum(v for v in entered.values() if v > 0)
+                source = "entered"
+            else:
+                v_r = _doe_flow(doe, reactor, when)
+                fi01, source = None, "Run Plan DOE"
+                v_sum = sum(v for v in (_doe_flow(doe, k, when) for k in range(1, 9)) if v and v > 0) if v_r else 0
+            flow = (fi01, v_r, v_sum, source)
+            if v_r is None:
+                status = f"ERROR: no gas feed for R{reactor} (not in the export) – enter it under Conversion basis"
+            elif v_r <= 0 or not v_sum:
+                status = f"ERROR: no gas feed to R{reactor} ({source}: {v_r:g} NmL/h)"
+            elif unit != "volume" and not (fi01 and fi01 > 0 and ar_wt) and not ar_mol:
+                status = "ERROR: no total gas feed 01i14FI01 and no Ar mol% – enter Ar mol% (or 01i14FI01 and Ar wt%)"
         if status != "OK":
             out["Status"] = status
             out_rows.append(out)
             continue
 
-        fi01, v_r, v_sum = _flows(row, reactor)
-        feed_r = fi01 * v_r / v_sum if fi01 is not None else None
-        ar_r = feed_r * ar_wt / 100 if feed_r is not None and ar_wt else None
+        fi01, v_r, v_sum, source = flow
+        if unit != "volume" and fi01 and fi01 > 0 and ar_wt:
+            ar_r = fi01 * v_r / v_sum * ar_wt / 100            # workbook: Gas!G20 = 01i14FI01 · V_r/ΣV · w_Ar
+            route = f"{source}, 01i14FI01"
+        else:
+            ar_r = v_r / 1000 / vm * (ar_mol or 0) / 100 * MW_AR   # n_Ar · MW_Ar from the volumetric feed
+            route = f"{source}, molar volume" if unit != "volume" else source
+        sources[route] = sources.get(route, 0) + 1
+        out["Flow source"] = route
         v_out = v_r / 1000 * ar_mol / y_ar if ar_mol else None
         problems, total = [], 0.0
         for n in names:
@@ -216,17 +307,25 @@ def convert_online_rows(rows, unit, feed_gas=None, ar_mol_pct=None, ar_wt_pct=No
             out[f"{n} [{suffix}]"] = result
             total += result
         if unit == "mass":
-            out.update({"Gas feed to reactor [g/h]": feed_r, "Ar to reactor [g/h]": ar_r, "Total w/o Ar [g/h]": total})
+            out.update({"Gas feed to reactor [NmL/h]": v_r, "Ar to reactor [g/h]": ar_r, "Total w/o Ar [g/h]": total})
         elif unit == "volume":
             out.update({"Gas feed to reactor [Nl/h]": v_r / 1000, "Total out [Nl/h]": v_out})
         else:
-            out["Total C [g C/h]"] = total
+            out.update({"Gas feed to reactor [NmL/h]": v_r, "Total C [g C/h]": total})
         out["Status"] = "OK" if not problems else f"ERROR: no MW for {', '.join(problems)} (total without them)"
         out_rows.append(out)
 
+    basis["flow_sources"] = sources
     components = [{"component": n, "mw": COMPONENTS[n][0] if n in COMPONENTS else None,
                    "carbon_atoms": COMPONENTS[n][1] if n in COMPONENTS else None,
-                   "source": COMPONENTS[n][2] if n in COMPONENTS else "no MW (lumped peak)"} for n in names]
+                   "source": (COMPONENTS[n][2] if n in COMPONENTS else "no MW (lumped peak)")
+                             + (f"; export spelling {', '.join(k for k in spelled[n] if k != n)}" if len(spelled[n]) > 1 else "")}
+                  for n in names]
     ok = sum(1 for r in out_rows if r["Status"] == "OK")
+    flows_missing = any(r["Status"].startswith("ERROR: no gas feed for R") for r in out_rows)
+    basis["flows_missing"] = flows_missing
+    # The export has no flows and nothing was entered / found in the DOE: the gas feed is needed as well
+    basis["flows_needed"] = not has_tags and not entered and not doe
+    basis["argon_missing"] = bool(missing)
     return {"unit": unit, "label": UNITS[unit]["label"], "columns": columns, "rows": out_rows, "basis": basis,
             "components": components, "ok_count": ok, "error_count": len(out_rows) - ok}
```

**Check after Phase 1** (in the dashboard folder):
```
python -c "from backend.services.online_analysis_service import process_online_file as p; from backend.services.online_units import convert_online_rows as c; r=p('tests/fixtures/online/R3-C2-S1_9-06-23.txt')['rows']; o=c(r,'mass',ar_mol_pct=5,gas_feed={f'R{k}':3000 for k in range(1,9)}); print(o['ok_count'], o['error_count'])"
```
→ `44 2`

## Phase 2 — Backend: endpoint (`backend/routes/api.py`)

**Goal:** pass the new inputs from the page to the conversion.

```diff
--- a/backend/routes/api.py
+++ b/backend/routes/api.py
@@ -175,7 +175,9 @@ def online_units():
     try:
         return jsonify(convert_online_rows(
             body.get("rows") or [], body.get("unit"), feed_gas=body.get("feed_gas"),
-            ar_mol_pct=body.get("ar_mol_pct"), ar_wt_pct=body.get("ar_wt_pct"), feed_cut_in=body.get("feed_cut_in")))
+            ar_mol_pct=body.get("ar_mol_pct"), ar_wt_pct=body.get("ar_wt_pct"), feed_cut_in=body.get("feed_cut_in"),
+            gas_feed=body.get("gas_feed"), total_feed_g_h=body.get("total_feed_g_h"),
+            molar_volume=body.get("molar_volume"), doe_rows=body.get("doe_rows")))
     except Exception as e:
         return jsonify({"error": str(e)}), 400
 
```

## Phase 3 — Backend: Run Plan of the earlier layout (`backend/services/run_plan_template.py`)

**Goal:** Ar in feed gas from Run Plans whose Feed has a "Gas composition (mol%)" block (e.g. `RunPlan_R6-C1-S1_MassBalance.xlsx`).

Steps: in `parse_feed` (1) skip header rows inside the liquid range, (2) read the "Gas composition (mol%)" block
(component A, unit D, value E, until Total) when `tbl_gas` has no values, (3) accept "Gas feed" as the settings title and
stop the settings at the "Gas composition" row.

```diff
--- a/backend/services/run_plan_template.py
+++ b/backend/services/run_plan_template.py
@@ -311,6 +311,8 @@ def parse_feed(ws_values, ws_formulas=None):
         if label.lower() == "total":
             liquid_total, liquid_check = number(r[4]), clean(r[5])
             continue
+        if label.lower().startswith("component") or _label(r[4] if len(r) > 4 else "").lower() == "weight":
+            continue                                     # header rows inside the range (earlier template layout)
         liquid.append({"component": label, "carbon_no": clean(r[1]), "type": clean(r[2]), "unit": clean(r[3]) or "wt%",
                        "weight": clean(r[4]), "mw": clean(r[5])})
     weights = [number(x["weight"]) for x in liquid if number(x["weight"]) is not None]
@@ -326,13 +328,28 @@ def parse_feed(ws_values, ws_formulas=None):
     gas_block, _, _ = _block(rows, ranges["tbl_gas"])
     gas = [{"component": _label(r[0]), "unit": clean(r[1]) or "mol%", "value": clean(r[2]), "check": clean(r[3])} for r in gas_block]
     gas_values = [number(g["value"]) for g in gas if number(g["value"]) is not None]
+    if not gas_values:
+        # Earlier template layout: a "Gas composition (mol%)" block under "Gas feed" (component A, unit D, value E).
+        start = next((i for i, r in enumerate(rows) if r and _label(r[0]).lower().startswith("gas composition")), None)
+        if start is not None:
+            legacy = []
+            for r in rows[start + 1:]:
+                label = _label(r[0]) if r else ""
+                if not label or label.lower() == "total":
+                    break
+                legacy.append({"component": label, "unit": (clean(r[3]) if len(r) > 3 else "") or "mol%",
+                               "value": clean(r[4]) if len(r) > 4 else "", "check": ""})
+            if any(number(g["value"]) is not None for g in legacy):
+                gas = legacy
+                gas_values = [number(g["value"]) for g in gas if number(g["value"]) is not None]
     gas_total = sum(gas_values) if gas_values else None
 
-    settings, start = [], next((i for i, r in enumerate(rows) if r and _label(r[0]).lower() == "gas feed settings"), None)
+    settings, start = [], next((i for i, r in enumerate(rows)                # "Gas feed settings" (template), "Gas feed"
+                                if r and _label(r[0]).lower() in ("gas feed settings", "gas feed")), None)
     if start is not None:
         for i in range(start + 1, len(rows)):
             label = _label(rows[i][0]) if rows[i] else ""
-            if not label:
+            if not label or label.lower().startswith("gas composition"):
                 break
             settings.append({"label": label, "unit": clean(rows[i][3]) if len(rows[i]) > 3 else "",
                              "value": clean(rows[i][4]) if len(rows[i]) > 4 else "", "note": note(i)})
```

**Check:** load the R6 Run Plan on the Run Plan page → Feed → Gas feed composition shows Argon 5, Hydrogen 19.859 …

## Phase 4 — Frontend: inputs on the Online Analysis page (`frontend/online_analysis.html`, `frontend/css/online_units.css`)

**Goal:** a "Gas feed" part in the Conversion basis block: R1–R8 (NmL/h), total `01i14FI01` (g/h, optional), molar volume.
Bump the cache-busters so browsers load the new files.

```diff
--- a/frontend/online_analysis.html
+++ b/frontend/online_analysis.html
@@ -8,8 +8,8 @@
     <link href="/frontend/css/dashboard.css" rel="stylesheet">
     <link href="/frontend/css/claude-theme.css" rel="stylesheet">
     <script src="/frontend/js/navigation.js?v=3" defer></script>
-    <link href="/frontend/css/online_units.css?v=1" rel="stylesheet">
-    <script src="/frontend/js/online_analysis.js?v=4" defer></script>
+    <link href="/frontend/css/online_units.css?v=2" rel="stylesheet">
+    <script src="/frontend/js/online_analysis.js?v=5" defer></script>
     <script src="/frontend/js/reforming_sync.js?v=1" defer></script>
 </head>
 
@@ -104,6 +104,24 @@
                             <label>Ar in feed gas <small>wt%</small><input class="input" id="onlineArWt" type="number" step="any" min="0" placeholder="Run Plan"></label>
                             <span class="online-units-basis" id="onlineUnitsBasis"></span>
                         </div>
+                        <div class="online-units-flows" id="onlineFlowInputs">
+                            <div class="online-units-title">Gas feed (used when the export has no 01i14FIC0r / 01i14FI01 columns, like the workbook's Gas sheet)</div>
+                            <div class="online-units-inputs">
+                                <label>R1 <small>NmL/h</small><input class="input online-flow" data-reactor="R1" type="number" step="any" min="0"></label>
+                                <label>R2 <small>NmL/h</small><input class="input online-flow" data-reactor="R2" type="number" step="any" min="0"></label>
+                                <label>R3 <small>NmL/h</small><input class="input online-flow" data-reactor="R3" type="number" step="any" min="0"></label>
+                                <label>R4 <small>NmL/h</small><input class="input online-flow" data-reactor="R4" type="number" step="any" min="0"></label>
+                                <label>R5 <small>NmL/h</small><input class="input online-flow" data-reactor="R5" type="number" step="any" min="0"></label>
+                                <label>R6 <small>NmL/h</small><input class="input online-flow" data-reactor="R6" type="number" step="any" min="0"></label>
+                                <label>R7 <small>NmL/h</small><input class="input online-flow" data-reactor="R7" type="number" step="any" min="0"></label>
+                                <label>R8 <small>NmL/h</small><input class="input online-flow" data-reactor="R8" type="number" step="any" min="0"></label>
+                            </div>
+                            <div class="online-units-inputs">
+                                <label>Total gas feed 01i14FI01 <small>g/h (optional)</small><input class="input" id="onlineFi01" type="number" step="any" min="0" placeholder="not used"></label>
+                                <label>Molar volume <small>Nl/mol</small><input class="input" id="onlineVm" type="number" step="any" min="0" placeholder="22.414 (0 °C)"></label>
+                                <span class="online-units-basis" id="onlineFlowNote"></span>
+                            </div>
+                        </div>
                         <div class="online-units-formula" id="onlineUnitsFormula"></div>
                         <div class="online-units-mw">
                             <div class="online-units-title">Molecular weights used (experimental standards of the MassBal workbook)</div>
```

```diff
--- a/frontend/css/online_units.css
+++ b/frontend/css/online_units.css
@@ -18,3 +18,7 @@
 .online-units-bar summary{cursor:pointer;font-size:12px;color:var(--slate);list-style-position:inside}
 .online-units-bar:not([open]){padding:9px 15px}
 .online-units-title{font-size:12px;font-weight:700;color:var(--burnt)}
+.online-units-flows{display:grid;gap:8px;padding-top:6px;border-top:1px dashed var(--border)}
+.online-units-flows .online-flow{width:110px}
+.online-units-bar.needs-input{border-left-color:#991b1b}
+.online-units-bar.needs-input summary .online-units-title{color:#991b1b}
```

## Phase 5 — Frontend: page logic (`frontend/js/online_analysis.js`)

**Goal:** keep the new inputs (saved in `dhaOnlineState`), send them and the Run Plan DOE rows to `/api/online-units`,
show where the flows came from, open the block (red title) when Ar or the gas feed is missing.

Steps: (1) state `gasFeed`, `fi01`, `molarVolume`; (2) mass formula text with the second Ar route; (3) `onlineRunPlanContext()`
also returns the DOE rows (Reactor ID, Start/End Date, Total gas / Gas Flow); (4) the request sends `gas_feed`,
`total_feed_g_h`, `molar_volume`, `doe_rows`; (5) `renderUnitsBar()` fills the inputs, writes the flow note, opens the block
when something is missing and puts "… missing – enter it here" in its summary; (6) save / restore the new state;
(7) input handlers for all fields (recalculate 0.4 s after typing).

```diff
--- a/frontend/js/online_analysis.js
+++ b/frontend/js/online_analysis.js
@@ -11,7 +11,10 @@ const onlineState = {
     converted: null,
     hiddenConverted: [],
     arMol: '',
-    arWt: ''
+    arWt: '',
+    gasFeed: {},
+    fi01: '',
+    molarVolume: ''
 };
 const online$ = (selector) => document.querySelector(selector);
 const formatOnlineValue = (value) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : (value ?? '');
@@ -151,9 +154,9 @@ function applyReactorMapMapping(rows, reactorRows) {
 
 // ---------------------------------------------------------------- Units (mol% → g/h, Nl/h, g C/h)
 const ONLINE_UNIT_FORMULAS = {
-    mass: 'm_i [g/h] = y_i·MW_i / (y_Ar·39.948) · F_Ar,r   with   F_Ar,r = 01i14FI01 · FIC_r / ΣFIC · w_Ar   (y = ESTD mol%)',
+    mass: 'm_i [g/h] = y_i·MW_i / (y_Ar·39.948) · F_Ar,r   with   F_Ar,r = 01i14FI01 · FIC_r / ΣFIC · w_Ar,   or without 01i14FI01: F_Ar,r = FIC_r/1000 / Vm · y_Ar,feed/100 · 39.948   (y = ESTD mol%)',
     volume: 'V_i [Nl/h] = y_i/100 · V_out   with   V_out = FIC_r[NmL/h]/1000 · y_Ar,feed / y_Ar   (argon balance)',
-    carbon: 'C_i [g C/h] = 12.011 · nC_i / MW_i · m_i   (carbon of each molecule over TOS)',
+    carbon: 'C_i [g C/h] = 12.011 · nC_i / MW_i · m_i   (carbon of each molecule over TOS; m_i as for the mass flow rates)',
 };
 const escOnline = (value) => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
 
@@ -173,9 +176,12 @@ function onlineRunPlanContext() {
         const rp = JSON.parse(sessionStorage.getItem('runPlanDashboardState') || 'null') || {};
         const info = rp.planData?.info || [];
         const cutIn = info.find(i => String(i.parameter).trim().toLowerCase() === 'feed cut-in')?.value || '';
-        return { feedGas: rp.feedTables?.gas?.rows || [], feedCutIn: cutIn };
+        // DOE gas flow per reactor and condition (template "Total gas (Nl/h)", older files "Gas Flow (NmL/h)")
+        const doeRows = (rp.doeData?.rows || []).map(row => Object.fromEntries(Object.entries(row).filter(([key]) =>
+            /^(Reactor ID|Start Date|End Date)$/.test(key) || /^total gas/i.test(key) || /^gas flow/i.test(key))));
+        return { feedGas: rp.feedTables?.gas?.rows || [], feedCutIn: cutIn, doeRows };
     } catch (e) {
-        return { feedGas: [], feedCutIn: '' };
+        return { feedGas: [], feedCutIn: '', doeRows: [] };
     }
 }
 
@@ -204,6 +210,10 @@ async function refreshOnlineUnits() {
                 unit, rows: compactUnitRows(onlineState.rows), feed_gas: ctx.feedGas, feed_cut_in: ctx.feedCutIn,
                 ar_mol_pct: onlineState.arMol === '' ? null : Number(onlineState.arMol),
                 ar_wt_pct: onlineState.arWt === '' ? null : Number(onlineState.arWt),
+                gas_feed: Object.fromEntries(Object.entries(onlineState.gasFeed).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
+                total_feed_g_h: onlineState.fi01 === '' ? null : Number(onlineState.fi01),
+                molar_volume: onlineState.molarVolume === '' ? null : Number(onlineState.molarVolume),
+                doe_rows: ctx.doeRows,
             }),
         });
         const data = await onlineJson(response);
@@ -234,6 +244,12 @@ function renderUnitsBar() {
     const arMol = online$('#onlineArMol'), arWt = online$('#onlineArWt');
     if (arMol && document.activeElement !== arMol) arMol.value = onlineState.arMol;
     if (arWt && document.activeElement !== arWt) arWt.value = onlineState.arWt;
+    document.querySelectorAll('.online-flow').forEach((input) => {
+        if (document.activeElement !== input) input.value = onlineState.gasFeed[input.dataset.reactor] ?? '';
+    });
+    const fi01 = online$('#onlineFi01'), vm = online$('#onlineVm');
+    if (fi01 && document.activeElement !== fi01) fi01.value = onlineState.fi01;
+    if (vm && document.activeElement !== vm) vm.value = onlineState.molarVolume;
     const fromPlan = basis.ar_source !== 'entered';
     if (arMol) arMol.placeholder = basis.ar_feed_mol_pct != null && fromPlan ? `${formatBasisValue(basis.ar_feed_mol_pct)} (Run Plan)` : 'Run Plan';
     if (arWt) arWt.placeholder = basis.ar_feed_wt_pct != null && fromPlan ? `${formatBasisValue(basis.ar_feed_wt_pct)} (Run Plan)` : 'Run Plan';
@@ -249,9 +265,21 @@ function renderUnitsBar() {
         parts.push(onlineState.rows.length ? 'Converting…' : 'Import a SystemTxt file first.');
     }
     online$('#onlineUnitsBasis').innerHTML = parts.join(' · ');
+    // Gas feed: where the flows of the calculated lines came from, and what is missing
+    const sources = Object.entries(basis.flow_sources || {}).map(([k, n]) => `${escOnline(k)}: ${n}`).join(', ');
+    const flowNote = [];
+    if (data && !basis.export_has_flows) flowNote.push('This export has no gas flow columns.');
+    if (basis.doe_flows) flowNote.push(`Run Plan DOE gas flows: ${basis.doe_flows} rows`);
+    if (sources) flowNote.push(`Flow source of the calculated lines – ${sources}`);
+    if (basis.flows_missing || basis.flows_needed) flowNote.push('<span class="online-cell-error">Enter the gas feed of the reactors (NmL/h), or load a Run Plan with DOE gas flows.</span>');
+    online$('#onlineFlowNote').innerHTML = flowNote.join(' · ');
+    const missingInputs = [basis.argon_missing ? 'Ar in feed gas' : '', (basis.flows_missing || basis.flows_needed) ? 'gas feed per reactor' : ''].filter(Boolean);
+    bar.classList.toggle('needs-input', missingInputs.length > 0);
+    if (missingInputs.length && !bar.dataset.autoOpened) { bar.open = true; bar.dataset.autoOpened = '1'; }
     // One line on the closed block: Ar basis and how many lines could be calculated
     online$('#onlineUnitsSummary').innerHTML = data
-        ? `· Ar ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
+        ? (missingInputs.length ? `· <span class="online-cell-error">${missingInputs.join(' and ')} missing – enter it here</span> ` : '')
+          + `· Ar ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
           + `${basis.ar_feed_wt_pct != null ? formatBasisValue(basis.ar_feed_wt_pct) + ' wt%' : '–'} · ${data.ok_count} calculated`
           + (data.error_count ? `, <span class="online-cell-error">${data.error_count} ERROR</span>` : '')
         : '';
@@ -309,6 +337,9 @@ function saveOnlineState() {
             hiddenConverted: onlineState.hiddenConverted,
             arMol: onlineState.arMol,
             arWt: onlineState.arWt,
+            gasFeed: onlineState.gasFeed,
+            fi01: onlineState.fi01,
+            molarVolume: onlineState.molarVolume,
             path: online$('#onlineFile').value,
             summary: online$('#onlineSummary').textContent,
             from: from,
@@ -335,6 +366,9 @@ function restoreOnlineState() {
             if (Array.isArray(saved.hiddenConverted)) onlineState.hiddenConverted = saved.hiddenConverted;
             onlineState.arMol = saved.arMol ?? '';
             onlineState.arWt = saved.arWt ?? '';
+            onlineState.gasFeed = saved.gasFeed && typeof saved.gasFeed === 'object' ? saved.gasFeed : {};
+            onlineState.fi01 = saved.fi01 ?? '';
+            onlineState.molarVolume = saved.molarVolume ?? '';
             if (Array.isArray(saved.rows)) onlineState.rows = saved.rows;
             if (Array.isArray(saved.columns)) onlineState.columns = saved.columns;
             onlineState.allColumns = Array.isArray(saved.allColumns) ? saved.allColumns : [...onlineState.columns];
@@ -552,14 +586,23 @@ if (online$('#onlineUnit')) online$('#onlineUnit').onchange = () => {
     refreshOnlineUnits();
 };
 let unitInputTimer = null;
-['#onlineArMol', '#onlineArWt'].forEach((selector) => {
+const unitInputs = { '#onlineArMol': 'arMol', '#onlineArWt': 'arWt', '#onlineFi01': 'fi01', '#onlineVm': 'molarVolume' };
+const scheduleUnits = () => {
+    saveOnlineState();
+    clearTimeout(unitInputTimer);
+    unitInputTimer = setTimeout(refreshOnlineUnits, 400);
+};
+Object.entries(unitInputs).forEach(([selector, key]) => {
     const input = online$(selector);
     if (!input) return;
+    input.oninput = () => { onlineState[key] = input.value.trim(); scheduleUnits(); };
+});
+document.querySelectorAll('.online-flow').forEach((input) => {
     input.oninput = () => {
-        onlineState[selector === '#onlineArMol' ? 'arMol' : 'arWt'] = input.value.trim();
-        saveOnlineState();
-        clearTimeout(unitInputTimer);
-        unitInputTimer = setTimeout(refreshOnlineUnits, 400);
+        const value = input.value.trim();
+        if (value === '') delete onlineState.gasFeed[input.dataset.reactor];
+        else onlineState.gasFeed[input.dataset.reactor] = value;
+        scheduleUnits();
     };
 });
 online$('#onlineReactorFilter').onchange = renderOnlineTable;
```

## Phase 6 — Version, documents, tests

1. `VERSION` → `6.4.3`; add the 6.4.3 entries to `CHANGELOG.md`, `ILS.md`, `README.md` (texts in `files/`).
2. Copy the new test files: `tests/fixtures/online/R3-C2-S1_9-06-23.txt`,
   `tests/fixtures/run_plan/RunPlan_R6-C1-S1_MassBalance.xlsx`, and `tests/test_online_units.py` (new tests: export
   without flows, entered gas feed, both Ar routes agree, DOE gas feed, R6 Run Plan).
3. `python -m pytest -q` → **25 passed**.

## Phase 7 — Acceptance test in the browser

| # | Action | Expected |
|---|---|---|
| 1 | `run_dashboard.bat`, Ctrl+F5 | menu bar **v6.4.3** |
| 2 | Run Plan: load `RunPlan_R6-C1-S1_MassBalance.xlsx` | Feed → Gas feed composition: Argon 5, red badge "93.041 mol% · Not 100" |
| 3 | Online: import `R3-C2-S1_9-06-23.txt`, Units = Mass flow rates | Conversion basis opens (red): "gas feed per reactor missing – enter it here"; lines `ERROR: no gas feed for Rr (not in the export) …` |
| 4 | Type 3000 in R1…R8 (Ar 5 mol% if no Run Plan is loaded) | "44 calculated, 2 ERROR"; Flow source "entered, molar volume"; **Ethylene [g/h]** column present |
| 5 | Line 08.06.2023 18:09:40 (R2) | Methane 0.00002768, Ethane 0.0000947, Ethylene 0.0008201 g/h |
| 6 | Units = Carbon / Volumetric | same lines OK; Volumetric: Total out ≈ 2.97 Nl/h for 3 Nl/h feed |
| 7 | Reload the page | unit, entered flows and Ar kept |
| 8 | Units = Normalised mol% | original table, block hidden |

## Phase 8 — Rollback

Copy the backup folder back (Step 3.1). No data files or settings are changed by this update.

## Notes for the Run Plan

* Ar in feed gas: the MassBal workbook uses the **verified** Ar (Gas!I35, e.g. 4.3 mol%); a Run Plan with the target
  (5 mol%) gives 16.8 % higher flows. Put the verified value in the Run Plan gas composition or type it on the page.
* Gas flows from the Run Plan DOE: a condition is used from its start date; without a duration (or end) it counts until
  the end of the data, so enter the durations when the flows change between conditions. Conditions without a start date are not used.
* The liquid (C, H, MW of the liquid) is **not** a Run Plan entry — it comes later with the liquid product data.
