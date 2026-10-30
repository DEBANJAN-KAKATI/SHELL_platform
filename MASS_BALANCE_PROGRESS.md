# Mass Balance process (v6.5)

Third process next to Isomerization and Reforming. It reproduces the MassBal workbook
(`R6-C1-S1-MassBal_Ver2.2.xlsx`: ZMB → Run_Plan → Liq → Gas → R1_MB…R8_MB → C-Balance → Summary) from the online GC
exports plus the values entered by hand. `HC_SIMDIS` and `HC_DHA` are not part of it.

## How to use
1. **Run Plan** page: enter the Run Number and choose **Process: Mass Balance**. The shared `RunPlan.xlsx` can still be
   loaded; its `Feed Cut-In` becomes the default Run Start and Feed `E2` Carbon the default liquid-feed carbon.
2. **Mass Balance** page (`/mass-balance`, nav tab shown for this process instead of Analysis/Calculation/Plots):
   - **Import**: the ZMB export (.txt), the run export (.txt) and, optionally, a filled MassBal workbook (.xlsx) whose
     blue cells (Run_Plan, ZMB liquid reps, Gas, Liq, C-Balance N34) are read; while no run export is imported the
     workbook's GC tables are used. Samples (C1-S1, C1-S2, …) are added here; options: mixed-gas source block,
     workbook-compatible mode, GC map editor (export gas → R*_MB row, `+` sums gases), ZMB Argon suggestion.
   - **ZMB · Run Plan · Liq & Gas · R1-R8 MB · C-Balance · Summary**: the workbook tabs. Blue cells are editable and
     recalculate on change; click a rep header (`#n`) to exclude/include that GC injection. Outliers
     (value > mean + 2·sd of reps 2…n, as in Rx_MB AC:AE) are shaded.
   - **Plots**: balance closure per reactor, gas-phase C'Bal and acetylene conversion by GC rep (vs TOS, or rep number
     when the reps have no time), run trend across samples.
   - **Export .xlsx**: every tab per sample with the workbook's labels, a Run trend sheet and a Formulas sheet.
3. Save Run Details / Save to Historian include `ils_mb_inputs`, `ils_mb_imports`, `ils_mb_results`; History lists the
   table "Mass Balance · Summary (all samples)".

## Data sources
| Workbook cells | Source |
|---|---|
| ZMB GC blocks (rows 22–31 per reactor, 157–166 bypass) | ZMB export, `ESTD_*` of each `Sampled_reactor` (verified: identical to Ver2.2) |
| Rx_MB D20:AB48 | run export, `ESTD_*` of the reactor's injections in the sample window, mapped by `config/mass_balance_gc_map.json` |
| Gas!B11:I11, Gas!E5 | means of `01i14FIC0r`, `01i14FI01` over the sample window (or entered by hand per sample) |
| Run_Plan B1:B3, B58; ZMB liquid reps; Gas I35/J35; Liq B5:I6, B17:I19; C-Balance N34 | entered (or read from the workbook) |

Sample window per reactor: (previous sample's collection finished, or Run Start) < GC time ≤ this collection finished;
an optional window start/end per sample overrides it.

Export quirks handled (`backend/mass_balance/txt_loader.py`): columns found by name (ZMB 152 / run 161 columns),
`ÿ` = no value, C6 Above raw ESTD read from `Area_C6 Above`, `Conc_C8 Unknowns` = GC total (never a component),
GC rows without `Sampled_reactor` (last lines) are reported and skipped.

## Code
- `backend/mass_balance/`: `constants.py` (MW tables per sheet, carbon atoms, row groups), `txt_loader.py`,
  `workbook.py` (blue cells + GC tables of a MassBal workbook), `engine.py` (all formulas, workbook cell in each
  comment), `service.py` (imports, windows, flows, calculation), `views.py` (sheet-like tables), `export.py`,
  `routes.py` (`/api/mass-balance/{browse-file, import-txt, import-workbook, gc-map, calculate, export-xlsx}`).
- `frontend/mass_balance.html`, `js/mass_balance.js`, `css/mass_balance.css`; `navigation.js` (third process,
  Mass Balance tab), `historian_save.js`, `run_data.js` (state keys), `app.py` (blueprint + `/mass-balance`).
- Tests: `tests/test_mass_balance_engine.py` compares the engine with 1 811 Excel-calculated cells of Ver2.2
  (`tests/fixtures/mass_balance/golden_R6-C1-S1.json`); `tests/test_mass_balance_txt.py` covers both exports, the
  quirks, flows, sample windows and the end-to-end service. `python -m pytest -q` → 19 passed.

## Known template differences (the dashboard behaviour)
| Workbook | Dashboard |
|---|---|
| R7_MB / R8_MB read Gas/Liq column G (R6) | each reactor uses its own column (same golden values: all flows are equal in Ver2.2) |
| R2…R8_MB time check compares with `'R1_MB'!H6/I6` | each reactor checks its own reps (Pass when Run Start < first GC and last GC < collection finished) |
| Rx_MB D86 uses Gas!$B$11 (R1) for every reactor, inconsistent units | kept in workbook-compatible mode (option); a corrected NL/h row is shown too; the ethylene selectivity does not depend on it |
| Gas!B22:B25 mixed-gas row reads empty J20:M20 | elemental rows include the mixed gas via Run_Plan L43:L46 (display only) |
| Run_Plan B35:K35 = ZMB Reactor-1 block only, not normalised | default the same; selectable block / mean / bypass |
| Liq!B40 divides by TOS, Liq!B41 by sampling hours | reproduced, noted in the cell tooltip |
| outlier statistics skip rep 1 (columns E:AB) | reproduced |

## Open items
- Lump peaks (C4, C5, C6, C6s, C6 Unknowns, C7 Unknowns, Isobutane) have no peak in the current GC method; map them in
  the GC map editor once the method reports them.
- Verified Ar mol% (Gas!I35) is entered; the page offers the ZMB-measured Argon as a one-click suggestion.
- One Ar mol% for all reactors (as in the workbook).
- The provided run export (Result_R08, Oct 2024) and the Ver2.2 workbook / Run6 ZMB export (May 2024) belong to
  different runs, so the end-to-end test checks mechanics, not plant results. The Run 6 run export would allow a
  full txt-only comparison with Ver2.2.
