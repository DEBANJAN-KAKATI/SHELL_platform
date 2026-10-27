"""Native dialog service using isolated subprocesses to avoid Tkinter thread safety issues in Flask."""

import json
import os
from pathlib import Path
import subprocess
import sys
import threading

_process_lock = threading.Lock()
_active_proc = None


def resolve_initial_dir(initial_path):
    """Resolve a valid directory from an initial path or return empty string."""
    if initial_path:
        try:
            p = Path(str(initial_path).strip())
            if p.is_dir():
                return str(p)
            if p.parent.is_dir():
                return str(p.parent)
        except Exception:
            pass
    return ""


def _get_python_gui_executable():
    """Return pythonw.exe on Windows if available, else sys.executable."""
    if sys.platform == "win32":
        pw = Path(sys.executable).parent / "pythonw.exe"
        if pw.exists():
            return str(pw)
    return sys.executable


def _run_picker(cmd, timeout=180):
    """Run the picker script in a subprocess, terminating any prior active dialog."""
    global _active_proc
    with _process_lock:
        if _active_proc and _active_proc.poll() is None:
            try:
                _active_proc.kill()
            except Exception:
                pass
            _active_proc = None

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        _active_proc = proc

    try:
        stdout, _ = proc.communicate(timeout=timeout)
        out = stdout.strip()
        if out:
            lines = [line for line in out.splitlines() if line.strip().startswith("{")]
            if lines:
                data = json.loads(lines[-1])
                if "error" in data:
                    raise RuntimeError(data["error"])
                return data.get("path", ""), data.get("cancelled", False)
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except Exception:
            pass
        return "", True
    finally:
        with _process_lock:
            if _active_proc == proc:
                _active_proc = None

    return "", True


def browse_directory_dialog(initial_dir=None, title="Select folder"):
    """Open a native folder selection dialog in a dedicated subprocess.

    Returns:
        tuple[str, bool]: (selected_path, cancelled)
    """
    resolved_dir = resolve_initial_dir(initial_dir)
    picker_script = str(Path(__file__).resolve().parent / "picker.py")
    py_exe = _get_python_gui_executable()

    cmd = [py_exe, picker_script, "folder", title or "Select folder", resolved_dir or ""]

    try:
        return _run_picker(cmd)
    except Exception as e:
        if sys.platform == "win32":
            return _browse_directory_powershell(resolved_dir, title)
        raise e


def _browse_directory_powershell(initial_dir=None, title="Select folder"):
    """Fallback Windows PowerShell folder picker."""
    ps_script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = {json.dumps(title)}
$dialog.ShowNewFolderButton = $true
$init = {json.dumps(initial_dir or '')}
if ($init -and (Test-Path $init)) {{
    $dialog.SelectedPath = $init
}}
$res = $dialog.ShowDialog()
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialog.SelectedPath
}}
"""
    cmd = ["powershell", "-NoProfile", "-STA", "-Command", ps_script]
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
        )
        selected = res.stdout.strip()
        return selected, not bool(selected)
    except Exception:
        return "", True


def browse_file_dialog(initial_file=None, title="Select file", filetypes=None):
    """Open a native file selection dialog in a dedicated subprocess.

    Returns:
        tuple[str, bool]: (selected_path, cancelled)
    """
    resolved_dir = resolve_initial_dir(initial_file)
    picker_script = str(Path(__file__).resolve().parent / "picker.py")
    py_exe = _get_python_gui_executable()

    cmd = [
        py_exe,
        picker_script,
        "file",
        title or "Select file",
        resolved_dir or "",
        json.dumps(filetypes or [("All files", "*.*")]),
    ]

    try:
        return _run_picker(cmd)
    except Exception as e:
        if sys.platform == "win32":
            return _browse_file_powershell(resolved_dir, title, filetypes)
        raise e


def _browse_file_powershell(initial_dir=None, title="Select file", filetypes=None):
    """Fallback Windows PowerShell file picker."""
    filter_str = "All files (*.*)|*.*"
    if filetypes:
        parts = []
        for name, ext in filetypes:
            parts.append(f"{name} ({ext})|{ext}")
        filter_str = "|".join(parts)

    ps_script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = {json.dumps(title)}
$dialog.Filter = {json.dumps(filter_str)}
$init = {json.dumps(initial_dir or '')}
if ($init -and (Test-Path $init)) {{
    $dialog.InitialDirectory = $init
}}
$res = $dialog.ShowDialog()
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $dialog.FileName
}}
"""
    cmd = ["powershell", "-NoProfile", "-STA", "-Command", ps_script]
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
        )
        selected = res.stdout.strip()
        return selected, not bool(selected)
    except Exception:
        return "", True
