# ILS Dashboard Run Plan

## Shared workbook

Isomerization and Reforming use one `RunPlan.xlsx` format with these sheets:

- **Plan**: fixed objective and R1-R8 Catalyst Loading Plan, plus optional label rows in column A with values in column C for `Feed SL ID`, `Feed Cut-In`, and `Feed molecular weight`.
- **DOE**: header row 10 and data from row 11. The optional column N is `Catalyst`; blank cells inherit the Plan Catalyst value for the row's Reactor ID.
- **Feed**: `E2` Carbon, `E3` Hydrogen, and `E4` Molecular Weight.

The Process selector on the Run Plan page chooses Isomerization or Reforming. It is not inferred from the workbook. Changing the process clears the loaded Run Plan and remains on the shared `run_plan.html` page.

Legacy Reforming workbooks with a `Run Information` row or a `Feed DHA` sheet are not accepted. Use the shared three-sheet template instead.
