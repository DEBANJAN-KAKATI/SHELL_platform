# Implementation plan — General_MB process with Internal Standard from the bypass (offline 6.4.3 → 6.5.0)

**Goal.** Add the Mass Balance as a third process, **General_MB**, next to Isomerization and Reforming. In General_MB the
Online Analysis gets an **Internal Standard** selection (Argon or N2). The feed gas composition (IS mol% and mixed gas
mol%) is **measured from the bypass (reactor 0) GC lines**, and the **Average IS Flow to Reactor** (MassBal workbook
R#_MB!F5 = Gas!G20) is calculated from it. Mass flows (g/h), volumetric flows (Nl/h) and carbon of each molecule (g C/h)
then follow from the IS, as in the workbook.

**Why.** In 6.4.3 the Ar content of the feed gas comes from the Run Plan, which is often the *target* (5 mol%) instead of
the measured value: the workbook uses the measured 4.3 mol%, a 16.8 % difference in every flow. The bypass GC lines
measure the feed gas itself during the run, so the IS value becomes a measurement, per condition.

---

## 1. Decisions (agreed)

| Topic | Decision |
|---|---|
| Version | Offline dashboard **6.4.3 → 6.5.0**; the process selector stays (Isomerization, Reforming, **General_MB**) |
| Where it shows | Only when Process = **General_MB**. Isomerization and Reforming: Online Analysis shows mol% only (as before 6.4.2) |
| Internal Standard | Selection **— / Argon / N2**; default **—** (none) |
| Without IS (default) | Units selector offers **Normalised mol% only**; g/h, Nl/h, g C/h become available after choosing Argon or N2 |
| Feed gas from the bypass | Averages of the bypass (reactor 0) GC lines **per DOE condition** |
| Values | **Raw ESTD averages** (not normalised to 100 %), e.g. R3: Ar 5.1077 + mixed gas 96.0090 = 101.1167 |
| IS = Argon | IS mol% = avg ESTD_Argon; mixed gas mol% = avg of the sum of **all other gases, N2 included** |
| IS = N2 | IS mol% = avg ESTD_N2; mixed gas mol% = avg of the sum of **all other gases, Argon included** |
| Run Plan | Still gives the DOE condition windows, the gas flows when the export has none, and the Feed Cut-In (TOS). Its Argon is shown only for comparison. Liquid analysis is not a Run Plan entry (comes later with the liquid product) |

---

## 2. Definitions and formulas

Symbols: `y` = ESTD mol% of a GC line; IS = Argon (MW 39.948) or N2 (MW 28.0134); `c` = DOE condition; `r` = reactor;
MWs and carbon atoms = experimental standards of the MassBal workbook (R#_MB columns B and AD).

### 2.1 Bypass lines and condition windows
* **Bypass line** = `Sampled_reactor = 0` (from the export, **also when the Reactor Map is ON**) with at least one GC value
  ≠ 0. Lines without GC values (all 0 / empty) are ignored.
* **Condition window** of reactor `r`: the DOE row of `r` with `Start ≤ t < End` (End = Start + Duration; without an end
  the condition runs until the next condition of that reactor, the last one until the end of the data).
* The bypass lines **inside that window** form the feed gas of condition `c` for reactor `r`.

### 2.2 Feed Gas Composition IS (per condition) — workbook Gas!I35:J35
```
y_IS,feed(c)  = average over the bypass lines of c of  ESTD_IS
y_mix,feed(c) = average over the bypass lines of c of  Σ ESTD_j   (j = every other gas; N2 counts for Argon-IS,
                                                                   Argon counts for N2-IS)
MW_mix(c)     = Σ_j avg(ESTD_j) · MW_j  /  y_mix,feed(c)          (mixed gas molar mass, from the bypass composition)
w_IS(c) [wt%] = 100 · y_IS,feed · MW_IS / ( y_IS,feed · MW_IS + y_mix,feed · MW_mix )      (workbook Gas!I37 = I38/ΣB38:J38)
```

### 2.3 Average IS Flow to Reactor — workbook Gas!G20 = R#_MB!F5
Per GC line of reactor `r` in condition `c`, with FIC_r = gas feed of the reactor [NmL/h]:

| Gas feed source of the line | IS flow to reactor `F_IS,r` [g/h] |
|---|---|
| Export has `01i14FI01` and `01i14FIC0r` | `F_IS,r = 01i14FI01 · FIC_r / ΣFIC · w_IS(c) / 100`  (workbook: Gas!B12 × Gas!I37) |
| Otherwise (FIC_r from the export or the Run Plan DOE) | `F_IS,r = FIC_r / 1000 / 22.414 · y_IS,feed(c) / 100 · MW_IS`  (moles of IS × MW) |

**Average IS Flow to Reactor** (the value of R#_MB!F5) = average of `F_IS,r` over the reactor's lines in the condition;
shown in a table condition × R1–R8.

### 2.4 Unit conversions of a reactor line (unchanged formulas, IS instead of Ar)
```
Mass flow          m_i [g/h]   = y_i · MW_i / ( y_IS,line · MW_IS ) · F_IS,r                    (R#_MB rows 52-80)
Volumetric flow    V_out [Nl/h] = FIC_r / 1000 · y_IS,feed(c) / y_IS,line ;  V_i = y_i/100 · V_out   (rows 86-116)
Carbon flow        C_i [g C/h] = 12.011 · nC_i / MW_i · m_i                                      (rows 121-150)
```
`y_IS,line` = ESTD of the IS in the reactor line itself.

### 2.5 Worked examples (from your files, raw averages)

| File | Bypass lines | IS | y_IS,feed | y_mix,feed | Sum | MW_mix | w_IS | F_IS at 3 Nl/h (no 01i14FI01) |
|---|---|---|---|---|---|---|---|---|
| `R3-C2-S1_9-06-23.txt` | 1 | Argon | 5.1077 | 96.0090 | 101.1167 | 27.911 | 7.0757 wt% | 0.273103 g/h |
| `R3-C2-S1_9-06-23.txt` | 1 | N2 | 88.5583 | 12.5584 | 101.1167 | 32.082 | 86.0285 wt% | 3.320451 g/h |
| `Result_R08-…txt` (whole file) | 44 | Argon | 5.1572 | 95.9625 | 101.1197 | 20.955 | 9.2933 wt% | 0.275747 g/h |
| `Result_R08-…txt` (whole file) | 44 | N2 | 58.3231 | 42.7966 | 101.1197 | 13.623 | 73.6999 wt% | 2.186796 g/h |

(In the plan the R08 values are per DOE condition; the whole-file numbers above are for orientation. For comparison,
the workbook's Gas sheet holds Ar 4.3 + mixed gas 95.6 mol%, MW_mix 20.07.)

---

## 3. Screen design (Online Analysis, Process = General_MB)

```
[Units ▾ Normalised mol%]  [Internal Standard ▾ — / Argon / N2]  [Reactor Map]  [All reactors ▾]  [Search]
```
* **Internal Standard = —**: Units shows only *Normalised mol%*; the other units are disabled with the tooltip
  "Choose an Internal Standard". Nothing else changes.
* **Internal Standard = Argon or N2** → two new panels appear above the table:

**Panel 1 — Feed Gas Composition IS (bypass, reactor 0)**, one row per DOE condition:

| Condition | Window | Bypass lines | IS (Argon) mol% | Mixed gas mol% | Sum | Mixed gas MW | IS wt% | Run Plan Argon (check) |
|---|---|---|---|---|---|---|---|---|

**Panel 2 — Average IS Flow to Reactor [g/h]**, rows = conditions, columns = R1–R8 (blank = reactor not used in that
condition, `ERROR …` = cannot be calculated).

* The table: converted columns as in 6.4.3 plus **IS flow to reactor [g/h]**; bypass lines show Status
  **"BYPASS – feed gas of condition c"** (not an error) and their GC values in mol%.
* The collapsed **Conversion basis** block keeps the formulas and the MW table (read-only).

---

## 4. Errors (explicit, never zero)

| Situation | Status of the reactor line |
|---|---|
| No bypass line with GC values inside the condition window | `ERROR: no bypass (reactor 0) GC line in condition c – feed gas IS not measured` |
| IS peak missing in the reactor line | `ERROR: no Argon peak (ESTD_Argon) – Argon is the internal standard` (N2 analogous) |
| No DOE condition at that time for the reactor | `ERROR: no Run Plan DOE condition for Rr at this time` |
| No gas feed (export and DOE) | `ERROR: no gas feed for Rr – not in the export and no Run Plan DOE condition with a gas flow at this time` |
| Gas feed 0 / stopped | `ERROR: no gas feed to Rr (… NmL/h)` |
| Molecule without MW (lumped peak) in the mixed gas | value excluded from MW_mix, warning in Panel 1 |
| Line without GC values / without reactor (other than 0) | as in 6.4.3 |

All divisions are guarded (no `NoneType / int` crashes): every missing value becomes one of the messages above.

---

## 5. Implementation phases (offline 6.4.3)

| Phase | File(s) | Work |
|---|---|---|
| 1 | `frontend/js/navigation.js` | `ILSProcess`: values `isomerization`, `reforming`, **`general_mb`** (label "General_MB"); `isGeneralMB()`; selector option on the Run Plan page, badge on the other pages; switching clears the loaded Run Plan (as today) |
| 2 | `frontend/online_analysis.html`, `frontend/css/online_units.css` | Internal Standard select; Panel 1 and Panel 2 containers; Units / IS / panels only visible for General_MB |
| 3 | `backend/services/online_units.py` | `bypass_feed_gas(rows, doe_rows, IS)` → per condition: windows, bypass lines, y_IS,feed, y_mix,feed, MW_mix, w_IS; `convert_online_rows(…, internal_standard)` uses them (IS name and MW instead of fixed Argon); Panel 2 averages; bypass Status; new error messages; guarded divisions |
| 4 | `backend/routes/api.py` | `/api/online-units` accepts `internal_standard` (`argon` / `n2`), returns `basis.feed_gas_is[]` and `basis.avg_is_flow{condition: {R1…R8}}` |
| 5 | `frontend/js/online_analysis.js` | state `internalStandard` (saved in `dhaOnlineState`); Units options depend on it; render Panels 1–2; bypass rows; Isomerization / Reforming: Units hidden (mol% only) |
| 6 | `frontend/js/historian_save.js`, `run_data.js` | Save Panel 1 and Panel 2 tables with Save Run Details / Historian ("Online · Feed Gas Composition IS", "Online · Average IS Flow to Reactor") |
| 7 | `tests/test_online_units.py` | see §6 |
| 8 | `VERSION` 6.5.0, `CHANGELOG.md`, `ILS.md`, `README.md` | process General_MB, Internal Standard, formulas |

---

## 6. Tests and acceptance

**Automated (pytest)**
1. Workbook golden: with y_IS,feed = 4.3, y_mix,feed = 95.6 and the Run_Plan mixed-gas composition, w_IS = 8.21725 wt%
   and F_IS,R6 = 0.228909 g/h (Gas!I37, Gas!G20); the R6_MB mass and carbon flows stay identical to the workbook.
2. R3 file, IS Argon: one bypass line → y_IS,feed 5.1077, y_mix,feed 96.0090, w_IS 7.0757 wt%; with a DOE of 3 Nl/h
   F_IS = 0.273103 g/h; IS N2 → 88.5583 / 12.5584 / 86.0285 wt% / 3.320451 g/h.
3. R08 file per condition of `RunPlan_MassBalance_SS.xlsx`: averages only over the bypass lines inside each window.
4. Errors: condition without bypass line; IS peak missing; no DOE condition; no `NoneType` crash with empty cells.
5. Isomerization / Reforming: `/api/online-units` not used; Units shows mol% only.

**Browser**
| # | Action | Expected |
|---|---|---|
| 1 | Run Plan: Process = General_MB, load the run's Run Plan | badge General_MB on all pages |
| 2 | Online: import the GC file, Internal Standard = — | Units only "Normalised mol%" |
| 3 | Internal Standard = Argon | Panels 1 and 2 appear; R3 file: Ar 5.1077, mixed gas 96.0090, sum 101.1167 |
| 4 | Units = Mass flow rates | reactor lines OK, bypass lines "BYPASS – feed gas of condition c"; IS flow column filled |
| 5 | Internal Standard = N2 | Panel 1: N2 88.5583, mixed gas 12.5584 (Argon included); flows recalculated with MW 28.0134 |
| 6 | Process = Isomerization | Online page as before (mol% only, no IS) |

---

## 7. Points to confirm before / during the build

1. **Condition without a bypass line**: plan = explicit ERROR for its reactor lines. Alternative: use the nearest
   earlier condition's bypass average (would be marked "from condition c−1").
2. **First bypass injection after a bottle / condition change** (gas not yet stable): include all lines (plan) or skip
   the first injection of each window, as the workbook's outlier check skips rep 1.
3. **Bypass lines with very different values** (outliers): show the standard deviation in Panel 1 and flag > 3 % RSD?
4. **Lumped peaks** (C3-C4 …) in the mixed gas have no MW: excluded from MW_mix with a warning (plan).

## 8. Rollback
Back up the dashboard folder before the update; the update changes no data files. Removing the process value
`general_mb` restores the 6.4.3 behaviour of the other processes.
