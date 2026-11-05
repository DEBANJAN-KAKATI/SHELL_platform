# ILS Dashboard 6.4.2 → 6.4.3: Online Analysis units from the export and the Run Plan

Process selection and everything else stay as in 6.4.2.

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

## Step by step

1. **Back up**: close the dashboard, copy the folder (e.g. `ILS_App\backups\2026-11-05_before_6.4.3\`).
2. **Check**: `python check_my_version.py "C:\Users\<you>\ILS_App\Dashboard"` → *original* = replace,
   *CHANGED* = you edited it (see the implementation plan), *updated* = done.
3. **Copy** the contents of `files/` into the dashboard folder (or `git apply --binary --whitespace=nowarn
   ILS_6.4.2_to_6.4.3.patch` on a 6.4.2 git checkout). To implement by hand: `IMPLEMENTATION_PLAN_6.4.2_to_6.4.3.md`.
4. **Start** `run_dashboard.bat`, Ctrl+F5 → menu bar **v6.4.3**; `python -m pytest -q` → **25 passed**.
5. **Check in the browser** (Units = Mass flow rates):

| Run Plan loaded | Online file | Expected |
|---|---|---|
| none | `R3-C2-S1_9-06-23.txt` | Conversion basis open, red: "Ar in feed gas and DOE gas flows missing in the Run Plan"; lines `ERROR: no Argon in the Run Plan feed gas …`; **no input fields** |
| `RunPlan_R6-C1-S1_MassBalance.xlsx` | `R3-C2-S1_9-06-23.txt` | "DOE gas flows missing in the Run Plan · Ar 5 mol% / 9.4827 wt%" — the R6 DOE (May 2024) does not cover the R3 GC lines (June 2023): `ERROR: no gas feed for Rr – not in the export and no Run Plan DOE condition with a gas flow at this time` |
| the Run Plan of the R3 run (DOE dates of June 2023, Argon in the gas feed) | `R3-C2-S1_9-06-23.txt` | 44 lines OK, 2 ERROR (bypass, empty GC line); Flow source "Run Plan DOE, molar volume"; with 3 Nl/h and Ar 5 mol% the line 08.06.2023 18:09:40 (R2) gives Methane 0.00002768, Ethane 0.0000947, Ethylene 0.0008201 g/h |
| `RunPlan_MassBalance_SS.xlsx` | `Result_R08-Ci-S4-27-Oct-24_1_3.txt` (has flows) | "Ar 5 mol% / 9.4827 wt% · 107 calculated, 64 ERROR"; line 24.10.2024 15:36:36 (R5): Methane 0.05612 g/h |

6. **Rollback**: copy the backup back.
