@echo off
REM Stops the cloudflared tunnel and any run_app.py Flask processes for this dashboard.
echo Stopping cloudflared tunnel(s)...
powershell -NoProfile -Command "Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force"

echo Stopping run_app.py process(es)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*run_app.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

echo.
echo Verifying...
powershell -NoProfile -Command "$p = Get-Process cloudflared -ErrorAction SilentlyContinue; $a = Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*run_app.py*' }; if (-not $p -and -not $a) { Write-Host 'All processes stopped.' -ForegroundColor Green } else { Write-Host 'Some processes may still be running - check Task Manager.' -ForegroundColor Yellow }"

echo.
pause
