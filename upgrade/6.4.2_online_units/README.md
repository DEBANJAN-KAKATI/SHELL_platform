# 6.4.1 → 6.4.2 Online Analysis units (process selection kept)

For the offline 6.4.1 dashboard: the Units selector on Analysis → Online (Normalised mol%, Mass flow rates g/h,
Volumetric flow rates Nl/h, TOS carbon of each molecule g C/h) with the MassBal workbook formulas and molecular weights.

* `UPDATE_GUIDE_6.4.1_to_6.4.2.md` – formulas (with the workbook cells) and the step-by-step update.
* `check_my_version.py` – shows which of your files are still the 6.4.1 originals.
* `ILS_6.4.1_to_6.4.2.patch` – the whole update as a git patch for 6.4.1
  (`git apply --binary --whitespace=nowarn ILS_6.4.1_to_6.4.2.patch`).

The ready-to-copy `files/` folder is in `ILS_6.4.2_Online_units_update.zip`, sent with the guide.
