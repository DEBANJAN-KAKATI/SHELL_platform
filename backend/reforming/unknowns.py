"""Carbon number of the Unidentified peaks of a reforming DHA COMPONENT_LIST.

Since 2026-10-14 the Hydrocarbon Expert template lumps most unknowns per carbon
number in COMPONENT_LIST (e.g. "C8 Uknowns", GROUP = CARBON# = 8). An unknown row
that carries a CARBON# > 0 keeps that Carbon# as given. Only rows without one
(GROUP "Unidentified", CARBON# 0, and every unknown of the older exports) use the
neighbour rule below.

Rule (agreed with the researcher, 2026-10-13):
  * Peaks are taken in elution order (TIME, which is also RI order).
  * An Unidentified peak whose previous and next identified peaks have the same
    Carbon# gets that Carbon#.
  * If the two neighbours differ, the peak gets the Carbon# of the previous
    identified peak (the one eluting just before it on the RI scale).
  * A peak with no identified peak before it takes the next identified peak's
    Carbon#; with no identified peak at all it falls back to round(RI / 100)
    (n-paraffin retention index scale).
Carbon numbers are clamped to C1..C15, the range of the reforming table.
"""

import re

UNIDENTIFIED_GROUPS = {"UNIDENTIFIED", "UNKNOWN", "UNKNOWNS"}
# "C8 Unknowns", "C7-Unknowns", "Below C4 Uknowns" (sic, as exported)
UNKNOWN_NAME = re.compile(r"\bUN?KNOWNS?\b|\bUNIDENTIFIED\b")


def _numeric(text):
    try:
        float(text)
    except (TypeError, ValueError):
        return False
    return True


def is_unidentified(peak):
    group = str(peak.get("group") or "").strip().upper()
    name = str(peak.get("component") or "").strip().upper()
    if group in UNIDENTIFIED_GROUPS or UNKNOWN_NAME.search(name):
        return True
    # Lumped unknown rows carry the carbon number in GROUP instead of a family name.
    return _numeric(group) and not name


def given_carbon(peak):
    """Carbon# exported for an unknown row (lumped "Cn Unknowns"), else None."""
    carbon = peak.get("carbon")
    if not is_unidentified(peak) or carbon is None or carbon <= 0:
        return None
    return int(round(carbon))


def _identified_carbon(peak):
    carbon = peak.get("carbon")
    if is_unidentified(peak) or carbon is None or carbon <= 0:
        return None
    return int(round(carbon))


def _clamp(carbon):
    return min(max(int(carbon), 1), 15)


def _label(peak):
    if not peak:
        return ""
    ri = peak.get("ri")
    ri_text = f", RI {ri:g}" if ri is not None else ""
    return f"{peak['component']} (C{_identified_carbon(peak)}{ri_text})"


def assign_unknown_carbon_numbers(peaks):
    """Return (assignment rows, {carbon#: summed wt%}) for the Unidentified peaks."""
    identified = [(index, _identified_carbon(peak)) for index, peak in enumerate(peaks)]
    identified = [(index, carbon) for index, carbon in identified if carbon is not None]

    totals = {n: 0.0 for n in range(1, 16)}
    rows = []
    for index, peak in enumerate(peaks):
        if not is_unidentified(peak):
            continue
        before = next((i for i, _ in reversed(identified) if i < index), None)
        after = next((i for i, _ in identified if i > index), None)
        prev_peak = peaks[before] if before is not None else None
        next_peak = peaks[after] if after is not None else None
        prev_c = _identified_carbon(prev_peak) if prev_peak else None
        next_c = _identified_carbon(next_peak) if next_peak else None

        if given_carbon(peak) is not None:
            carbon, basis = given_carbon(peak), "Carbon# given in COMPONENT_LIST"
        elif prev_c is not None and prev_c == next_c:
            carbon, basis = prev_c, f"Between two C{prev_c} peaks"
        elif prev_c is not None and next_c is not None:
            carbon, basis = prev_c, f"Neighbours differ (C{prev_c} / C{next_c}): previous peak"
        elif prev_c is not None:
            carbon, basis = prev_c, "After the last identified peak: previous peak"
        elif next_c is not None:
            carbon, basis = next_c, "Before the first identified peak: next peak"
        elif peak.get("ri") is not None:
            carbon, basis = round(peak["ri"] / 100.0), "No identified peaks: RI / 100"
        else:
            carbon, basis = 15, "No identified peaks and no RI: C15"

        assigned = _clamp(carbon)
        if assigned != carbon:
            basis += f" (C{carbon} clamped to C{assigned})"
        totals[assigned] += peak.get("wt") or 0.0
        rows.append({
            "Component": peak.get("component"),
            "Peak Time (min)": peak.get("time"),
            "RI": peak.get("ri"),
            "%WGT": peak.get("wt"),
            "Previous Identified": _label(prev_peak),
            "Next Identified": _label(next_peak),
            "Assigned Carbon#": f"C{assigned}",
            "Basis": basis,
        })
    return rows, totals
