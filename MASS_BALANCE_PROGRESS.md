# Mass Balance process (v6.5)

Third process next to Isomerization and Reforming. It reproduces the MassBal workbook
(`R6-C1-S1-MassBal_Ver2.2.xlsx`: ZMB → Run_Plan → Liq → Gas → R1_MB…R8_MB → C-Balance → Summary) from the online GC
exports plus the values entered by hand. `HC_SIMDIS` and `HC_DHA` are not part of it.

## How to use (v6.5.1: same main tabs for every process)
The navigation is the same as for Isomerization: Runs · Run Plan · Analysis ▾ · Calculation ▾ · Data Integrity · Plots ·
Summary Dashboard · History. With **Process: Mass Balance** (Run Plan page) the pages show the mass balance:

| Tab | Mass Balance content |
|---|---|
| Run Plan | tabs **Plan** (run information, liquid feed, mixed-gas composition, catalyst loading, target conditions), **Liq** (liquid sample: collection times, TLP / phase masses, C wt% of the product; product analyses on request), **Gas** (verified Ar / mixed gas, 01i14FI01 and 01i14FIC0r flows of the sample window). **Load Run Plan** reads a filled MassBal workbook (optional). Samples are added / chosen in the Liq and Gas tabs. |
| Analysis → Online Analysis | unchanged page: import the run export (.txt) and review it; the mass balance takes its GC reps and feed flows from this file. |
| Analysis → ZMB | replaces Offline Analysis (DHA). Import the ZMB export; one table at a time: **Overview** (average of every GC block, mixed-gas source, ZMB Argon suggestion), **GC by reactor** (R1–R8 / Bypass selector, click #n to exclude an injection), **Liquid verification** (Rep-1/2/3 selector + verified liquid flow). |
| Calculation → Calculation table | tabs **R#_MB** (All reactors by default or one reactor; one group at a time: Results, Composition, Mass flows, Volumetric flows, Carbon flows; zero rows hidden), **C-Balance** (carbon balance, C4+ yield, acetylene conversion / ethylene selectivity; helpers on request), **Summary** (per reactor, or by GC rep). Export .xlsx. |
| Calculation → Custom table | primary table = Mass Balance GC reps (`ils_mb_rep_table`). |
| Data Integrity | sources “Mass Balance · GC reps” and “Mass Balance · Summary” (Condition from the sample name, C1-S1 → 1). |
| Plots | GC-rep rows and sample rows (`ils_mb_rep_table` + `ils_mb_summary_table`); X = TOS(h), or GC rep when the reps have no time. |
| Summary Dashboard / History / Runs | table sources and saved state include the Mass Balance tables. |

`frontend/js/mb_core.js` holds the inputs (`ils_mb_inputs`), calls `/api/mass-balance/calculate` and publishes
`ils_mb_rep_table` / `ils_mb_summary_table`. Page scripts: `mb_run_plan.js` (run_plan.html), `mb_zmb.js` (zmb.html),
`mb_calculation.js` (mb_calculation.html). `navigation.js` sends index.html → zmb.html and calculation_table.html →
mb_calculation.html when the process is Mass Balance (and back for the other processes).

## Data sources
| Workbook cells | Source |
|---|---|
| ZMB GC blocks (rows 22–31 per reactor, 157–166 bypass) | ZMB export, `ESTD_*` of each `Sampled_reactor` (verified: identical to Ver2.2) |
| Rx_MB D20:AB48 | run export, `ESTD_*` of the reactor's injections in the sample window, mapped by `config/mass_balance_gc_map.json` |
| Gas!B11:I11, Gas!E5 | means of `01i14FIC0r`, `01i14FI01` over the sample window (or entered by hand per sample) |
| Run_Plan B1:B3, B58; ZMB liquid reps; Gas I35/J35; Liq B5:I6, B17:I19; C-Balance N34 | entered (or read from the workbook) |

Sample window per reactor: (previous sample's collection finished, or Run Start) < GC time ≤ this collection finished;
an optional window start/end per sample overrides it.

Export quirks handled (`backend/mass_balance/txt_loader.py`): columns found by name (ZMB 152 / run 161 columns),
`ÿ` = no value, C6 Above raw ESTD read from `Area_C6 Above`, `Conc_C8 Unknowns` = GC total (never a component),
GC rows without `Sampled_reactor` (last lines) are reported and skipped.

## Code
- `backend/mass_balance/`: `constants.py` (MW tables per sheet, carbon atoms, row groups), `txt_loader.py`,
  `workbook.py` (blue cells + GC tables of a MassBal workbook), `engine.py` (all formulas, workbook cell in each
  comment), `service.py` (imports, windows, flows, calculation), `views.py` (sheet-like tables), `export.py`,
  `routes.py` (`/api/mass-balance/{browse-file, import-txt, import-workbook, gc-map, calculate, export-xlsx}`).
- Frontend: see the table above; `css/mass_balance.css`; `historian_save.js`, `run_data.js` (state keys), `plots.js`,
  `plot_dashboard.js`, `custom_table.js`, `features/data_integrity` (sources); `app.py` (blueprint, `/zmb`, `/mass-balance`).
- Tests: `tests/test_mass_balance_engine.py` compares the engine with 1 811 Excel-calculated cells of Ver2.2
  (`tests/fixtures/mass_balance/golden_R6-C1-S1.json`); `tests/test_mass_balance_txt.py` covers both exports, the
  quirks, flows, sample windows and the end-to-end service. `python -m pytest -q` → 19 passed.

## Known template differences (the dashboard behaviour)
| Workbook | Dashboard |
|---|---|
| R7_MB / R8_MB read Gas/Liq column G (R6) | each reactor uses its own column (same golden values: all flows are equal in Ver2.2) |
| R2…R8_MB time check compares with `'R1_MB'!H6/I6` | each reactor checks its own reps (Pass when Run Start < first GC and last GC < collection finished) |
| Rx_MB D86 uses Gas!$B$11 (R1) for every reactor, inconsistent units | kept in workbook-compatible mode (option); a corrected NL/h row is shown too; the ethylene selectivity does not depend on it |
| Gas!B22:B25 mixed-gas row reads empty J20:M20 | elemental rows include the mixed gas via Run_Plan L43:L46 (display only) |
| Run_Plan B35:K35 = ZMB Reactor-1 block only, not normalised | default the same; selectable block / mean / bypass |
| Liq!B40 divides by TOS, Liq!B41 by sampling hours | reproduced, noted in the cell tooltip |
| outlier statistics skip rep 1 (columns E:AB) | reproduced |

## Open items
- Lump peaks (C4, C5, C6, C6s, C6 Unknowns, C7 Unknowns, Isobutane) have no peak in the current GC method; map them in
  the GC map editor once the method reports them.
- Verified Ar mol% (Gas!I35) is entered; the page offers the ZMB-measured Argon as a one-click suggestion.
- One Ar mol% for all reactors (as in the workbook).
- The provided run export (Result_R08, Oct 2024) and the Ver2.2 workbook / Run6 ZMB export (May 2024) belong to
  different runs, so the end-to-end test checks mechanics, not plant results. The Run 6 run export would allow a
  full txt-only comparison with Ver2.2.


## Run Plan workbook (v6.5.3)
Same format as the shared `RunPlan.xlsx` plus a **Liq** sheet; loaded with **Load Run Plan** in Mass Balance mode
(`backend/mass_balance/run_plan.py`; a filled MassBal workbook is still accepted and recognised by its sheets).

| Sheet | Content |
|---|---|
| Plan | B2 objective; A4:J14 Catalyst Loading Plan (Catalyst, Shape & Size, volume, CBD, amount, loaded weight per R1–R8; `X` = not loaded); Op.Conditions; label rows (A label, C value): **Run Start** (or Feed Cut-In), Feed SL ID, Feed molecular weight |
| DOE | header row 10, data from row 11: Condition No., Block, Start/End Date, Temperature, Pressure (per block), Reactor ID, **Gas Flow (NmL/h)**, **Liquid Flow (g/h)**, LHSV, GoR, Feed Gas, Remarks, Catalyst (N) |
| Feed | liquid feed: Carbon (E2, C-Balance C3), Hydrogen, Molecular Weight, Oxygen, Sulfur, Nitrogen, Density, Feed ID, description; gas feed: Argon (verified), Mixed gas (verified), Total gas feed (01i14FI01), Mixed gas – <component> target mol% |
| Liq | table “Sample · Condition · Reactor ID · Collection Started · Collection Finished · TLP Mass · HC Phase · Aqueous Phase · C in Liquid Product · Density”, one row per sample and reactor; table “Rep · Reactor ID · Collection Started · Collection Finished · TL Collected Mass” for the ZMB liquid reps |

DOE gas flows and the Feed 01i14FI01 are the hand-entered feed flows of a sample when no Online Analysis export is
loaded. The example `tests/fixtures/mass_balance/RunPlan_MassBalance_R08.xlsx` (built by
`scripts/build_mass_balance_run_plan.py`) matches `Result_R08-Ci-S4-27-Oct-24_1_3.txt`: gas to R1, R5, R6; gas to R5/R6
stops on 27.10.2024 08:30, so sample C1-S4 has R1 only. With the Run6 ZMB export it gives mass balance closures of
about 94–102 %.
