# ILS 6.4.3 → 6.5.0: process General_MB (Internal Standard from the bypass lines)

Built from `IMPLEMENTATION_PLAN_General_MB.md`. It replaces any earlier Copilot attempt: copy the 6.5.0 files over the
Copilot-edited files; don't merge them (see `FIX_PLAN_General_MB_Copilot.md` for what was wrong there).

## What you get

| Where | Change |
|---|---|
| Run Plan page → Process | Third option **General_MB** (badge on every page). It uses the Isomerization pages. |
| Online Analysis, Isomerization / Reforming | Normalised mol% only (no Units, no Internal Standard). |
| Online Analysis, General_MB | **Internal Standard — / Argon / N2** (default —, mol% only). With Argon or N2: Units g/h, Nl/h, g C/h, and a **side panel next to the table**. |
| Side panel: Feed gas composition · Internal Standard | One card per Run Plan DOE condition (Block · Condition No.), from the bypass (reactor 0) GC lines in that condition's window, as raw ESTD averages: IS mol%, IS wt%, mixed gas mol% (every other gas; N2 counts for Argon-IS, Argon counts for N2-IS), sum, mixed gas MW, IS spread (RSD) and the Run Plan Argon as a check. |
| Side panel: Average IS flow to reactor [g/h] | Workbook R#_MB!F5 = Gas!G20, per active reactor and condition (number of lines in brackets). |
| Table | New column **Condition**. Bypass lines get the grey Status "BYPASS – feed gas of …". They stay the bypass when the Reactor Map is ON. |
| Bottom | **Conversion basis** stays collapsed at the bottom (formulas, flow sources, MW table). |
| Save to Historian / Save Run Details | Also saves "Online · Feed Gas Composition IS" and "Online · Average IS Flow to Reactor". |

### Formulas (per condition c, reactor r; y = ESTD mol%)
```
y_IS,feed = avg ESTD_IS (bypass lines of c)        y_mix,feed = avg Σ ESTD_j (all other gases)
MW_mix    = Σ avg_j·MW_j / Σ avg_j                  w_IS = y_IS·MW_IS / (y_IS·MW_IS + y_mix·MW_mix)
F_IS,r    = 01i14FI01 · FIC_r/ΣFIC · w_IS           (export has 01i14FI01; workbook Gas!B12 × Gas!I37)
          = FIC_r/1000 / 22.414 · y_IS,feed/100 · MW_IS   (otherwise; FIC from the export or the Run Plan DOE)
m_i = y_i·MW_i/(y_IS·MW_IS) · F_IS,r     V_out = FIC_r/1000 · y_IS,feed/y_IS,  V_i = y_i/100 · V_out     C_i = 12.011·nC_i/MW_i · m_i
```
MW_IS: Argon 39.948, N2 28.0134. Condition window of a reactor runs from Start Date to End Date, else Start + Duration
(h), else to the start of that reactor's next condition, else to the end of the data. Blocks that run in parallel share
the bypass lines.

### Errors (shown in Status, never 0)
* `ERROR: no Run Plan DOE condition for Rr at this time`
* `ERROR: no bypass (reactor 0) GC line in condition … – feed gas Argon not measured`
* `ERROR: no Argon peak (ESTD_Argon) – Argon is the internal standard` (N2 the same)
* `ERROR: no gas feed to Rr (export: 0 NmL/h)` / `ERROR: no gas feed for Rr – not in the export and no Run Plan DOE …`

## What the Run Plan must contain (General_MB)
* DOE rows with **Condition No., Block, Reactor ID, Start (date, time)** and End or Duration.
* **Total gas (Nl/h)** of each reactor, needed when the export has no flow columns.
* Plan **Feed Cut-In** (TOS zero; otherwise the first record).
* Feed → Gas feed composition: comparison only in General_MB (the IS comes from the bypass). Enter the **measured**
  composition there, not the target.
* No liquid feed analysis is needed (it comes later with the liquid product data).

`RunPlan_MassBalance_SS_filled.xlsx` is your file with this filled in. Only Feed → Gas feed composition (tbl_gas,
O15:O28) changed: it was the target (Ar 5, Other 6.96 mol%) and is now the measured bypass gas of R08 (44 lines,
normalised to 100): H2 24.0298, N2 57.6773, Ar 5.1001, CH4 2.7898, C2H6 0.0100, C2H4 1.4506, C2H2 8.8625,
C3H6 0.0020, Other 0.0778 (C6 Above, no MW). Plan, DOE and every formula are unchanged. The DOE was already complete
for this run.

## Steps
1. Close the dashboard. Copy the dashboard folder to `backups/2026-11-06_general_mb/` (rollback = copy it back).
2. `python check_my_version.py "C:\path\to\ILS"`: lists every file as original / updated / CHANGED / new.
3. Copy everything from `files/` into the dashboard folder (keep the folder structure), **or** with git:
   `git apply --binary --whitespace=nowarn ILS_6.4.3_to_6.5.0.patch` (only on an unchanged 6.4.3).
4. Run the checker again: every line must say `updated`.
5. Optional: `python -m pytest -q tests` → 35 passed.
6. Start the dashboard. Hard-refresh the browser once (Ctrl+F5). The JS/CSS versions are bumped, so this is only a safety step.

Files (21): `VERSION`, `CHANGELOG.md`, `README.md`, `ILS.md`, `backend/routes/api.py`,
`backend/services/online_units.py`, `frontend/online_analysis.html`, `frontend/css/online_units.css`,
`frontend/js/online_analysis.js`, `frontend/js/navigation.js`, `frontend/js/historian_save.js`,
`frontend/js/reforming_offline.js`, the 7 pages that load `navigation.js?v=4` (`index`, `run_plan`, `calculation_table`,
`custom_table`, `plots`, `plot_dashboard`, `history`), `tests/test_online_units.py`,
`tests/fixtures/run_plan/RunPlan_MassBalance_SS_filled.xlsx` (new).

## Acceptance test (R08 export + `RunPlan_MassBalance_SS_filled.xlsx`)

| # | Action | Expected |
|---|---|---|
| 1 | Run Plan: Run Number 8, Process **General_MB**, load the filled Run Plan | Badge General_MB on all pages |
| 2 | Online: import `Result_R08-Ci-S4-27-Oct-24_1_3.txt` | 171 records; Internal Standard "—"; Units only Normalised mol% |
| 3 | Internal Standard **Argon** | Side panel: **Block-1 · C1**: 44 bypass lines, Argon 5.1572 mol%, 9.2933 wt%, mixed gas 95.9625, sum 101.1197, MW 20.955, RSD 2.66 %. **Block-2 · C1**: 36 lines, 5.0994 mol%, 9.2129 wt%. Average Argon flow: R1 0.1267, R5 0.2520, R6 0.2455 g/h |
| 4 | Units g/h, then Nl/h, then g C/h | R1 2024-10-24 15:09:23: Methane 0.02323 g/h, 0.03703 Nl/h, 0.01739 g C/h. Summary: 107 calculated, 45 bypass, 19 ERROR |
| 5 | Internal Standard **N2** | Block-1: N2 58.3231 mol%, 73.6999 wt%, mixed gas (Argon included) 42.7966; R1 1.0044, R5 2.0162, R6 1.9646 g/h |
| 6 | Internal Standard "—" | Units back to mol%, side panel hidden |
| 7 | Process Isomerization | Online page: no Internal Standard, no Units, mol% only |

The 19 ERROR lines are real: R5/R6 lines after the Block-2 gas was stopped (export FIC 0 from 27.10 ~02:00) and after its
End Date 08:30; the last R1 line (FIC 0 at 17:54); and three lines without a reactor or GC values.

Note: the R1/R5/R6 flows in `FIX_PLAN_General_MB_Copilot.md` (0.1238 / 0.2259 / 0.2202) came from the Copilot code. That
code merged both blocks into one condition. The values in this guide are the correct ones.

## Open points (plan §7), as built
1. A condition without a bypass line gives an explicit ERROR for its reactor lines (no fallback to another condition).
2. All bypass lines with GC values are used, including the first one after a change.
3. The spread is shown as IS RSD % in the panel, with no automatic flag.
4. Lumped peaks without a MW are left out of the mixed-gas MW and named under the card.
