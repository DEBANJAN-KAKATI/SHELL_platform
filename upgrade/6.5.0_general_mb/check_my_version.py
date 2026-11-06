"""Check an ILS 6.4.3 folder before the 6.5.0 update (process General_MB, Internal Standard from the bypass lines).

usage:  python check_my_version.py "C:\\path\\to\\your\\ILS dashboard folder"

For every file the update replaces it tells you whether your copy is still the original 6.4.3 file
(safe to replace with the file from files/), already updated, or changed locally (for example by an earlier
Copilot attempt: then replace it with the file from files/ anyway, after keeping a backup of your copy).
"""
import hashlib
import sys
from pathlib import Path

ORIGINAL_6_4_3 = {
    "CHANGELOG.md": "eb3425faf7a733a23ae0737091616070621bcc5cedb3cdedd8d2a1778867b52c",
    "ILS.md": "5bf8cd793ba897654cba0e048b7670b7fc9220ad16405a83a694c7ba9551aaf7",
    "README.md": "fbde8d8dcef10d659917d842b787c254df3fb31c147dc0ba64c1646f66651d8a",
    "VERSION": "80122a7e3b45391c8fbacb7ab7105b34469fb882ab8254b4f1fadaa578c48354",
    "backend/routes/api.py": "1bc57c63e6c66d68a3aeba7399c2322bf030eba2391455a034f27b46603760c9",
    "backend/services/online_units.py": "7ce5259fcb339ea73f67c86c31d4624aa500cc8a313fa86db3147b6ed034957d",
    "frontend/calculation_table.html": "58596a0d231ecf4dbf3be9df564e9a395bbe2ab3411e265e89f1aa3189f0a7b1",
    "frontend/css/online_units.css": "1926c5f845f9dee0c66f598ffa3de1b822c849e30394fc6c2a1c70c89314a021",
    "frontend/custom_table.html": "98427e329bde63c5ceafaa50d6738b5428bdbd0bcbba3af949fbff0e15046514",
    "frontend/history.html": "e5a159cb53057d1d2ceb6af12666c2caf28dd12149fd4445a59c9b74088d4245",
    "frontend/index.html": "1e070bfd577d77315d60c6ab2b5b2d394e2297c1e331eec036dfe144b9178c8f",
    "frontend/js/historian_save.js": "555dc634e004d5fd9c365c5dccc80e2502d2a489da4ea19ced913d0efa13685f",
    "frontend/js/navigation.js": "1fb4bca42ab2474858b4718586cd1fcb2c29afb848bc131f2b0e87769f0a9be2",
    "frontend/js/online_analysis.js": "9afc1cdcbc75feea38c6b3ccf9307463c9316c66aae0283b439e50a2ddbe59bc",
    "frontend/js/reforming_offline.js": "a1103db41ebf07950a233322b95714867b6c21f5f50970258f67ffee1c49fce4",
    "frontend/online_analysis.html": "ce9eecd79c685a509978ee622679c4b555419b72f9631868d122f864a0cc4464",
    "frontend/plot_dashboard.html": "eddb7ace2532002d8ba8476eadf6fb11ea58f5f266de613380c4c21409eefea8",
    "frontend/plots.html": "214ba26796f6a002f7671e47bc36eb6fca7eb6e91e2a8669035c582c2bd9ef11",
    "frontend/run_plan.html": "576b24036f1a86395f0ba7a7be89c67eaba6c3ad71ac5f5cb5fabc9ce429b1a4",
    "tests/fixtures/run_plan/RunPlan_MassBalance_SS_filled.xlsx": None,
    "tests/test_online_units.py": "efe16782364aa5b19abc91138c758050a4c1f9f7b94468fcc5519900d70939ce"
}
UPDATED_6_5_0 = {
    "CHANGELOG.md": "89cc9b10fa21e52ce57b58949b5cf8868f26e332d599071f9368dc5c5af1277b",
    "ILS.md": "ded826f9bf91adc21c6b7d2883bcabf0297fbfe523dedfbe38ea2eb1a34d2486",
    "README.md": "880302814ef3609a14db433363dadced9774d40365cac64b1cac818377c143af",
    "VERSION": "3eb8e06ca1e02f0a30b0e3eebd289494b35d4fd1466ed907b9148e03b2459b00",
    "backend/routes/api.py": "d449eca7854defbb13d1b914e7cdfaa52f4fdd9ee1723fb90c4b94879610ec48",
    "backend/services/online_units.py": "04f7c4a1412d447b4c0c7c94181b32db06128af4a4ba3f79685ef82aa03517b8",
    "frontend/calculation_table.html": "a7cfae479ee7ab0f992f414f8d1ad1781e195fc7fe9edc24f4c26497cefaaccb",
    "frontend/css/online_units.css": "ecc9640ed6cc1822c85fba27e521e5c07c0bf1c9a08a14cd10bcceb26ad5a42e",
    "frontend/custom_table.html": "5f8aceb4ecee085c087c530105ccc81788ba9b19e2863e4608a65bf3310f9cd1",
    "frontend/history.html": "48b48c8a22c15038ee3debb906fbe57b5ace14be1bb5e61e8a6a74eb9bc6a94a",
    "frontend/index.html": "61ed0f587dbe060809fffc025f1e33de9560e4231a2bc3d9385216f401ee0836",
    "frontend/js/historian_save.js": "a74ed798047dc27401966119d424b9e9a10c488ba9373f87f66530e8565f8827",
    "frontend/js/navigation.js": "cf8ef33b81c63ca3beb55a25c49f33011fcef8423c533e7b50f6b49e25ecee22",
    "frontend/js/online_analysis.js": "459ab9b428249566839d5561424d473f8da292d30310c6ea626e48919c13fab9",
    "frontend/js/reforming_offline.js": "f305fb085c40c8be41a07e5ab282eda457da241bd99d0dd8497b68bdc3052378",
    "frontend/online_analysis.html": "39030083ed7d0c1f34870c17354400313e91e11e393e97d2261bb267221349c0",
    "frontend/plot_dashboard.html": "11f2f3622b3501c119cf80f4f1bb7fe46fde6cada9ef1177bef5f8c7148c2582",
    "frontend/plots.html": "b680697e49f38cc512651c13d8e9ddb7512d43c289ae874437f7e8104e236b93",
    "frontend/run_plan.html": "b9d3250d81000434d00ffad043dd90836039f0c8e8ee6831199e948dbc6fff43",
    "tests/fixtures/run_plan/RunPlan_MassBalance_SS_filled.xlsx": "37a6631c6dfa72a0ffb632f7a354c1588d0a5743184d683cd1c248401f22d87a",
    "tests/test_online_units.py": "f9da6bc1e7694f05de4a5b1e1fe2e11cdddd3a73716d180b148e40e201718da5"
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
    for name in sorted(ORIGINAL_6_4_3):
        path = root / name
        if not path.exists():
            state = "new       - copy the file from files/" if ORIGINAL_6_4_3[name] is None else "MISSING   - copy the file from files/"
        else:
            d = digest(path)
            if d == ORIGINAL_6_4_3[name]:
                state = "original  - replace it with files/" + name
            elif d == UPDATED_6_5_0[name]:
                state = "updated   - nothing to do"
            else:
                state = "CHANGED   - differs from 6.4.3 (e.g. Copilot edits): back it up, then copy files/" + name
                local.append(name)
        print(f"  {name:45s} {state}")
    if local:
        print()
        print("Changed files: " + ", ".join(local))
        print("Keep a copy of them (backups/<date>_general_mb/), then replace them with the files from files/.")
        print("The 6.5.0 files contain the whole General_MB feature; do not merge them with an earlier attempt.")

if __name__ == "__main__":
    main()
