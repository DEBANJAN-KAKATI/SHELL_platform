# ILS — platform reference

"ILS" is the name for this application: the **ILS Dashboard** (README title "DHA Data Dashboard"), version
in `VERSION` (6.5.3). It is a local Flask web app for a pilot-plant test rig: it loads gas-chromatography DHA
(Detailed Hydrocarbon Analysis) results, online process/historian data and the Run Plan workbook, joins them by
timestamp and reactor, calculates yields, and offers plots, a printable summary dashboard and saved runs.
Three processes: **Isomerization** (original, reactors R1–R8), **Reforming** (v6.4, Reactor 1 only) and
**Mass Balance** (v6.5, R1–R8 mass/carbon balance from the GC exports, see `MASS_BALANCE_PROGRESS.md`).

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
  (online `.txt` → `ONLINE_COLUMNS`, reactor mapping by `Sampled_reactor`), `reactor_map_service.py`
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
Mass Balance uses the same tabs (Offline Analysis → ZMB, Calculation table → `mb_calculation.html`).

## API
- `/api`: `health`, `settings`, `run-number` (GET/POST), `browse-folder`, `process` (DHA folder),
  `browse-reactor-folder`, `process-reactor-map`, `browse-online-file`, `process-online`,
  `apply-online-reactor-map`, `browse-run-plan-file`, `process-run-plan`, `feed-properties`,
  `process-calculation-base`, `calculate-yield-table`, `custom-table/{validate-formula,calculate,inspect-cell}`,
  `export-xlsx`.
- `/api/reforming`: `process`, `settings`, `sync-source` (GET/POST), `process-run-plan`, `operating-data`.
- `/api/mass-balance`: `browse-file`, `import-txt`, `import-workbook`, `gc-map` (GET/POST), `calculate` (results, views,
  flat `tables`), `export-xlsx`.
- `/api/run-data/runs` (GET list, POST save), `/api/run-data/runs/<run_id>` (GET).
- `/api/historian`: `runs`, `runs/<n>/exists`, `runs/<n>`, `save`, `compare`.
- `/api/data-integrity/{config,analyze}`.

## State model
All working data lives in the browser tab's **sessionStorage** (use one tab across pages). Keys:
`ils_run_number`, `ils_process`, `runPlanDashboardState`, `ils_feed_properties`, `dhaDashboardState` (offline),
`dhaOnlineState`, `dhaDateTimeFilter`, `ils_base_table_state`, `ils_yield_table_state`, `ils_custom_table_state`,
`ils_custom_columns`, `ils_plot_preferences`, `ils_reforming_offline`, `ils_reforming_carbon_state`,
`ils_reforming_sync`, `ils_mb_inputs`, `ils_mb_imports`, `ils_mb_results`; localStorage `ils_reforming_autosync`. `historian_save.js` (`STATE_KEYS`) and
`run_data.js` (`sourceKeys`) list what gets saved — add new keys there. **Save Run Details** writes a gzip JSON
snapshot to `RunData/` (max 25 MB, id = 32-hex); re-saving the same Run Number offers cancel / replace latest /
new version. History stores runs in `Historian/Run_<n>.sqlite` and compares tables between runs.
Static JS/CSS use `?v=N` cache-busters — bump them when changing a file.

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

## Reforming (v6.4) — details in `REFORMING_PROGRESS.md`
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

## Mass Balance (v6.5) — details in `MASS_BALANCE_PROGRESS.md`
- `window.ILSProcess` values `isomerization | reforming | massbalance`. Same main tabs for every process; for
  massbalance: Run Plan → Plan/Liq/Gas (`mb_run_plan.js`), Analysis → ZMB (`zmb.html`, replaces Offline) + Online
  Analysis (run export), Calculation table → `mb_calculation.html` (R#_MB / C-Balance / Summary). `mb_core.js` keeps
  `ils_mb_inputs` and publishes `ils_mb_rep_table` / `ils_mb_summary_table` for Plots, Data Integrity, Custom table,
  Summary Dashboard and History. navigation.js redirects index↔zmb and calculation_table↔mb_calculation by process.
- `backend/mass_balance/` (self-contained): `txt_loader` (ZMB export 152 cols, run export 161 cols; by header name;
  `ÿ` = none; C6 Above raw ESTD in `Area_`; `Conc_C8 Unknowns` = GC total), `workbook` (blue cells + GC tables of a
  MassBal Ver2.x .xlsx), `engine` (formulas, workbook cell refs in comments), `service`, `views`, `export`, `routes`
  (`/api/mass-balance/*`). GC map `config/mass_balance_gc_map.json`.
- Key formulas: m_i = y_i·MW_i/(y_Ar·39.948)·Ar_r with y = ESTD mol%; Ar_r = FI01·V_r/ΣV·w_Ar; MB closure
  = 100·(gas product w/o Ar + aq + HC)/(gas feed w/o Ar + liquid feed); C in gas feed from C2H2/CH4/C2H6/C2H4 only;
  mixed gas = ZMB R1 block (ESTD, not normalised). Golden tests: `tests/test_mass_balance_*.py` (Ver2.2, 1 811 cells).
- State keys `ils_mb_inputs`, `ils_mb_imports`, `ils_mb_results`, `ils_mb_rep_table`, `ils_mb_summary_table`.
- Run Plan for Mass Balance = shared RunPlan.xlsx format (Plan, DOE, Feed) + **Liq** sheet (`backend/mass_balance/run_plan.py`;
  DOE Gas/Liquid Flow per reactor, Feed liquid + gas feed, Liq samples + ZMB liquid reps). Example built by
  `scripts/build_mass_balance_run_plan.py` → `tests/fixtures/mass_balance/RunPlan_MassBalance_R08.xlsx`.
- TLP flow divides by hours since the sample window start (= Run Start for the first sample, as in the workbook).
  Reactors with GC but 01i14FIC0r = 0 in the window get `ERROR: no gas feed …`. Tables use fixed column widths.

## Working conventions seen in this codebase
- Keep isomerization behaviour unchanged when adding reforming work; gate reforming code on
  `window.ILSProcess` / `process === 'reforming'`.
- Make previous versions recoverable (versioned folders, `backups/<date>_<topic>/`); record changes in
  `CHANGELOG.md`, `README.md` and, for reforming, `REFORMING_PROGRESS.md`.
- Errors are shown explicitly in tables rather than silently replaced with zero.
