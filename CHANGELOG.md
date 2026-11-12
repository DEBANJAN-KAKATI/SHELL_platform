## 6.9.6 (2026-11-12) — Calculation → Mass Balance
- New page **Calculation → Mass Balance** (General_MB): carbon balance, mass balance closure, conversion, selectivity and
  yield per liquid sample and reactor, calculated from Online Analysis (Gas and Liquid tabs) and the Run Plan. Conditions
  without a liquid sample are shown "gas only" (conversion, selectivity, gas-phase carbon balance; the balances that need
  the liquid say so).
- One **score card per reactor**: carbon balance in large type with a status (✓ within ±5 %, ! 5–10 %, ✕ more), the
  split of recovered carbon between gas and liquid, and six figures: conversion of the key reactant, selectivity and
  yield of the target product, mass balance, C4+ yield, gas-phase carbon balance. Click any number to see its formula
  with the values used and the GC lines averaged.
- Detail tabs: **Carbon in → out** (stacked bars per reactor), **Selectivity & yield** (where the converted carbon went,
  by product group; switch to yield), **Trends vs TOS** (conversion, selectivity or gas-phase carbon balance per GC
  injection), **C-Balance table** (the workbook sheet, clickable), **Summary (all samples)** (one row per sample and
  reactor, click a row to open it, CSV export), **Molecules** (in / out / change per molecule in g/h, g C/h, Nl/h).
- Calculation settings (collapsed): internal standard, key reactant (default acetylene), target product (default
  ethylene), GC lines averaged (whole condition without the first line — default —, all lines, or ± hours around the
  liquid sample).
- Gas feed of each molecule is scaled with the internal standard from the bypass composition of the condition; every
  carbon-containing feed molecule counts in "C in gas feed" (the workbook counts four). Selectivity and yield on a carbon
  basis, net of the feed; the workbook's Nl/h ethylene selectivity and C4+ yield are kept for comparison.
- Saved with the run ("Calculation · Mass Balance summary"). New `backend/services/mass_balance.py`,
  `POST /api/mass-balance`, `frontend/mass_balance.html`, `js/mass_balance.js`, `css/mass_balance.css`,
  `tests/test_mass_balance.py`.

## 6.9.5 (2026-11-12) — Online Analysis: Gas and Liquid tabs
- General_MB: Online Analysis has two tabs. **Gas** is the imported export (unchanged). **Liquid** holds the liquid side
  of the mass balance, typed by the user (workbook Liq sheet):
  - **Liquid feed:** Carbon wt% of the liquid feed (typed once) and the liquid feed flow per reactor, taken from the ZMB
    pump check (verified) or else the Run Plan DOE liquid flow of the sample's condition (shown, nothing to type).
  - **Liquid product, one tab per sample** (C1-S1, C1-S2 …; "+ New sample" proposes the next name). One row per Run Plan
    reactor (unused reactors hidden, "Show unused reactors"). Typed: sample collection started / finished ("Apply times" to
    every reactor), TLP mass, Carbon wt% ("Apply" to every reactor). Tick **Two phases seen** to type the HC (top) and
    aqueous (bottom) phase masses. Calculated: Condition (Run Plan DOE), duration, TOS from the Feed Cut-In, decantation
    loss, HC and aqueous product flows over the sampling duration, carbon in the liquid product and in the liquid feed.
  - Each row shows whether it is ready for the **mass balance** and the **carbon balance**; a checklist above the table
    says what is still needed and for which reactors. Errors are shown in the row (not a number, negative, finished
    before started, phases heavier than the TLP).
  - Quick entry: Enter moves to the next reactor; a block copied from Excel can be pasted into any cell (rows =
    reactors, columns = fields); dates as 5/14/2024 7:52 AM, 14.05.2024 07:52 or ISO; decimal comma accepted.
  - Optional analyses (H, O wt%, N, S ppmw, density, mono/di/tri+ aromatics) in a collapsed table.
- Workbook fix: the hydrocarbon product flow is divided by the sampling duration (the workbook's Liq row 40 divides by the
  average TOS).
- Kept in the browser tab (`ils_liquid_state`) and saved with Save Run Details / Save to Historian ("Online · Liquid
  product per sample"). Next: C-Balance and Summary tables from the Gas and Liquid tabs.

## 6.9.4 (2026-11-11) — Online Analysis: Condition column
- Online Analysis table: new column **Condition** after Reactor, for every process. The Condition No. comes from the
  Run Plan DOE only when the line's DateTime falls inside a DOE condition window of its reactor (Start Date → End Date,
  else Start + Duration, else the next condition of that reactor). Lines outside every window stay blank (e.g. after a
  block was stopped). Bypass / unknown-reactor lines take the condition running in each block; when blocks differ it
  reads e.g. "Block-1: 2, Block-2: 1". Shown in the mol% view and in the converted units views; saved with the run.
- New filled Run Plan `tests/fixtures/run_plan/RunPlan_MassBalance_R08_filled.xlsx` matching the R08 export
  (Block-1 R1: C1 200 °C 24.10 14:00–25.10 11:00, C2 250 °C to 27.10 17:45; Block-2 R5/R6: C1 250 °C to 27.10 01:45),
  and a test that checks the conditions against the export.

## 6.9.3 (2026-11-11) — ZMB: liquid pump check
- ZMB page: new card **Liquid collected per reactor** (workbook ZMB rows 4–13). One tab per repeat (Rep 1, Rep 2, …,
  "+ Add rep", "Remove this rep"; each tab shows how many reactors have a flow) keeps several repeats uncluttered.
  Per reactor: sample collection started / finished (typed, or "Apply to all reactors" for the rep), duration (min),
  TOS (h) = finished − started, TL collected mass (g, typed) and Liq. flow rate (g/h) = mass / TOS. Reactors not used in
  the Run Plan are greyed. Errors shown in the row (finished not after started, mass without times, not a number).
- **Verified liquid flow (g/h)** per reactor = average of the reps with a flow rate, with the number of reps.
- Kept in the tab (`ils_zmb_pump`) and saved with the run (tables "ZMB · Liquid pump check (reps)" and "ZMB · Verified
  liquid flow (g/h)"). Not yet used in the mass balance.

## 6.9.2 (2026-11-11) — General_MB: ZMB import
- **Analysis → ZMB** (only with the General_MB process tab): browse and import the GC export of the blank (ZMB) run,
  the same tab-delimited file as Online Analysis. The lines are shown as imported (normalised mol%) with reactor filter
  (0 = bypass), search, date range and removable columns; the summary counts the bypass lines. Kept in the browser tab
  (`ils_zmb_state`) and saved with Save Run Details / Save to Historian ("ZMB (blank run)"). Other processes see the
  page read-only with a hint. How ZMB values enter the calculations (liquid pump check, feed gas reference) comes later.
- New `frontend/zmb.html`, `frontend/js/zmb.js`, `/zmb`, `POST /api/browse-zmb-file`, `POST /api/process-zmb`.

## 6.9.1 (2026-11-06) — Molecular weights from the Run Plan
- **The Run Plan now holds every molar mass and carbon number** used by the dashboard, so a new molecule only needs a
  row in the Run Plan. On the Feed sheet:
  - the gas feed table (tbl_gas) has two new columns, **MW (g/mol)** and **Carbon #**;
  - a new table **tbl_MW "Molecular weights"** (T14:W61) lists every analysed component as it is named in the GC
    export (ESTD_<name>), pre-filled with the MassBal workbook standards, with 12 spare rows for new components.
- Online Analysis (g/h, Nl/h, g C/h, feed gas composition, internal-standard and mixed-gas MW) takes MW and carbon
  number from the Run Plan: Molecular weights table first, then the gas feed table, then the liquid components.
  Built-in workbook values only fill gaps and are labelled "built-in … (not in the Run Plan)"; a component without an
  MW anywhere shows "ERROR: no MW for X – add it to the Run Plan (Feed → Molecular weights)". Names are matched without
  case, spaces and hyphens (CH4 = Methane, Hydrogen = H2, n-Butane = Butane …).
- The molecular weights are used by the calculations only: the Run Plan page does not show them. Online Analysis →
  Conversion basis (collapsed) lists the source of every MW, and a missing MW appears as an ERROR in the Status column.
- `scripts/run_plan_examples/add_molecular_weights.py RunPlan.xlsx [out.xlsx]` adds the columns and the table to any
  existing Run Plan (charts, formulas and comments kept; does nothing if tbl_MW exists). All template and test Run
  Plans in `tests/fixtures/run_plan/` were updated with it; results are unchanged.

## 6.9.0 (2026-11-06) — Process tabs Isomerization / Reforming / General_MB
- **Process selection is back**, as three tabs next to the Run Number on the Run Plan page: **Isomerization**,
  **Reforming** and **General_MB**. The other pages show the process as a badge. The tabs are locked until a Run Number
  is entered. Switching clears the loaded Run Plan, and a Run Plan saved under another process is not restored.
  The universal Run Plan template (Feed tables, Plan, DOE, Pre-run) is the same for all three.
- **Reforming** is active again: its Offline Analysis tables, the Calculation table tabs (Reforming CARBON_TABULAR,
  Component Summary, Export Complete), SharePoint/OneDrive sync and Data Integrity source were kept in the code since
  v6.6 and now switch on with the Reforming tab.
- **General_MB**: Isomerization pages plus the Internal Standard mass balance on Online Analysis (same as offline 6.5.0):
  Internal Standard — / Argon / N2, measured in the bypass (reactor 0) GC lines per Run Plan DOE condition. The side
  panel next to the table shows Feed gas composition · IS (IS mol%, IS wt%, mixed gas mol%, sum, mixed gas MW, RSD,
  Run Plan Argon as a check) and the Average IS flow to reactor [g/h] (workbook R#_MB!F5 = Gas!G20). The Units g/h,
  Nl/h and g C/h are calculated with that IS; bypass lines show "BYPASS – feed gas of …"; new column Condition; the
  Conversion basis stays collapsed at the bottom; Historian / Save Run Details store both panel tables.
- **Isomerization and Reforming**: the Online Analysis table shows Normalised mol% only (the unit conversion needs the
  Internal Standard of General_MB).
- Tests: General_MB worked examples (R3, R08 per block, workbook Gas!I37 / G20 from a bypass line, error cases);
  fixture `RunPlan_MassBalance_SS_filled.xlsx` (gas feed composition = measured bypass gas of R08).

## 6.8.2 (2026-11-05) — Run Plans of the earlier template layout: gas feed composition
- Run Plans made with the earlier template (Feed without Excel tables, e.g. `RunPlan_R6-C1-S1_MassBalance.xlsx`) keep the
  gas feed in a "Gas composition (mol%)" block under "Gas feed". It is now read as the Gas feed composition (it was read
  as gas feed settings and the gas table stayed empty, so the Online Analysis units had no Ar in feed gas). Header rows
  inside the liquid range are no longer listed as components.
- Test `test_run_plan_r6_earlier_layout_gives_feed_gas_and_doe_flows`: with the DOE gas flow (2.9999 Nl/h) and the
  verified Ar of the workbook (4.3 mol%) the converted flows are within 0.5 % of R6_MB; with the Run Plan's target Ar
  (5 mol%) they are 16.8 % higher.

## 6.8.1 (2026-11-05) — Online Analysis units for GC exports without gas flows
- GC exports without the 01i14FIC0r / 01i14FI01 columns (e.g. `R3-C2-S1_9-06-23.txt`) showed "ERROR: no gas feed …
  = empty" on every line. The gas feed of a line now comes from the export, else from the values entered per reactor
  (R1–R8 NmL/h, optional total 01i14FI01 g/h — the workbook's Gas!B11:I11 / E5), else from the Run Plan DOE condition
  running at that time. Without 01i14FI01 the argon flow is calculated from the volume (FIC_r / molar volume · Ar mol% ·
  39.948, molar volume 22.414 Nl/mol, editable). New column "Flow source".
- The Conversion basis block opens by itself and says what is missing (Ar in feed gas, gas feed per reactor).
- `ESTD_Etylene` (spelling of some GC methods) is read as Ethylene.

## 6.8.3 (2026-11-05) — Online Analysis units: Ar and gas feed only from the Run Plan
- The Ar inputs (mol%, wt%) and the gas feed inputs (R1–R8, 01i14FI01, molar volume) are removed from the Online
  Analysis page: Ar comes from the Run Plan Feed → Gas feed composition, the gas feed from the export or else the Run
  Plan DOE. The Conversion basis block is read-only and says what is missing in the Run Plan; status messages point to
  the Run Plan ("no Argon in the Run Plan feed gas", "no gas feed for Rr – not in the export and no Run Plan DOE
  condition with a gas flow at this time"). Molar volume fixed at 22.414 Nl/mol (0 °C).

## Unreleased — 6.4.3 update package
- `upgrade/6.4.3_online_gas_feed/`: guide, implementation plan, checker and patch that bring 6.8.1–6.8.3 (gas feed from
  the Run Plan DOE for GC exports without flows, Ar only from the Run Plan, Etylene, earlier Run Plan gas block) to the
  offline 6.4.2 dashboard with the process selection kept.

## Unreleased — 6.4.2 update package
- `upgrade/6.4.2_online_units/`: step-by-step guide (with the formulas and workbook cells), checker and git patch that
  bring the Online Analysis units to the offline 6.4.1 dashboard with the process selection kept.

## 6.8.0 (2026-11-05) — Online Analysis units; first Mass Balance removed
- **Online Analysis → Units**: Normalised mol% (as imported), Mass flow rates (g/h), Volumetric flow rates (Nl/h) and
  TOS carbon of each molecule (g C/h) per GC injection, with argon as internal standard and the formulas and molecular
  weights of the MassBal workbook (Ver2.2): F_Ar,r = 01i14FI01 · FIC_r/ΣFIC · w_Ar, m_i = y_i·MW_i/(y_Ar·39.948)·F_Ar,r,
  V_i = y_i/100 · FIC_r/1000 · y_Ar,feed/y_Ar, C_i = 12.011·nC_i/MW_i·m_i. Ar mol% / wt% of the feed gas from the Run Plan
  gas table (or entered), TOS from the Run Plan Feed Cut-In. Explicit ERROR status for bypass lines, missing argon peak,
  stopped gas feed and missing feed argon. The mass and carbon flows reproduce the workbook's R6_MB values exactly; the
  workbook's total volumetric flow (R#_MB!D86) mixes g/h and NmL/h, so the argon balance it intends is used.
- New `backend/services/online_units.py`, endpoint `POST /api/online-units`, tests `tests/test_online_units.py`.
- The conversion basis (Ar in feed gas inputs, formula, molecular weights) sits collapsed under the table, with a
  one-line summary (Ar mol% / wt%, lines calculated / with ERROR); the table follows the filters directly.
- Online loader: `ESTD_C6 Above` is taken from `Area_C6 Above` when the export shifts that column (`Conc_C6 Above`
  empty); the import summary says so.
- The first Mass Balance (v6.5: `backend/mass_balance`, its routes, GC map, tests, scripts and page hooks in Plots,
  Custom table, History and Save Run Details) is removed; Mass Balance is rebuilt step by step. The R08 run export and
  the MassBal workbook moved to `tests/fixtures/online/`; the older-layout Run Plan used by the tests is
  `tests/fixtures/run_plan/RunPlan_Old_Format.xlsx`.

## 6.7.1 (2026-11-04) — Feed Cut-In from the pre-run; 6.4.1 update package
- Template Run Plans now give the Plan info "Feed Cut-In" (TOS zero): the pre-run feed cut-in of the first active
  reactor's block, else the start of its first DOE condition; `doe.pretreatment.settings` holds the pre-run settings
  per block (program name, feed cut-in, pre-run start, program time / end).
- `upgrade/6.4.1_run_plan/`: step-by-step guide, checker and git patch to bring the new Run Plan (Feed in 4 tables,
  Pre-run tab with charts, launcher fix) to an offline 6.4.0 dashboard with the process selection kept.

## 6.7.0 (2026-11-04) — Run Plan: Pre-run tab
- New **Pre-run** tab on the Run Plan page (after DOE): the DOE Step 0 steps with the columns of the Run Plan up to
  Remarks (Step, Block, Start/End date, Phase with its chart colour, Gas, Start/Target T, Ramp, Hold, Pressure,
  Pressure change, Remarks), block totals and the feed cut-in hour, and one chart per block — temperature coloured by
  phase and the pressure (or the gas / liquid flow chosen in the template) dashed on the right axis against time.
- The profile is computed from the entered steps (`prerun_profile` in `run_plan_template.py`), so it does not depend on
  the workbook's cached graph data. The Step 0 switch on the DOE tab is removed (the table moved to Pre-run).

## 6.6.4 (2026-11-04) — Blank pre-run template in DOE Step 0
- `RunPlan_Template_Feed_SS.xlsx` is blank again in Step 0 (6.6.3 had an example program); Plan, Feed and DOE rows
  1-107 are exactly the uploaded template.
- Step 0 pre-run made practical for any experiment: 30 step rows, gas flow and liquid flow columns, phase names that
  can be renamed (drop-down + chart legend), chart right axis selectable (pressure, gas flow or liquid flow), start T
  defaults to the previous target of the block (overwrite turns orange).
- Script `scripts/run_plan_examples/prerun_doe.py` replaces `add_pretreatment_doe.py`; the Rheinland test file was
  converted with it (Block-1 24.3 h, Block-2 35.6 h).

## 6.6.3 (2026-11-04) — Run Plan template: pre-run (drying & reduction) in DOE Step 0
- Template only (no dashboard change): the DOE "Step 0" section now holds the whole pre-run, as in the
  "Drying & Reduction" sheets of the screening workbook — one row per step and block with Phase (Drying, Reduction,
  Sulfiding, Feed cut-in, Other), gas, start/target temperature, ramp, hold, gas flow, pressure and pressure-change time;
  calculated ramp/step time, start/end hours per block, start/end dates counted back from the feed cut-in (= start of
  DOE condition 1 of the block) and a Check column; settings per block; graph data and one chart per block
  (temperature coloured by phase + pressure on the right axis vs time, like the drying & reduction graph).
- `tests/fixtures/run_plan/RunPlan_Template_Feed_SS.xlsx` (template, example program in both blocks) and the
  Rheinland plan updated (Block-1 isomerisation catalyst 24.3 h, Block-2 SLD 35.6 h). The dashboard still reads the
  Step 0 table (18 steps, both totals).

## 6.6.2 (2026-11-04) — Mass balance plan in the universal template
- `tests/fixtures/run_plan/RunPlan_MassBalance_SS.xlsx`: the R08 mass balance plan (`RunPlan_MassBalance_R08.xlsx`)
  in the universal template, built by `scripts/run_plan_examples/fill_template_mass_balance.py` and recalculated.
  Plan: R1 Ni2CBV-3014, R5 Ni5CBV-3014, R6 Cu5CBV500 (role Catalyst, others Not used), LHSV basis and GoR (Nl/ml);
  DOE: Block-1 200 °C (76.5 h), Block-2 250 °C (66.5 h), 5 barg, LHSV 0.198, GoR 2.6 / 5.3, measured gas flows in the
  remarks; Feed: diesel properties (no component analysis), feed gas = Ar 5 mol% + 0.95 × mixed gas, the remainder of
  the not-normalised mixed-gas analysis as "Other (gas)"; the Liq sheet (samples, ZMB liquid reps) is kept as an
  extra sheet. No Step 0 in the source plan.
- Run Plan page: a feed table without values shows "no values" instead of a red "0 wt% · check"; the Step 0 total
  badge is hidden when there is no total.

## 6.6.1 (2026-11-04) — Rheinland isomerisation plan in the universal template
- `tests/fixtures/run_plan/RunPlan_Isomerisation_Rheinland.xlsx`: the Rheinland catalyst screening plan copied into the
  universal template (Plan, 11 conditions per block, 18 Step 0 steps, Feed in the four tables; recalculated values
  identical to the source plan). Step 0 extended to 20 rows with a total per block.
- DOE Step 0: every total row is read (e.g. "Block-1 total (h)", "Block-2 total (h)") and shown on the DOE tab.

## 6.6.0 (2026-11-02) — One universal dashboard, universal Run Plan template
- **No process selection any more.** The Isomerization / Reforming / Mass Balance selector and the Mass Balance pages
  (ZMB, Mass Balance calculation) are removed; every page works in the Isomerization format for now (calculation table
  and import analysis will be generalised later). Reforming and Mass Balance backend code and tests stay in the repo,
  unused (dormant); old links `/zmb`, `/mass-balance` open the standard pages.
- **Universal Run Plan template** (`tests/fixtures/run_plan/RunPlan_Template.xlsx`), detected by the Plan "Reactor role"
  row (`backend/services/run_plan_template.py`); older RunPlan.xlsx files still load with the fixed ranges.
  - Plan: catalyst loading rows 8-22 (Reactor role, Catalyst, SCI, CISPRO, shape, volume, CBD, LOI, amount, zones,
    loaded weight, remarks); Run ID, Start date, Lab notebook ref., Feed in the info; active reactors = role Catalyst/Inert.
  - DOE: only conditions with an entered T / P / space velocity are shown (blank template conditions are skipped);
    "Start (date, time)" / "End (date, time)" are returned as Start Date / End Date for the condition filters; planned
    hours and run end shown above the table; **Step 0 – Pretreatment / activation** is hidden behind a switch.
  - Feed: the four tables are shown separately — feed properties as tiles, Liquid components, Group-type summary and
    Gas feed composition (with the gas feed settings) as cards with value bars, totals and a 100 % check; empty rows
    hidden by default ("Show empty rows"). Carbon, Hydrogen and Molecular Weight stay the first feed rows, so the
    Calculation table, Plots and Custom table read them as before.
- Online Analysis no longer triggers Mass Balance recalculation; Data Integrity lists only the Isomerization sources.

## 6.5.3 (2026-10-30) — Mass Balance Run Plan in the RunPlan.xlsx format, aligned tables
- Mass Balance Run Plan: the shared `RunPlan.xlsx` format (Plan, DOE, Feed) plus a **Liq** sheet is imported on the
  Run Plan page (a filled MassBal workbook still works). Plan: objective, catalyst loading, Run Start; DOE: T/P per
  block, gas and liquid flow per reactor; Feed: liquid feed (Carbon E2 …) and gas feed (verified Ar / mixed gas,
  01i14FI01, target mixed-gas composition); Liq: liquid samples and ZMB liquid reps. Example:
  `scripts/build_mass_balance_run_plan.py` → `tests/fixtures/mass_balance/RunPlan_MassBalance_R08.xlsx`.
- Mixed gas falls back to the Feed-sheet target composition when no ZMB export is loaded (option "Run Plan Feed sheet").
- TLP flow of later samples is divided by the hours since the sample window start (previous collection) instead of
  the hours since Run Start; the first sample is unchanged (golden tests unchanged).
- A reactor with GC reps but no gas feed in the window (01i14FIC0r = 0) gets an explicit error, not a balance.
- Tables use fixed column widths, so R1…R8 line up between stacked tables; numbers and their headers are right-aligned.

## 6.5.2 (2026-10-30) — launcher opens the right copy
- `run_app.py` reuses a dashboard that is already running only when it is this folder (`/api/health` now reports
  `root`). When another copy, such as the previous version in its old folder, holds port 5001, it says so and
  starts this copy on the next free port, instead of opening the old dashboard.
- The tab bar shows the running version (e.g. `v6.5.2`, folder in the tooltip).

## 6.5.1 (2026-10-30) — Mass Balance inside the standard tabs
- The main tabs are the same for every process. Mass Balance: Run Plan has tabs Plan / Liq / Gas; Analysis has
  Online Analysis (run export, unchanged page) and **ZMB** (replaces Offline Analysis); Calculation table has tabs
  R#_MB (all reactors by default, or one reactor) / C-Balance / Summary. One table at a time (reactor, group and rep
  selectors, zero rows hidden). The separate Mass Balance page was removed.
- Plots, Summary Dashboard, Data Integrity, Custom table and History read the Mass Balance GC-rep and summary tables.
- Online Analysis reads the export on every OS (cp1252 when the Windows-only `mbcs` codec is missing, e.g. Docker) and
  shows `ÿ` cells as empty.

## 6.5.0 (2026-10-30) — Mass Balance process
- Third process **Mass Balance** on the Run Plan process selector; nav tab **Mass Balance** (`/mass-balance`) replaces
  Analysis / Calculation / Plots for this process. Isomerization and Reforming pages are unchanged.
- Imports the ZMB and run GC exports (.txt, read by column name; `ÿ`, shifted C6 Above and GC-total quirks handled) and,
  optionally, a filled MassBal workbook (blue cells and GC tables).
- Engine `backend/mass_balance/` reproduces MassBal Ver2.2: ZMB (verified liquid flow, GC blocks), Run_Plan mixed gas,
  Liq, Gas, R1-R8 mass balance (Ar internal standard), C-Balance (carbon balance, C4+ yield, acetylene conversion,
  ethylene selectivity) and Summary (per reactor and per GC rep). Several samples per run, sample windows, rep
  exclusion, outlier shading, editable inputs, plots, .xlsx export, RunData/Historian keys.
- Tests: 19 pytest tests, including 1 811 Excel-calculated cells of R6-C1-S1-MassBal_Ver2.2.xlsx. See MASS_BALANCE_PROGRESS.md.

## Next — Unified Run Plan
- Unified Isomerization and Reforming on the shared `RunPlan.xlsx` format (`Plan`, `DOE`, `Feed`).
- Added optional Plan metadata (`Feed SL ID`, `Feed Cut-In`, and `Feed molecular weight`), optional DOE column N `Catalyst`, and `summary.active_reactors`.
- Removed the legacy Reforming Run Plan page and reject legacy Reforming workbooks with a migration message.

## Unreleased — Windows launcher fixes
- Python 3.15+ was rejected (only 3.9-3.14 were accepted), so the launcher downloaded Python from python.org, which company
  proxies block with 403 Forbidden. Any installed Python 3.9+ is now used, including the Python Install Manager folder
  `%LOCALAPPDATA%\Python\pythoncore-*`; an installed Python that already has the packages is used directly with no downloads;
  if a venv cannot be created the installed Python is used directly instead of downloading one.
  Python on PATH is also found with the built-in `%~$PATH:` search, not only `where`.
- `requirements.txt`: pandas 3 on Python 3.15+ (pandas 2 has no Windows packages for it); pandas 2 otherwise.
- Base table TOS/sorting: ISO timestamps are parsed as ISO (pandas 3 applied dayfirst to them: 2026-10-09 became 10 September).
  Online/Base/Yield/Run Plan/Reactor Map/operating-data results are identical on pandas 2.3.3 and 3.1.0.
- A failed package update no longer stops the dashboard when the installed packages work; offline install from a `wheels`
  folder; clear guidance when pypi.org or python.org answer 403.
- `run_app.py`: if port 5001 is in use or reserved by Windows it uses the next free port; if the dashboard is already running it
  opens it instead of failing.
- `run_dashboard.bat` now uses an installed Python 3.9-3.14 to create `.venv` (or `.venv-local` beside a copied/broken `.venv`)
  instead of always downloading Python; the private runtime is downloaded only when no usable Python is installed.
- Fixed the private runtime: the get-pip URL was always empty (variable set and used in one block), an existing runtime
  without pip was never repaired, and `python312._pth` did not include the application folder, so `import app` failed.
- Packages are installed only when missing or when `requirements.txt` changes; downloads fall back from curl to PowerShell (TLS 1.2).
- Exit codes are checked with `neq 0`, so a Python that crashes (negative exit code) is no longer treated as success;
  install folders are scanned with `dir` and `python312._pth` is written line by line.
- Tested under Wine: Python installed but not on PATH, no Python (runtime left by the old launcher), and a broken copied `.venv`.
- `.gitattributes` keeps `.bat`/`.cmd`/`.ps1` files in CRLF (cmd.exe misreads labels in LF-only batch files).
- Folder/file Browse falls back to the PowerShell dialog when the tkinter picker cannot start (the private runtime has no tkinter).

## 6.4.0 (2026-10-14) — Reforming process
- Process selector (Isomerization / Reforming) on the Run Plan page; reforming Run Plan page, Offline hooks,
  Calculation tab "Reforming CARBON_TABULAR(%WGT)" with CSV export. Isomerization behaviour unchanged.
- Reforming DHA: lumped "Cn Unknowns" rows in COMPONENT_LIST use their given Carbon#; remaining "Unidentified"
  rows use the neighbour rule; a lump already counted in a CARBON_TABULAR family (Below C4 -> Olefins C4) is not
  counted twice. See REFORMING_PROGRESS.md.

### 6.0.0 - 2026-10-03
- Copied the latest v5.1 application into a standalone v6.0 folder, preserving v5.1.
- Includes the redesigned full-width run workspace and automatic saved-run metadata.
- Includes the Summary Dashboard, twelve plot slots, table source and filter options, card-sized captures, and A4 Print / PDF workflow.
- Preserves existing application data, RunData snapshots, and Historian records. Generated virtual environments and caches are excluded from the copy.

### 4.1.0 - 2026-09-21
- Added Custom Table Studio (`/custom-table`) enabling Excel-like formula flexibility.
- Implemented Dual-Mode Builder (Guided Visual Builder for non-programmers + Excel Formula Bar for power users).
- Added safe AST expression evaluator (zero arbitrary code execution, safe division by zero, DAG cycle detection).
- Added Cell Lineage & Audit Explain inspector to verify intermediate calculations and inputs.
- Added support for cross-referencing Base Table, Offline Table-2, Yield Table, and Demo datasets.
- Added CSV export and JSON calculation template import/export.

### 4.0.0 - 2026-09-15
- Yield table wof% calculation synchronization.
- Base reactor conditions and feed property bindings.

### 3.4.0 - 2026-09-10
- Added a Reactor Map tab beside Table-3 · Octane Table.
- Linked the tab to the packaged valve-opening dashboard at /frontend/reactor_map.html.
- Restyled the Reactor Map with the main dashboard palette, typography, cards, filters, table, and responsive behavior.
- Added tab/route regression checks and a complete v3.3.0 rollback archive.
- No DHA or valve-state calculation logic was changed.

### 3.3.0 - 2026-09-09
- Added Table-3 · Octane Table as a third tab beside Tables 1 and 2.
- Extracts Lin-RON, Lin-MON, Cal-RON, and Cal-MON from OCTANE_NUMBERS!B1:B4 for each XLS file.
- Added Table-3 processed KPI and file-level partial/error reporting.
- Formats all displayed numeric table values to two decimal places without altering extracted numeric data.
- Added automated tests for octane cell mapping and updated documentation.

### 1.3.2 - 2026-09-08
- Fixed Table-1 returning zero rows when the optional Unknown column is absent or labeled Unknowns/Unidentified.
- Table-1 now detects the carbon header row and all available worksheet columns dynamically.
- Added separate Table-1 and Table-2 processed KPIs so partial processing is visible.
- Preserved revised HC_category.py Table-2 logic and restored the full startup package.

## Changelog

### 1.2.0 - 2026-09-08
- Added a Components filter dropdown to the DHA Data table.
- Added Paraffin, I-Paraffins, Aromatics, Naphthenes, and Olefins multi-select options.
- Added Select all and Clear controls and an active-filter summary.
- Preserved text search and folder processing behavior.
- Added safer JSON response handling for API errors.

### 1.1.0 - 2026-09-08
- Consolidated the component views into one DHA Data table.
