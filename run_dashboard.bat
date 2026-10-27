@echo off
setlocal EnableExtensions

rem ILS Dashboard v6.4 - self-contained Windows launcher
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "PYTHON="
set "RUNTIME=%ROOT%.python-runtime"

if not exist "%ROOT%run_app.py" goto :missing_files
if not exist "%ROOT%requirements.txt" goto :missing_files
if not exist "%ROOT%config\settings.json" goto :missing_files

rem Prefer a working environment shipped with the application.
if exist "%ROOT%.venv\Scripts\python.exe" (
    "%ROOT%.venv\Scripts\python.exe" --version >nul 2>&1
    if not errorlevel 1 set "PYTHON=%ROOT%.venv\Scripts\python.exe"
)

rem A copied virtual environment can contain paths from another computer.
if not defined PYTHON if exist "%ROOT%.venv-local\Scripts\python.exe" (
    "%ROOT%.venv-local\Scripts\python.exe" --version >nul 2>&1
    if not errorlevel 1 set "PYTHON=%ROOT%.venv-local\Scripts\python.exe"
)

rem If Python is not installed on this computer, bootstrap the local runtime.
if not defined PYTHON call :prepare_embedded_python
if not defined PYTHON goto :failed

echo.
echo Checking dashboard dependencies...
"%PYTHON%" -m pip install --disable-pip-version-check --no-input -r "%ROOT%requirements.txt"
if errorlevel 1 (
    echo.
    echo ERROR: Dashboard dependencies could not be installed.
    echo Check the internet connection or corporate proxy, then run this file again.
    goto :failed
)

echo Validating dashboard startup files...
"%PYTHON%" -c "import flask, pandas, openpyxl, olefile, xlrd; import app"
if errorlevel 1 (
    echo.
    echo ERROR: Dashboard dependencies are incomplete or corrupted.
    goto :failed
)

echo Starting ILS Dashboard...
echo Close this window to stop the dashboard.
"%PYTHON%" "%ROOT%run_app.py"
set "EXIT_CODE=%errorlevel%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo ERROR: Dashboard stopped with exit code %EXIT_CODE%.
    goto :failed
)
exit /b 0

:prepare_embedded_python
set "PYTHON=%RUNTIME%\python.exe"
if exist "%PYTHON%" (
    "%PYTHON%" --version >nul 2>&1
    if not errorlevel 1 goto :embedded_ready
    set "PYTHON="
)

echo Python was not found. Downloading the private dashboard runtime...
if not exist "%RUNTIME%" mkdir "%RUNTIME%"
set "PYTHON_VERSION=3.12.10"
set "PYTHON_ZIP=%RUNTIME%\python-embed.zip"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"

where curl.exe >nul 2>&1
if errorlevel 1 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ZIP%' } catch { exit 1 }"
) else (
    curl.exe --fail --location --retry 3 --silent --show-error "%PYTHON_URL%" --output "%PYTHON_ZIP%"
)
if errorlevel 1 (
    echo ERROR: Could not download Python %PYTHON_VERSION%.
    echo An internet connection is required the first time this launcher is used.
    set "PYTHON="
    exit /b 0
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -LiteralPath '%PYTHON_ZIP%' -DestinationPath '%RUNTIME%' -Force } catch { exit 1 }"
if errorlevel 1 (
    echo ERROR: Could not unpack the private Python runtime.
    set "PYTHON="
    exit /b 0
)
del /q "%PYTHON_ZIP%" >nul 2>&1

rem Enable site-packages for the embeddable distribution.
findstr /x /c:"Lib\site-packages" "%RUNTIME%\python312._pth" >nul 2>&1
if errorlevel 1 echo Lib\site-packages>>"%RUNTIME%\python312._pth"
findstr /x /c:"import site" "%RUNTIME%\python312._pth" >nul 2>&1
if errorlevel 1 echo import site>>"%RUNTIME%\python312._pth"

if not exist "%RUNTIME%\get-pip.py" (
    set "PIP_URL=https://bootstrap.pypa.io/get-pip.py"
    where curl.exe >nul 2>&1
    if errorlevel 1 (
        powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%PIP_URL%' -OutFile '%RUNTIME%\get-pip.py' } catch { exit 1 }"
    ) else (
        curl.exe --fail --location --retry 3 --silent --show-error "%PIP_URL%" --output "%RUNTIME%\get-pip.py"
    )
    if errorlevel 1 (
        echo ERROR: Could not download the Python package installer.
        set "PYTHON="
        exit /b 0
    )
)

echo Installing the Python package installer...
"%PYTHON%" "%RUNTIME%\get-pip.py" --disable-pip-version-check --no-warn-script-location
if errorlevel 1 (
    echo ERROR: Could not install the Python package installer.
    set "PYTHON="
    exit /b 0
)

:embedded_ready
exit /b 0

:missing_files
echo ERROR: This folder is incomplete. Keep run_dashboard.bat with the full v6.4 application folder.
goto :failed

:failed
echo.
echo The dashboard could not be started.
pause
exit /b 1
