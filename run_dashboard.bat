@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem ILS Dashboard v6.4 - self-contained Windows launcher
rem Python is chosen in this order (nothing is downloaded when an earlier step works):
rem   1. a working .venv or .venv-local in this folder
rem   2. a Python installed on this computer (3.9 or newer) that already has the dashboard packages
rem   3. a new .venv created from an installed Python 3.9 or newer
rem   4. a private Python downloaded into .python-runtime (only when no Python is installed)
rem Packages from requirements.txt are installed only when missing or when requirements.txt changes,
rem from the "wheels" folder when it holds .whl files (offline install), otherwise from pypi.org.
rem Note: keep CRLF line endings (see .gitattributes); cmd.exe misreads labels in LF-only batch files.
rem Exit codes are tested with "neq 0": a crashing program returns a negative code, which "if errorlevel 1" misses.

pushd "%~dp0"
set "ROOT=%CD%"
if not "%ROOT:~-1%"=="\" set "ROOT=%ROOT%\"
set "PYTHON="
set "APP_PY="
set "BASE_PY="
set "SEARCHED="
set "RUNTIME=%ROOT%.python-runtime"
rem The embeddable runtime's ._pth file below names python312.zip, so keep this a 3.12.x release.
set "PY_EMBED_VERSION=3.12.10"
set "PS_TLS=[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;"
set "IMPORT_CHECK=import flask, pandas, openpyxl, olefile, xlrd; import app"
rem Settings left by other Python installations (e.g. Anaconda) can break a virtual environment.
set "PYTHONHOME="
set "PYTHONPATH="

if not exist "%ROOT%run_app.py" goto :missing_files
if not exist "%ROOT%requirements.txt" goto :missing_files
if not exist "%ROOT%config\settings.json" goto :missing_files

rem A copied virtual environment can contain paths from another computer, so each one is tested.
call :use_python "%ROOT%.venv\Scripts\python.exe"
if not defined PYTHON call :use_python "%ROOT%.venv-local\Scripts\python.exe"
if defined PYTHON goto :have_python

call :find_installed_python
if defined APP_PY goto :use_installed
call :create_venv
if not defined PYTHON call :prepare_embedded_python
if not defined PYTHON goto :failed

:have_python
echo.
echo Using Python: %PYTHON%

rem Install packages only when they are missing or requirements.txt changed since the last install.
for %%I in ("%PYTHON%") do set "STAMP=%%~dpIils-requirements.txt"
if not exist "%STAMP%" goto :install_packages
fc /b "%ROOT%requirements.txt" "%STAMP%" >nul 2>&1
if %errorlevel% neq 0 goto :install_packages
call :check_app quiet
if %errorlevel% equ 0 goto :start_dashboard

:install_packages
call :pip_install
if %errorlevel% neq 0 goto :install_failed
copy /y "%ROOT%requirements.txt" "%STAMP%" >nul 2>&1
call :check_app
if %errorlevel% neq 0 goto :check_failed
goto :start_dashboard

:install_failed
rem Packages could not be downloaded (e.g. 403 Forbidden from the corporate proxy).
rem Start anyway when the packages that are already there are enough.
call :check_app quiet
if %errorlevel% neq 0 goto :install_failed_fallback
echo.
echo WARNING: The package update failed, but the installed packages work - starting the dashboard.
goto :start_dashboard
:install_failed_fallback
if not defined SEARCHED call :find_installed_python
if not defined APP_PY goto :packages_failed
if /i "%APP_PY%"=="%PYTHON%" goto :packages_failed

:use_installed
set "PYTHON=%APP_PY%"
echo.
echo Using the installed Python, which already has the dashboard packages: %PYTHON%

:start_dashboard
echo.
echo Starting ILS Dashboard...
echo Close this window to stop the dashboard.
"%PYTHON%" "%ROOT%run_app.py"
set "EXIT_CODE=%errorlevel%"
if "%EXIT_CODE%"=="0" goto :done
echo.
echo ERROR: Dashboard stopped with exit code %EXIT_CODE% (see the message above).
goto :failed

rem ---------------------------------------------------------------------------

:use_python
rem Sets PYTHON when %1 exists and runs.
if not exist "%~1" exit /b 0
"%~1" -c "import sys" >nul 2>&1
if %errorlevel% neq 0 exit /b 0
set "PYTHON=%~1"
exit /b 0

:check_app
rem Imports the packages and the application; errorlevel 1 when anything is missing.
if "%~1"=="quiet" goto :check_app_quiet
"%PYTHON%" -c "%IMPORT_CHECK%"
if %errorlevel% neq 0 exit /b 1
exit /b 0
:check_app_quiet
"%PYTHON%" -c "%IMPORT_CHECK%" >nul 2>&1
if %errorlevel% neq 0 exit /b 1
exit /b 0

:pip_install
echo.
if exist "%ROOT%wheels\*.whl" goto :pip_install_offline
echo Installing dashboard packages from pypi.org (first start or after an update)...
"%PYTHON%" -m pip install --disable-pip-version-check --no-input --no-warn-script-location -r "%ROOT%requirements.txt"
if %errorlevel% neq 0 exit /b 1
exit /b 0
:pip_install_offline
echo Installing dashboard packages from the wheels folder (offline)...
"%PYTHON%" -m pip install --disable-pip-version-check --no-input --no-warn-script-location --no-index --find-links "%ROOT%wheels" -r "%ROOT%requirements.txt"
if %errorlevel% neq 0 exit /b 1
exit /b 0

:create_venv
if not defined BASE_PY exit /b 0
rem Keep an existing (copied or broken) .venv untouched and build .venv-local next to it.
rem --system-site-packages reuses packages the installed Python already has, so fewer downloads are needed.
set "VENV=%ROOT%.venv"
if exist "%ROOT%.venv" set "VENV=%ROOT%.venv-local"
echo.
echo Creating the dashboard environment in %VENV% from %BASE_PY% ...
"%BASE_PY%" -m venv --system-site-packages --clear "%VENV%"
if %errorlevel% neq 0 goto :create_venv_failed
call :use_python "%VENV%\Scripts\python.exe"
if defined PYTHON exit /b 0
:create_venv_failed
rem Never fall through to downloading Python when one is installed: use it directly
rem (pip installs into the user's site-packages when the Python folder is read-only).
echo WARNING: Could not create a virtual environment - using the installed Python directly.
set "PYTHON=%BASE_PY%"
exit /b 0

:find_installed_python
rem Looks at every installed Python 3.9+; sets APP_PY (already runs the dashboard) and BASE_PY (can create a venv).
set "SEARCHED=1"
echo.
echo Looking for an installed Python...
where py.exe >nul 2>&1
if %errorlevel% neq 0 goto :find_on_path
call :try_py_launcher -3
for %%V in (3.12 3.13 3.11 3.14 3.15 3.16 3.10 3.9) do call :try_py_launcher -%%V
:find_on_path
rem python.exe on PATH. The Microsoft Store placeholder does not report a version and is skipped.
for /f "delims=" %%P in ('where python.exe 2^>nul') do call :consider "%%~P"
rem Standard install folders, for installations that were not added to PATH.
call :scan_folder "%LOCALAPPDATA%\Programs\Python" "Python3*"
call :scan_folder "%LOCALAPPDATA%\Python" "pythoncore-3*"
call :scan_folder "%ProgramFiles%" "Python3*"
call :scan_folder "%SystemDrive%\" "Python3*"
if defined APP_PY exit /b 0
if defined BASE_PY exit /b 0
echo   No installed Python 3.9 or newer was found.
exit /b 0

:scan_folder
rem Tries every %2 sub-folder of %1 (dir is used because it handles spaces in the path).
for /f "delims=" %%D in ('dir /b /ad "%~1\%~2" 2^>nul') do call :consider "%~1\%%D\python.exe"
exit /b 0

:try_py_launcher
set "CANDIDATE="
rem stdin is closed so a launcher that offers to install a missing version cannot wait for input.
for /f "delims=" %%P in ('py.exe %1 -c "import sys; print(sys.executable)" 2^>nul ^<nul') do set "CANDIDATE=%%P"
if defined CANDIDATE call :consider "%CANDIDATE%"
exit /b 0

:consider
rem Checks one python.exe: version 3.9+, whether it already runs the dashboard, whether it can create a venv.
if not exist "%~1" exit /b 0
if /i "%~1"=="%APP_PY%" exit /b 0
if /i "%~1"=="%BASE_PY%" exit /b 0
set "CAND_VER="
rem The first number (sys.api_version, 1013 for every Python 3) proves the output came from Python.
for /f "tokens=1,2" %%A in ('call "%~1" -c "import sys; print(sys.api_version, sys.version_info[0] * 100 + sys.version_info[1])" 2^>nul ^<nul') do if "%%A"=="1013" set "CAND_VER=%%B"
if not defined CAND_VER exit /b 0
if %CAND_VER% lss 309 exit /b 0
set /a "CAND_MAJOR=CAND_VER / 100, CAND_MINOR=CAND_VER %% 100"
if defined APP_PY goto :consider_base
"%~1" -c "%IMPORT_CHECK%" >nul 2>&1
if %errorlevel% neq 0 goto :consider_base
echo   Python %CAND_MAJOR%.%CAND_MINOR% at %~1 - has the dashboard packages
set "APP_PY=%~1"
exit /b 0
:consider_base
if defined BASE_PY exit /b 0
"%~1" -c "import venv, ensurepip" >nul 2>&1
if %errorlevel% neq 0 exit /b 0
echo   Python %CAND_MAJOR%.%CAND_MINOR% at %~1 - packages will be installed into a .venv
set "BASE_PY=%~1"
exit /b 0

:prepare_embedded_python
set "EMBED=%RUNTIME%\python.exe"
if not exist "%EMBED%" goto :embedded_download
"%EMBED%" -c "import sys" >nul 2>&1
if %errorlevel% equ 0 goto :embedded_configure

:embedded_download
echo.
echo No usable Python was found on this computer.
echo Downloading a private Python %PY_EMBED_VERSION% for the dashboard (first start only)...
if not exist "%RUNTIME%" mkdir "%RUNTIME%"
call :download "https://www.python.org/ftp/python/%PY_EMBED_VERSION%/python-%PY_EMBED_VERSION%-embed-amd64.zip" "%RUNTIME%\python-embed.zip"
if %errorlevel% neq 0 goto :embedded_download_failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -LiteralPath '%RUNTIME%\python-embed.zip' -DestinationPath '%RUNTIME%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
if %errorlevel% neq 0 goto :embedded_unpack_failed
if not exist "%EMBED%" goto :embedded_unpack_failed
del /q "%RUNTIME%\python-embed.zip" >nul 2>&1

:embedded_configure
rem Rewritten on every start so a runtime left by an older launcher is repaired.
rem ".." adds this application folder, so "import app" works with the embeddable runtime.
set "PTH=%RUNTIME%\python312._pth"
> "%PTH%" echo python312.zip
>> "%PTH%" echo .
>> "%PTH%" echo Lib\site-packages
>> "%PTH%" echo ..
>> "%PTH%" echo import site
"%EMBED%" -m pip --version >nul 2>&1
if %errorlevel% equ 0 goto :embedded_ready
if exist "%ROOT%wheels\pip-*.whl" goto :embedded_pip_offline
if exist "%RUNTIME%\get-pip.py" goto :embedded_install_pip
call :download "https://bootstrap.pypa.io/get-pip.py" "%RUNTIME%\get-pip.py"
if %errorlevel% neq 0 goto :embedded_pip_download_failed
:embedded_install_pip
echo Installing the Python package installer...
"%EMBED%" "%RUNTIME%\get-pip.py" --disable-pip-version-check --no-warn-script-location
if %errorlevel% neq 0 goto :embedded_pip_failed
goto :embedded_ready
:embedded_pip_offline
echo Installing the Python package installer from the wheels folder...
for %%W in ("%ROOT%wheels\pip-*.whl") do set "PIP_WHEEL=%%~fW"
"%EMBED%" "%PIP_WHEEL%/pip" install --disable-pip-version-check --no-warn-script-location --no-index "%PIP_WHEEL%"
if %errorlevel% neq 0 goto :embedded_pip_failed

:embedded_ready
set "PYTHON=%EMBED%"
exit /b 0

:embedded_download_failed
echo ERROR: Could not download Python %PY_EMBED_VERSION% from www.python.org.
echo A "403 Forbidden" message means the company network or proxy blocks the download.
echo Install Python 3.12 or newer on this computer (from the company software centre or python.org)
echo and run this file again - the launcher then uses it and downloads nothing from python.org.
exit /b 0
:embedded_unpack_failed
echo ERROR: Could not unpack the private Python runtime.
exit /b 0
:embedded_pip_download_failed
echo ERROR: Could not download the Python package installer from bootstrap.pypa.io.
exit /b 0
:embedded_pip_failed
echo ERROR: Could not install the Python package installer.
del /q "%RUNTIME%\get-pip.py" >nul 2>&1
exit /b 0

:download
rem Downloads %1 to %2 with curl, falling back to PowerShell (which uses the Windows proxy settings).
set "DL_URL=%~1"
set "DL_OUT=%~2"
if exist "%DL_OUT%.part" del /q "%DL_OUT%.part" >nul 2>&1
where curl.exe >nul 2>&1
if %errorlevel% neq 0 goto :download_powershell
curl.exe --fail --location --retry 3 --silent --show-error --output "%DL_OUT%.part" "%DL_URL%"
if %errorlevel% equ 0 goto :download_done
:download_powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "%PS_TLS% try { Invoke-WebRequest -UseBasicParsing -Uri '%DL_URL%' -OutFile '%DL_OUT%.part' } catch { Write-Host $_.Exception.Message; exit 1 }"
if %errorlevel% neq 0 exit /b 1
:download_done
if not exist "%DL_OUT%.part" exit /b 1
move /y "%DL_OUT%.part" "%DL_OUT%" >nul
if not exist "%DL_OUT%" exit /b 1
exit /b 0

rem ---------------------------------------------------------------------------

:packages_failed
echo.
echo ERROR: Dashboard packages could not be installed (see the pip message above).
echo "403 Forbidden" or "from versions: none" means the company network or proxy blocks pypi.org.
echo Options:
echo   - run this file once on a network that allows pypi.org and files.pythonhosted.org, or
echo   - ask IT to allow pypi.org and files.pythonhosted.org, or
echo   - on a computer with internet and the same Python version, run
echo       py -m pip download -r requirements.txt -d wheels
echo     in this folder, copy the "wheels" folder here and run this file again (offline install).
goto :failed

:check_failed
echo.
echo ERROR: Dashboard packages are incomplete or the application files are damaged (see the message above).
goto :failed

:missing_files
echo ERROR: This folder is incomplete. Keep run_dashboard.bat with the full v6.4 application folder.
goto :failed

:failed
echo.
echo The dashboard could not be started.
pause
popd
exit /b 1

:done
popd
exit /b 0
