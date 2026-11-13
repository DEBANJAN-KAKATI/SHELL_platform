# ILS Dashboard (DHA Data Dashboard) v6.9.10

Local web dashboard for the ILS multi-reactor test unit. It reads the Run Plan workbook, the offline DHA reports, the
online GC / process export and the liquid product data, joins them by time and reactor, and calculates base and yield
tables, the mass balance (any chemistry), plots, a printable summary and saved runs. Double-click `run_dashboard.bat`;
the version is shown on the right of the menu bar. The full technical reference is [ILS.md](ILS.md); the history of
changes is [CHANGELOG.md](CHANGELOG.md); the user and technical documentation is
`documentation/ILS_Dashboard_Documentation.docx`.

## Workflow

| Step | Page | What to do |
|---|---|---|
| 1 | **Run Plan** | Enter the Run Number, click the process tab (Isomerization, Reforming, General_MB), load the Run Plan; check Feed, Plan, DOE, Pre-run |
| 2 | **Analysis → Offline** | Process the DHA report folder; optional Reactor Map (valve states) |
| 3 | **Analysis → Online** | Import the GC / process export (Gas tab); General_MB: choose the Internal Standard and units |
| 4 | **Analysis → ZMB** (General_MB) | Import the blank-run export; enter the liquid pump check |
| 5 | **Analysis → Online → Liquid** (General_MB) | Enter the liquid samples (collection window, TLP or HC + aqueous mass, carbon wt%) |
| 6 | **Calculation** | Calculation table (Base, Yield wof%), Custom table, and for General_MB the **Mass Balance** |
| 7 | **Data Integrity** | Statistics and MAD-based outlier flags (never changes data) |
| 8 | **Plots / Summary Dashboard** | Scatter plots by reactor and condition; mass balance plots; A4 board with 12 plots and one table |
| 9 | **Save** | Save Run Details (RunData snapshot) or Save to Historian (one SQLite file per run); reload from **Runs**, compare in **History** |

Use one browser tab for a run: the working data is kept per tab. The ↻ button resets the tab and the Run Number.

## Processes (v6.9)
On the **Run Plan** page the process tabs follow the Run Number (locked until a Run Number is entered); the other pages
show the process as a badge. Switching the process clears the loaded Run Plan; the process is never taken from the workbook.

| Process | What it adds |
|---|---|
| **Isomerization** (default) | DHA tables (CARBON_TABULAR, COMPONENT_LIST, octane), Base table, Yield wof%, Custom table, Plots |
| **Reforming** | Reforming DHA with unknown peaks assigned to a carbon number, Reforming CARBON_TABULAR tab with CSV / Export Complete, optional sync from a synced SharePoint folder |
| **General_MB** | Isomerization pages plus the internal-standard gas flows, Liquid tab, ZMB page, Calculation → Mass Balance and mass balance plots |

## Run Plan: one template for every experiment (v6.6)
The universal template has the sheets **Plan** (run, objective, catalyst loading plan with the role of each reactor),
**DOE** (conditions per block and reactor with start / end or duration, flows; Step 0 pre-run programme) and **Feed**
(feed properties, liquid components, group-type summary, gas feed composition and, since v6.9.1, the **Molecular
weights** table). The dashboard shows Feed, Plan, DOE and **Pre-run** (steps and one temperature / pressure chart per
block). Older RunPlan.xlsx files still load.

**Molecular weights (v6.9.1).** Every molar mass and carbon number comes from the Run Plan: the gas feed table has
**MW (g/mol)** and **Carbon #** columns, and the **Molecular weights** table lists every component as it is named in the GC
export (ESTD_<name>), with spare rows for new molecules. Add them to an older Run Plan with
`python scripts/run_plan_examples/add_molecular_weights.py RunPlan.xlsx`. The values are used by the calculations only
and are not shown on the Run Plan page.

For a mass balance the Run Plan needs: DOE conditions with condition number, block, reactor, start and end (or duration);
the total gas flow per reactor and condition (used when the export has no flow columns); the Feed Cut-In; the measured
gas feed composition. The liquid feed analysis is not part of the Run Plan (it is entered on the Liquid tab).

## Analysis

### Offline Analysis
Process the DHA (.XLS) folder: Table-1 CARBON_TABULAR(%WGT) (Unknown, Unknowns or Unidentified accepted), Table-2
COMPONENT_LIST, Table-3 octane numbers; the **Reactor Map** tab shows the R1–R8 valve states with a From / To filter.
In Reforming, Table-1 splits the Unknown row by carbon number (lumped `Cn Unknowns` keep n; `Unidentified` takes the
neighbouring identified peaks' carbon number; lumps already counted in a family are not counted twice), Table-2 lists
every unknown peak with the reason, Table-3 holds RON, MW, Carbon, Hydrogen and SG.

### Online Analysis (Gas)
Import the tab-delimited SystemTxt export. Every line has a **Condition** column (v6.9.4): the Run Plan DOE condition
whose window of that reactor contains the line time, blank outside every window; bypass lines list the condition of each
block when they differ ("Block-1: 2, Block-2: 1").

With **General_MB**, choose the **Internal Standard** (Argon or N2). The bypass (reactor 0) lines of each DOE condition give
the feed gas composition; a side panel shows it with the average IS flow to each reactor. The **Units** selector then shows
**mass (g/h)**, **volumetric (Nl/h)** or **carbon (g C/h)** flows, calculated like the MassBal workbook. The gas feed comes
from the export line, else from the Run Plan DOE condition running at that time; TOS counts from the Feed Cut-In. Lines
that cannot be calculated show an ERROR status (bypass, no internal-standard peak, gas off, no DOE condition), never zero.
The formulas, flow sources and molecular weights are in the collapsed **Conversion basis** block. Isomerization and
Reforming show mol% only.

### Online Analysis (Liquid, General_MB, v6.9.5)
The liquid side of the mass balance, typed by the user: the carbon wt% of the liquid feed (once) and, per sample (one tab
per sample, "+ New sample") and reactor, sample collection started / finished ("Apply times" for all reactors), TLP mass
(or the HC and aqueous phases with **Two phases seen**) and the carbon wt% of the HC product; optional H, O, N, S,
density and aromatics. The tab calculates duration, TOS, decantation loss, HC and aqueous product flows over the sampling
duration and the carbon in the liquid product and feed; the liquid feed flow comes from the ZMB pump check, else the Run
Plan DOE. Each reactor shows whether it is ready for the mass and the carbon balance. Enter moves to the next reactor; a
block copied from Excel can be pasted into any cell (US, dotted or ISO dates, decimal comma).

### ZMB (General_MB, v6.9.2 – v6.9.3)
**Analysis → ZMB** imports the GC export of the blank run and shows it like the Online table. The **Liquid collected per
reactor** card is the liquid pump check: one tab per repeat, collection start / end and collected mass per reactor; it
shows the duration, TOS and liquid flow, and the **verified liquid flow** averaged over the repeats, which the mass
balance uses as the liquid feed.

## Calculation

### Calculation table and Custom table
**Base table**: TOS, H2 / naphtha flows and ratios from the online data and the Run Plan feed properties. **Yield (wof%)**:
each Table-2 sample is matched to the nearest Base row within ±60 min (same reactor preferred, equal distance → earlier);
missing matches and invalid naphtha values are explicit errors. **Custom table**: Excel-like formulas on any column
(whitelisted evaluator, cycle detection, cell inspector, CSV / JSON templates). Reforming adds the Reforming
CARBON_TABULAR(%WGT) tab (Date, Condition, TOS, Reactor, UID, families × C1–C15, properties) with CSV export.

### Mass Balance (General_MB, v6.9.6 – v6.9.10)
One plain page like the Isomerization calculation table, for **any chemistry** (no reaction, reactant or product is fixed;
the default reference reactant is the component whose carbon is consumed most):

- **Reactor table** – one row per liquid sample and reactor (a condition without a liquid sample is "gas only"): TOS, GC
  lines averaged, carbon in / out of gas and liquid, **carbon balance**, gas-phase carbon balance, gas / liquid feed, gas,
  HC and aqueous product, **mass balance**, carbon recovered in the liquid, conversion of the reference reactant. The header
  holds the internal standard and how the GC lines are averaged (whole condition without the first line – default –, all
  lines, or ± hours around the liquid sample).
- **Component table** – like the Offline component filter, pick the **Components** (grouped: reference, in the feed,
  formed, "Liquid hydrocarbons", gas lumps by carbon number "Gas C2", "Gas C4+" …), the **Reference** reactant(s), the
  **Values** and the **Basis** (carbon g C/h, mass g/h, mole mmol/h):

| Value | Definition |
|---|---|
| In, Out, Net | flow into and out of the reactor, and out − in |
| Conversion | (in − out) / in × 100, consumed components only |
| Selectivity | (out − in) / reference reactant(s) converted × 100 |
| Yield | (out − in) / reference reactant(s) fed × 100 (= conversion × selectivity) |
| Yield wof% | out / total feed × 100 (mass), as the Isomerization yield table |

Missing inputs show as ERROR text; hover a value to see its formula with the numbers. Both tables export to CSV and are
saved with the run. The workbook (MassBal Ver2.2) is described cell by cell in
[documentation/MassBal_Workbook_Reference.md](documentation/MassBal_Workbook_Reference.md).

## Plots and Summary Dashboard
**Plots**: X / Y from the Yield, Base, octane and Custom table columns; colours = reactors, marker shapes = DOE
conditions; Reactor and Condition filters (DOE Start / End windows), date range, optional centred 3/5/7-point moving
average per reactor and condition, reactor-wise connecting lines, axis limits and editable axis titles, point exclusion,
paper-size PNG export at 300 DPI. With **General_MB** a row of choices adds the mass balance (v6.9.10): **Data** (per GC
injection, per sample, or the calculation tables), **Chart** (X–Y; Carbon in → out; Selectivity / yield by component),
**Component**, **Value**, **Basis** and **Reference reactant**. The X–Y chart keeps all the plot features; X can be TOS or any
other value (for example selectivity vs conversion).

**Summary Dashboard**: a 3 × 4 board; **Add to Dashboard** on Plots captures the current plot, **Add table** adds a Yield,
Base, Custom, Plan or DOE table with Reactor / Condition filters. **Print / PDF** prints A4 portrait; long tables continue
with repeated headers. Snapshots persist in the browser tab.

**Data Integrity** (optional plug-in): statistics and MAD-based potential outliers per Run / Condition / Reactor / Parameter;
hide it with `DASHBOARD_DATA_INTEGRITY=0`; see [features/data_integrity/README.md](features/data_integrity/README.md).

## Saving runs
**Save Run Details** writes the tab's sources, table definitions, Liquid / ZMB entries, mass balance choices and plot
settings as a gzip JSON snapshot in `RunData/`; saving the same Run Number again offers cancel, replace latest or new
version. The **Runs** page (`/`) lists and loads saved runs, or starts with fresh data. **Save to Historian** writes `Historian/Run_<n>.sqlite`;
**History** compares tables between runs.

## Run on Windows
Double-click `run_dashboard.bat` (or `./run_dashboard.ps1`). The launcher uses, in order: a working `.venv` /
`.venv-local`; an installed Python 3.9+ that already imports the app (no downloads); a new `.venv` from an installed
Python; only when no Python is installed, a private Python 3.12 in `.python-runtime`. Packages are installed only when
missing or after `requirements.txt` changes (Python 3.15+ gets pandas 3, older Python pandas 2). If the network blocks
pypi.org (403), run `py -m pip download -r requirements.txt -d wheels` on a computer with internet and the same Python
version, copy the `wheels` folder here and start again. The dashboard opens at http://127.0.0.1:5001 (host / port in
`config/settings.json`); a busy port moves to the next free one, and a dashboard already running from the same folder is
reused. After an update, close the old dashboard window first and press Ctrl+F5 once. Set `DASHBOARD_USER` and
`DASHBOARD_PASS` to require a login when sharing.

## Run with Docker
```powershell
$env:DASHBOARD_SECRET_KEY = "replace-with-a-long-random-secret"
docker compose up --build
```
Open http://localhost:5001. `data/` is mounted at `/app/data`; RunData is kept in the `dashboard-rundata` volume. Override
the sources with `DASHBOARD_SOURCE_DIRECTORY`, `DASHBOARD_REACTOR_SOURCE_DIRECTORY` or `DASHBOARD_RUN_PLAN_FILE`.

## Tests
`python -m pytest -q tests` (47 tests: Run Plan reader and molecular weights, online units and the internal standard
against the MassBal workbook, R08 conditions, mass balance).
