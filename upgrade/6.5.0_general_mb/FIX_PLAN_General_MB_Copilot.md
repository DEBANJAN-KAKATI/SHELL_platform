# General_MB — correction plan for the Copilot build (6.5.0)

Applies to the offline 6.4.3 → 6.5.0 build made with Copilot (files checked: `online_units.py`,
`online_analysis.js`, `online_analysis.html`, `navigation.js`, `historian_save.js`).
Read together with `IMPLEMENTATION_PLAN_General_MB.md` (formulas and decisions are unchanged).

## 1. What is wrong (verified with `Result_R08-…txt` + `RunPlan_MassBalance_SS.xlsx`)

| # | Symptom on the page | Root cause | File |
|---|---|---|---|
| 1 | g/h, Nl/h and g C/h show nothing; "0 calculated, 171 ERROR"; Feed Gas panel empty | `_reactor_number(value)` uses `str(value or "")`, so the bypass reactor `0` becomes `""` → **no bypass line is ever found**, and the regex `R?([0-8])` rejects `1.0` / `0.0` (the loader gives floats) → every line is "no reactor … RNone" | `online_units.py` |
| 2 | Nl/h tab gives `unsupported operand type(s) for /: 'NoneType' and 'int'` | `values[name] / 100` when a component is empty in that line | `online_units.py` |
| 3 | Average IS Flow table empty on Nl/h and g C/h | `avg_is_flow` is only filled inside `if unit == "mass"` | `online_units.py` |
| 4 | Internal Standard change does nothing / page init stops | `updateGeneralMBControls()` is defined **inside** `renderUnitsBar()` but called at top level → `ReferenceError` | `online_analysis.js` |
| 5 | Summary shows `Ar 5 mol% / 9.482692119628974 wt%` | Shows the Run Plan target, not the bypass value, and is not rounded | `online_units.py`, `online_analysis.js` |
| 6 | Panels are under the table | Layout: they must be a **side panel** next to the table; only Conversion basis stays at the bottom | `online_analysis.html`, CSS |
| 7 | Bypass rows show mol% numbers under g/h headers | Bypass branch copies raw mol% into the converted columns | `online_units.py` |
| 8 | "Total without IS" too large | `sum(masses) + reactor_feed` adds the feed | `online_units.py` |
| 9 | Messages say "RNone" | Flow lookup runs with `reactor = None` | `online_units.py` |
| 10 | Same condition number in two blocks is merged | Windows keyed by `Condition No.` only | `online_units.py` |

Also check (file not supplied): `backend/routes/api.py` `/api/online-units` must forward
`internal_standard=body.get("internal_standard")`. Without it the panels stay empty even after fix 1.

Note on the screenshot: the reactor filter was on **0**, so only bypass lines were listed — by design they
have no g/h values. Set the filter to "All reactors" to see the converted lines.

## 2. Backend fixes — `backend/services/online_units.py`

**Fix 1 (main fix)** — replace `_reactor_number`:
```python
def _reactor_number(value):
    """0 = bypass; 1..8 from 1, 1.0, '1', 'R1'; None when unknown."""
    if value is None:
        return None
    text = str(value).strip().upper()
    if text == "BYPASS":
        return 0
    try:
        number = int(float(text.lstrip("R")))
    except ValueError:
        return None
    return number if 0 <= number <= 8 else None
```

**Fix 2** — Nl/h line:
```python
out[f"{name} [Nl/h]"] = values[name] / 100 * total_out if values.get(name) is not None else ""
```

**Fix 3** — move the average out of the unit branch, right after `masses = {...}`:
```python
if condition:
    avg_is_flow.setdefault(condition, {}).setdefault(f"R{reactor}", []).append(ar_flow)
```
and delete it from the `if unit == "mass"` block.

**Fix 5** — basis/summary from the bypass when an IS is selected:
```python
"is_mol_pct": round(feed_entry_values[0], 4) if feed_entry_values else None,   # per condition list in feed_gas_is
"ar_mol_pct": None if internal_standard else ar_mol,
"ar_wt_pct": None if internal_standard else ar_wt,
```
Round every number in `feed_gas_is` and `avg_is_flow` to 4 decimals before returning.

**Fix 7** — bypass branch: leave the converted columns empty (the composition is in the side panel):
```python
out["Status"] = f"BYPASS – feed gas of condition {condition or '—'}"
result.append(out); continue          # no values copied
```

**Fix 8** — `out["Total without IS [g/h]"] = sum(masses.values())`; keep `Gas feed to reactor [g/h]` as its own column.
Remove the duplicate `IS flow to reactor [g/h]` column (same value as `{IS} to reactor [g/h]`).

**Fix 9** — only look up flows when the reactor is known:
```python
if reactor is None:
    errors.append("no reactor (unknown Sampled_reactor)")
else:
    ...flow lookup...
```

**Fix 10** — key the condition windows by block and condition:
```python
key = f"{_row_value(row, 'Block') or ''} C{_condition_key(row)}".strip()
```
and show that label in the panel ("Block-1 C1").

## 3. Frontend fixes — `frontend/js/online_analysis.js`

1. Move `function updateGeneralMBControls() {...}` out of `renderUnitsBar()` to top level (fix 4).
   When the IS is set back to "—": `onlineState.unit = 'mol'`, hide the side panel.
2. Replace `conversionInputs()` with the 6.4.3 `onlineRunPlanContext()` (`rp.feedTables?.gas?.rows`), but pass
   the **full DOE rows** (Condition No., Block, Reactor ID, Start/End Date, gas flow) — the 6.4.3 filter strips `Condition No.`.
3. Call `renderGeneralMBPanels()` after restore on page load, and after every `refreshOnlineUnits()`.
4. Status column: put it right after Reactor, colour `ERROR:` cells red and `BYPASS` cells grey.
5. Conversion basis summary: `Conversion basis · IS Argon (bypass) 5.1572 mol% / 9.2932 wt% · 116 calculated, 6 ERROR, 45 bypass`
   (numbers with `toFixed(4)`; Run Plan Argon only as a comparison line inside the details).
6. Bump cache-busters: `online_analysis.js?v=6`, `online_units.css?v=3`, `navigation.js?v=3`.

## 4. Layout — side panel (`online_analysis.html` + `online_units.css`)

```
┌───────────────────────────── Reactor conditions ──── [IS ▾] [Units ▾] [Map] [Reactor ▾] [Search] ┐
│ ┌──────────────────────────────────────────────┐ ┌─ FEED GAS COMPOSITION · IS ───────┐ │
│ │ DateTime | TOS | Reactor | Status | ... g/h  │ │ Block-1 C1  24.10 14:00–27.10 18:30│ │
│ │                                              │ │ 44 bypass lines                     │ │
│ │          (online table, scrolls)             │ │ Argon (IS)     5.1572 mol% 9.29 wt% │ │
│ │                                              │ │ Mixed gas     95.9625 mol%          │ │
│ │                                              │ │ Sum          101.1197 mol%          │ │
│ │                                              │ │ Mixed gas MW  20.955 g/mol          │ │
│ │                                              │ │ Run Plan Ar   5.0 mol% (target)     │ │
│ │                                              │ ├─ AVERAGE IS FLOW TO REACTOR [g/h] ──┤ │
│ │                                              │ │ R1 0.1238   R5 0.2259   R6 0.2202   │ │
│ └──────────────────────────────────────────────┘ └─────────────────────────────────────┘ │
│ ▸ Conversion basis · IS Argon (bypass) …   (collapsed, stays at the bottom)                │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

HTML: wrap the table and a new `<aside>` in one grid; the two `<section class="online-mb-panel">` move into the aside;
`<details id="onlineUnitsBar">` stays after the grid.
```html
<div class="online-mb-layout" id="onlineMbLayout">
  <div class="table-wrap online-table-wrap"> …table… </div>
  <aside class="online-mb-side" id="onlineMbSide" hidden>
    <section class="online-mb-card"> <div class="eyebrow">Feed gas composition · Internal Standard</div>
      <div id="onlineFeedGasCards"></div></section>
    <section class="online-mb-card"> <div class="eyebrow">Average IS flow to reactor [g/h]</div>
      <div id="onlineIsFlowCards"></div></section>
  </aside>
</div>
<details class="online-units-bar" id="onlineUnitsBar" hidden> … </details>
```
CSS:
```css
.online-mb-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; }
.online-mb-layout.with-side { grid-template-columns: minmax(0, 1fr) 320px; }
.online-mb-side { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 12px; max-height: 70vh; overflow: auto; }
.online-mb-card { border: 1px solid var(--line, #ddd); border-radius: 10px; padding: 10px 12px; background: var(--card, #fff); }
.online-mb-card dl { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 6px 0 0; }
.online-mb-card .missing { color: #b42318; }
@media (max-width: 1200px) { .online-mb-layout.with-side { grid-template-columns: 1fr; } }
```
Side panel shows one card per condition (key/value list, `<dl>`), only the active reactors in the IS-flow card,
and a red line "ERROR: no bypass line in this condition" when `bypass_lines = 0`.
Visible only for process General_MB with an IS selected (any unit, also mol%).

## 5. Acceptance (R08 export + `RunPlan_MassBalance_SS.xlsx`, IS = Argon)

| Check | Expected |
|---|---|
| Feed gas card, condition 1 | 44 bypass lines · Argon 5.1572 mol% · mixed 95.9625 mol% · 9.2932 wt% |
| Average IS flow [g/h] (all 3 units) | R1 0.1238 · R5 0.2259 · R6 0.2202 |
| Mass tab | 116 OK, 45 BYPASS, 10 ERROR (no gas flow R5/R6, no reactor, empty lines) |
| R1 2024-10-24 15:09:23 | Methane 0.02323 g/h · 0.03703 Nl/h · 0.01739 g C/h |
| IS = "—" | only Normalised mol%, side panel hidden |
| Isomerization / Reforming | page unchanged (no IS selector, no side panel) |
| Messages | no "RNone", no NoneType error |

Verified: fixes 1 and 2 alone already give 116 OK lines on all three tabs and the feed-gas values above.

## 6. Order of work
1. `online_units.py` fixes 1–3, 7–9 → run the acceptance file in Python (no UI).
2. `api.py` forwards `internal_standard`.
3. `online_analysis.js` 1–3 (page works again).
4. Side-panel layout + CSS, Status colouring, summary text, cache-busters.
5. Fixes 5 and 10, tests in `tests/test_online_units.py` for the table above, CHANGELOG/README.
