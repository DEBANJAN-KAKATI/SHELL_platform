@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem ILS Dashboard v6.4 - self-contained Windows launcher
rem Python is chosen in this order:
rem   1. a working .venv or .venv-local in this folder
rem   2. a new .venv created from Python 3.9-3.14 already installed on this computer
rem   3. a private Python downloaded into .python-runtime (only when no usable Python is installed)
rem Packages from requirements.txt are installed only when missing or when requirements.txt changes.
rem Note: keep CRLF line endings (see .gitattributes); cmd.exe misreads labels in LF-only batch files.
rem Exit codes are tested with "neq 0": a crashing program returns a negative code, which "if errorlevel 1" misses.

pushd "%~dp0"
set "ROOT=%CD%"
if not "%ROOT:~-1%"=="\" set "ROOT=%ROOT%\"
set "PYTHON="
set "BASE_PY="
set "RUNTIME=%ROOT%.python-runtime"
rem The embeddable runtime's ._pth file below names python312.zip, so keep this a 3.12.x release.
set "PY_EMBED_VERSION=3.12.10"
set "PS_TLS=[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;"
rem Settings left by other Python installations (e.g. Anaconda) can break a virtual environment.
set "PYTHONHOME="
set "PYTHONPATH="

if not exist "%ROOT%run_app.py" goto :missing_files
if not exist "%ROOT%requirements.txt" goto :missing_files
if not exist "%ROOT%config\settings.json" goto :missing_files

rem A copied virtual environment can contain paths from another computer, so each one is tested.
call :use_python "%ROOT%.venv\Scripts\python.exe"
if not defined PYTHON call :use_python "%ROOT%.venv-local\Scripts\python.exe"
if not defined PYTHON call :create_venv
if not defined PYTHON call :prepare_embedded_python
if not defined PYTHON goto :failed

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
echo.
echo Installing dashboard packages (first start or after an update)...
"%PYTHON%" -m pip install --disable-pip-version-check --no-input --no-warn-script-location -r "%ROOT%requirements.txt"
if %errorlevel% neq 0 goto :packages_failed
copy /y "%ROOT%requirements.txt" "%STAMP%" >nul
call :check_app
if %errorlevel% neq 0 goto :check_failed

:start_dashboard
echo.
echo Starting ILS Dashboard...
echo Close this window to stop the dashboard.
"%PYTHON%" "%ROOT%run_app.py"
set "EXIT_CODE=%errorlevel%"
if "%EXIT_CODE%"=="0" goto :done
echo.
echo ERROR: Dashboard stopped with exit code %EXIT_CODE%.
echo If another dashboard window is still open, close it first - both use the same port.
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
"%PYTHON%" -c "import flask, pandas, openpyxl, olefile, xlrd; import app"
if %errorlevel% neq 0 exit /b 1
exit /b 0
:check_app_quiet
"%PYTHON%" -c "import flask, pandas, openpyxl, olefile, xlrd; import app" >nul 2>&1
if %errorlevel% neq 0 exit /b 1
exit /b 0

:create_venv
call :find_installed_python
if not defined BASE_PY exit /b 0
rem Keep an existing (copied or broken) .venv untouched and build .venv-local next to it.
set "VENV=%ROOT%.venv"
if exist "%ROOT%.venv" set "VENV=%ROOT%.venv-local"
echo.
echo Found Python: %BASE_PY%
echo Creating the dashboard environment in %VENV% ...
"%BASE_PY%" -m venv --clear "%VENV%"
if %errorlevel% neq 0 goto :create_venv_failed
call :use_python "%VENV%\Scripts\python.exe"
if defined PYTHON exit /b 0
:create_venv_failed
echo WARNING: Could not create a virtual environment from the installed Python.
exit /b 0

:find_installed_python
rem Python launcher (py.exe), preferring the versions with the widest package support.
where py.exe >nul 2>&1
if %errorlevel% neq 0 goto :find_on_path
for %%V in (3.12 3.13 3.11 3.14 3.10 3.9) do if not defined BASE_PY call :try_py_launcher %%V
if defined BASE_PY exit /b 0
:find_on_path
rem python.exe on PATH. The Microsoft Store placeholder fails the version test and is skipped.
for /f "delims=" %%P in ('where python.exe 2^>nul') do if not defined BASE_PY call :try_base "%%~P"
if defined BASE_PY exit /b 0
rem Standard install folders, for installations that were not added to PATH.
call :scan_folder "%LOCALAPPDATA%\Programs\Python"
if not defined BASE_PY call :scan_folder "%ProgramFiles%"
if not defined BASE_PY call :scan_folder "%SystemDrive%\"
exit /b 0

:scan_folder
rem Tries every Python3* sub-folder of %1 (dir is used because it handles spaces in the path).
for /f "delims=" %%D in ('dir /b /ad "%~1\Python3*" 2^>nul') do if not defined BASE_PY call :try_base "%~1\%%D\python.exe"
exit /b 0

:try_py_launcher
set "CANDIDATE="
rem stdin is closed so a launcher that offers to install a missing version cannot wait for input.
for /f "delims=" %%P in ('py.exe -%1 -c "import sys; print(sys.executable)" 2^>nul ^<nul') do set "CANDIDATE=%%P"
if defined CANDIDATE call :try_base "%CANDIDATE%"
exit /b 0

:try_base
rem Accepts %1 when it runs, is Python 3.9-3.14 (the range the pinned packages provide wheels for)
rem and can create virtual environments.
if not exist "%~1" exit /b 0
"%~1" -c "import sys, venv, ensurepip; sys.exit(0 if (3, 9) <= sys.version_info[:2] <= (3, 14) else 1)" >nul 2>&1
if %errorlevel% neq 0 exit /b 0
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
if exist "%RUNTIME%\get-pip.py" goto :embedded_install_pip
call :download "https://bootstrap.pypa.io/get-pip.py" "%RUNTIME%\get-pip.py"
if %errorlevel% neq 0 goto :embedded_pip_download_failed
:embedded_install_pip
echo Installing the Python package installer...
"%EMBED%" "%RUNTIME%\get-pip.py" --disable-pip-version-check --no-warn-script-location
if %errorlevel% neq 0 goto :embedded_pip_failed

:embedded_ready
set "PYTHON=%EMBED%"
exit /b 0

:embedded_download_failed
echo ERROR: Could not download Python %PY_EMBED_VERSION%.
echo An internet connection is required the first time this launcher is used without an installed Python.
exit /b 0
:embedded_unpack_failed
echo ERROR: Could not unpack the private Python runtime.
exit /b 0
:embedded_pip_download_failed
echo ERROR: Could not download the Python package installer.
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
echo ERROR: Dashboard packages could not be installed.
echo Check the internet connection or corporate proxy, then run this file again.
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
