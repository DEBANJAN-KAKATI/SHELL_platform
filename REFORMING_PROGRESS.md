# v6.4 — Reforming process (released 2026-10-14; runs from run_dashboard.bat on port 5001)

v6.4 is a copy of v6.3 (v6.3 is left untouched as the backup). VERSION = 6.4.0.
Isomerization code is unchanged except `app.py` (2 lines that register the reforming blueprint).

## Decisions agreed with the user
- Unknown peak → Carbon#: walk COMPONENT_LIST in elution order. If the previous and next identified
  peaks have the same Carbon#, use it. If they differ, use the **previous** identified peak's Carbon#.
  Leading peaks (no previous) use the next peak. If there are no identified peaks, use round(RI/100). Values are clamped to C1..C15.
- Calculation page in reforming mode: existing Base table + new tab **"Reforming CARBON_TABULAR(%WGT)"**;
  Yield (wof%) hidden. Reforming wof% (Reactor1 sheet) is a later update.
- Reforming Base table temperature = **10i2TIC01** (10i1TIC02 reads a constant 350).
- Reforming runs in **Reactor 1 only**; catalysts PS-210 and R-434 are tested one after the other in R1.
- Process selector (Isomerization / Reforming) goes right after the Run Number on the Run Plan page.
- Export = CSV of the image-1 layout (Paraffins, Iso Paraffins, Naphthenes, Aromatics, Olefins, Unknowns ×
  C1..C15, then Total, Molecular Weight, RON, Carbon wt%, Hydrogen wt%, Specific Gravity).

## New DHA format (2026-10-14) — handled
- The HCE template now lumps unknowns per carbon number in COMPONENT_LIST: rows like `C8 Uknowns`, `C7-Unknowns`,
  `Below C4 Uknowns` with GROUP = CARBON# = n. These rows use the **given Carbon#** directly.
- Remaining `Unidentified` rows (CARBON# 0) still use the neighbour rule (R18 file: RI 901.31 -> C9, RI 1304.26 -> C13).
  Old exports without a C# use the neighbour rule for every unknown peak (02_B00010852001 unchanged: 8.7756).
- `Below C4 Uknowns` is already counted by HCE as **Olefins C4** in CARBON_TABULAR and is left out of the sheet UNKNOWNS.
  The loader detects a lump whose %WGT equals a family cell at its C# (only when the unknowns would exceed the sheet UNKNOWNS)
  and leaves it there instead of counting it twice. The audit table (Table-2, now with a Component column) says so.
  R18 file: Unknowns 4.8221 = sheet UNKNOWNS, row total 99.99997. (Ask the user whether Below C4 should move to Unknowns C4.)
- UID: SAMPLE_ID is cut at 29 chars (`R18_C1_S1_004_2026-10-12 19-5`) -> trimmed to `R18_C1_S1_004`.

## DONE (backend, all tested)
- `backend/reforming/` (separate package, does not import isomerization code):
  - `dha_loader.py`: reads both HEADER layouts (Hydrocarbon Expert `INJECTION_TIME_DATE 'OCT 09, 2026 - 12:39:52'`
    + SAMPLE_ID, and the isomerization B2/B6 layout), CARBON_TABULAR(%WGT) by header names, COMPONENT_LIST,
    properties (RON = OCTANE_NUMBERS TOTAL_CALCULATED_RON; Carbon/Hydrogen/MW from PHYSICAL_PROPERTIES;
    fallback MW = sum AVERAGE_MW; SG = sum AVERAGE_SG).
  - `unknowns.py`: the Carbon# rule above + per-peak audit (previous/next peak, basis).
  - `service.py`: `process_reforming_directory` → isomerization-shaped response (Table-1 with the Unknown row
    filled per Carbon#, Table-2 = unknown-peak audit, Table-3 = properties + TOS) + `reforming_rows`/`reforming_columns`
    (96 cols, keys like `Paraffins C6`, `Unknowns C8`, `Total`, ...).
  - `run_plan.py`: parses the reforming Run Plan workbook (label-driven; computes derived flows if formulas lack cached values).
  - `routes.py`: `POST /api/reforming/process`, `POST /api/reforming/process-run-plan`, `GET /api/reforming/settings`.
- `scripts/build_reforming_run_plan.py` → `data/RunPlan_Reforming.xlsx` (built from ILS_Chemical Validation_Reforming.xlsx):
  Plan (objective, run info, Feed Cut-In 08/10/2026 12:00, catalyst loading PS-210 / R-434), Conditions (1-3: 25 barg,
  210/220/230 °C, LHSV 1.5, H2/Naphtha 2, 72 h), DOE (6 rows, R1: cond 1-3 PS-210 dated Cut-In + 72 h each =
  ASSUMPTION; cond 4-6 R-434 dates blank), Feed (Carbon 85.33, Hydrogen 14.89, MW 102.2 first; density 0.7264 ...),
  Feed DHA, Feed SimTBP.
- Verified: reference `02_B00010852001_Ndat-Front Signal.XLS` reproduces image-2 exactly; Unknowns sum 8.7756 =
  sheet UNKNOWNS; row Total 100.00004. 88 unknown peaks, 44 with differing neighbours (largest 2.97 wt% at RI 666.94 → C6).
  The 43 isomerization DHA files also load through the reforming loader (all totals 100.00). Isomerization `/api/process` unchanged (43/43).

## DONE (frontend, 2026-10-14, verified in headless Edge on port 5002)
1. `navigation.js`: `window.ILSProcess` (sessionStorage `ils_process`, default isomerization). Run Plan pages get a
   Process `<select>` after Run Number (disabled until a run number exists); switching clears the loaded Run Plan
   (`runPlanDashboardState`, `ils_feed_properties`) and goes to the matching page. Other pages show a read-only Process
   badge. "Run Plan" nav link follows the process; opening the wrong Run Plan page redirects. Reset clears the process.
2. `run_plan_reforming.html` + `js/run_plan_reforming.js`: tabs Feed / Feed DHA / Catalysts (objective + run info) /
   Conditions / DOE; default file from `/api/reforming/settings`; writes `runPlanDashboardState` (same keys +
   `process:'reforming'` + full response in `reforming`) and `ils_feed_properties`.
   `run_plan.js` got one guard line (returns when the process is reforming).
3. Offline: `js/reforming_offline.js` (before dashboard.js) + 5 gated hooks in dashboard.js (Table-3 columns, process
   URL, store `ils_reforming_offline`, table titles, `process` saved in dhaDashboardState). Tabs renamed in reforming
   (Table-2 · Unknown Peaks, Table-3 · Properties). Warning when the saved tables were processed under the other process.
4. Calculation: tab "Reforming CARBON_TABULAR(%WGT)" + panel + `js/reforming_carbon_table.js`: two-row header,
   Date / Condition (DOE via assignBaseConditions) / TOS(h) (from Feed Cut-In, else first sample) / Reactor / UID,
   decimals (default 4), date filter, search, Export CSV with 2 header rows; state `ils_reforming_carbon_state`
   ({rows, columns, groups}). The sample whose UID contains the Run Plan "Feed SL ID" is labelled Condition "Feed".
   Gated edits in calculation_table.js: temperature tag 10i2TIC01, refreshYieldTable returns in reforming, Yield tab
   hidden, switchSubtab shows the new panel. Cache-busters: calculation_table.js?v=9, dashboard.js?v=9.
5. Data Integrity: source `ils_reforming_carbon_state` in index.html + app.js.
6. historian_save.js STATE_KEYS + `ils_process`, `ils_reforming_offline`, `ils_reforming_carbon_state`; Historian
   tables add "Calculation · Reforming CARBON_TABULAR(%WGT)"; run_data.js sourceKeys + the two data keys.
7. E2E: process switch -> reforming page auto-loads (16 / 2 / 6 / R1); Offline processes both DHA files; Calculation
   tab: 101 columns, R18 sample = Condition 2, TOS 104.18 h, Total 100.0000; CSV has 2 header rows; isomerization
   pages unchanged (badge Isomerization, Octane tab, run_plan.html link). Console: only favicon 404 and the
   isomerization default Run Plan path 400 (pre-existing).

## Still open
- "Sync from Online Analysis" backend fallback still uses the isomerization temperature mapping.
- Reforming wof% (Reactor1 sheet) is a later update.

## Notes to tell the user
- Excel Reactor1 sheet has an alignment bug (assumes iP starts at C4, N at C5, A at C6, O at C2) so e.g. Aromatics C6
  lands in "C4 (O)"; its Temperature row uses 10i1TIC02 (350).
- Exp. Plan says 25 barg but online 10i1PIC01 reads ~7.0 barg.
- History / Summary Dashboard plan tables expect R1..R8 columns; the reforming plan is per catalyst (not adapted, "other tabs").

## Formatting (2026-10-14, after release)
- Reforming CARBON_TABULAR tab: dark 2px line where each family / Total / Physical Properties starts (white in the
  black header), light 1px line between C# columns (classes `rf-group-start` / `rf-sub` in dashboard.css).
- Molecular Weight, RON, Carbon wt%, Hydrogen wt%, Specific Gravity sit under one "Physical Properties" header
  (display only; CSV export unchanged). Second header row sticks below the first (`--rf-head1`).
- Cache-busters: reforming_carbon_table.js?v=2, dashboard.css?v=64 (calculation page).
- CSV export only: Date is written as ="dd/mm/yyyy hh:mm" so Excel keeps it as shown (a plain date became the serial
  46303.66875 when copied / pasted as values into another workbook). Verified with Excel COM: CSV, normal paste and
  paste-values all show 08/10/2026 16:03; other columns stay numeric. Display unchanged. reforming_carbon_table.js?v=3.

## Export Complete (2026-10-14)
- Separate button "Export Complete" bottom-right of the Reforming CARBON_TABULAR panel -> `Reforming_Complete_<date>.csv`
  in the Raw Data layout of ILS_Chemical Validation_Reforming.xlsx: operating columns (file order, Date/Time .. GC Date/Time),
  Name_H2, Conc_H2, ESTD_H2, Area_H2, RT_H2, Conc_N2, ESTD_N2, Area_N2, RT_N2, N2 (Corrected), H2 (Corrected) [vol%],
  Date, Time Stamp, GC Data, GC Time Stamp, DHA Date/Time (the yellow column), 6 families x C1..C15, Total, Molecular Weight,
  RON, Carbon, Hydrogen [wt%], Specific Gravity. Two header rows. Dates/times written as ="..." text.
- New backend `backend/reforming/operating.py` + `POST /api/reforming/operating-data {path}` re-reads the Online Analysis
  .txt (dhaOnlineState.path) because the online parser drops Name_/Conc_/Area_/RT_. Corrected = (Area - 5710532)/4716081 (N2),
  (Area - 180057)/179209 (H2) from GC Calibration Data (7 Aug 2026). Isomerization parser untouched.
- Pairing: one row per operating record; a DHA sample joins the record whose GC Date/Time is closest, within -10..+60 min of the
  injection (DHA file time = GC Date/Time, injection ~12.6 min later). Unmatched DHA samples are added as rows with blank
  operating data. Panel From/To filter applies. DHA values use the panel decimals.
- Verified with the real data (DATA/Harish Sir Data/REFORMING: Operating Data.txt 48 records + 19 DHA files): 57 rows,
  11 paired exactly as the workbook Raw Data (19:57:05 -> 21:48 ...), 8 DHA re-runs of 12-13 Oct have no operating record.
  Raw Data values differ slightly (e.g. Paraffins C6 40.6253 vs 40.7134) because the DHA files were re-reported on 12 Oct.
- Fix: N2/H2 (Corrected) are written with at most 15 significant digits (Excel stored 16-17 digit values as text, green
  triangles). Verified in Excel: 94/94 cells are numbers. reforming_carbon_table.js?v=6 (frontend only, no restart needed).
- Export Complete layout changed per user (2026-10-14): NO N2/H2 (Corrected), Date, Time Stamp, GC Data, GC Time Stamp.
  Columns = operating tags (Date/Time .. 02i2FIC08) + ESTD_* + the other valid file columns in file order (GC Date/Time,
  Name/Conc/Area/RT of H2 and N2) + DHA Date/Time + 6 families x C1..C15 + Total, MW, RON, Carbon, Hydrogen, SG.
  "Error data" columns dropped server-side with the Yield Online-export rule (ÿ marker, error text, Excel error codes,
  NaN, all blank): Operating Data.txt 178 -> 43 columns. API now returns {columns, rows, dropped_columns}.
  Verified: 140 columns x 57 rows; 5001 restarted. reforming_carbon_table.js?v=7.

## SharePoint sync (2026-10-15)
- Source: Harish's SharePoint folder "ILS Chemical Validation_Reforming/Online DHA Results", synced by OneDrive to
  `C:\Users\Debanjan.Kakati\Shell\Balam, Harish K PTIN-DRX D L L - Online DHA Results\` (DHA .XLS in the sub-folder
  "Data from 8th Oct to 9th Oct", plus `Operating Data.txt`). The platform reads the synced copy; it never calls SharePoint.
- Backend `backend/reforming/sync_source.py` + `GET/POST /api/reforming/sync-source`: finds a folder ending in
  "Online DHA Results" under %USERPROFILE% (or its Shell*/OneDrive* children), or uses the folder saved in
  `config/reforming_sync.json` ({"sync_folder": ...}; blank = auto-detect). DHA folder = the folder itself if it has
  .XLS, else the sub-folder with the most. Operating file = "Operating Data.txt", else the newest .txt. Returns counts,
  latest file (by name), and signatures (sha1 of name|size|mtime).
- Frontend `js/reforming_sync.js` (Reforming mode only; index.html + online_analysis.html, after the page script):
  sync bar under the path row with status, Auto-sync checkbox (localStorage `ils_reforming_autosync`, default on),
  Change folder, Sync now. Sync = put the synced path in the page's path box and click the page's own Process/Import
  button (processing code unchanged). Auto-sync runs on page open and every 5 min while the page is open, when the
  signature differs from the one last processed (sessionStorage `ils_reforming_sync` {offline, online}) or the page
  has no data. Needs a Run Number.
- Verified (Edge, port 5002): Offline auto-processed 41 files (~1 s), Online 48 records, reopen does not reprocess,
  changed signature reprocesses, auto-sync off shows "New data available", Calculation reforming tab 41 rows,
  isomerization page has no bar. Backups: `backups/2026-10-15_sharepoint_sync/`. 5001 restarted.
