# MassBal workbook (Ver 2.2) — how it works, cell by cell

Reference for rebuilding the mass balance in the ILS dashboard (General_MB). Source: `R6-C1-S1-MassBal_Ver2.2.xlsx`
(a copy is in `tests/fixtures/online/`). Example numbers below are the cached values of that file (run R6-C1-S1,
condition C1, sample S1, eight reactors, argon as internal standard).

---

## 1. The workbook at a glance

16 sheets, about 25 000 formulas. Data flows in this order:

```
 ZMB ───────────────► Run_Plan (mixed gas composition) ──► Gas (Ar wt%, gas feed and Ar flow per reactor)
  │  (blank run: pump check,                                      │
  │   feed gas GC per reactor)                                    ▼
  └──► Liq (verified liquid feed) ──────────────────────────► R1_MB … R8_MB (GC replicates → g/h, Nl/h, g C/h,
        Liq (TLP masses, liquid product flows) ─────────────►   mass balance closure per reactor)
                                                                  │
                                       C-Balance (carbon balance, C4+ yield, acetylene conversion, selectivity)
                                                                  │
                                                               Summary (KPI table + by-injection tables)
 HC_SIMDIS, HC_DHA: liquid product analyses for charts only (no formula reads them)
```

| Sheet | Role | Typed in by the user | Feeds |
|---|---|---|---|
| Run_Plan | Run ID, start, catalyst loading, gas feed composition and MWs, liquid feed analysis, target conditions | yes | Gas, C-Balance, Liq, HC sheets |
| ZMB | Blank ("zero") run before the experiment: liquid pump calibration and GC of the feed gas per reactor position | yes (masses, times, GC) | Run_Plan row 35, Liq row 13 |
| Liq | Sampling window of the sample, liquid feed and liquid product (TLP) per reactor | yes (times, masses, elemental analysis) | R#_MB, C-Balance, Summary |
| HC_SIMDIS | Boiling-point curve of the hydrocarbon product per reactor | yes | 2 charts only |
| HC_DHA | PIONA by carbon number of the hydrocarbon product per reactor | yes | 8 charts only |
| Gas | Gas feed per reactor (g/h), verified Ar mol%, Ar wt%, Ar flow per reactor | yes (avg 01i14FI01, FIC per reactor, Ar %) | R#_MB, C-Balance |
| R1_MB … R8_MB | One per reactor: GC replicate injections → mass, volume and carbon flow per molecule; mass balance closure | yes (GC mol% per injection) | C-Balance, Summary |
| C-Balance | Carbon in/out, carbon balance, C4+ yield, acetylene conversion, ethylene selectivity | no (two hard-coded numbers) | Summary |
| Summary | KPI table per reactor, gas-phase carbon balance and acetylene conversion by injection | no | — |

Units: gas flows in NmL/h or Nl/h (0 °C, 1 atm), mass flows in g/h, GC values in "normalized mol%" (ESTD of the
export), masses in g, times as Excel date-times (×1440 → minutes, ×24 → hours).

---

## 2. Run_Plan

### 2.1 Run identification (rows 1–4)
`B1` Run Number (R6-C1-S1), `B2` Objective, `B3` Run Start Date (2024-05-13 14:00) — **the zero of time on stream for
the whole workbook**, `B4` notebook reference.

### 2.2 Catalyst loading (rows 6–21)
Two blocks of four reactors (R1–R4 rows 8–14, R5–R8 rows 15–21). Per reactor: Catalyst ID per bed (top/middle/bottom),
target and actual weight [mg], actual volume [mL]; totals `=SUM(…)` in rows 13/20.
Row 14/21 "Condensed Cat Description" = `CONCATENATE("R1", " Catalyst ", top bed [/ middle [/ bottom]])` → used as
chart titles in HC_SIMDIS and HC_DHA. **No calculation uses the catalyst weights** (they would be needed for WHSV,
see §2.6).

### 2.3 Target feed gas composition (rows 23–31)
Columns B–J = Hydrogen, Ethylene, Methane, Ethane, Nitrogen, CO2, CO, Argon, Mixed gas; row 25 "Used for GoR or GHSV
calc?" (Yes/No); rows 26–31 = Condition 1–6 in mol% (here Ar 5 + mixed gas 95). O–X copy the value when the flag is
"Yes" and sum (X = 100). `M25` gas density 0.9014. **Nothing downstream reads rows 23–31** (only `H25` is read by
C-Balance AD3, see §9). They document the planned feed only.

### 2.4 Mixed gas composition (rows 33–46) — used
| Row | Content | Formula | Example |
|---|---|---|---|
| 35 | Concentration [mol%] of H2, C2H4, CH4, C2H6, N2, CO2, CO, C2H2, C3H6, C3H8 | `=ZMB!$B$22 … $B$31` (averages of the blank run, Reactor-1 position) | H2 20.90, C2H4 1.61, CH4 2.54, C2H6 0.0017, N2 59.80, C2H2 7.82; L35 = 92.67 |
| 37 | Mol Wt | typed | 2.016, 28.054, 16.043, 30.07, 28.014, 44.009, 28.01, 26.038, 42.081, 44.097 |
| 38 | g in 100 gmol of gas | `=B35*B37` | Σ B38:K38 = 2006.97 |
| 36 | Concentration [mass %] | `=100*B38/SUM($B$38:$K$38)` | C2H2 10.148 %, CH4 2.027 %, C2H4 2.254 %, N2 83.47 % |
| 39–42 | C, H, O, N mass % of each molecule | typed (e.g. C2H2: C 92.257 %, H 7.743 %) | |
| 43–46 | C, H, O, N contained in 100 kg gas | `=B$36*B39/100`, totals in L | C 12.81 kg, H 3.72 kg, N 83.47 kg |

Note: row 35 comes from the GC of the total feed gas, so it sums to 92.67 mol%, not 100 (argon and unanalysed
components are not in the list).

### 2.5 Liquid feed (rows 48–70)
Feed ID (B48), description (B49), density (B52), elemental analysis C/H/O wt% MAF (B58–B60), S and N ppmw (B61–B62),
chloride, sodium. **`B58` (carbon wt%) is read by C-Balance for the carbon in the liquid feed** — it is empty in
this file, so the liquid feed brings no carbon into the balance.

### 2.6 Target operating conditions and flows (rows 79–106)
Temperature and pressure per block, duration, LHSV [ml liq/ml cat·h] and GoR [Nl active gas/ml liq] per reactor and
condition; rows 97–106 planned liquid [g/h] and gas [Nl/h] flows (typed for conditions 1–3; formulas for 4–6:
`liq = catalyst weight[g] × LHSV`, `gas = GoR × liq/1000 / (active gas mol%/100)`). **Not used by any calculation**
(the second formula multiplies a weight by an LHSV, i.e. it treats g as ml).

---

## 3. ZMB — blank run before the experiment

Three repeats (Rep-1 columns B–I, Rep-2 L–S, Rep-3 V–AC), one column per reactor R1–R8.

| Row | Content | Formula | Example (R1) |
|---|---|---|---|
| 4 / 5 | Sample collection started / finished | typed | 2024-05-12 14:00 → 15:00 (the day before the run) |
| 6 | Duration [min] | `=(B5-B4)*1440` | 60 |
| 7 | "Average Time-on-Stream" (really the duration in hours) | `=B6/60` | 1.0 |
| 10 | TL collected mass [g] | typed | 0.5 |
| 11 | Liquid flow [g/h] | `=B10/B7` | 0.5 |
| 13 | **Verified liquid flow [g/h]** | `=AVERAGE(B11, L11, V11)` (three repeats) | 0.5 → Liq!B13 |

GC of the feed gas, one block per reactor position (rows 17–31 Reactor-1, 34–48 Reactor-2 … 136–150 Reactor-8, 152–166
Bypass): rep number (row 17), injection date-time (18), cumulative and elapsed minutes (19–20), mol% of H2, C2H4, CH4,
C2H6, N2, CO2, CO, C2H2, C3H6, C3H8 per injection in D–AB. `B` = `AVERAGE(D:AB)` (all injections, including the first),
`AC` = `B × MW`, `C` = wt% = `100·AC/ΣAC`. **Only the Reactor-1 averages (B22:B31) are used** (→ Run_Plan row 35);
the other positions agree within about 3 % (e.g. C2H2 7.82–8.06 mol%) and the Bypass block is empty.
Checks (conditional formatting): injection time outside the window turns red; durations below 48 min highlighted.

---

## 4. Liq — sample window, liquid feed and liquid product

| Row | Content | Formula | Example |
|---|---|---|---|
| 4 | Condition and sample number | typed | C1-S1 |
| 5 / 6 | Sample collection started / finished (per reactor B–I) | typed | 2024-05-14 07:52 → 07:58 |
| 7 | Duration of sampling [min] | `=(B6-B5)*1440` | 6 |
| 8 | Average time on stream [h] | `=24*((B5+B6)/2 - Run_Plan!B3)` | 17.917 |
| 13 | Liquid feed flow [g/h] (02i2FIC0r) | `=ZMB!B$13` | 0.5 |
| 17 | TLP mass [g] | typed | empty |
| 18 / 19 | Hydrocarbon (top) / aqueous (bottom) phase mass [g] | typed | empty |
| 20 | Decantation loss [%] | `=100 - 100*(B18+B19)/B17` | — |
| 24–28 | Elemental analysis of the HC product: C, H, O wt%, N, S ppmw | typed | empty |
| 32–35 | Density, mono/di/tri+ aromatics | typed | empty |
| 40 | Hydrocarbon product flow [g/h] | `=(B17-B19)/(B8)` | 0 |
| 41 | Aqueous product flow [g/h] | `=B19/(B7/60)` | 0 |

The liquid side of this sample is empty: no TLP was weighed, so the liquid product is 0 everywhere downstream.

---

## 5. Gas — gas feed and argon per reactor

| Cell(s) | Content | Formula | Example |
|---|---|---|---|
| E3, E4 | Sampling duration, average TOS | as in Liq | 6 min, 17.917 h |
| **E5** | Average of 01i14FI01 (total gas feed, g/h) over the sampling window | typed from the export | 19.5 |
| **B11:I11** | Gas feed per reactor 02i2FIC0r [NmL/h] | typed | 3000 (R3 empty) |
| **B12:I12** | Gas feed to the reactor [g/h] | `=$E$5*B11/SUM($B$11:$I$11)` (total split by volume share) | 19.5 × 3000/21000 = 2.7857 |
| B13:I21 | Flow of each feed gas [g/h] = B12 × mass % (row 37) | `=B12*$B$37/100` … `$J$37` | Ar (row 20) 0.22891; mixed gas (row 21) 2.5568 |
| **I35, J35** | **Verified** feed composition: Argon 4.3, mixed gas 95.6 mol% | typed | K35 = 99.9 |
| J36 | MW of the mixed gas | `=SUM(Run_Plan!B38:K38)/100` | 20.0697 |
| I38, J38 | mol% × MW | `=I35*I36` | 171.776, 1918.66 |
| **I37** | **Ar wt% of the feed gas** | `=100*I38/SUM(B38:J38)` | 8.21725 |
| **B20:I20** | **Average Ar flow to reactor [g/h]** | `=B12*$I$37/100` | 0.22891 → R#_MB!F5 |
| B22:B31, J12:M18 | Elemental C/H/O/N/Ar flows of the feed gas (element mass % table J12:M18) | see §9 | not used anywhere |

The whole argon basis comes from three typed numbers: E5 (total gas, g/h), B11:I11 (split) and I35 (Ar mol%).

---

## 6. R1_MB … R8_MB — one sheet per reactor

Layout (R6_MB shown; all eight are copies, see §9 for the reference errors):

### 6.1 Header (rows 1–13)
| Cell | Content | Formula | R6 |
|---|---|---|---|
| C3 | Run start | `=Run_Plan!B3` | |
| C5 / C6 | Sample window | `=Liq!B5` / `=Liq!B6` | 07:52 → 07:58 |
| F3 / F4 | Duration [min] / average TOS [h] | `=(C6-C5)*1440` / `=24*((C5+C6)/2-C3)` | 6 / 17.917 |
| **F5** | **Average Ar flow to reactor [g/h]** | `=Gas!G20` | 0.22891 |
| H6 / I6 | First / last GC injection time | array `=MIN(IF(D16:XFD16<>0,D16:XFD16))` / MAX | — |
| H7, I7, K6 | Injection time inside the sample window? | `=IF(Liq!G3>'R1_MB'!H6,"NA",TRUE)` … `Pass/Fail` | Pass (see §9) |
| C8 | Liquid feed [g/h] | `=Liq!G13` | 0.5 |
| **C9** | **Gas feed without Ar [g/h]** | `=Gas!G12-Gas!G20` | 2.7857 − 0.2289 = 2.5568 |
| C10 / C11 | HC / aqueous liquid product [g/h] | `=Liq!G40` / `=Liq!G41` | 0 / 0 |
| **C12** | **Gas product without Ar [g/h]** | `=SUM(C52:C74, C76:C80)` (all molecules except row 75 = Argon) | 2.8212 |
| **C13** | **Mass balance closure [%]** | `=100*(C12+C11+C10)/(C9+C8)` | 2.8212 / 3.0568 = 92.29 % |

### 6.2 GC replicates (rows 15–49)
Row 15 rep number, 16 injection date-time, 17 minutes since the first injection `=(E16-$D$16)*1440`, 18 minutes
between injections. Rows 20–48: **normalized mol% per injection** (columns D … AB = up to 25 injections) for 29
components with their MW in column B:

| Row | Component | MW | C atoms (AD) | | Row | Component | MW | C atoms |
|---|---|---|---|---|---|---|---|---|
| 20 | Methane | 16.04 | 1 | | 35 | Ethylbenzene | 106.167 | 8 |
| 21 | Ethane | 30.07 | 2 | | 36 | p-Xylene | 106.167 | 8 |
| 22 | Ethylene | 28.05 | 2 | | 37 | m-Xylene | 106.167 | 8 |
| 23 | Propane | 44.1 | 3 | | 38 | o-Xylene | 106.167 | 8 |
| 24 | Propylene | 42.08 | 3 | | 39 | C6 Unknowns | 86.18 | 6 |
| 25 | Butane | 58.12 | 4 | | 40 | C8 Unknowns | 114.23 | 8 |
| 26 | Pentane | 72.15 | 5 | | 41 | C7 Unknowns | 100.21 | 7 |
| 27 | C6s | 86.18 | 6 | | 42 | CO2 | 44.01 | 1 |
| 28 | Hexane | 86.18 | 6 | | 43 | **Argon** (IS) | 39.948 | 0 |
| 29 | C4 | 58.12 | 4 | | 44 | CO | 28.01 | 1 |
| 30 | C5 | 72.15 | 5 | | 45 | H2 | 2.016 | 0 |
| 31 | C6 | 86.18 | 6 | | 46 | Acetylene | 26.04 | 2 |
| 32 | C6 Above | 100.21 | 6 | | 47 | Isobutane | 58.12 | 4 |
| 33 | Benzene | 78.11 | 6 | | 48 | N2 | 28.0134 | 0 |
| 34 | Toluene | 92.14 | 7 | | | | | |

Statistics per component (outlier check): `AC` = `STDEV.S(E:AB)`, `AD` = `AVERAGE(E:AB)`, `AE` = `AD + 2·AC` — over
injections 2…25 (**the first injection, column D, is left out**). Conditional formatting colours a value above AE.
R6 example, Argon: injections 4.282, 4.317, 4.318, 4.321, **2.824**, 4.323 … → AD 4.179, AC 0.450 (injection 5 is a bad
injection: H2 11.97 instead of ~21.8, N2 72.4 instead of ~58.8).

### 6.3 Mass flow of each molecule (rows 51–84)
Per injection (D…AB) and averaged (C = `AVERAGE(D:AB)`, **all injections including the first and outliers**):

```
m_i [g/h] = ( y_i · MW_i ) / ( y_Ar · MW_Ar ) · F_Ar,r          D52 = (D20*$B20/(D$43*$B$43))*$F$5
```
y = mol% of that injection, F_Ar,r = F5. Argon itself (row 75) returns F5 exactly (0.22891).
R6 averages: CH4 0.05557, C2H4 0.06695, C2H2 0.27351, H2 0.05727, N2 2.35266 g/h.
- Row 82 HC gases = Σ rows 52–73 + 78 + 79 (C1–C8 hydrocarbons, acetylene, isobutane) = 0.4112
- Row 83 COx = CO2 + CO; row 84 = HC + COx.
- `AC52:AC80` carbon mass flow from the average: `=(12.011*AD52/B20)*C52`.

### 6.4 Volumetric flows (rows 86–118)
```
D86  V_out [Nl/h] = D75 / Gas!I35 · Gas!B11          (= m_Ar / y_Ar,feed · FIC of R1)
D88  V_i  [Nl/h] = y_i / 100 · V_out
```
R6: V_out = 0.22891 / 4.3 × 3000 = 159.7 "Nl/h" for a feed of 3 Nl/h — see §9 (units).

### 6.5 Carbon of each molecule over TOS (rows 120–150)
```
D121  C_i [g C/h] = 12.011 · nC_i / MW_i · m_i       (per injection; C = average)
C150  total carbon in the gas product = Σ C121:C149   R6: 0.3636 g C/h
```
D150…AB150 (carbon per injection) feed the "Gas phase C' balance by TOS" table on Summary.

---

## 7. C-Balance — carbon and conversion

Columns C–J = R1–R8 (results); columns N–U = helper calculations per reactor (labels in column M); W–AG = gas-mix
density (unused).

### 7.1 Helper block (N–U, R1 shown)
| Row | Label (col M) | Formula | Value |
|---|---|---|---|
| 3 | Acetylene wt% in mixed gas | `=Run_Plan!$I$36` | 10.148 |
| 4 | Acetylene wt% in the total feed gas | `=N3*Gas!$J$37%` | 9.314 |
| 5 | C weight fraction in acetylene | `=24/26.038` | 0.9217 |
| 6 | C wt% of feed gas from C2H2 | `=N4*N5` | 8.585 |
| 7 | **C from C2H2 [g/h]** | `=Gas!B$12*N$6%` | 0.2392 |
| 8 | Acetylene flow in feed [g/h] | **typed 0.1027** (stale, unused) | |
| 13–18 | same for methane (Run_Plan!D36, 12/16) | → C 0.03887 g/h, CH4 0.05182 g/h | |
| 20–25 | same for ethane (Run_Plan!E36, 24/30.07) | → C 5.3·10⁻⁵ g/h, C2H6 6.6·10⁻⁵ g/h | |
| 27–32 | same for ethylene (Run_Plan!C36, 24/28.05) | → C 0.04932 g/h, C2H4 0.05764 g/h | |
| 34 | C wt% of the liquid product | **typed 84.865** | |
| 35 | C in TLP [g] | `=Liq!B$17*N$34%` | 0 |
| 36 | C in liquid product [g/h] | `=N35/Liq!B$8` | 0 |

### 7.2 Results (C–J)
| Row | Quantity | Formula (R1) | R6 |
|---|---|---|---|
| 3 | C in liquid feed [g/h] | `=Liq!B13*Run_Plan!$B$58%` | 0 (B58 empty) |
| 4 | C in gas feed [g/h] | `=N7+N17+N24+N31` (C2H2 + CH4 + C2H6 + C2H4) | 0.3274 |
| 6 | C in liquid product [g/h] | `=N$36` | 0 |
| 7 | C in gas product [g/h] | `=SUM('R1_MB'!$AC$52:$AC$80)` | 0.3636 |
| **9** | **Carbon balance [%]** | `=(C6+C7)/(C3+C4)*100` | 111.04 |
| 11 | C4+ in liquid feed [g/h] | `=Liq!B$13` (whole liquid feed counted as C4+) | 0.5 |
| 12 | C4+ in liquid product [g/h] | `=Liq!B$17/Liq!B$8` | — |
| 13 | C4+ in gas feed | typed 0 | |
| 14 | C4+ in gas product [g/h] | `=SUM('R1_MB'!$C$57:$C$73,'R1_MB'!$C$79)` (butane … C7 unknowns + isobutane) | 0.0145 |
| 15 | C4+ yield [%] | `=((C12+C14)-(C13+C11))/(C13+C11)*100` | — (no liquid product) |
| 17 | Acetylene in [g/h] | `=Gas!B$12*N$4%` | 0.2595 |
| 18 | Acetylene out [g/h] | `='R1_MB'!$C$78` | 0.2735 |
| **19** | **Acetylene conversion [%]** | `=(C17-C18)/C17*100` | −5.41 |
| 20 | "Ethylene to ethane selectivity [mol/mol]" | `=(C2H4 out − C2H4 in)/(C2H6 out − C2H6 in)` in **g/h** | 18.37 |
| **21** | **Ethylene selectivity [%]** | `=C90/(C90+C89+C91·1.5+C93·2+C97·2+C99·3+C100·3+C108·4)*100` on Nl/h of R#_MB (C2H4 / Σ products weighted by carbon number ÷ 2) | 91.88 |

---

## 8. Summary

| Block | Cells | Content |
|---|---|---|
| KPI table | E3:L11 (row = reactor) | Sampled reactor, C'Bal (C-Balance row 9), M'Bal (R#_MB!C13), TOS_h (Liq row 8), Ac%Conv (row 19), Ethy_%Sel (row 21), C'Bal_g (R#_MB!C150), "C17+%Yeild" (= C-Balance row 15, the **C4+** yield) |
| Gas-phase C' balance by TOS | O3:W28 (row = injection 1…25) | `=R#_MB!D150 / C-Balance!C4 × 100` — carbon in the gas of one injection / carbon in the gas feed |
| Acetylene conversion by TOS | E15:M40 (row = injection) | `=100 − R#_MB!D78 / C-Balance!C17 × 100` |

This file: C'Bal 100.2–116.1 %, M'Bal 84.0–103.6 %, Ac%Conv −8.8 % (R2) … 98.9 % (R8), Ethy_%Sel 59.8–96.9 %.
R5 is loaded with **alpha-alumina (inert)**: its acetylene conversion of −6.5 % and carbon balance of 111.5 % show the
systematic offset of the method (an inert reactor should give 0 % and 100 %).

---

## 9. Errors and weak points found (impact on the numbers)

| # | Where | What is wrong | Impact | Dashboard should |
|---|---|---|---|---|
| 1 | R7_MB, R8_MB C8–C11, F5 | Point at R6's columns (`Liq!G13`, `Gas!G12`, `Gas!G20`, `Liq!G40/41`) instead of H / I | R7, R8 use R6's feeds and Ar flow (invisible here because all reactors had 3000 NmL/h) | Each reactor uses its own inputs |
| 2 | All R#_MB D86 | `V_out = m_Ar / y_Ar,feed[mol%] · FIC_R1` mixes g/h and NmL/h and always uses R1's FIC (`Gas!$B$11`) | Volumetric flows ~53× too high (159.7 Nl/h for 3 Nl/h) | `V_out = FIC_r/1000 · y_Ar,feed / y_Ar` (already done in 6.8) |
| 3 | Gas J36 | MW of the mixed gas = Σ(y·MW)/**100** while the composition sums to 92.67 mol% | MW_mix 20.07 instead of 21.66 (Σ/Σy) → Ar wt% 8.22 instead of 7.66 % → **every gas product flow ~7 % high** | Normalise by Σy (General_MB does), state the convention |
| 4 | Liq row 40, C-Balance rows 12, 36 | Hydrocarbon product flow divides by **average TOS** (`B8`, 17.9 h) instead of the sampling duration (`B7/60`, 0.1 h); the aqueous flow (row 41) uses the duration | HC liquid product, C4+ yield and liquid carbon wrong by the ratio TOS/duration (~180×) once TLP masses are entered | Divide by the sampling duration |
| 5 | C-Balance N34, N8 | Liquid product carbon 84.865 wt% typed (ignores Liq row 24); stale acetylene flow 0.1027 | Liquid carbon not from the analysis | Take C wt% from the liquid analysis |
| 6 | C-Balance row 3 | Liquid feed carbon = Run_Plan!B58, empty here | Carbon in = gas only (0.327 g/h); with 0.5 g/h of liquid at ~85 % C the real input is ~0.75 g C/h | Require feed C wt% when a liquid is fed |
| 7 | C-Balance row 4 | Gas feed carbon counts only C2H2, CH4, C2H6, C2H4 | Propylene, propane, CO, CO2 in the feed ignored | Sum carbon over every feed component |
| 8 | Gas rows 22–31 | Elemental flows use J20:M20 (empty) for the mixed gas | C/H/O/N feed totals = 0 (not used further) | Compute from the composition |
| 9 | C-Balance row 20 | "mol/mol" selectivity computed from g/h | Wrong unit | Divide by MW (or use Nl/h) |
| 10 | C-Balance row 21 | Selectivity denominator misses propylene, pentane, C5, C6 unknowns, aromatics, isobutane, methane; ethylene in the feed not subtracted | Selectivity overstated, not a true selectivity of converted acetylene | Define with the team (see §10.4) |
| 11 | R#_MB H7/I7 | Time check compares `Liq!G3` (empty) with `'R1_MB'!H6` (R1's injections) | Always "Pass" | Check each injection time against that reactor's window |
| 12 | R#_MB, ZMB averages | Flow averages include the first injection and outliers; the statistics exclude the first injection; the highlight rule `C20>$AE20` is shifted one column and only flags high values | Bad injections (R6 injection 5) enter the averages | Flag (and optionally exclude) outliers both ways, same rule for statistics and averages |
| 13 | Gas E5, B11:I11 | Average 01i14FI01 and FIC typed by hand | Copy errors | Average them from the online export over the sampling window |
| 14 | Run_Plan rows 97–106 | Planned liquid flow = catalyst weight × LHSV (g treated as ml) | Planning only | — |
| 15 | C-Balance AC5 | Acetylene fMW uses 44.01 (CO2) | Gas-mix density X4 wrong (unused) | — |
| 16 | Summary L3 | "C17+ yield" shows the C4+ yield | Label | — |

---

## 10. What the dashboard needs for the mass balance

### 10.1 Inputs and where they come from

| Input | Workbook | ILS dashboard |
|---|---|---|
| Run start / feed cut-in | Run_Plan B3 | Run Plan → Plan → Feed Cut-In ✔ |
| Catalyst per reactor, weights | Run_Plan rows 8–21 | Run Plan → Plan ✔ |
| Conditions and their windows | Run_Plan rows 79–106 (unused) | Run Plan → DOE (start, end, flows per reactor) ✔ |
| Feed gas composition (IS and mixed gas) | ZMB → Run_Plan row 35; Gas I35/J35 typed | **Bypass GC lines per condition** (General_MB) ✔ |
| Molar masses, carbon numbers | R#_MB col B / AD, Run_Plan row 37 | Run Plan → Feed → Molecular weights ✔ (6.9.1) |
| Total gas feed (01i14FI01) and FIC per reactor | Gas E5, B11:I11 typed | Online export per line (else Run Plan DOE) ✔ |
| GC injections per reactor | R#_MB D20:AB48 typed | Online export lines with Sampled_reactor ✔ |
| Sampling window per sample (start / end) | Liq B5:I6 | **to build** — sample entry per reactor |
| Liquid feed flow | ZMB row 13 → Liq row 13 | **to build** — pump check (ZMB) or 02i2FIC0r from the export / Run Plan DOE liquid flow |
| TLP mass, HC and aqueous phase masses | Liq rows 17–19 | **to build** — liquid product entry |
| Liquid product analysis (C, H, O wt%, N, S, density) | Liq rows 24–35 | **to build** (liquid product entry) |
| Liquid feed C wt% | Run_Plan B58 | **to build** — with the liquid feed data (not the Run Plan, per the agreed decision) |
| SIMDIS, DHA of the product | HC_SIMDIS, HC_DHA | Offline Analysis (DHA) exists; SIMDIS optional |

### 10.2 Calculations

| Step | Formula | Status |
|---|---|---|
| Gas feed to reactor | F_r = 01i14FI01 · FIC_r / ΣFIC | done |
| IS flow to reactor | F_IS = F_r · w_IS, w_IS from the bypass composition | done (General_MB) |
| Mass / volume / carbon flow per molecule and injection | §6.3–6.5 | done |
| Averages over the sampling window per reactor | AVERAGE of the injections in Liq B5..B6 (with outlier rule) | to build |
| Gas feed without IS, gas product without IS | C9, C12 | to build (from existing flows) |
| Liquid product flows | HC = (TLP − aqueous)/duration, aqueous = aqueous/duration | to build (fix #4) |
| **Mass balance closure** | (gas out + HC out + aq out)/(gas in + liquid in) ×100 | to build |
| **Carbon balance** | (C gas out + C liquid out)/(C gas in + C liquid in) ×100, C gas in over every feed component | to build (fixes #6, #7) |
| Acetylene conversion | (in − out)/in ×100, in = F_r · w_C2H2 | to build |
| Selectivity / C4+ yield | as defined with the team | to build |
| Checks | injection inside the window, outliers, decantation loss, inert reactor near 0 % conversion and 100 % balance | to build |

### 10.3 Outputs (Summary)
Per reactor and sample: TOS, mass balance %, carbon balance %, carbon in gas product (g C/h), acetylene conversion %,
ethylene selectivity %, C4+ yield %; per injection: gas-phase carbon balance and acetylene conversion vs TOS (plots).

### 10.4 Decisions to take with the team before building
1. Mixed-gas MW convention (#3): divide by Σy of the analysed gas (dashboard) or by 100 (workbook)? It changes every flow by ~7 %.
2. Which injections count in the average: all (workbook flows), all but the first (workbook statistics), or without outliers?
3. Definition of ethylene selectivity and of the C4+ yield (which components, subtract the feed or not).
4. Liquid feed: flow from the ZMB pump check, the export (02i2FIC0r) or the Run Plan DOE; carbon wt% from the feed analysis.
5. Whether R5-type inert reactors are used as a correction reference.
