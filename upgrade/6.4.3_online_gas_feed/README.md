# 6.4.2 → 6.4.3 Online Analysis units for GC exports without gas flows (process selection kept)

For the offline 6.4.2 dashboard: gas feed from the values entered per reactor or the Run Plan DOE when the GC export has
no 01i14FIC0r / 01i14FI01 columns, Ar flow from the molar volume without 01i14FI01, `ESTD_Etylene` = Ethylene, and the
gas composition of Run Plans in the earlier template layout.

* `UPDATE_GUIDE_6.4.2_to_6.4.3.md` – what changes, formulas, step by step, checks, what the Run Plan needs.
* `IMPLEMENTATION_PLAN_6.4.2_to_6.4.3.md` – phases 1–8 with the exact code changes per file, checks and acceptance test.
* `check_my_version.py` – shows which of your files are still the 6.4.2 originals.
* `ILS_6.4.2_to_6.4.3.patch` – `git apply --binary --whitespace=nowarn ILS_6.4.2_to_6.4.3.patch` on 6.4.2.

The ready-to-copy `files/` folder is in `ILS_6.4.3_Online_gas_feed_update.zip`, sent with the guide.
