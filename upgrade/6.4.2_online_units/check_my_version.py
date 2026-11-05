"""Check an ILS 6.4.1 folder before the 6.4.2 Online Analysis units update.

usage:  python check_my_version.py "C:\\path\\to\\your\\ILS dashboard folder"

For every file the update replaces it tells you whether your copy is still the original 6.4.1 file
(safe to replace with the file from files/), already updated, or changed locally (then make the edit
described in the guide by hand instead of copying the file, so your own changes are kept).
"""
import hashlib
import sys
from pathlib import Path

ORIGINAL_6_4_1 = {
    "CHANGELOG.md": "4beffeb0aa165606651a104e7d3cab18ed585f0a619f252b5b7bcba17bf5708d",
    "ILS.md": "208b63cbaa0940a5c1bcb6a83868c98013c5b51afc6e40420d12a81f9938d6c2",
    "README.md": "6f59f445944af142d1d225a7f12f30ad155090df4bf29ecf5d840bc1a0bbcefb",
    "VERSION": "54b11ccf3cb1e7809aff739924b32e15d39cc236fcbb79bd596ec817269f3ba9",
    "backend/routes/api.py": "468739fad592650ce6814646e27ad758be2e0b0eebf4d8497ba00666783ca053",
    "backend/services/online_analysis_service.py": "7732ef80d68b9d9f6fd9d799baf583f3ee916689c2121dd59563d4a5eb034acd",
    "frontend/js/online_analysis.js": "3a74c0aec3923293966b6ece69c51167ccffe1f54f146cbee49cf8c4292ddbb2",
    "frontend/online_analysis.html": "511e33d087ffbb0da1fd0b463734246c21d8af7f8dc351a452d6382ff954982f"
}
UPDATED_6_4_2 = {
    "CHANGELOG.md": "654431b52a82592ebe24f93cfa88d340f66db56c42c90126cbe144affd7c8aec",
    "ILS.md": "83868252a4918bc31bd8aa9c190e17663e96acf7434ae1a24198fc5604b240c7",
    "README.md": "ae139d7827d9feda43ad5eb253230accfddcf1516822ee26dd53290fa8fbf5f0",
    "VERSION": "93b777cb807a6bdcecdf855c118a8f772125caabbbcd7e9333d5ba78feee7363",
    "backend/routes/api.py": "3133bc199c829086bca76d085e5a49fc79fcf23639682d9aeb1753a0793bf62e",
    "backend/services/online_analysis_service.py": "be9fa22092fac4e55f90d041acb489340b955a71cf4c4cd30ab87427d2b03a17",
    "frontend/js/online_analysis.js": "97c60c19abf9efb462fd9f5efd4a06f2605c8845dbb38d9ae282a4399140ce78",
    "frontend/online_analysis.html": "d86c2378daa0ad10fa18be9e46a52fcdaf4f397efb1f48e4788ee8bc43e5359f"
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
    for name in sorted(ORIGINAL_6_4_1):
        path = root / name
        if not path.exists():
            state = "MISSING   - copy the file from files/"
        else:
            d = digest(path)
            if d == ORIGINAL_6_4_1[name]:
                state = "original  - replace it with files/" + name
            elif d == UPDATED_6_4_2[name]:
                state = "updated   - nothing to do"
            else:
                state = "CHANGED   - your copy differs from 6.4.1: apply the edit from the guide by hand"
                local.append(name)
        print(f"  {name:45s} {state}")
    print()
    print("Files that are new in 6.4.2 (just copy them): backend/services/online_units.py, frontend/css/online_units.css,")
    print("  tests/test_online_units.py, tests/fixtures/online/*, tests/fixtures/run_plan/RunPlan_MassBalance_SS.xlsx")
    if local:
        print()
        print("Locally changed files: " + ", ".join(local))
        print("Do not overwrite them: follow the step for each file in the guide (the edits are short).")

if __name__ == "__main__":
    main()
