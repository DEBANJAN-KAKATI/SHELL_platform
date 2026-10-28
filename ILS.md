# ILS — platform reference

"ILS" is the name for this application: the **ILS Dashboard** (README title "DHA Data Dashboard"), version
in `VERSION` (6.4.0). It is a local Flask web app for a pilot-plant test rig: it loads gas-chromatography DHA
(Detailed Hydrocarbon Analysis) results, online process/historian data and the Run Plan workbook, joins them by
timestamp and reactor, calculates yields, and offers plots, a printable summary dashboard and saved runs.
Two processes: **Isomerization** (original, reactors R1–R8) and **Reforming** (v6.4, Reactor 1 only).

## Run / stack
- Python 3, Flask 3, pandas 2, olefile + xlrd (legacy `.XLS` read via the OLE `Workbook`/`Book` stream), openpyxl.
- Windows-first: `run_dashboard.bat` picks Python in order: working `.venv` / `.venv-local` → new venv from an installed
  Python 3.9-3.14 (`py`, PATH, standard folders) → downloaded embeddable 3.12 in `.python-runtime` (its `python312._pth`
  is rewritten each start and includes `..` so `import app` works). pip runs only when packages are missing or
  `requirements.txt` differs from the stamp `ils-requirements.txt` next to python.exe; then `run_app.py` →
  http://127.0.0.1:5001. Keep `.bat` files CRLF (`.gitattributes`); avoid set-and-use of a variable inside one `( )` block.
  The embeddable runtime has no tkinter, so Browse uses the PowerShell dialog fallback in `dialog_service.py`.
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
  `unknowns.py`, `service.py`, `run_plan.py`, `operating.py`, `sync_source.py`, `routes.py`.
- `features/data_integrity/` — removable plug-in (own blueprint, HTML/JS/CSS, README).
- `frontend/` — static HTML pages + vanilla JS (Chart.js, Lucide icons, no build step). `navigation.js` builds the
  top nav, Run Number box, Process selector/badge (`window.ILSProcess`), reset button.
  `reactor_map.html` is a large self-contained page.
- `scripts/` — `build_reforming_run_plan.py` (→ `data/RunPlan_Reforming.xlsx`), `ValveOpening.py`,
  `build_static_snapshot.py`.

## Pages (nav order)
Runs `/` (`run_data_home.html`) → Run Plan (`run_plan.html` or `run_plan_reforming.html`) → Analysis: Offline
(`index.html`), Online (`online_analysis.html`) → Calculation: Calculation table, Custom table → Data Integrity
(`/data-integrity`) → Plots → Summary Dashboard (`plot_dashboard.html`) → History (`history.html`).

## API
- `/api`: `health`, `settings`, `run-number` (GET/POST), `browse-folder`, `process` (DHA folder),
  `browse-reactor-folder`, `process-reactor-map`, `browse-online-file`, `process-online`,
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
- Process selector after Run Number on the Run Plan page; switching clears the loaded Run Plan.
- Default Run Plan `data/RunPlan_Reforming.xlsx` (tabs Feed / Feed DHA / Catalysts / Conditions / DOE);
  catalysts PS-210 then R-434, both in R1.
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

## Working conventions seen in this codebase
- Keep isomerization behaviour unchanged when adding reforming work; gate reforming code on
  `window.ILSProcess` / `process === 'reforming'`.
- Make previous versions recoverable (versioned folders, `backups/<date>_<topic>/`); record changes in
  `CHANGELOG.md`, `README.md` and, for reforming, `REFORMING_PROGRESS.md`.
- Errors are shown explicitly in tables rather than silently replaced with zero.
