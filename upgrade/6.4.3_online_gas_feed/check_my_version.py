"""Check an ILS 6.4.2 folder before the 6.4.3 update (gas feed for GC exports without flows, earlier Run Plan layout).

usage:  python check_my_version.py "C:\\path\\to\\your\\ILS dashboard folder"

For every file the update replaces it tells you whether your copy is still the original 6.4.2 file
(safe to replace with the file from files/), already updated, or changed locally (then make the edit
described in the guide by hand instead of copying the file, so your own changes are kept).
"""
import hashlib
import sys
from pathlib import Path

ORIGINAL_6_4_2 = {
    "CHANGELOG.md": "654431b52a82592ebe24f93cfa88d340f66db56c42c90126cbe144affd7c8aec",
    "ILS.md": "83868252a4918bc31bd8aa9c190e17663e96acf7434ae1a24198fc5604b240c7",
    "README.md": "ae139d7827d9feda43ad5eb253230accfddcf1516822ee26dd53290fa8fbf5f0",
    "VERSION": "93b777cb807a6bdcecdf855c118a8f772125caabbbcd7e9333d5ba78feee7363",
    "backend/routes/api.py": "3133bc199c829086bca76d085e5a49fc79fcf23639682d9aeb1753a0793bf62e",
    "backend/services/online_units.py": "5526084439e5a1cb741d516145fecb0fd76fb511269177fae01955b9e818c158",
    "backend/services/run_plan_template.py": "02b804211aea42a8eb50f6c645b6b3913d1867caa86289b7487cc37b73b62160",
    "frontend/css/online_units.css": "12b3399ca1d682e366b3ffe2f6ef707cdd922dcbbf6a9e197c63ce2f958a2e7f",
    "frontend/js/online_analysis.js": "97c60c19abf9efb462fd9f5efd4a06f2605c8845dbb38d9ae282a4399140ce78",
    "frontend/online_analysis.html": "d86c2378daa0ad10fa18be9e46a52fcdaf4f397efb1f48e4788ee8bc43e5359f",
    "tests/test_online_units.py": "1562652ffe8158bccd3ca8e14fc3c4ef2eb9c1a5fbb1e2015fb82d7b3b20daca"
}
UPDATED_6_4_3 = {
    "CHANGELOG.md": "c6eef5ed9ea1bd07e91fc6bb59fbdb2dc7a36a41d712534ab4640bd69c493fd4",
    "ILS.md": "8e3d707f69f643c0e0d0bc0ea755cdfda530de6a5505f81f01dbf7c9b62d0bfc",
    "README.md": "540d68fcbf1d44e4e07f0e65a6ab236b0b0536fbfae4b0fa64b8546a2732bd0a",
    "VERSION": "80122a7e3b45391c8fbacb7ab7105b34469fb882ab8254b4f1fadaa578c48354",
    "backend/routes/api.py": "0743d3c3c462ebc4625460f3b943d4fa87f5c5a0ef948216a4303a503bd119af",
    "backend/services/online_units.py": "7280a61a5c56c8eeab6591a22b57f48110f28a7808b4fac3dbbc474fc5541867",
    "backend/services/run_plan_template.py": "3215bf8d9750f61aedce1c61dab9c02e48f49c4fd7851073914e381820823781",
    "frontend/css/online_units.css": "e7600e2ea82a5f3c3767ed138f9d6f68430225d5d6ef52fa69f0f4a7c05f3cd7",
    "frontend/js/online_analysis.js": "670dd6a2eec6f9a79b8f6b1d9dac0cd25bfc599ebbe4f924730ebd223fb70c0a",
    "frontend/online_analysis.html": "f571b01980898ac9edce5e25181d1671ba33d918efff233d7f364622e2ce6234",
    "tests/test_online_units.py": "92fd443d125932e9088ecfdaf9d5a01929d36755da87d5e05262d04cea910aea"
}

def digest(path):
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()

def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = Path(sys.argv[1])
    version = (root / "VERSION").read_text(encoding="utf-8").strip() if (root / "VERSION").exists() else "?"
    print(f"Folder: {root}  (VERSION {version})")
    local = []
    for name in sorted(ORIGINAL_6_4_2):
        path = root / name
        if not path.exists():
            state = "MISSING   - copy the file from files/"
        else:
            d = digest(path)
            if d == ORIGINAL_6_4_2[name]:
                state = "original  - replace it with files/" + name
            elif d == UPDATED_6_4_3[name]:
                state = "updated   - nothing to do"
            else:
                state = "CHANGED   - your copy differs from 6.4.2: apply the edit from the guide by hand"
                local.append(name)
        print(f"  {name:45s} {state}")
    print()
    print("Files that are new in 6.4.3 (just copy them): tests/fixtures/online/R3-C2-S1_9-06-23.txt,")
    print("  tests/fixtures/run_plan/RunPlan_R6-C1-S1_MassBalance.xlsx")
    if local:
        print()
        print("Locally changed files: " + ", ".join(local))
        print("Do not overwrite them: follow the step for each file in the guide (the edits are short).")

if __name__ == "__main__":
    main()
