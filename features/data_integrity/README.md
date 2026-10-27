# Optional Data Integrity Feature

This v6-only feature performs local statistical review. It uses no external AI service, introduces no dependency, changes no source tables, and writes no analysis result to RunData or Historian. Results exist only in page memory unless you explicitly export a CSV or add a plot/table snapshot to Summary Dashboard.

## Use

Load Base, Yield, or Online Analysis data with an existing Condition column in the same browser tab, then open **Data Integrity** in the top navigation. The top-row Parameter dropdown lists numeric parameters from all three tables, labeled by source. Choosing a parameter switches its source automatically. Choose reactor/condition filters and a modified Z-score threshold (default 3.5). The minimum valid samples per group is fixed at 3 in the backend and cannot be overridden by a request. Analyse calculates statistics and scores independently for each Run / Condition / Reactor / Parameter group. Group measurements displays all groups selected by those top filters, without a separate group dropdown.

- The existing source Condition column is authoritative for both analysis and the matrix. DOE windows are not loaded, validated, or rematched here. Timestamp-range condition logic remains in the source-table calculation stage only.
- Blank, Unassigned, unknown, and error-valued conditions are flagged and excluded from assigned groups, not inferred. Condition filters are populated from loaded source tables.
- Groups with fewer than 3 valid samples or zero MAD are not scored. A zero-MAD group can still contain unusual values; these need manual review.
- Flagged records show Condition as Unassigned when the source condition is missing or invalid. Invalid reactors or timestamps are also flagged; a known source condition is retained in those flags. The Reason column explains the failure.
- Standard deviation is the sample standard deviation; quartiles use inclusive linear interpolation. Missing and invalid values are flagged, excluded from numeric statistics, and never imputed.
- Duplicates mean identical selected measurements at the same Run / Condition / Reactor / timestamp, not necessarily duplicates across every unselected column. These are reported and excluded from statistics.
- Statistics include all valid, nonduplicate values, including suspected outliers. Flags are review prompts, not proof of an error. Startup, drift and stabilization are not automatically removed.
- Use consistent timestamps: naive timestamps are compared on their written local clock, and offset timestamps are converted to UTC. Do not mix local naive timestamps and offset timestamps unless they describe the same clock convention.
- Flagged records show the first 500 records on screen; CSV export includes all flags. Rows are limited to 100,000 and parameters to 30 per request.

## Condition RSD Matrix

The Reactor comparison section shows an 8-by-8 R1-R8 matrix with independent Condition and Parameter dropdowns. Parameters come from every loaded Base, Yield, and Online Analysis table, grouped and labeled by source so same-named columns are not pooled. Date/time, TOS, and identifying columns are excluded. Changing either dropdown recalculates the matrix automatically for all eight reactors, independently of the source/parameter/reactor controls used for the other analysis sections. Multiple runs must be loaded separately rather than combined.

Each cell is `100 * sample standard deviation([mean_Ri, mean_Rj]) / abs(mean([mean_Ri, mean_Rj]))`. This compares two equally weighted reactor means, not pooled sample variation or a statistical significance test. The matrix is symmetric. Diagonal cells are zero for nonzero reactor means; missing reactor means and zero pair means are undefined and shown as `-`. Cells display one decimal place and `%`; hover tooltips, CSV export, and Summary Dashboard transfer retain additional precision. Online Analysis uses its existing Condition values, just like Base and Yield.

The matrix is a compact responsive square without internal scrolling. Unrounded RSD values strictly above 2% have a 30%-opacity theme-orange tint with dark ink text; all other data cells have no fill and black text. Reactor headers use a light theme-sand shade with dark ink text. An orange cell is a comparison warning, not evidence of a data error. The former reactor/block summary table is no longer displayed.

Add matrix to dashboard captures the selected matrix as a structured snapshot in the next empty plot slot, retaining its 8-by-8 layout, percent formatting, and threshold colors. It does not replace the standalone Summary Dashboard table. Matrices can be enlarged or deleted like plots; if all 12 slots are occupied, a replacement choice is required. Source/filter changes do not change the saved matrix snapshot, and it remains available after reloading the same tab. Matrix slots are included in print output.

## Hide Without Deleting

Set `DASHBOARD_DATA_INTEGRITY=0` in the app's environment and restart v6. In PowerShell, use `$env:DASHBOARD_DATA_INTEGRITY = '0'` before launching the app. The page and analysis API are disabled and the navigation entry disappears. To restore it, remove that environment variable or set it to `1`, then restart.

## Clean Removal

1. Stop the v6 app.
2. Remove the folder `features/data_integrity/` and its dedicated test file `tests/test_data_integrity.py`. The app already checks for the feature file's presence and still starts without it.
3. For a complete code cleanup, remove the `integrity_file` / `integrity_enabled` registration block from `app.py`.
4. Remove `addOptionalIntegrityTab()` and its invocation from `frontend/js/navigation.js`, and remove `|| path.endsWith('/data-integrity')` from the `isPlotDashboard` assignment.
5. Remove the optional Data Integrity section from the app README, and restart. No requirements changes, database migrations, or source-data cleanup are needed.

Any deliberately added Summary Dashboard snapshots remain ordinary plots/tables and can be deleted using existing dashboard controls. CSV files you deliberately exported remain independent files. v5.1 is unchanged and can still be used as the pre-feature version.