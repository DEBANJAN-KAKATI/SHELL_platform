# Implementation plan 6.4.2 → 6.4.3 — Online Analysis units from the export and the Run Plan

Removes the errors `ERROR: no gas feed to Rr (01i14FIC0r = empty)` and the Ar input fields of the Conversion basis
block. Code blocks are the tested patch (`-` removed, `+` added). Fastest route: copy `files/` and go to Phase 6.

## What 6.4.3 does

| Problem in 6.4.2 (your screenshots) | 6.4.3 |
|---|---|
| Every line `ERROR: no gas feed to Rr (01i14FIC0r = empty)` — the GC export has no gas flow columns | The gas feed of a line comes from the export line, else from the **Run Plan DOE**: the gas flow of the condition running for that reactor at that time (`Total gas (Nl/h)`, older Run Plans `Gas Flow (NmL/h)`) |
| Ar mol% / wt% had to be typed in the Conversion basis block | **Removed.** Ar in the feed gas comes **only from the Run Plan** (Feed → Gas feed composition, Argon mol%) |
| `Etylene – no MW (lumped peak)`, no Ethylene column | `ESTD_Etylene` is read as **Ethylene** |
| The R6 Run Plan's gas is not read | The "Gas composition (mol%)" block of the earlier template layout is read as the Gas feed composition |
| — | Without `01i14FI01` the Ar flow is `FIC_r/1000 / 22.414 × Ar mol%/100 × 39.948` (moles of Ar × MW_Ar; agrees with the workbook's `01i14FI01 × FIC_r/ΣFIC × w_Ar` within 1 %) |
| — | New column **Flow source** (`export`, `Run Plan DOE`, `…, 01i14FI01` / `…, molar volume`) |
| — | The Conversion basis block is **read-only**; it opens in red and says what is missing in the Run Plan |

Formulas (unchanged): `m_i = y_i·MW_i/(y_Ar·39.948)·F_Ar,r`, `V_out = FIC_r/1000 · y_Ar,feed/y_Ar`, `V_i = y_i/100 · V_out`,
`C_i = 12.011·nC_i/MW_i·m_i`; MWs = experimental standards of the MassBal workbook.

## What the Run Plan must contain

| For | Run Plan entry |
|---|---|
| Ar in feed gas | Feed → Gas feed composition: **Argon mol%** (use the **verified** value, e.g. 4.3 mol% as the MassBal workbook's Gas!I35; the target 5 mol% gives 16.8 % higher flows) and the mixed-gas components |
| Gas feed when the GC export has no flow columns | DOE: per condition the **start date**, the **duration** (or end) and the gas flow ("Total gas (Nl/h)", from LHSV and GoR) for every reactor. A condition without an end counts until the next one; without a start date it is not used |
| TOS zero | DOE condition 1 start (Feed Cut-In) |
| *not needed* | Liquid feed C / H / MW — comes later with the liquid product data |

---

## Phase 1 — `backend/services/online_units.py` (conversion)
1. Docstring: Ar from the Run Plan; gas feed from the export, else the Run Plan DOE.
2. `ALIASES = {"Etylene": "Ethylene"}`, `MOLAR_VOLUME = 22.414`.
3. `_flows()` → `_line_flows()` (None when the export line has no FIC_r); new `doe_gas_flows()` and `_doe_flow()`.
4. `convert_online_rows(rows, unit, feed_gas, feed_cut_in, doe_rows, ar_mol_pct=None, ar_wt_pct=None)` — the two
   `ar_…` arguments are for scripts/tests only; the page does not send them. Per line: export → Run Plan DOE; Ar route
   with `01i14FI01` (workbook) or from the volume; column "Flow source"; Run-Plan error messages;
   `basis.flows_missing / flows_needed / argon_missing / flow_sources / doe_flows / export_has_flows`.

```diff
--- a/backend/services/online_units.py
+++ b/backend/services/online_units.py
@@ -4,6 +4,9 @@ The formulas follow the MassBal workbook (Ver2.2, sheets R#_MB, Gas, Run_Plan);
 
 * Gas feed to reactor r   F_r [g/h]   = 01i14FI01 · V_r / ΣV            (Gas!B12; V = 01i14FIC01..08 [NmL/h])
 * Argon to reactor r      F_Ar,r      = F_r · w_Ar / 100                (Gas!G20; w_Ar = Ar wt% of the feed gas, Gas!I37)
+                          without 01i14FI01: F_Ar,r = V_r/1000 / Vm · y_Ar,feed/100 · 39.948 (Vm = 22.414 Nl/mol)
+  V_r / 01i14FI01 come from the export line, else from the Run Plan DOE condition running at that time
+  ("Total gas (Nl/h)" / "Gas Flow (NmL/h)"). Ar in the feed gas comes from the Run Plan (Feed → Gas feed composition).
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
 
@@ -108,68 +111,131 @@ def feed_argon(feed_gas):
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
+def convert_online_rows(rows, unit, feed_gas=None, feed_cut_in=None, doe_rows=None, ar_mol_pct=None, ar_wt_pct=None):
+    """Rows of the Online Analysis table (DateTime, Reactor, ESTD_*, flows) in the chosen unit.
 
-def convert_online_rows(rows, unit, feed_gas=None, ar_mol_pct=None, ar_wt_pct=None, feed_cut_in=None):
-    """Rows of the Online Analysis table (DateTime, Reactor, ESTD_*, 01i14FI01, 01i14FIC0r) in the chosen unit."""
+    Everything comes from the export and the Run Plan: Ar in the feed gas from `feed_gas` (Run Plan Feed → Gas feed
+    composition), the gas feed of a line from the export line (01i14FIC0r, 01i14FI01), else from the Run Plan DOE
+    condition running at that time (`doe_rows`). `ar_mol_pct` / `ar_wt_pct` override the feed gas for scripts and tests
+    only (the page does not send them).
+    Argon to the reactor: with 01i14FI01 and the Ar wt% as in the workbook (F_r · w_Ar); without 01i14FI01 from the
+    volume: FIC_r/1000 / molar volume · y_Ar,feed/100 · 39.948 (the same quantity: n_Ar · MW_Ar).
+    """
     if unit not in UNITS or unit == "mol":
         raise ValueError(f"Unknown unit '{unit}'. Use one of: mass, volume, carbon.")
     suffix = UNITS[unit]["suffix"]
     feed = feed_argon(feed_gas)
     ar_mol = _num(ar_mol_pct) if _num(ar_mol_pct) else feed["ar_mol_pct"]
     ar_wt = _num(ar_wt_pct) if _num(ar_wt_pct) else feed["ar_wt_pct"]
+    vm = MOLAR_VOLUME
+    doe = doe_gas_flows(doe_rows)
+    has_tags = any(_num(r.get(f"01i14FIC0{k}")) is not None or _num(r.get(f"02i2FIC0{k}")) is not None
+                   for r in rows or [] for k in range(1, 9))
     basis = {"unit": unit, "label": UNITS[unit]["label"], "ar_feed_mol_pct": ar_mol, "ar_feed_wt_pct": ar_wt,
-             "ar_source": "entered" if (_num(ar_wt_pct) or _num(ar_mol_pct)) else "Run Plan feed gas",
-             "excluded_feed_gas": feed["excluded"]}
+             "ar_source": "override" if (_num(ar_wt_pct) or _num(ar_mol_pct)) else "Run Plan feed gas",
+             "excluded_feed_gas": feed["excluded"], "molar_volume": vm, "export_has_flows": has_tags,
+             "doe_flows": len(doe)}
     missing = None
-    if unit in ("mass", "carbon") and not ar_wt:
-        missing = "ERROR: Ar wt% of the feed gas is not set (Run Plan Feed → Gas feed composition, or enter it)"
     if unit == "volume" and not ar_mol:
-        missing = "ERROR: Ar mol% of the feed gas is not set (Run Plan Feed → Gas feed composition, or enter it)"
+        missing = "ERROR: no Argon in the Run Plan feed gas (Run Plan → Feed → Gas feed composition)"
+    if unit in ("mass", "carbon") and not ar_mol and not ar_wt:
+        missing = "ERROR: no Argon in the Run Plan feed gas (Run Plan → Feed → Gas feed composition)"
 
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
@@ -178,19 +244,36 @@ def convert_online_rows(rows, unit, feed_gas=None, ar_mol_pct=None, ar_wt_pct=No
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
+            else:
+                v_r = _doe_flow(doe, reactor, when)
+                fi01, source = None, "Run Plan DOE"
+                v_sum = sum(v for v in (_doe_flow(doe, k, when) for k in range(1, 9)) if v and v > 0) if v_r else 0
+            flow = (fi01, v_r, v_sum, source)
+            if v_r is None:
+                status = (f"ERROR: no gas feed for R{reactor} – not in the export and no Run Plan DOE condition "
+                          f"with a gas flow at this time")
+            elif v_r <= 0 or not v_sum:
+                status = f"ERROR: no gas feed to R{reactor} ({source}: {v_r:g} NmL/h)"
+            elif unit != "volume" and not (fi01 and fi01 > 0 and ar_wt) and not ar_mol:
+                status = "ERROR: no Argon mol% in the Run Plan feed gas (needed without 01i14FI01)"
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
@@ -216,17 +299,25 @@ def convert_online_rows(rows, unit, feed_gas=None, ar_mol_pct=None, ar_wt_pct=No
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
+    # The export has no flows and the Run Plan DOE has no gas flows: the gas feed is missing
+    basis["flows_needed"] = not has_tags and not doe
+    basis["argon_missing"] = bool(missing)
     return {"unit": unit, "label": UNITS[unit]["label"], "columns": columns, "rows": out_rows, "basis": basis,
             "components": components, "ok_count": ok, "error_count": len(out_rows) - ok}
```

**Check:** `python -m pytest -q tests/test_online_units.py` (after Phase 6 step 2) → all pass.

## Phase 2 — `backend/routes/api.py` (endpoint)
`/api/online-units` passes `feed_gas`, `feed_cut_in`, `doe_rows` (no typed values).

```diff
--- a/backend/routes/api.py
+++ b/backend/routes/api.py
@@ -175,7 +175,7 @@ def online_units():
     try:
         return jsonify(convert_online_rows(
             body.get("rows") or [], body.get("unit"), feed_gas=body.get("feed_gas"),
-            ar_mol_pct=body.get("ar_mol_pct"), ar_wt_pct=body.get("ar_wt_pct"), feed_cut_in=body.get("feed_cut_in")))
+            feed_cut_in=body.get("feed_cut_in"), doe_rows=body.get("doe_rows")))
     except Exception as e:
         return jsonify({"error": str(e)}), 400
 
```

## Phase 3 — `backend/services/run_plan_template.py` (earlier Run Plan layout)
`parse_feed`: skip header rows in the liquid range; read the "Gas composition (mol%)" block (A label, D unit, E value,
until Total) when `tbl_gas` has no values; "Gas feed" accepted as settings title, settings stop at that block.

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

## Phase 4 — `frontend/online_analysis.html`, `frontend/css/online_units.css` (read-only block)
Remove the two Ar inputs; the block shows the basis text, the flow note, the formula and the MW table. Cache-busters
`online_units.css?v=2`, `online_analysis.js?v=5`.

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
 
@@ -99,11 +99,8 @@
                     <!-- Conversion basis: collapsed under the table -->
                     <details class="online-units-bar" id="onlineUnitsBar" hidden>
                         <summary><span class="online-units-title">Conversion basis</span> <span id="onlineUnitsSummary"></span></summary>
-                        <div class="online-units-inputs">
-                            <label>Ar in feed gas <small>mol%</small><input class="input" id="onlineArMol" type="number" step="any" min="0" placeholder="Run Plan"></label>
-                            <label>Ar in feed gas <small>wt%</small><input class="input" id="onlineArWt" type="number" step="any" min="0" placeholder="Run Plan"></label>
-                            <span class="online-units-basis" id="onlineUnitsBasis"></span>
-                        </div>
+                        <div class="online-units-basis" id="onlineUnitsBasis"></div>
+                        <div class="online-units-basis" id="onlineFlowNote"></div>
                         <div class="online-units-formula" id="onlineUnitsFormula"></div>
                         <div class="online-units-mw">
                             <div class="online-units-title">Molecular weights used (experimental standards of the MassBal workbook)</div>
```

```diff
--- a/frontend/css/online_units.css
+++ b/frontend/css/online_units.css
@@ -18,3 +18,5 @@
 .online-units-bar summary{cursor:pointer;font-size:12px;color:var(--slate);list-style-position:inside}
 .online-units-bar:not([open]){padding:9px 15px}
 .online-units-title{font-size:12px;font-weight:700;color:var(--burnt)}
+.online-units-bar.needs-input{border-left-color:#991b1b}
+.online-units-bar.needs-input summary .online-units-title{color:#991b1b}
```

## Phase 5 — `frontend/js/online_analysis.js` (page logic)
Remove the `arMol` / `arWt` state, inputs, handlers and request fields; send the Run Plan DOE rows (`doe_rows`); the
flow note lists the flow sources and what is missing in the Run Plan; the block opens in red when Ar or the DOE gas
flows are missing; mass formula text with the second Ar route.

```diff
--- a/frontend/js/online_analysis.js
+++ b/frontend/js/online_analysis.js
@@ -9,9 +9,7 @@ const onlineState = {
     // Units of the GC values: 'mol' (as imported) or a conversion from /api/online-units (mass, volume, carbon)
     unit: 'mol',
     converted: null,
-    hiddenConverted: [],
-    arMol: '',
-    arWt: ''
+    hiddenConverted: []
 };
 const online$ = (selector) => document.querySelector(selector);
 const formatOnlineValue = (value) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : (value ?? '');
@@ -151,9 +149,9 @@ function applyReactorMapMapping(rows, reactorRows) {
 
 // ---------------------------------------------------------------- Units (mol% → g/h, Nl/h, g C/h)
 const ONLINE_UNIT_FORMULAS = {
-    mass: 'm_i [g/h] = y_i·MW_i / (y_Ar·39.948) · F_Ar,r   with   F_Ar,r = 01i14FI01 · FIC_r / ΣFIC · w_Ar   (y = ESTD mol%)',
+    mass: 'm_i [g/h] = y_i·MW_i / (y_Ar·39.948) · F_Ar,r   with   F_Ar,r = 01i14FI01 · FIC_r / ΣFIC · w_Ar,   or without 01i14FI01: F_Ar,r = FIC_r/1000 / 22.414 · y_Ar,feed/100 · 39.948   (y = ESTD mol%; FIC from the export or the Run Plan DOE; Ar from the Run Plan)',
     volume: 'V_i [Nl/h] = y_i/100 · V_out   with   V_out = FIC_r[NmL/h]/1000 · y_Ar,feed / y_Ar   (argon balance)',
-    carbon: 'C_i [g C/h] = 12.011 · nC_i / MW_i · m_i   (carbon of each molecule over TOS)',
+    carbon: 'C_i [g C/h] = 12.011 · nC_i / MW_i · m_i   (carbon of each molecule over TOS; m_i as for the mass flow rates)',
 };
 const escOnline = (value) => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
 
@@ -173,9 +171,12 @@ function onlineRunPlanContext() {
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
 
@@ -202,8 +203,7 @@ async function refreshOnlineUnits() {
             method: 'POST', headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 unit, rows: compactUnitRows(onlineState.rows), feed_gas: ctx.feedGas, feed_cut_in: ctx.feedCutIn,
-                ar_mol_pct: onlineState.arMol === '' ? null : Number(onlineState.arMol),
-                ar_wt_pct: onlineState.arWt === '' ? null : Number(onlineState.arWt),
+                doe_rows: ctx.doeRows,
             }),
         });
         const data = await onlineJson(response);
@@ -231,12 +231,6 @@ function renderUnitsBar() {
     if (unit === 'mol') return;
     const data = onlineState.converted;
     const basis = data?.basis || {};
-    const arMol = online$('#onlineArMol'), arWt = online$('#onlineArWt');
-    if (arMol && document.activeElement !== arMol) arMol.value = onlineState.arMol;
-    if (arWt && document.activeElement !== arWt) arWt.value = onlineState.arWt;
-    const fromPlan = basis.ar_source !== 'entered';
-    if (arMol) arMol.placeholder = basis.ar_feed_mol_pct != null && fromPlan ? `${formatBasisValue(basis.ar_feed_mol_pct)} (Run Plan)` : 'Run Plan';
-    if (arWt) arWt.placeholder = basis.ar_feed_wt_pct != null && fromPlan ? `${formatBasisValue(basis.ar_feed_wt_pct)} (Run Plan)` : 'Run Plan';
     const parts = [];
     if (data) {
         parts.push(`<b>${escOnline(data.label)}</b> · ${data.ok_count} line${data.ok_count === 1 ? '' : 's'} calculated`
@@ -249,9 +243,22 @@ function renderUnitsBar() {
         parts.push(onlineState.rows.length ? 'Converting…' : 'Import a SystemTxt file first.');
     }
     online$('#onlineUnitsBasis').innerHTML = parts.join(' · ');
+    // Gas feed: where the flows of the calculated lines came from, and what is missing
+    const sources = Object.entries(basis.flow_sources || {}).map(([k, n]) => `${escOnline(k)}: ${n}`).join(', ');
+    const flowNote = [];
+    if (data && !basis.export_has_flows) flowNote.push('This export has no gas flow columns.');
+    if (basis.doe_flows) flowNote.push(`Run Plan DOE gas flows: ${basis.doe_flows} rows`);
+    if (sources) flowNote.push(`Flow source of the calculated lines – ${sources}`);
+    if (basis.flows_missing || basis.flows_needed) flowNote.push('<span class="online-cell-error">Gas feed missing: load the Run Plan with the DOE gas flow of every condition (start date, duration, Total gas Nl/h).</span>');
+    if (basis.argon_missing) flowNote.push('<span class="online-cell-error">Ar missing: load the Run Plan with Argon in Feed → Gas feed composition.</span>');
+    online$('#onlineFlowNote').innerHTML = flowNote.join(' · ');
+    const missingInputs = [basis.argon_missing ? 'Ar in feed gas' : '', (basis.flows_missing || basis.flows_needed) ? 'DOE gas flows' : ''].filter(Boolean);
+    bar.classList.toggle('needs-input', missingInputs.length > 0);
+    if (missingInputs.length && !bar.dataset.autoOpened) { bar.open = true; bar.dataset.autoOpened = '1'; }
     // One line on the closed block: Ar basis and how many lines could be calculated
     online$('#onlineUnitsSummary').innerHTML = data
-        ? `· Ar ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
+        ? (missingInputs.length ? `· <span class="online-cell-error">${missingInputs.join(' and ')} missing in the Run Plan</span> ` : '')
+          + `· Ar ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
           + `${basis.ar_feed_wt_pct != null ? formatBasisValue(basis.ar_feed_wt_pct) + ' wt%' : '–'} · ${data.ok_count} calculated`
           + (data.error_count ? `, <span class="online-cell-error">${data.error_count} ERROR</span>` : '')
         : '';
@@ -307,8 +314,6 @@ function saveOnlineState() {
             reactorMapActive: onlineState.reactorMapActive,
             unit: onlineState.unit,
             hiddenConverted: onlineState.hiddenConverted,
-            arMol: onlineState.arMol,
-            arWt: onlineState.arWt,
             path: online$('#onlineFile').value,
             summary: online$('#onlineSummary').textContent,
             from: from,
@@ -333,8 +338,6 @@ function restoreOnlineState() {
             onlineState.reactorMapActive = Boolean(saved.reactorMapActive);
             if (['mol', 'mass', 'volume', 'carbon'].includes(saved.unit)) onlineState.unit = saved.unit;
             if (Array.isArray(saved.hiddenConverted)) onlineState.hiddenConverted = saved.hiddenConverted;
-            onlineState.arMol = saved.arMol ?? '';
-            onlineState.arWt = saved.arWt ?? '';
             if (Array.isArray(saved.rows)) onlineState.rows = saved.rows;
             if (Array.isArray(saved.columns)) onlineState.columns = saved.columns;
             onlineState.allColumns = Array.isArray(saved.allColumns) ? saved.allColumns : [...onlineState.columns];
@@ -551,17 +554,6 @@ if (online$('#onlineUnit')) online$('#onlineUnit').onchange = () => {
     saveOnlineState();
     refreshOnlineUnits();
 };
-let unitInputTimer = null;
-['#onlineArMol', '#onlineArWt'].forEach((selector) => {
-    const input = online$(selector);
-    if (!input) return;
-    input.oninput = () => {
-        onlineState[selector === '#onlineArMol' ? 'arMol' : 'arWt'] = input.value.trim();
-        saveOnlineState();
-        clearTimeout(unitInputTimer);
-        unitInputTimer = setTimeout(refreshOnlineUnits, 400);
-    };
-});
 online$('#onlineReactorFilter').onchange = renderOnlineTable;
 online$('#onlineRestoreColumns').onclick = () => {
     if (onlineState.unit !== 'mol' && onlineState.converted) onlineState.hiddenConverted = [];
```

## Phase 6 — Version, documents, tests
1. `VERSION` = `6.4.3`; 6.4.3 entries of `CHANGELOG.md`, `ILS.md`, `README.md` (see `files/`).
2. Copy `tests/test_online_units.py`, `tests/fixtures/online/R3-C2-S1_9-06-23.txt`,
   `tests/fixtures/run_plan/RunPlan_R6-C1-S1_MassBalance.xlsx`.
3. `python -m pytest -q` → **25 passed**.

## Phase 7 — Acceptance test
See step 5 of `UPDATE_GUIDE_6.4.2_to_6.4.3.md` (four Run Plan / file combinations with the expected messages and values).

## Phase 8 — Rollback
Copy the backup folder back; no data or settings files are changed.
