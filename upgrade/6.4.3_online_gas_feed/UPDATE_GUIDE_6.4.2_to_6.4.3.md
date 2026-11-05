# ILS Dashboard 6.4.2 → 6.4.3: Online Analysis units for GC exports without gas flows

**Problem in 6.4.2.** Many GC exports (e.g. `R3-C2-S1_9-06-23.txt`) contain the GC columns but **no gas flow columns**
(`01i14FIC01…08`, `01i14FI01`). With Units = g/h, Nl/h or g C/h every line showed
`ERROR: no gas feed to Rr (01i14FIC0r = empty)`. Some GC methods also write `ESTD_Etylene` instead of `ESTD_Ethylene`, and
Run Plans made with the earlier template keep the feed gas in a "Gas composition (mol%)" block that 6.4.2 did not read.

**What 6.4.3 does.** Process selection and everything else stay as in 6.4.2.

1. **Gas feed of a line**, in this order:
   1. the export line (`01i14FIC0r` NmL/h, `01i14FI01` g/h) — as before;
   2. the values entered in the **Conversion basis** block under the table: gas feed per reactor R1–R8 (NmL/h) and,
      optionally, the total gas feed `01i14FI01` (g/h) — exactly the workbook's Gas!B11:I11 and Gas!E5;
   3. the **Run Plan DOE**: the gas flow of the condition running for that reactor at that time
      (`Total gas (Nl/h)` × 1000 in the template, `Gas Flow (NmL/h)` in older Run Plans).
   A new column **Flow source** shows which one was used (`export`, `entered`, `Run Plan DOE`).
2. **Argon flow to the reactor** (the internal standard):

   | When | Formula | |
   |---|---|---|
   | `01i14FI01` known and Ar wt% known | `F_Ar,r = 01i14FI01 × FIC_r / ΣFIC × w_Ar / 100` | as the workbook (Gas!G20) |
   | otherwise | `F_Ar,r = FIC_r / 1000 / Vm × y_Ar,feed / 100 × 39.948` | moles of Ar × MW_Ar |

   `Vm` = molar volume of the normal litre, **22.414 Nl/mol (0 °C, 1.01325 bar)**, editable in the block. Both routes
   are the same quantity: with the workbook's own numbers (19.5 g/h for 7 × 3000 NmL/h, Ar 4.3 mol%) they agree within
   0.5 %. (24.04 Nl/mol, the 20 °C value on the Run Plan's Plan sheet, would give 6.8 % less.)
   The other formulas are unchanged: `m_i = y_i·MW_i/(y_Ar·39.948)·F_Ar,r`, `V_out = FIC_r/1000 · y_Ar,feed/y_Ar`,
   `V_i = y_i/100 · V_out`, `C_i = 12.011 · nC_i / MW_i · m_i`.
3. When something is missing, the **Conversion basis** block opens by itself, its title turns red and says what to
   enter: "Ar in feed gas and gas feed per reactor missing – enter it here". The Status of the lines says
   `ERROR: no gas feed for Rr (not in the export) – enter it under Conversion basis`.
4. `ESTD_Etylene` is read as **Ethylene** (the MW list says "export spelling Etylene").
5. Run Plans of the earlier template (Feed without Excel tables): the "Gas composition (mol%)" block under "Gas feed"
   (component A, unit D, value E) is the Gas feed composition; header rows inside the liquid list are skipped.

---

## Step by step

**Step 0 — Close the dashboard and back up** the folder (e.g. `ILS_App\backups\2026-11-05_before_6.4.3\`).

**Step 1 — Check your folder**
```
python check_my_version.py "C:\Users\<you>\ILS_App\Dashboard"
```
*original* → replace with `files/…`; *CHANGED* → you edited it, see Step 3; *updated* → nothing to do.

**Step 2 — Quick way (all files "original")**: copy the contents of `files/` into the dashboard folder and let
Windows replace the files. For a git checkout of 6.4.2: `git apply --binary --whitespace=nowarn ILS_6.4.2_to_6.4.3.patch`.

**Step 3 — Files you edited yourself** (replace the others):

| File | Change |
|---|---|
| `backend/services/online_units.py` | `ALIASES = {"Etylene": "Ethylene"}`, `MOLAR_VOLUME = 22.414`; `_line_flows`, `doe_gas_flows`, `_doe_flow`; `convert_online_rows(…, gas_feed, total_feed_g_h, molar_volume, doe_rows)` with the order export → entered → DOE, the two Ar routes, column "Flow source", `basis.flows_missing / flows_needed / argon_missing`. Replace the file (it has no settings of yours). |
| `backend/routes/api.py` | `/api/online-units` passes `gas_feed`, `total_feed_g_h`, `molar_volume`, `doe_rows` on to `convert_online_rows` |
| `backend/services/run_plan_template.py` | `parse_feed`: reads the "Gas composition (mol%)" block when `tbl_gas` has no values; settings stop at that block; header rows ("Component (wt%)", rows whose weight cell says "Weight") are skipped |
| `frontend/online_analysis.html` | in the Conversion basis block the "Gas feed" inputs (`.online-flow` R1–R8, `#onlineFi01`, `#onlineVm`, `#onlineFlowNote`); `online_units.css?v=2`, `online_analysis.js?v=5` |
| `frontend/js/online_analysis.js` | state `gasFeed`, `fi01`, `molarVolume` (saved); sends them and the Run Plan DOE rows; opens the block when inputs are missing. Replace the file. |
| `frontend/css/online_units.css` | styles of the gas feed inputs and the red "needs input" block |

**Step 4 — Start and check** (`run_dashboard.bat`, the menu bar shows **v6.4.3**):
1. Run Plan: Run Number, load `tests\fixtures\run_plan\RunPlan_R6-C1-S1_MassBalance.xlsx`. Feed → **Gas feed
   composition** shows Hydrogen 19.859, Nitrogen 56.808, Argon 5, Methane 2.409, Ethane 0.002, Ethylene 1.532,
   Acetylene 7.431 (red badge "93.041 mol% · Not 100").
2. Analysis → Online: import `tests\fixtures\online\R3-C2-S1_9-06-23.txt` (a GC export without flows), Units =
   **Mass flow rates (g/h)**. Without a fitting Run Plan the block opens: "… gas feed per reactor missing – enter it here".
3. In the block type **3000** for R1…R8 (and, if no Run Plan with Ar is loaded, Ar **5** mol%). The summary becomes
   "Ar 5 mol% · 44 calculated, 2 ERROR" (the bypass line and the empty GC line); Flow source = "entered, molar volume".
   The line of 08.06.2023 18:09:40 (R2) shows Methane 0.00002768, Ethane 0.0000947, Ethylene 0.0008201 g/h.
4. Carbon (g C/h) and Volumetric (Nl/h) work the same way; the entered values stay after a reload.
5. Optional: `python -m pytest -q` → `25 passed`.

## Run Plan: what the units need

| Needed for | Run Plan entry | In `RunPlan_R6-C1-S1_MassBalance.xlsx` |
|---|---|---|
| TOS zero | DOE condition 1 start (Feed Cut-In) | ✔ 13.05.2024 14:00 |
| Gas feed per reactor (GC export without flows) | DOE condition rows with start, duration (or end) and flows | ✔ condition 1, 2.9999 Nl/h; ✖ no duration / end; ✖ conditions 2 and 3 empty |
| Ar in feed gas | Feed → Gas feed composition: Argon mol% | ⚠ 5 mol% = target; the workbook uses the **verified 4.3 mol%** (Gas!I35) |
| Ar wt% (only with `01i14FI01`) | the whole feed gas composition | ✔ (93.04 mol%; the unanalysed rest has no MW) |

With the target 5 mol% every flow is 16.8 % higher than in the MassBal workbook; with the verified 4.3 mol% the R6
flows are within 0.5 % of R6_MB. Put the verified value in the Run Plan (Argon 4.3, mixed-gas components × 0.956), or
type 4.3 in *Ar in feed gas mol%* of the Conversion basis block.

The liquid (Carbon, Hydrogen, MW of the liquid feed / product) is **not** a Run Plan entry: it comes later with the
liquid product data of the Mass Balance.
