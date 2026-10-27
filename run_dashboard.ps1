Set-Location $PSScriptRoot
# Use .venv if it works on this PC; otherwise (e.g. copied from another machine) use .venv-local
$venv = '.venv'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$works = $false
if (Test-Path $python) { & $python --version *> $null; $works = ($LASTEXITCODE -eq 0) }
if (-not $works) {
	$venv = '.venv-local'
	$python = Join-Path $PSScriptRoot '.venv-local\Scripts\python.exe'
}
if (-not (Test-Path $python)) {
	$launcher = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
	& $launcher -m venv $venv
	if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $python .\run_app.py
