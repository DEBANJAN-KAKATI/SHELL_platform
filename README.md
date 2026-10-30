# DHA Data Dashboard v6.4.0
Double-click `run_dashboard.bat`. Table-1 accepts Unknown, Unknowns, or Unidentified as the Unknown component. If the optional Unknown source column is absent, the other five Table-1 components still process and an empty Unknown row is retained.

### Reforming process (v6.4)
On the single **Run Plan** page, enter the Run Number and choose **Process: Reforming** (default is Isomerization). Both processes use the same `RunPlan.xlsx` workbook format with `Plan`, `DOE`, and `Feed` sheets; the process selector, not the workbook, controls the process. The optional Plan labels `Feed SL ID` and `Feed Cut-In` identify reforming feed samples and TOS. Other pages show the selected process as a badge; switching the process clears the loaded Run Plan.

In Reforming mode, **Offline Analysis** reads the reforming DHA (.XLS) folder: Table-1 is CARBON_TABULAR(%WGT) with the Unknown row split by Carbon#, Table-2 lists every unknown COMPONENT_LIST row with its assigned Carbon# and the reason, and Table-3 holds RON, Molecular Weight, Carbon, Hydrogen and Specific Gravity. Unknown Carbon#:
- rows that carry a Carbon# (`C8 Unknowns`, `C7-Unknowns`, ...) keep it;
- rows without one (`Unidentified`, Carbon# 0) take the Carbon# of the neighbouring identified peaks when both match, otherwise the previous identified peak's Carbon#;
- a lumped row already counted in a CARBON_TABULAR family (e.g. `Below C4 Unknowns` under Olefins C4) is not counted twice.

**Calculation** shows the Base table (temperature tag 10i2TIC01) and the **Reforming CARBON_TABULAR(%WGT)** tab: Date, Condition (from the DOE), TOS (h, from the Feed Cut-In), Reactor, UID, then Paraffins / Iso Paraffins / Naphthenes / Aromatics / Olefins / Unknowns x C1-C15, Total and the properties, with decimals, date filter and CSV export (two header rows). The Feed sample (Run Plan "Feed SL ID") is labelled Condition "Feed". The Yield (wof%) table is not used for reforming yet. Isomerization behaviour is unchanged.

### Run workspace (v6.0)
The app opens at `/`, where you can select a saved run, view its metadata, load it, or start with fresh data. **Save Run Details** is available in the header of every analysis page and on the run workspace. It saves the browser tab's loaded source data, calculated-table definitions/results, and plot settings as a small gzip-compressed JSON snapshot under `RunData/` (without duplicating display tables). Multiple snapshots of the same Run Number are kept independently. Use the same browser tab across pages; Load Run replaces the current tab's state and returns to the page from which the run was saved. Start with fresh data clears the active tab's state but leaves saved RunData files intact.


### Reactor Map (v3.4.0)
Open the **Reactor Map** tab beside **Table-3 · Octane Table**. The packaged page is served locally from `/frontend/reactor_map.html` and retains From/To filtering for R1-R8 valve states.

### Plots (v6.0.0)
On the Plots page, use **Show moving-average trends** to draw separate dashed trends for each reactor and DOE condition. The centered 3/5/7-point moving average sorts by the selected X value, averages duplicate X values, and requires at least as many distinct X values as the window size; scatter points remain unconnected. Choose **Plot size** for physical paper dimensions (mm); fixed-size PNG exports use 300 DPI. Click an axis title in the chart to change its displayed label without changing the selected data column. X/Y selectors include Base Table tags and offer Custom Calculated Table tags after they have been calculated on the Custom table page in the same browser tab.
The multi-select **Condition Filter** uses each selected Run Plan DOE condition's Start Date and End Date as an inclusive time window. Date-only End Dates include the entire day. Conditions without a valid date range cannot be selected; load the Run Plan in the same browser tab before opening Plots.
Plot colors identify reactors; marker shapes identify matched DOE conditions. The separate condition legend shows the shape and point count for each plotted condition.

### Summary Dashboard (v6.0)
Open **Summary Dashboard** in the top navigation. The desktop board has three columns and four rows, with responsive layouts on smaller screens and no sidebar. On **Plots**, use **Add to Dashboard** to capture the current plot and its visible legends. Empty slots fill first; when all twelve are occupied, choose a plot to replace or cancel. Click a plot to enlarge it, or use its delete icon to free the slot.

New plot snapshots are rendered at card proportions with larger axis labels, without changing the original plot's paper dimensions or settings. Existing snapshots retain their proportions; re-add older plots to use the sharper card-sized rendering. Axes and legends are retained rather than cropped.

Use **Add table** on the dashboard to select a loaded Yield, Base, Custom, Plan, or DOE table and its columns. Plan and DOE become available after loading a Run Plan in the same tab. **Reactor** and **Condition** filters select matching rows when those fields exist; the Plan table's Reactor filter selects reactor columns instead. Unavailable filters are disabled. The first eight columns are selected initially; the chosen columns and matching rows are captured as a full-width table snapshot, with applied filters shown in the report metadata. Table and plot snapshots persist across reloads within the same browser tab, but are not a separate saved RunData report and do not survive closing the tab. Later source/filter changes do not change captured snapshots.

The dashboard's reset icon asks for confirmation before removing all plots and the table; it does not reset source data or the Run Number. **Print / PDF** opens the browser print dialog with A4 portrait styling. Select **Save as PDF** for a PDF file. Empty slots and controls are excluded; long tables continue onto additional pages with repeated column headers.

### Optional Data Integrity (v6.0)
Open **Data Integrity** between Calculation and Plots to review loaded Base or Yield data in the same tab. Statistical summaries and MAD-based potential outlier checks run independently per Run / Condition / Reactor / Parameter. Small and zero-MAD groups are unscored; ambiguous assignments, missing or invalid values, and duplicate selected measurements are flagged. Source records are never changed. Results can be exported to CSV or deliberately added to Summary Dashboard.

This feature has no new dependencies, external AI calls, or database migrations. To hide it, set `DASHBOARD_DATA_INTEGRITY=0` and restart. The complete feature lives in `features/data_integrity/`; the app continues to start if that folder is absent. See [the feature guide](features/data_integrity/README.md) for assumptions, limits, and exact clean-removal instructions.

### Yield Timestamp Matching
Yield rows keep the Offline Table-2 sample timestamp. Base readings are matched using full timestamps within an inclusive 60-minute window in either direction, including across midnight, month, and year boundaries. If the sample identifies a reactor, readings for that reactor are preferred within the window; otherwise the nearest reading is used. Equal-distance matches prefer the earlier timestamp. Missing matches and invalid Naphtha values remain explicit errors rather than being replaced with zero. Restart the app after updating the backend, then sync Calculation data to recalculate saved Yield rows.

### Save Run Details
The first save creates a RunData snapshot. Saving the same Run Number again asks whether to cancel, replace the latest file, or save a new version. Replacement updates only the selected latest snapshot; earlier versions remain available in Populate Run. Cancel leaves existing files unchanged.

### Run v6.4 on Windows
Double-click `run_dashboard.bat` (or run `./run_dashboard.ps1` in PowerShell). The launcher uses, in order: a working `.venv` / `.venv-local`; an installed Python 3.9 or newer (Python launcher `py`, PATH, or the standard install folders, including the Python Install Manager's `%LOCALAPPDATA%\Python\pythoncore-*`) that already has the packages, which starts with no downloads; a new `.venv` created from an installed Python; and only when no Python is installed, a private Python 3.12 downloaded into `.python-runtime`. Packages in `requirements.txt` are installed only when missing or after `requirements.txt` changes (Python 3.15+ gets pandas 3, older Python pandas 2). If the company network blocks pypi.org ("403 Forbidden"), run `py -m pip download -r requirements.txt -d wheels` in this folder on a computer with internet and the same Python version, copy the `wheels` folder here and start again: the launcher then installs offline from it. It opens http://127.0.0.1:5001 (host/port in `config/settings.json`); when that port is busy or blocked it uses the next free port and prints the address, and when the dashboard is already running it just opens it. To start it directly from the v6.4 folder, use `.\.venv\Scripts\python.exe .\run_app.py` in PowerShell.

### Run v6.4 with Docker
Docker packages the Flask application and its frontend, calculation services, feature modules, and Python dependencies into one image. From the v6.4 folder, build and start it with:

```powershell
$env:DASHBOARD_SECRET_KEY = "replace-with-a-long-random-secret"
docker compose up --build
```

Open http://localhost:5001. The Compose setup mounts the local `data/` folder at `/app/data` so source files and Run Plan workbooks are available to the container, while saved RunData is retained in the named `dashboard-rundata` volume. Set `DASHBOARD_USER` and `DASHBOARD_PASS` before `docker compose up` to enable login protection. The direct image command is:

```powershell
docker build -t dha-data-dashboard:6.4 .
docker run --rm -p 5001:5001 `
  -e DASHBOARD_SECRET_KEY="replace-with-a-long-random-secret" `
  -v dashboard-rundata:/app/RunData `
  -v "${PWD}\data:/app/data" `
  dha-data-dashboard:6.4
```

The container listens on `0.0.0.0:5001`, disables browser auto-opening, and uses `/app/data/input` and `/app/data/RunPlan.xlsx` as its default source locations. Override these with `DASHBOARD_SOURCE_DIRECTORY`, `DASHBOARD_REACTOR_SOURCE_DIRECTORY`, or `DASHBOARD_RUN_PLAN_FILE` when needed.
