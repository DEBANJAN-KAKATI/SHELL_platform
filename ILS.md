# ILS — platform reference

"ILS" is the name for this application: the **ILS Dashboard** (README title "DHA Data Dashboard"), version
in `VERSION` (6.8.0). It is a local Flask web app for a pilot-plant test rig: it loads gas-chromatography DHA
(Detailed Hydrocarbon Analysis) results, online process/historian data and the Run Plan workbook, joins them by
timestamp and reactor, calculates yields, and offers plots, a printable summary dashboard and saved runs.
**One universal dashboard (v6.6):** no process selection; the universal Run Plan template describes every experiment
and the pages work in the Isomerization format for now (calculation table and import analysis to be generalised later).
Reforming (v6.4) code is **dormant** (backend and tests stay, UI removed). The first Mass Balance (v6.5) was **removed in
v6.8**; Mass Balance is being rebuilt step by step, starting with the Online Analysis units (below).

## Run / stack
- Python 3, Flask 3, pandas 2, olefile + xlrd (legacy `.XLS` read via the OLE `Workbook`/`Book` stream), openpyxl.
- Windows-first: `run_dashboard.bat` picks Python in order: working `.venv` / `.venv-local` → installed Python 3.9+
  (`py`, PATH, `%LOCALAPPDATA%\Programs\Python\Python3*`, `%LOCALAPPDATA%\Python\pythoncore-*`, Program Files) that already
  imports the app (used directly, no downloads) → new venv (`--system-site-packages`) from an installed Python, or that Python
  directly if venv fails → downloaded embeddable 3.12 in `.python-runtime` only when no Python is installed (its
  `python312._pth` includes `..` so `import app` works). pip runs only when packages are missing or `requirements.txt`
  differs from the stamp `ils-requirements.txt` next to python.exe; a `wheels` folder enables offline install; a failed pip
  is tolerated when the app still imports. Company networks may answer 403 for python.org / pypi.org.
  `run_app.py` moves to the next free port when 5001 is busy/reserved and reuses an already running dashboard only
  when `/api/health` `root` is the same folder (another copy/version on the port → next free port). Nav shows `vX.Y.Z`.
  Keep `.bat` files CRLF (`.gitattributes`); test exit codes with `neq 0`; avoid set-and-use of a variable inside one
  `( )` block. The embeddable runtime has no tkinter, so Browse uses the PowerShell dialog fallback in `dialog_service.py`.
- pandas: 2.x on Python ≤3.14, 3.x on 3.15+ (requirements markers). Parse ISO timestamps with `format="ISO8601"` —
  pandas 3 applies `dayfirst=True` to ISO dates.
- `config/settings.json`: host, port, `open_browser`, default DHA folder, valve-opening (reactor map) folder,
  Run Plan file (paths point at `C:\Users\...\ILS_App\Data\...`).
- Env vars: `DASHBOARD_USER` + `DASHBOARD_PASS` (both set → login required, for sharing over a tunnel;
  `stop_sharing.bat`), `DASHBOARD_SECRET_KEY`, `DASHBOARD_DATA_INTEGRITY=0` hides Data Integrity.
- `pytest.ini` expects `tests/`, but no tests are committed. Data files (`*.xls/xlsx/csv`, `DHA/`, `RunData/*`,
  `Historian/*.sqlite`, `backups/`) are git-ignored.
- Native file/folder pickers: `backend/services/dialog_service.py` (tkinter via `picker.py`, PowerShell fallback).

## Layout
- `app.py` — `create_app()`: registers blueprints `api`, `historian_api`, `run_data_api`, `reforming_api`,
  optional `data_integrity`; serves page routes and `/frontend/<path>`.
- `backend/loaders/xls_loader.py` — Isomerization DHA reader. HEADER!B2 = date, HEADER!B6 = metadata text with
  UID `<Run>_C<n>_S<n>_<n>` (regex `UID`). Sheets `CARBON_TABULAR(%WGT)`, `COMPONENT_LIST`, `OCTANE_NUMBERS`
  (B1:B4 = Lin-RON, Lin-MON, Cal-RON, Cal-MON).
- `backend/calculations/` — `constants.py` (components Paraffin, I-Paraffins, Aromatics, Naphthenes, Olefins,
  Unknown × C1–C15); `component_category.py` (COMPONENT_LIST → 15 reported components + carbon-range lumps
  "C3 & Below", "C3-C4" … "C8+" decided by elution position between n-paraffins, not RI);
  `yield_table.py` (Yield wof%).
- `backend/services/` — `dashboard_service.py` (process DHA folder, cumulative TOS), `online_analysis_service.py`
  (online `.txt` → `ONLINE_COLUMNS`, reactor mapping by `Sampled_reactor`), `online_units.py` (GC mol% → g/h, Nl/h, g C/h), `reactor_map_service.py`
  (valve-opening R1–R8 states), `run_plan_service.py` (+ root `RunPlan.py`), `calculation_table_service.py`
  (Base table), `custom_table_service.py` (safe AST formula engine), `excel_export_service.py`, `run_data.py`
  (RunData snapshots), `historian.py` (SQLite per run).
- `backend/reforming/` — self-contained Reforming package (does not import isomerization code): `dha_loader.py`,
  `unknowns.py`, `service.py`, `operating.py`, `sync_source.py`, `routes.py` (its own Run Plan parser was retired;
  the shared `run_plan_service.py` parses the Run Plan for both processes).
- `features/data_integrity/` — removable plug-in (own blueprint, HTML/JS/CSS, README).
- `frontend/` — static HTML pages + vanilla JS (Chart.js, Lucide icons, no build step). `navigation.js` builds the
  top nav, Run Number box, Process selector/badge (`window.ILSProcess`), reset button.
  `reactor_map.html` is a large self-contained page.
- `scripts/` — `ValveOpening.py`, `build_static_snapshot.py`.
- Docker: `Dockerfile` + `docker-compose.yml` (gunicorn `app:app` on 0.0.0.0:5001, `data/` mounted at `/app/data`,
  RunData in volume `dashboard-rundata`); env overrides `DASHBOARD_HOST/PORT/OPEN_BROWSER`,
  `DASHBOARD_SOURCE_DIRECTORY`, `DASHBOARD_REACTOR_SOURCE_DIRECTORY`, `DASHBOARD_RUN_PLAN_FILE`.

## Pages (nav order)
Runs `/` (`run_data_home.html`) → Run Plan (`run_plan.html`, shared by all processes) → Analysis: Offline
(`index.html`), Online (`online_analysis.html`) → Calculation: Calculation table, Custom table → Data Integrity
(`/data-integrity`) → Plots → Summary Dashboard (`plot_dashboard.html`) → History (`history.html`).
No process selector.

## API
- `/api`: `health`, `settings`, `run-number` (GET/POST), `browse-folder`, `process` (DHA folder),
  `browse-reactor-folder`, `process-reactor-map`, `browse-online-file`, `process-online`, `online-units`,
  `apply-online-reactor-map`, `browse-run-plan-file`, `process-run-plan`, `feed-properties`,
  `process-calculation-base`, `calculate-yield-table`, `custom-table/{validate-formula,calculate,inspect-cell}`,
  `export-xlsx`.
- `/api/reforming`: `process`, `settings`, `sync-source` (GET/POST), `process-run-plan`, `operating-data`.
- `/api/run-data/runs` (GET list, POST save), `/api/run-data/runs/<run_id>` (GET).
- `/api/historian`: `runs`, `runs/<n>/exists`, `runs/<n>`, `save`, `compare`.
- `/api/data-integrity/{config,analyze}`.

## State model
All working data lives in the browser tab's **sessionStorage** (use one tab across pages). Keys:
`ils_run_number`, `ils_process`, `runPlanDashboardState`, `ils_feed_properties`, `dhaDashboardState` (offline),
`dhaOnlineState`, `dhaDateTimeFilter`, `ils_base_table_state`, `ils_yield_table_state`, `ils_custom_table_state`,
`ils_custom_columns`, `ils_plot_preferences`, `ils_reforming_offline`, `ils_reforming_carbon_state`,
`ils_reforming_sync`; localStorage `ils_reforming_autosync`. `historian_save.js` (`STATE_KEYS`) and
`run_data.js` (`sourceKeys`) list what gets saved — add new keys there. **Save Run Details** writes a gzip JSON
snapshot to `RunData/` (max 25 MB, id = 32-hex); re-saving the same Run Number offers cancel / replace latest /
new version. History stores runs in `Historian/Run_<n>.sqlite` and compares tables between runs.
Static JS/CSS use `?v=N` cache-busters — bump them when changing a file.

## Run Plan (universal template, v6.6) — `backend/services/run_plan_template.py`
- Detected by the Plan row "Reactor role"; otherwise the older fixed ranges (Plan A2:B2, A4:J14; DOE header row 10;
  Feed A2:E25) in `RunPlan.py` / `run_plan_service.py` are used. Example: `tests/fixtures/run_plan/RunPlan_Template.xlsx`
  (empty) and `RunPlan_Template_Filled.xlsx` (recalculated with LibreOffice so formula values exist).
- Plan: B1 Run ID, H1 Start date, B2 Objective, B3 Lab notebook ref., B4 Feed; Catalyst Loading Plan rows after the
  "Reactor" row (7) until the blank row (8-22: Reactor role Catalyst/Inert/Not used, Catalyst, …, Loaded catalyst
  weight, remarks). Active reactors = role Catalyst or Inert. Flow calculation basis / reactor flow basis are not shown.
- DOE: header row 10 (A..R: … H2 Flow, Naphtha/liquid Flow, N2 dilution, WHSV|LHSV, H2/Naphtha|GoR, Remarks, Duration,
  H2 flow NLPH, Total gas, Liquid flow if fed, Check); rows R1-R8 up to the "Step 0" title, kept only when T, P or
  space velocity is filled; Start/End (date, time) → `Start Date`/`End Date`; Catalyst column added from Plan. Row 9
  planned hours/run end → `doe.planned`; Step 0 table → `doe.pretreatment` (`totals` = every "… total (h)" row, e.g.
  one per block; `profile` = `prerun_profile()`: per block 3 points per step, temperature by phase with `None` gaps, right
  axis (pressure with 'Pressure change (h)', or gas / liquid flow), `total_h`, `feed_cut_in_h`; phase names and right axis
  from the template's Chart settings). Shown on the Run Plan **Pre-run** tab: columns up to Remarks + one Chart.js
  chart per block (`renderPrerun` / `drawPrerunCharts` in run_plan.js).
- DOE Step 0 pre-run (v6.6.4; drying, reduction, sulfiding, feed cut-in …), blank in the template, all on the DOE sheet:
  steps rows 110-139 (A..T: Step, Block, Start/End date (calc), Phase, Gas, Start T (default = previous target of the
  block), Target T, Ramp °C/h, Hold h, Pressure, Pressure change h (blank = at step start, else linear), Remarks, Gas flow
  NLPH, Liquid flow g/h, Ramp time, Step time, Start h, End h (per block, SUMIF), Check); totals rows 140/141 (read by the
  dashboard as before); settings rows 143-151 (Block-1 col E, Block-2 col H: feed cut-in = DOE C11/C59, hours to the
  phase-4 step, pre-run start, program time/end); chart settings 153-159 (5 renamable phase names E154:E158 = Phase
  drop-down + legend, right axis E159 Pressure / Gas flow / Liquid flow); graph data rows 170-259 (3 points per step;
  per block G-N / O-V: time, 5 phase temperatures, right-axis time, value; #N/A = gap); charts at X108 / X133.
  Built by `scripts/run_plan_examples/prerun_doe.py` (blank, or `doe` to convert an old Step 0 table). Plan, Feed and DOE
  rows 1-107 are not touched. Template: `tests/fixtures/run_plan/RunPlan_Template_Feed_SS.xlsx`; filled test file:
  `RunPlan_Isomerisation_Rheinland.xlsx`.
- Feed: Excel tables tbl_Feed (A1:F13 properties: label A, unit D, value E, note G), tbl_comp (A14:F45 liquid, Total row),
  tbl_compType (H14:K22), tbl_gas (M14:P31) + "Gas feed settings" (A46:E48) → `feed.tables`; flat `feed.rows` start
  with Carbon, Hydrogen, Molecular Weight (consumers read Carbon = row 1, MW = row 3), then other properties and filled
  components. Totals checked to 100 ± 0.5.
- Open item: condition assignment (Calculation table, Plots) matches DOE dates only, not per block/reactor.

## Isomerization calculations
- Online tags: temperatures `10i1TIC02` (R1–4) / `10i2TIC02` (R5–8), pressures `10i1PIC01` / `10i2PIC01`,
  N2 flows `10i1FIC01..04` (R1–4) / `10i2FIC01..04` (R5–8), feed `01i14FIC01..08`, `01i14FI01`, GC `ESTD_H2`,
  `ESTD_N2`, `Sampled_reactor`.
- Base table (`reconstruct_base_table`): `TOS[h]` from first timestamp; `Naphtha_online = 100 − (ESTD_H2+ESTD_N2)`;
  `H2_out = N2/(ESTD_N2/100)·(ESTD_H2/100)·0.0416·2`; `Naphtha_out = N2/(ESTD_N2/100)·(Naphtha_online/100)·0.0416·MW`;
  `Carbon_out = Naphtha_out·Carbon/100`; `Naphtha_in = Carbon_out/(Carbon/100)`;
  `Naphtha/H2 = Naphtha_online·MW/(ESTD_H2·2)`. Carbon and MW come from Run Plan feed properties.
- Yield (wof%): each COMPONENT_LIST row is matched to the nearest Base row within ±60 min (same reactor preferred,
  ties → earlier), value × `Naphtha_out/Naphtha_in`; `Gas` = C3&Below + i/n-butane etc., `C5+` = (C3…n-Octane
  range) − Gas, `H2_Consumption` = range − 100. Missing match / bad Naphtha → explicit `ERROR: ...` cells, never 0.
- Plots: condition filter uses Run Plan DOE Start/End dates; colours = reactors, marker shapes = DOE conditions;
  optional centred 3/5/7-point moving average; paper-size PNG at 300 DPI. Summary Dashboard: 12 plot slots
  (3×4) + one table snapshot, A4 print/PDF.
- Custom table: Excel-like formulas evaluated by a whitelisted AST evaluator (no `eval`), cycle detection,
  cell lineage inspector, CSV and JSON template import/export.
- Data Integrity: per Run/Condition/Reactor/Parameter stats and MAD-based outlier flags; never modifies data.

## Reforming (v6.4, dormant since v6.6) — details in `REFORMING_PROGRESS.md`
- Process selector after Run Number on the shared Run Plan page; switching clears the loaded Run Plan and stays on
  `run_plan.html`. The process is never inferred from the workbook.
- **Unified Run Plan** (2026-10-28): both processes use one `RunPlan.xlsx` format — `Plan` (objective, R1–R8 Catalyst
  Loading Plan, optional column-A labels with values in column C: `Feed SL ID`, `Feed Cut-In`, `Feed molecular weight`),
  `DOE` (header row 10, data from row 11, optional column N `Catalyst`; blank inherits the Plan catalyst of that reactor),
  `Feed` (`E2` Carbon, `E3` Hydrogen, `E4` MW). Payload has `planData.info` and `summary.active_reactors`. Legacy
  reforming workbooks (`Run Information` row or `Feed DHA` sheet) are rejected with a migration message.
  `data/RunPlan_Reforming.xlsx` is a reforming example in this format (R1 PS-210, DOE 1-3 PS-210, 4-6 R-434).
- DHA: Table-1 = CARBON_TABULAR with the Unknown row split by Carbon#; Table-2 = unknown-peak audit; Table-3 =
  RON, MW, Carbon, Hydrogen, SG. Unknown Carbon# rule: lumped `Cn Unknowns` rows keep n; `Unidentified` rows take
  the neighbours' Carbon# if equal, else the previous identified peak's (leading → next; none → round(RI/100));
  clamp C1–C15; a lump already counted in a family (Below C4 → Olefins C4) is not double counted.
  UID is SAMPLE_ID trimmed to e.g. `R18_C1_S1_004`.
- Calculation: Base table uses temperature `10i2TIC01`; Yield tab hidden; tab "Reforming CARBON_TABULAR(%WGT)"
  (Date, Condition, TOS from Feed Cut-In, Reactor, UID, 6 families × C1–C15, Total, physical properties) with
  CSV export (2 header rows, dates written as `="dd/mm/yyyy hh:mm"`) and **Export Complete** (operating data
  joined to DHA within −10..+60 min).
- SharePoint/OneDrive sync: reads a locally synced "Online DHA Results" folder (`config/reforming_sync.json`),
  auto-syncs every 5 min when file signatures change.
- Open items: "Sync from Online Analysis" fallback still uses isomerization temperature mapping; reforming wof%
  (Reactor1 sheet) not done; History / Summary Dashboard plan tables assume R1–R8 columns.

## Online Analysis units (v6.8) — `backend/services/online_units.py`, `/api/online-units`
- Units selector on the Online Analysis table: **Normalised mol%** (the imported ESTD values), **Mass flow rates (g/h)**,
  **Volumetric flow rates (Nl/h)**, **TOS carbon of each molecule (g C/h)**. Formulas of the MassBal workbook (Ver2.2,
  R#_MB / Gas / Run_Plan), argon = internal standard, y = ESTD mol% of the injection:
  F_r = 01i14FI01 · FIC_r / ΣFIC (Gas!B12); F_Ar,r = F_r · w_Ar (Gas!G20); m_i = y_i·MW_i/(y_Ar·39.948) · F_Ar,r (rows 52-80);
  V_out = FIC_r[NmL/h]/1000 · y_Ar,feed / y_Ar, V_i = y_i/100 · V_out (rows 86-116; the workbook's D86 mixes g/h and NmL/h:
  159.7 Nl/h for 3 Nl/h feed, so the argon balance it intends is used); C_i = 12.011 · nC_i / MW_i · m_i (rows 121-150).
- MWs and carbon atoms = experimental standards of the workbook (R#_MB columns B and AD; H2S, Propadiene: standard
  values; lumped peaks C3-C4, C4-C5, C5-C6, C6-C8 have no MW → `ERROR: no MW`). Feed gas MWs (Run_Plan row 37) give
  w_Ar from the Run Plan Feed → Gas feed composition (Argon mol%; 'Other' has no MW and adds no mass, as in the workbook);
  Ar mol% / wt% can be entered on the page instead. TOS from the Run Plan Feed Cut-In (else the first record).
- Each line uses its own 01i14FI01 / 01i14FIC0r (else 02i2FIC0r); Reactor from `Sampled_reactor` or the Reactor Map
  (1, 1.0, "R1"). Status per line: OK or `ERROR: …` (bypass / no reactor, no argon peak, no gas feed to Rr, no GC values,
  feed argon not set). Converted rows are not stored (the unit, hidden columns and entered Ar values are, in
  `dhaOnlineState`). Loader fix: `ESTD_C6 Above` = `Area_C6 Above` when `Conc_C6 Above` is empty (export column shift).
- Tests: `tests/test_online_units.py` reproduces R6_MB mass and carbon flows of `tests/fixtures/online/R6-C1-S1-MassBal_Ver2.2.xlsx`
  exactly and runs the R08 export (`tests/fixtures/online/Result_R08-…txt`) with `RunPlan_MassBalance_SS.xlsx`.

## Working conventions seen in this codebase
- One dashboard for every experiment (v6.6): no process gates in new code. `window.ILSProcess` is fixed to
  'isomerization' only to keep the dormant reforming checks off.
- Make previous versions recoverable (versioned folders, `backups/<date>_<topic>/`); record changes in
  `CHANGELOG.md`, `README.md` and, for reforming, `REFORMING_PROGRESS.md`.
- Errors are shown explicitly in tables rather than silently replaced with zero.
