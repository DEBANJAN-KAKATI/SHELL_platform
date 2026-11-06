# 6.4.3 → 6.5.0 Process General_MB: Internal Standard (Argon / N2) measured in the bypass lines

For the offline dashboard with the process selector. Adds the third process General_MB. In it, the Online Analysis page
gets an Internal Standard selection and a side panel. The panel shows the feed gas composition from the bypass
(reactor 0) lines and the average IS flow to each reactor, per Run Plan DOE condition. g/h, Nl/h and g C/h are then
calculated with that IS.

* `UPDATE_GUIDE_6.4.3_to_6.5.0.md`: what changes, what the Run Plan must contain, steps, acceptance test.
* `IMPLEMENTATION_PLAN_General_MB.md`: the plan this build follows (formulas, decisions).
* `FIX_PLAN_General_MB_Copilot.md`: what was wrong in the Copilot attempt. Replace it with these files.
* `check_my_version.py`: shows which files are still 6.4.3, already updated, or changed.
* `ILS_6.4.3_to_6.5.0.patch`: `git apply --binary --whitespace=nowarn ILS_6.4.3_to_6.5.0.patch` on 6.4.3.

The ready-to-copy `files/` folder and the filled Run Plan are in `ILS_6.5.0_General_MB_update.zip`, sent with the guide.
