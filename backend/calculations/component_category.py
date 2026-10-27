"""COMPONENT_LIST aggregation in the industrial reporting format. Values use %WGT.

The 15 reported components keep their own column. Every other peak (Unidentified,
instrument groups such as "C6-C7 Unknowns", or extra named isomers) is summed into
a carbon-range group decided by the normal paraffins it elutes between (elution
order and carbon number only; retention index is NOT used, it can shift):

    before Propane                         -> C3 & Below
    between Propane and n-Butane           -> C3-C4
    between n-Butane and n-Pentane         -> C4-C5
    between n-Pentane and n-Hexane         -> C5-C6
    between n-Hexane and n-Heptane         -> C6-C7
    between n-Heptane and n-Octane         -> C7-C8
    after n-Octane                         -> C8+

So e.g. a peak eluting after 2-Methylhexane but before n-Heptane is C6-C7, as in
the industrial sheet.

Absent components are reported as 0, so every sample has the same columns and
they sum to the COMPONENT_LIST total (100 %WGT).
"""

import re

import pandas as pd

# Reported component -> carbon number
REPORTED_COMPONENTS = {
    "Propane": 3,
    "i-Butane": 4,
    "n-Butane": 4,
    "i-Pentane": 5,
    "n-Pentane": 5,
    "2,2-Dimethylbutane": 6,
    "2,3-Dimethylbutane": 6,
    "2-Methylpentane": 6,
    "3-Methylpentane": 6,
    "n-Hexane": 6,
    "Methylcyclopentane": 6,
    "2-Methylhexane": 7,
    "3-Methylhexane": 7,
    "n-Heptane": 7,
    "n-Octane": 8,
}

# Normal paraffins that bound the groups (carbon number)
N_PARAFFINS = {"Propane": 3, "n-Butane": 4, "n-Pentane": 5, "n-Hexane": 6, "n-Heptane": 7, "n-Octane": 8}

# Group column for unreported peaks, by carbon number of the previous normal paraffin
_GROUP_BY_CARBON = {3: "C3-C4", 4: "C4-C5", 5: "C5-C6", 6: "C6-C7", 7: "C7-C8", 8: "C8+"}
UNIDENTIFIED_GROUPS = ["C3 & Below", "C3-C4", "C4-C5", "C5-C6", "C6-C7", "C7-C8", "C8+"]

# Output order: the 15 reported components, then the grouping columns at the end
INDUSTRIAL_COLUMNS = list(REPORTED_COMPONENTS) + UNIDENTIFIED_GROUPS

# Gas (C1-C4) as in the industrial yield sheet, where Unidentified(<C3) holds all
# unreported peaks lighter than C6 (C3 & Below + C3-C4 + C4-C5 + C5-C6)
GAS_COLUMNS = ["C3 & Below", "C3-C4", "Propane", "i-Butane", "n-Butane", "C4-C5", "C5-C6"]

_ALIASES = {
    "isobutane": "i-Butane",
    "butane": "n-Butane",
    "isopentane": "i-Pentane",
    "pentane": "n-Pentane",
    "hexane": "n-Hexane",
    "heptane": "n-Heptane",
    "octane": "n-Octane",
}
_REPORTED_LOOKUP = {name.lower(): name for name in REPORTED_COMPONENTS}
_REPORTED_LOOKUP.update(_ALIASES)

# Instrument group labels, e.g. "C3 & Below", "C6-C7 Unknowns", "C8 Plus"
_LABEL_RANGE = re.compile(r"^C(\d+)\s*-\s*C?\d+\s+unknowns?$", re.IGNORECASE)
_LABEL_BELOW = re.compile(r"^C(\d+)\s*(&|and)\s*below$", re.IGNORECASE)
_LABEL_PLUS = re.compile(r"^C(\d+)\s*(\+|plus)$", re.IGNORECASE)


def _reported_name(component):
    return _REPORTED_LOOKUP.get(str(component).strip().lower())


def _group_for_carbon(carbon):
    if carbon is None or carbon < 3:
        return "C3 & Below"
    return _GROUP_BY_CARBON.get(min(int(carbon), 8), "C8+")


def _labelled_group(component):
    text = str(component).strip()
    if _LABEL_BELOW.match(text):
        return "C3 & Below"
    match = _LABEL_RANGE.match(text) or _LABEL_PLUS.match(text)
    if match:
        return _group_for_carbon(int(match.group(1)))
    return None


def build_component_category(df):
    required = {"COMPONENT", "%WGT"}
    missing = required - set(df.columns)

    if missing:
        raise ValueError(f"COMPONENT_LIST missing columns: {sorted(missing)}")

    values = {column: 0.0 for column in INDUSTRIAL_COLUMNS}

    # Carbon number of the last normal paraffin seen (None before the first one)
    last_carbon = None

    for _, row in df.iterrows():
        weight = pd.to_numeric(row["%WGT"], errors="coerce")
        reported = _reported_name(row["COMPONENT"])

        if reported:
            if reported in N_PARAFFINS:
                last_carbon = N_PARAFFINS[reported]
            if not pd.isna(weight):
                values[reported] += float(weight)
            continue

        if pd.isna(weight):
            continue

        group = _labelled_group(row["COMPONENT"]) or _group_for_carbon(last_carbon)
        values[group] += float(weight)

    return values
