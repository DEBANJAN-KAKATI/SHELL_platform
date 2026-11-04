# ILS Dashboard 6.4.0 → 6.4.1: new Run Plan (Feed in 4 tables, Pre-run with charts)

This update brings the new Run Plan to the 6.4 dashboard **with the process selection kept**
(Isomerization / Reforming). Mass Balance is not part of it.

What you get in 6.4.1:

| Where | What changes |
|---|---|
| Run Plan → **Feed** | Feed properties as tiles; **Liquid components**, **Group-type summary** and **Gas feed composition** as separate tables with totals and a 100 % check; empty rows hidden ("Show empty rows" shows them) |
| Run Plan → **Plan** | Run ID, start date, lab notebook, feed, catalyst loading plan with **Reactor role** (Catalyst / Inert / Not used); active reactors = Catalyst or Inert |
| Run Plan → **DOE** | Only the filled conditions; planned hours and run end above the table |
| Run Plan → **Pre-run** (new tab) | The DOE Step 0 steps (Step … Remarks) and one chart per block: temperature coloured by phase (Drying, Reduction, …, Feed cut-in) and pressure on the right axis |
| Reforming | TOS zero ("Feed Cut-In") is taken from the pre-run feed cut-in (else the start of condition 1) |
| Launcher | Opens only a dashboard from the same folder (no more old version opening); the menu bar shows the version, e.g. **v6.4.1** |
| Old Run Plan files | Still load exactly as before |

Everything was tested on a clean 6.4.0 copy: 13 automated tests pass, and in the browser the Feed / Plan /
DOE / Pre-run tabs, the Calculation table (Carbon / Hydrogen / MW from the Feed) and the process switch to
Reforming all work.

---

## Contents of this package

```
ILS_6.4.1_RunPlan_update/
├── UPDATE_GUIDE_6.4.0_to_6.4.1.md      this guide
├── check_my_version.py                  checks your folder before you copy anything
├── RunPlan_Template_Feed_SS.xlsx        the blank Run Plan template for the scientists
├── ILS_6.4.0_to_6.4.1.patch             the same update as a git patch (optional, Step B)
└── files/                               every new or changed file, in the dashboard's folder layout
    ├── VERSION, CHANGELOG.md, ILS.md, .gitignore, run_app.py
    ├── backend/routes/api.py
    ├── backend/services/run_plan_service.py
    ├── backend/services/run_plan_template.py          (new)
    ├── frontend/run_plan.html, frontend/js/run_plan.js, frontend/css/run_plan.css (new)
    ├── frontend/js/navigation.js
    ├── frontend/{calculation_table,custom_table,history,index,online_analysis,plot_dashboard,plots}.html
    ├── scripts/run_plan_examples/prerun_doe.py        (new)
    └── tests/test_run_plan_template.py + tests/fixtures/run_plan/*.xlsx   (new)
```

---

## Step 0 — Close the dashboard and make a backup

1. Close every dashboard window (the black console window) and the browser tabs.
2. Copy your whole dashboard folder, e.g. `ILS_App\Dashboard` → `ILS_App\backups\2026-11-04_before_6.4.1\`
   (or zip it). If anything goes wrong you copy this folder back.

## Step 1 — Check your folder

Open a command prompt in the package folder and run (use your own path):

```
python check_my_version.py "C:\Users\<you>\ILS_App\Dashboard"
```

For each file it prints one of:

* **original** – your file is the untouched 6.4.0 file → replace it with the file from `files/`.
* **CHANGED** – you edited this file yourself → do **not** overwrite it; make the short edit described for
  that file in Step 3 by hand, so your own changes stay.
* **updated** – already done.

If every file says *original*, the quickest way is Step 2 (copy everything). Otherwise go through Step 3
file by file.

## Step 2 — Quick way: copy the files (all files "original")

Copy the **contents** of `files/` into your dashboard folder and allow Windows to replace the files
(the folders match: `files/backend/...` → `Dashboard/backend/...`). Then continue with Step 4.

> Alternative for a git checkout of 6.4.0 (Step B): `git apply --binary ILS_6.4.0_to_6.4.1.patch`.

## Step 3 — File by file (only needed for files marked CHANGED)

New files are always copied as they are:
`backend/services/run_plan_template.py`, `frontend/css/run_plan.css`, `scripts/run_plan_examples/prerun_doe.py`,
`tests/test_run_plan_template.py`, `tests/fixtures/run_plan/*.xlsx`.

### 3.1 `backend/services/run_plan_service.py` — use the new reader for the template

Below the line `from RunPlan import load_run_plan_data, read_excel_range` add:

```python
from backend.services.run_plan_template import is_template, process_template
```

In `process_run_plan_file`, right after the check that the file is an Excel file (`... got {path.suffix}")`)
and **before** `data = load_run_plan_data(str(path))`, add:

```python
    # The universal Run Plan template (Plan with "Reactor role", DOE with Step 0, Feed with 4 tables) has its own reader;
    # older RunPlan.xlsx files keep the fixed ranges below.
    if is_template(path):
        return process_template(path)
```

### 3.2 `backend/routes/api.py` — tell the launcher which folder runs

Replace the `health()` function by:

```python
@api.get("/health")
def health():
    # "root" lets run_app.py tell this dashboard apart from a copy in another folder on the same port.
    root = str(Path(current_app.root_path).resolve())
    return jsonify({"status": "ok", "version": current_app.config["APP_VERSION"], "root": root})
```

(`Path` is already imported in this file.)

### 3.3 `run_app.py` — open only a dashboard from the same folder

Replace the file with `files/run_app.py`. If you changed it yourself, the differences are:
`dashboard_running()` becomes `running_dashboard()` (returns the `/api/health` answer), the new function
`same_folder(health, base)` compares `health["root"]` with this folder, and the "already running" branch opens
the browser only when `same_folder(...)` is true — otherwise it prints that another version runs and starts on
the next free port. The start message shows the version (`Dashboard 6.4.1 address: ...`).

### 3.4 `frontend/run_plan.html` — Feed cards and the Pre-run tab

Replace the file with `files/frontend/run_plan.html`. If you changed it yourself, add these parts:

1. In `<head>` after the navigation script:
   ```html
   <link href="/frontend/css/run_plan.css?v=3" rel="stylesheet">
   <script src="/frontend/js/chart.umd.min.js" defer></script>
   <script src="/frontend/js/run_plan.js?v=8" defer></script>
   ```
   (remove the old `run_plan.js?v=2` line; `navigation.js?v=3`).
2. After the DOE tab button: the **Pre-run** tab button (`data-subtab="prerun"`, `id="tabPrerun"`).
3. In the Feed panel: the "Show empty rows" switch (`#feedShowEmptyWrap`), the `#feedTemplate` block
   (properties `#feedProps`, cards `#feedLiquid`, `#feedGroups`, `#feedGas`) and `id="feedLegacy"` on the old
   feed table wrapper.
4. In the DOE panel above `#doeImportStatus`: the bar `#doeBar` with `#doePlanned`.
5. After the DOE panel: the whole `#prerunPanel` block (title, `#prerunTotals`, `#prerunSummary`, the table
   `#prerunHead` / `#prerunBody`, `#prerunEmpty`, `#prerunCharts`).

Copy these blocks from `files/frontend/run_plan.html` – the ids must stay exactly as they are.

### 3.5 `frontend/js/run_plan.js` — show the new tables and the Pre-run charts

Replace the file with `files/frontend/js/run_plan.js`. This file is the 6.4.0 file plus the new Feed / DOE /
Pre-run code; it **keeps the process lines of 6.4** (the saved Run Plan belongs to one process):

```js
            process: window.ILSProcess?.get?.() || 'isomerization',          // in saveState()
        if (saved && (!saved.process || saved.process === (window.ILSProcess?.get?.() || 'isomerization'))) {   // restoreState()
```

If you changed `run_plan.js` yourself, take the new file and re-apply your own change to it (the new parts
are the functions `renderFeedTemplate`, `checkBadge`, `barCell`, `renderDoePlanned`, `renderPrerun`,
`drawPrerunCharts` and the `feedTables` / `feedShowEmpty` / `pretreatment` / `planned` state).

### 3.6 `frontend/js/navigation.js` — version badge (process selector stays)

After the line `addOptionalIntegrityTab();` add:

```js
    // Version of the running dashboard, so an old copy still open in the background is easy to spot.
    fetch('/api/health').then(r => r.json()).then(health => {
        if (!health?.version) return;
        const badge = document.createElement('span');
        badge.className = 'nav-version';
        badge.textContent = `v${health.version}`;
        badge.title = health.root ? `Dashboard ${health.version} · ${health.root}` : `Dashboard ${health.version}`;
        badge.style.cssText = 'margin-left:auto;align-self:center;font-size:11px;color:var(--slate);opacity:.75';
        tabs.appendChild(badge);
    }).catch(() => {});
```

### 3.7 The other pages — load the new navigation

In `calculation_table.html`, `custom_table.html`, `history.html`, `index.html`, `online_analysis.html`,
`plot_dashboard.html`, `plots.html` change `navigation.js?v=2` to `navigation.js?v=3` (so the browser loads the
new file instead of its cached copy). Nothing else changes in these pages.

### 3.8 `.gitignore`, `VERSION`, `CHANGELOG.md`, `ILS.md`

* `.gitignore`: add at the end
  ```
  # Run Plan templates and examples used by the tests are kept
  !tests/fixtures/**
  ```
* `VERSION`: `6.4.1`
* `CHANGELOG.md`: add the 6.4.1 entry from `files/CHANGELOG.md` at the top.
* `ILS.md`: add the section "Universal Run Plan template (v6.4.1)" from `files/ILS.md` and change the
  version in the first lines to 6.4.1.

## Step 4 — Put the template where the scientists find it

1. Copy `RunPlan_Template_Feed_SS.xlsx` to the Run Plan folder, e.g. `ILS_App\Data\RunPlan\`.
2. Optional: in `config/settings.json` point the default Run Plan file at a filled copy, e.g.
   `"default_run_plan_file": "C:\\Users\\<you>\\ILS_App\\Data\\RunPlan\\RunPlan_<run>.xlsx"`.

How the template is filled (one workbook per run, sheets **Plan**, **DOE**, **Feed**):

| Sheet | Fill in (yellow cells) |
|---|---|
| Plan | Run ID (B1), start date (H1), objective, lab notebook ref.; per reactor R1–R8: **Reactor role** (Catalyst / Inert / Not used), catalyst, shape & size, volume, CBD, LOI, loaded weight; flow basis (WHSV/LHSV, H2/HC or GoR) |
| DOE | Per block and condition (first row of each group of 4): start, temperature, pressure, space velocity, ratio, duration. The flows and the Check column are calculated. |
| DOE → **Step 0 – Pre-run** (row 108 down) | One row per step: Block, Phase, Gas, Start T (taken from the previous step), Target T, Ramp °C/h, Hold h, Pressure, Pressure change h (blank = at the start of the step, a value = linear over that time), Remarks, gas / liquid flow if used. Feed cut-in = start of condition 1 of the block; the step dates are counted back from it. Chart settings (row 153): rename the phases, choose the right axis (pressure, gas flow or liquid flow). Excel draws one chart per block next to the table. |
| Feed | Feed properties (ID, description, density, C, H, MW, RON, S, N, water), liquid components (wt%), group types, gas composition (mol%) and gas feed settings |

## Step 5 — Start and check

1. Start the dashboard with `run_dashboard.bat` as usual.
2. The menu bar shows **v6.4.1** on the right. If it shows an older version, an old dashboard window is still
   open: close it and start again (the new launcher also tells you this in the console).
3. Run Plan page: enter the Run Number, keep **Process: Isomerization**, load
   `tests\fixtures\run_plan\RunPlan_Isomerisation_Rheinland.xlsx` (filled example) and check:
   * **Feed**: tiles (Feed ID B00010665001, density 0.66, C 83.6, H 16.4, MW 89) and three tables with green
     "OK" badges (liquid 99.985 wt%, group types 100 wt%, gas 100 mol%).
   * **Plan**: Reactor role row, 8 active reactors.  **DOE**: 88 conditions, "Planned hours: Block-1 528 h".
   * **Pre-run**: 18 steps, badges "Block-1: 24.3 h · Block-2: 35.6 h", two charts — Block-1 rises 25 → 300 °C
     (Drying, blue), 150 → 300 → 210 °C (Reduction, orange), Feed cut-in (grey) at 23.3 h, pressure dashed
     1 → 5 barg at 14.5–15.5 h and 25 barg from 22.3 h.
4. Calculation → Calculation table: the feed strip shows *Carbon 83.60 wt% · Hydrogen 16.40 wt% · Molecular
   Weight 89.00 g/mol*.
5. Back on Run Plan, switch **Process** to Reforming (the loaded Run Plan is cleared, as in 6.4), load the same
   file again: the Pre-run tab shows the same charts and Reforming uses Feed Cut-In 2026-09-04 14:00 for TOS.
6. Load one of your older Run Plan files: it still loads as before (one feed list, no Pre-run steps).
7. Optional, automated: in the dashboard folder run `python -m pytest -q` → `13 passed`.

## Step 6 — If something goes wrong

* Copy the backup folder from Step 0 back.
* The browser shows the old page after the update → press Ctrl+F5 once (the `?v=` numbers normally prevent this).
* "Run Plan Loaded" but an empty Pre-run tab → the workbook has no Step 0 steps yet, or it is an old-format file.
* A message "Failed" right after switching the process comes from the default Run Plan path in
  `config/settings.json` (it is loaded automatically when the tab has no Run Plan yet); set it to an existing file
  or ignore it and load your file.

## Not included (later)

* Mass Balance (process, ZMB import, MB calculation).
* The calculation table and import analysis for other experiments still work in the Isomerization / Reforming
  format of 6.4.
* Condition assignment in the Calculation table / Plots uses the DOE dates only (not per block / reactor).
