# 6.4.0 → 6.4.1 Run Plan update (process selection kept)

For an offline 6.4.0 dashboard (Isomerization + Reforming, no Mass Balance): the universal Run Plan template with the
Feed in 4 tables, the Pre-run tab (DOE Step 0 with one chart per block) and the launcher fix.

* `UPDATE_GUIDE_6.4.0_to_6.4.1.md` – step-by-step guide (backup, check, copy or edit file by file, verify).
* `check_my_version.py` – shows which of your files are still the 6.4.0 originals before you replace them.
* `ILS_6.4.0_to_6.4.1.patch` – the whole update (incl. the Excel template and tests) as a git patch for commit
  77d6869 (6.4.0): `git apply --binary ILS_6.4.0_to_6.4.1.patch`.

The ready-to-copy `files/` folder is in the zip `ILS_6.4.1_RunPlan_update.zip` sent with the guide; the patch contains
the same changes.
