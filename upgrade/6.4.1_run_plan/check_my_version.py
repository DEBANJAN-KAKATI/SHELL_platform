"""Check an ILS 6.4.0 folder before the 6.4.1 Run Plan update.

usage:  python check_my_version.py "C:\\path\\to\\your\\ILS dashboard folder"

For every file the update replaces it tells you whether your copy is still the original 6.4.0 file
(safe to replace with the file from files/), already updated, or changed locally (then make the edit
described in the guide by hand instead of copying the file, so your own changes are kept).
"""
import hashlib
import sys
from pathlib import Path

ORIGINAL_6_4_0 = {
    ".gitignore": "0cc2a225e4e7bfd6b97c372b3e343d6db6368f505718c4b1d165e89bedf9b93f",
    "CHANGELOG.md": "fcc738a140c6dd999ed4d84fbae847f43da6a77e4d2b64c15803af03bd5d012b",
    "ILS.md": "cf2eee2216a832492cb810db0a65ba00dbbc5707341b1f20cdc6babc9f10f98a",
    "VERSION": "3754366908ac60b46e7aab559e5d23fa7eea0ff51835fb9fd72ba76aab3bcafd",
    "backend/routes/api.py": "37ac2ec9a3ad424174449e9a0b4480d91586175525e5d3441ecec188b83ed3f8",
    "backend/services/run_plan_service.py": "f808cb4d8775e1fad8093b646012df4bd667f9ca4b029456307eb09462a1b7c3",
    "frontend/calculation_table.html": "cbf4950a645a0521528173bb35d12c23ac2f66152e4637b4123f8bccc20c5446",
    "frontend/custom_table.html": "5e3d2040ec82aad72f98a231f7234f60b0668c2d657cab651133726e2cec4884",
    "frontend/history.html": "f206faf9ca1470555b335fdbb63ab8da14333db959ab5a4836fab78221f24f91",
    "frontend/index.html": "d00e3fee78f2bf8284026bfa1cb4af7ad5e79d6e1f4892a9feb91dda96a71e00",
    "frontend/js/navigation.js": "3d7af12dfdf13cee35d332ad7dccd830548b516c39365ad69f242d6b28add5c5",
    "frontend/js/run_plan.js": "e625d81dfe0ceb54a545a0f5c8c4ed3a106a1f2836916a1d14adec0be8ab7bd8",
    "frontend/online_analysis.html": "6ac82869166884e7a5d008c197efe26856d3fd80fd49d0a74d0f45e389c1be1c",
    "frontend/plot_dashboard.html": "34e620297a1c7b4980a3a1bc8febea7c50ff956f6968ecfb8f7f490c95719c66",
    "frontend/plots.html": "8cf756ed9f98be00385b01eb4fc25edc9674db44ace6a7b377ac3999c064946e",
    "frontend/run_plan.html": "3b7421456b935c8c1b405b90370718388c7dc05a41ceb84b4090f010c5174244",
    "run_app.py": "e2942a8881cc9b9d79428e1cced76e6f3619d6bdbc00e74df5659817d6f006f6"
}
UPDATED_6_4_1 = {
    ".gitignore": "9e77c021391d0b12f468a28ccb00ca3f0f725b797cc9e937b244f383ffc52b43",
    "CHANGELOG.md": "4beffeb0aa165606651a104e7d3cab18ed585f0a619f252b5b7bcba17bf5708d",
    "ILS.md": "208b63cbaa0940a5c1bcb6a83868c98013c5b51afc6e40420d12a81f9938d6c2",
    "VERSION": "54b11ccf3cb1e7809aff739924b32e15d39cc236fcbb79bd596ec817269f3ba9",
    "backend/routes/api.py": "468739fad592650ce6814646e27ad758be2e0b0eebf4d8497ba00666783ca053",
    "backend/services/run_plan_service.py": "eec67ed6241b625c367dfdfe3d4fa802d1bced39a472e5027eb9ee27c03fce39",
    "frontend/calculation_table.html": "58596a0d231ecf4dbf3be9df564e9a395bbe2ab3411e265e89f1aa3189f0a7b1",
    "frontend/custom_table.html": "98427e329bde63c5ceafaa50d6738b5428bdbd0bcbba3af949fbff0e15046514",
    "frontend/history.html": "e5a159cb53057d1d2ceb6af12666c2caf28dd12149fd4445a59c9b74088d4245",
    "frontend/index.html": "1e070bfd577d77315d60c6ab2b5b2d394e2297c1e331eec036dfe144b9178c8f",
    "frontend/js/navigation.js": "1fb4bca42ab2474858b4718586cd1fcb2c29afb848bc131f2b0e87769f0a9be2",
    "frontend/js/run_plan.js": "6c9a23e7518f3adb0f853aa203dced0629b6fe0171c313e701b4a0cdc6745f86",
    "frontend/online_analysis.html": "511e33d087ffbb0da1fd0b463734246c21d8af7f8dc351a452d6382ff954982f",
    "frontend/plot_dashboard.html": "eddb7ace2532002d8ba8476eadf6fb11ea58f5f266de613380c4c21409eefea8",
    "frontend/plots.html": "214ba26796f6a002f7671e47bc36eb6fca7eb6e91e2a8669035c582c2bd9ef11",
    "frontend/run_plan.html": "576b24036f1a86395f0ba7a7be89c67eaba6c3ad71ac5f5cb5fabc9ce429b1a4",
    "run_app.py": "7dc6f3aa39c74258a4e15b53a60dccf30c91756995a482b7b1f664e5b308e69a"
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
    for name in sorted(ORIGINAL_6_4_0):
        path = root / name
        if not path.exists():
            state = "MISSING   - copy the file from files/"
        else:
            d = digest(path)
            if d == ORIGINAL_6_4_0[name]:
                state = "original  - replace it with files/" + name
            elif d == UPDATED_6_4_1[name]:
                state = "updated   - nothing to do"
            else:
                state = "CHANGED   - your copy differs from 6.4.0: apply the edit from the guide by hand"
                local.append(name)
        print(f"  {name:45s} {state}")
    print()
    print("Files that are new in 6.4.1 (just copy them): backend/services/run_plan_template.py, frontend/css/run_plan.css,")
    print("  scripts/run_plan_examples/prerun_doe.py, tests/test_run_plan_template.py, tests/fixtures/run_plan/*.xlsx")
    if local:
        print()
        print("Locally changed files: " + ", ".join(local))
        print("Do not overwrite them: follow the step for each file in the guide (the edits are short).")

if __name__ == "__main__":
    main()
