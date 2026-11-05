"""Check an ILS 6.4.2 folder before the 6.4.3 update (Online Analysis units from the export and the Run Plan).

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
    "CHANGELOG.md": "eb3425faf7a733a23ae0737091616070621bcc5cedb3cdedd8d2a1778867b52c",
    "ILS.md": "5bf8cd793ba897654cba0e048b7670b7fc9220ad16405a83a694c7ba9551aaf7",
    "README.md": "fbde8d8dcef10d659917d842b787c254df3fb31c147dc0ba64c1646f66651d8a",
    "VERSION": "80122a7e3b45391c8fbacb7ab7105b34469fb882ab8254b4f1fadaa578c48354",
    "backend/routes/api.py": "1bc57c63e6c66d68a3aeba7399c2322bf030eba2391455a034f27b46603760c9",
    "backend/services/online_units.py": "7ce5259fcb339ea73f67c86c31d4624aa500cc8a313fa86db3147b6ed034957d",
    "backend/services/run_plan_template.py": "3215bf8d9750f61aedce1c61dab9c02e48f49c4fd7851073914e381820823781",
    "frontend/css/online_units.css": "1926c5f845f9dee0c66f598ffa3de1b822c849e30394fc6c2a1c70c89314a021",
    "frontend/js/online_analysis.js": "9afc1cdcbc75feea38c6b3ccf9307463c9316c66aae0283b439e50a2ddbe59bc",
    "frontend/online_analysis.html": "ce9eecd79c685a509978ee622679c4b555419b72f9631868d122f864a0cc4464",
    "tests/test_online_units.py": "efe16782364aa5b19abc91138c758050a4c1f9f7b94468fcc5519900d70939ce"
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
