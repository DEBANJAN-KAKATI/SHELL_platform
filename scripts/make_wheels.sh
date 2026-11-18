#!/usr/bin/env bash
# Builds ILS_wheels_win.zip: the "wheels" folder for run_dashboard.bat's offline install (Windows 64-bit,
# Python 3.12 = the private Python the launcher downloads, 3.13 and 3.14), including pip and colorama.
# Run on any computer with internet: bash scripts/make_wheels.sh  (writes ILS_wheels_win.zip in the current folder)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"; mkdir -p "$work/wheels"
grep -v '^#' "$here/requirements.txt" | grep -v gunicorn | grep -v 'pandas>=3' | sed 's/; python_version.*//' > "$work/req.txt"
for v in 3.12 3.13 3.14; do
  python3 -m pip download --platform win_amd64 --python-version "$v" --only-binary=:all: \
    -r "$work/req.txt" colorama pip -d "$work/wheels" -q
done
printf 'Put this "wheels" folder next to run_dashboard.bat and run it: pip and all packages are installed offline.\r\n' > "$work/wheels/README.txt"
(cd "$work" && zip -qr ILS_wheels_win.zip wheels)
mv "$work/ILS_wheels_win.zip" . && rm -rf "$work"
echo "ILS_wheels_win.zip written"
