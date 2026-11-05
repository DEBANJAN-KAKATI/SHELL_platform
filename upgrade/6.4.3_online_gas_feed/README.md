# 6.4.2 → 6.4.3 Online Analysis units from the export and the Run Plan (process selection kept)

For the offline 6.4.2 dashboard: removes "ERROR: no gas feed to Rr (01i14FIC0r = empty)" for GC exports without gas flow
columns (gas feed from the Run Plan DOE), takes Ar in the feed gas only from the Run Plan (the Ar input fields are
removed), reads `ESTD_Etylene` as Ethylene and the gas composition of Run Plans in the earlier template layout.

* `UPDATE_GUIDE_6.4.2_to_6.4.3.md` – what changes, what the Run Plan must contain, steps, acceptance test.
* `IMPLEMENTATION_PLAN_6.4.2_to_6.4.3.md` – phases 1–8 with the exact code changes per file.
* `check_my_version.py` – shows which of your files are still the 6.4.2 originals.
* `ILS_6.4.2_to_6.4.3.patch` – `git apply --binary --whitespace=nowarn ILS_6.4.2_to_6.4.3.patch` on 6.4.2.

The ready-to-copy `files/` folder is in `ILS_6.4.3_Online_gas_feed_update.zip`, sent with the guide.
