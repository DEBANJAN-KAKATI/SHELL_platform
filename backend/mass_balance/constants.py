"""Constants of the MassBal workbook (Ver2.2). Each sheet uses its own molecular weights; keep them separate."""

REACTORS = list(range(1, 9))
BYPASS = 0
AR_MW = 39.948
C_ATOM = 12.011

# ZMB GC blocks (ZMB!A22:A31): name, txt gas, MW used in ZMB!AC22:AC31
ZMB_GASES = [
    ("Hydrogen", "H2", 2.016),
    ("Ethylene", "Ethylene", 28.05),
    ("Methane", "Methane", 16.04),
    ("Ethane", "Ethane", 30.069),
    ("Nitrogen", "N2", 28.013),
    ("CO2", "CO2", 44.01),
    ("CO", "CO", 28.01),
    ("Acetylene", "Acetylene", 26.038),
    ("Propylene", "Propylene", 42.081),
    ("Propane", "Propane", 44.097),
]

# Run_Plan!B34:K42 mixed gas: name, MW, C / H / O / N mass%
MIX_GASES = [
    ("Hydrogen", 2.016, 0, 100, 0, 0),
    ("Ethylene", 28.054, 85.62771797248165, 14.37228202751835, 0, 0),
    ("Methane", 16.043, 74.86754347690581, 25.13245652309419, 0, 0),
    ("Ethane", 30.07, 79.88693049551047, 20.11306950448953, 0, 0),
    ("Nitrogen", 28.014, 0, 0, 0, 100),
    ("CO2", 44.009, 27.29214478856597, 0, 72.70785521143402, 0),
    ("CO", 28.01, 42.88111388789718, 0, 57.11888611210282, 0),
    ("Acetylene", 26.038, 92.25746985175513, 7.742530148244867, 0, 0),
    ("Propylene", 42.081, 85.62771797248163, 14.37228202751837, 0, 0),
    ("Propane", 44.097, 81.71304170351723, 18.28695829648277, 0, 0),
]

# Gas!B34:J36 verified feed gas: pure gases (normally empty), Argon, mixed gas
GAS_PURE = [("Hydrogen", 2.016), ("Ethylene", 28.054), ("Methane", 16.043), ("Ethane", 30.07),
            ("Nitrogen", 28.014), ("CO2", 44.009), ("CO", 28.01)]
# Gas!J12:M18 element mass% (C, H, O, N) of the pure-gas rows 13..19, exactly as the sheet uses them
GAS_ELEMENTS = {
    "Hydrogen": (0, 100, 0, 0),
    "Ethylene": (85.62771797248165, 14.37228202751835, 0, 0),
    "Methane": (74.86754347690581, 25.13245652309419, 0, 0),
    "Ethane": (79.88693049551047, 20.11306950448953, 0, 0),
    "Nitrogen": (0, 0, 0, 100),
    "CO2": (27.29214478856597, 0, 72.70785521143402, 0),
    "CO": (42.88111388789718, 0, 57.11888611210282, 0),
}

# Rx_MB!A20:B48 and AD52:AD80: row name, MW, carbon atoms, default txt gas (None = no peak in the export)
MB_ROWS = [
    ("Methane", 16.04, 1, "Methane"),
    ("Ethane", 30.07, 2, "Ethane"),
    ("Ethylene", 28.05, 2, "Ethylene"),
    ("Propane", 44.1, 3, "Propane"),
    ("Propylene", 42.08, 3, "Propylene"),
    ("Butane", 58.12, 4, "Butane"),
    ("Pentane", 72.15, 5, "Pentane"),
    ("C6s (Isomers of hexane?)", 86.18, 6, None),
    ("Hexane", 86.18, 6, "Hexane"),
    ("C4", 58.12, 4, None),
    ("C5", 72.15, 5, None),
    ("C6", 86.18, 6, None),
    ("C6 Above", 100.21, 6, "C6 Above"),
    ("Benzene", 78.11, 6, "Benzene"),
    ("Toluene", 92.14, 7, "Toluene"),
    ("Ethylbenzene", 106.167, 8, "Ethylbenzene"),
    ("p-Xylene", 106.167, 8, "p-Xylene"),
    ("m-Xylene", 106.167, 8, "m-Xylene"),
    ("o-Xylene", 106.167, 8, "o-Xylene"),
    ("C6 Unknowns", 86.18, 6, None),
    ("C8 Unknowns", 114.23, 8, "C8 Unknowns"),
    ("C7 Unknowns", 100.21, 7, None),
    ("CO2", 44.01, 1, "CO2"),
    ("Argon", 39.948, 0, "Argon"),
    ("CO", 28.01, 1, "CO"),
    ("H2", 2.016, 0, "H2"),
    ("Acetylene", 26.04, 2, "Acetylene"),
    ("Isobutane", 58.12, 4, None),
    ("N2", 28.0134, 0, "N2"),
]
MB_NAMES = [row[0] for row in MB_ROWS]
DEFAULT_GC_MAP = {name: txt for name, _, _, txt in MB_ROWS}

# Rx_MB!D82: HC gases = Methane..C7 Unknowns + Acetylene + Isobutane; D83: COx = CO2 + CO
HC_ROWS = MB_NAMES[:MB_NAMES.index("C7 Unknowns") + 1] + ["Acetylene", "Isobutane"]
COX_ROWS = ["CO2", "CO"]
# C-Balance!C14: C4+ in gas product = Butane..C7 Unknowns (C57:C73) + Isobutane (C79)
C4PLUS_ROWS = MB_NAMES[MB_NAMES.index("Butane"):MB_NAMES.index("C7 Unknowns") + 1] + ["Isobutane"]
# C-Balance!C21: ethylene selectivity weights on the average volumetric flows
SELECTIVITY_WEIGHTS = [("Ethylene", 1), ("Ethane", 1), ("Propane", 1.5), ("Butane", 2), ("C4", 2),
                       ("C6", 3), ("C6 Above", 3), ("C8 Unknowns", 4)]
# C-Balance helper fractions: carbon mass fraction written as in the sheet (rounded atomic masses)
FEED_CARBON = [("Acetylene", 24 / 26.038), ("Methane", 12 / 16), ("Ethane", 24 / 30.07), ("Ethylene", 24 / 28.05)]
DEFAULT_C_WT_LIQUID_PRODUCT = 84.865          # C-Balance!N34
MAX_WORKBOOK_REPS = 25                         # Rx_MB columns D:AB
