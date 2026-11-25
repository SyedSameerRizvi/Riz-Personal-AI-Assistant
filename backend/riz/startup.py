"""Turns the "Start with Windows" shortcut on or off."""

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def shortcut_path() -> Path:
    appdata = Path(os.environ.get("APPDATA", Path.home()))
    return appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / "Riz.lnk"


def _ps(value: object) -> str:
    """A PowerShell single-quoted string."""
    return "'" + str(value).replace("'", "''") + "'"


def set_start_with_windows(enabled: bool, python_exe: Path) -> None:
    lnk = shortcut_path()
    if not enabled:
        lnk.unlink(missing_ok=True)
        return
    script = (
        f"$s = (New-Object -ComObject WScript.Shell).CreateShortcut({_ps(lnk)}); "
        f"$s.TargetPath = {_ps(python_exe)}; "
        "$s.Arguments = '-m riz --tray'; "
        f"$s.WorkingDirectory = {_ps(BACKEND_DIR)}; "
        "$s.Description = 'Riz, your local AI assistant'; "
        "$s.Save()"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        check=False,
        capture_output=True,
        timeout=30,
        creationflags=NO_WINDOW,
    )


def pythonw_exe() -> Path:
    """pythonw.exe next to the running Python, so the app starts without a console window."""
    exe = Path(sys.executable)
    windowless = exe.with_name("pythonw.exe")
    return windowless if windowless.exists() else exe
