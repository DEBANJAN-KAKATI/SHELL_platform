# ILS Dashboard 6.4.1 → 6.4.2: Online Analysis units (mol%, g/h, Nl/h, g C/h)

This update adds a **Units** selector to **Analysis → Online**, which converts the GC results like the MassBal workbook
(Ver2.2). **Process selection** (Isomerization / Reforming) and everything else stay as in 6.4.1.

| Unit | What the table shows for every GC injection |
|---|---|
| **Normalised mol%** (default) | The imported `ESTD_` values, as before |
| **Mass flow rates (g/h)** | Mass flow of every molecule + gas feed to the reactor, Ar to the reactor, total without Ar |
| **Volumetric flow rates (Nl/h)** | Volumetric flow of every molecule + gas feed to the reactor, total gas out |
| **TOS carbon of each molecule (g C/h)** | Carbon flow of every carbon-containing molecule + total carbon, against TOS |

Converted tables have the columns `DateTime · TOS (h) · Reactor · Status · <molecule> [unit] … · totals`. The reactor,
date and search filters and the column remove / restore work as before. A collapsed **Conversion basis** block
under the table holds the argon inputs, the formula and the MW table; it opens with one click.

Tested on a clean 6.4.1 copy: 20 automated tests pass (13 old + 7 new), the browser shows the four units with
the process selector in place, and the mass and carbon flows reproduce the workbook's R6_MB values exactly.

---

## 1. The formulas (traced from the MassBal workbook)

Argon is the internal standard. `y` = the `ESTD_` mol% of the GC injection (not normalised, as on R#_MB rows 20-48).
Every line uses the process values of the **same line** of the export (the workbook averages them over the sampling
window).

| Step | Formula | Workbook cell |
|---|---|---|
| Gas feed to reactor r [g/h] | `F_r = 01i14FI01 × FIC_r / ΣFIC`  (FIC = `01i14FIC01…08` in NmL/h, else `02i2FIC0r`) | Gas!B12:I12 |
| Ar mass fraction of the feed gas [wt%] | `w_Ar = 100 × y_Ar,feed × 39.948 / Σ(y_j,feed × MW_j)` | Gas!I37 |
| Ar flow to reactor r [g/h] | `F_Ar,r = F_r × w_Ar / 100` | Gas!G20 (R#_MB!F5) |
| **Mass flow** of molecule i [g/h] | `m_i = y_i × MW_i / (y_Ar × 39.948) × F_Ar,r` | R#_MB rows 52-80 |
| Total gas out [Nl/h] | `V_out = FIC_r / 1000 × y_Ar,feed / y_Ar`  (argon balance: Ar in = Ar out) | R#_MB!D86 (see note) |
| **Volumetric flow** of molecule i [Nl/h] | `V_i = y_i / 100 × V_out` | R#_MB rows 88-116 |
| **Carbon flow** of molecule i [g C/h] | `C_i = 12.011 × nC_i / MW_i × m_i` | R#_MB rows 121-149 ("TOS Carbon of Each Molecule") |
| Total carbon [g C/h] | `Σ C_i` | R#_MB row 150 |
| TOS [h] | hours since the Run Plan **Feed Cut-In** (else since the first record) | R#_MB "TOS [min]" |

> **Note on R#_MB!D86.** The workbook calculates the total volumetric flow as `m_Ar / Gas!I35 × Gas!B11`, which mixes
> g/h with NmL/h: 3 Nl/h of feed gives 159.7 Nl/h. The dashboard uses the argon balance this row is meant to give
> (3.0 Nl/h for 3 Nl/h of feed). Please confirm this with your mentor.

**Molecular weights = the experimental standards of the workbook** (R#_MB column B; carbon atoms column AD):

| Molecule | MW | nC | | Molecule | MW | nC |
|---|---|---|---|---|---|---|
| H2 | 2.016 | 0 | | Butane / Isobutane / C4 | 58.12 | 4 |
| N2 | 28.0134 | 0 | | Pentane / C5 | 72.15 | 5 |
| Argon | 39.948 | 0 | | Hexane / C6 / C6s / C6 Unknowns | 86.18 | 6 |
| CO | 28.01 | 1 | | C6 Above | 100.21 | 6 |
| CO2 | 44.01 | 1 | | C7 Unknowns | 100.21 | 7 |
| Methane (CH4) | 16.04 | 1 | | Benzene | 78.11 | 6 |
| Ethane | 30.07 | 2 | | Toluene | 92.14 | 7 |
| Ethylene | 28.05 | 2 | | Ethylbenzene, p-/m-/o-Xylene | 106.167 | 8 |
| Acetylene | 26.04 | 2 | | C8 Unknowns | 114.23 | 8 |
| Propane | 44.1 | 3 | | H2S *(not in the workbook)* | 34.081 | 0 |
| Propylene | 42.08 | 3 | | Propadiene *(not in the workbook)* | 40.064 | 3 |

Lumped GC peaks without a molecule (`C3-C4`, `C4-C5`, `C5-C6`, `C6-C8`) have no MW: a non-zero value shows
`ERROR: no MW for …` (zero values are fine).

**Feed gas MWs for w_Ar** (workbook Run_Plan row 37 / Gas row 36): Hydrogen 2.016, Ethylene 28.054, Methane 16.043,
Ethane 30.07, Nitrogen 28.014, CO2 44.009, CO 28.01, Acetylene 26.038, Propylene 42.081, Propane 44.097, Argon 39.948
(Butane 58.123 and H2S 34.081 are standard values). They are applied to the Run Plan **Feed → Gas feed composition**
(total feed gas, mol%). A row such as "Other (gas)" has no MW and adds no mass — the workbook treats the unanalysed
rest of the mixed gas the same way. Ar mol% and/or wt% can also be typed into the Conversion basis block; typed values
win over the Run Plan.

**Every line gets a Status**: `OK`, or an explicit `ERROR: …` with no numbers (never zero):
`no reactor (bypass or unknown)` (Sampled_reactor 0), `no argon peak`, `no gas feed to Rr (01i14FIC0r = 0)`,
`no total gas feed (01i14FI01 ≤ 0)`, `no GC values in this line`, `Ar wt% / mol% of the feed gas is not set`.

**Export quirk handled by the loader:** for "C6 Above" the export leaves `Conc_` empty, writes the normalised value into
`ESTD_` and the raw ESTD into `Area_`. When `Conc_C6 Above` is empty the loader takes `ESTD_C6 Above` from
`Area_C6 Above` (also in the mol% view); the import summary says so.

---

## 2. Contents of this package

```
ILS_6.4.2_Online_units_update/
├── UPDATE_GUIDE_6.4.1_to_6.4.2.md    this guide
├── check_my_version.py                checks your 6.4.1 folder before you copy anything
├── ILS_6.4.1_to_6.4.2.patch           the same update as a git patch (optional)
└── files/
    ├── VERSION, CHANGELOG.md, ILS.md, README.md
    ├── backend/services/online_units.py            (new)  the conversion
    ├── backend/services/online_analysis_service.py        loader: encoding, 'ÿ' = no value, C6 Above fix
    ├── backend/routes/api.py                               new endpoint POST /api/online-units
    ├── frontend/online_analysis.html                       Units selector + Conversion basis block
    ├── frontend/js/online_analysis.js                      converted view, inputs, saved settings
    ├── frontend/css/online_units.css               (new)
    └── tests/test_online_units.py + tests/fixtures/online/* + tests/fixtures/run_plan/RunPlan_MassBalance_SS.xlsx
```

---

## 3. Step by step

### Step 0 — Close the dashboard and back up
Close the dashboard console window and the browser tabs. Copy the dashboard folder to e.g.
`ILS_App\backups\2026-11-05_before_6.4.2\`.

### Step 1 — Check your folder
```
python check_my_version.py "C:\Users\<you>\ILS_App\Dashboard"
```
*original* → replace with the file from `files/`; *CHANGED* → you edited it yourself, make the edit of Step 3 by hand;
*updated* → nothing to do.

### Step 2 — Quick way (all files "original")
Copy the **contents** of `files/` into the dashboard folder and let Windows replace the files. Continue with Step 4.
For a git checkout of 6.4.1 instead: `git apply --binary --whitespace=nowarn ILS_6.4.1_to_6.4.2.patch`.

### Step 3 — File by file (only for files marked CHANGED)

New files are always copied as they are: `backend/services/online_units.py`, `frontend/css/online_units.css`,
`tests/test_online_units.py`, `tests/fixtures/online/*`, `tests/fixtures/run_plan/RunPlan_MassBalance_SS.xlsx`.

**3.1 `backend/services/online_analysis_service.py`** — in `process_online_file` replace the `try … mbcs … utf-8-sig`
read by:
```python
    # 'ÿ' (0xFF) is the export's "no value" marker; mbcs exists only on Windows, cp1252 reads the same bytes elsewhere.
    frame = None
    for encoding in ("mbcs", "cp1252", "utf-8-sig"):
        try:
            frame = pd.read_csv(path, delimiter="\t", encoding=encoding, na_values=["\xff"])
            break
        except (LookupError, UnicodeDecodeError):
            continue
    if frame is None:
        raise ValueError("Online Analysis file could not be decoded.")
```
Before `frame = frame.sort_values(…)` add:
```python
    notes = []
    # Export column shift for "C6 Above": Conc_ is empty, ESTD_ holds the normalised value and Area_ the raw ESTD
    # (checked against the MassBal workbook). Use the raw ESTD like every other component.
    if {"Conc_C6 Above", "ESTD_C6 Above", "Area_C6 Above"} <= set(frame.columns) \
            and frame["Conc_C6 Above"].isna().all() and frame["Area_C6 Above"].notna().any():
        frame["ESTD_C6 Above"] = frame["Area_C6 Above"]
        notes.append("ESTD_C6 Above taken from Area_C6 Above (export column shift: ESTD_ holds the normalised value)")
```
and add `"notes": notes,` to the returned dictionary (after `"source_file"`).

**3.2 `backend/routes/api.py`** — add above `@api.post("/apply-online-reactor-map")`:
```python
@api.post("/online-units")
def online_units():
    """Online Analysis rows in mass flow (g/h), volumetric flow (Nl/h) or carbon flow (g C/h) per molecule."""
    from backend.services.online_units import convert_online_rows
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(convert_online_rows(
            body.get("rows") or [], body.get("unit"), feed_gas=body.get("feed_gas"),
            ar_mol_pct=body.get("ar_mol_pct"), ar_wt_pct=body.get("ar_wt_pct"), feed_cut_in=body.get("feed_cut_in")))
    except Exception as e:
        return jsonify({"error": str(e)}), 400
```

**3.3 `frontend/online_analysis.html`**
1. In `<head>`: replace `online_analysis.js?v=3` by
   ```html
   <link href="/frontend/css/online_units.css?v=1" rel="stylesheet">
   <script src="/frontend/js/online_analysis.js?v=4" defer></script>
   ```
2. As the first element inside `<div class="table-actions online-table-actions">`: the Units selector
   ```html
   <label class="online-unit-wrap" title="Show the GC values as normalised mol% or converted with argon as internal standard (MassBal workbook)">
       <span>Units</span>
       <select class="input online-filter" id="onlineUnit" aria-label="Units of the GC values">
           <option value="mol">Normalised mol%</option>
           <option value="mass">Mass flow rates (g/h)</option>
           <option value="volume">Volumetric flow rates (Nl/h)</option>
           <option value="carbon">TOS carbon of each molecule (g C/h)</option>
       </select>
   </label>
   ```
3. Right after the closing `</div>` of `<div class="table-wrap online-table-wrap">` (below the table): the collapsed
   block — copy it from `files/frontend/online_analysis.html` (`<details class="online-units-bar" id="onlineUnitsBar" hidden>`
   with `#onlineUnitsSummary`, `#onlineArMol`, `#onlineArWt`, `#onlineUnitsBasis`, `#onlineUnitsFormula`, `#onlineMwBody`).
   The ids must stay exactly as they are.

**3.4 `frontend/js/online_analysis.js`** — replace it with `files/frontend/js/online_analysis.js` (6.4.1 had the
original file of 6.4.0). If you changed it yourself, take the new file and re-apply your change. What is new:
* state `unit`, `converted`, `hiddenConverted`, `arMol`, `arWt` (saved in `dhaOnlineState`; converted rows are not saved,
  they are recalculated when the page opens);
* `refreshOnlineUnits()` sends `DateTime`, `Reactor`, `ESTD_*`, `01i14FI01`, `01i14FIC0*` / `02i2FIC0*` of the
  (Reactor-Map-mapped) rows, the Run Plan gas table and Feed Cut-In to `POST /api/online-units`;
* `renderUnitsBar()`, `currentOnlineView()`, `onlineCellHtml()` draw the converted table (Status in green / red,
  small numbers with 4 significant digits, TOS with 2 decimals);
* the table, filters, column remove / restore work on the converted view; the conversion re-runs after an import, a
  Reactor Map switch, a unit change or a typed Ar value.

**3.5 Version and documents** — `VERSION` = `6.4.2`; add the 6.4.2 entry of `files/CHANGELOG.md` at the top of yours;
add the section "Online Analysis units (v6.4.2)" of `files/ILS.md` and `files/README.md`.

### Step 4 — Start and check
1. Start with `run_dashboard.bat`; the menu bar shows **v6.4.2**.
2. **Run Plan** (Process: Isomerization): load `tests\fixtures\run_plan\RunPlan_MassBalance_SS.xlsx`
   (it holds the feed gas: Ar 5 mol% + mixed gas, Feed Cut-In 24.10.2024 14:00).
3. **Analysis → Online**: import `tests\fixtures\online\Result_R08-Ci-S4-27-Oct-24_1_3.txt`. The summary ends with
   "ESTD_C6 Above taken from Area_C6 Above …".
4. **Units = Mass flow rates (g/h)**: the line of 24.10.2024 15:36:36 (R5, TOS 1.61 h) shows Status OK,
   Methane 0.05612, Ethane 0.03154, Ethylene 0.1016 g/h. Under the table: "Conversion basis · Ar 5 mol% /
   9.4827 wt% · 107 calculated, 64 ERROR" (46 bypass lines, 15 after the gas to R1 / R5 / R6 was stopped, 3 without
   GC values).
5. **Volumetric flow rates (Nl/h)**: same line Methane 0.08261, Ethane 0.02477, Ethylene 0.08556 Nl/h; for the R1 lines
   "Total out" ≈ "Gas feed to reactor" (≈ 1.56 Nl/h: the argon balance closes).
6. **TOS carbon of each molecule (g C/h)**: same line Methane 0.04203, Ethane 0.0252, Ethylene 0.08705 g C/h.
7. Open **Conversion basis**, type `10` in *Ar in feed gas wt%*: the mass flows rise by 10 / 9.4827 (Methane 0.05918).
   Clear the field again. Back to **Normalised mol%** → the original table.
8. Optional: `python -m pytest -q` in the dashboard folder → `20 passed`.

### Step 5 — If something goes wrong
* Copy the Step 0 backup back.
* Old page in the browser → Ctrl+F5 once.
* Every line "ERROR: Ar wt% of the feed gas is not set" → load a Run Plan whose Feed → Gas feed composition has an
  Argon row, or type the Ar mol% / wt% in the Conversion basis block.
* Every line "ERROR: no reactor" → the export's `Sampled_reactor` is empty / 0; switch the Reactor Map on.

## Not included yet
Plots, Custom table and the Summary Dashboard do not use the converted tables yet; the rest of the Mass Balance
(liquid samples, closure, carbon balance) follows in later steps.
