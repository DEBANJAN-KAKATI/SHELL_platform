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
