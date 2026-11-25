from pathlib import Path

from riz import startup


def test_enable_creates_shortcut_through_powershell(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(startup.subprocess, "run", lambda args, **k: calls.append(args))
    monkeypatch.setattr(startup, "shortcut_path", lambda: tmp_path / "Riz.lnk")
    startup.set_start_with_windows(True, Path("C:/py/pythonw.exe"))
    [args] = calls
    assert args[0] == "powershell"
    script = args[-1]
    assert "CreateShortcut" in script and "-m riz" in script and "pythonw.exe" in script


def test_disable_removes_shortcut(tmp_path, monkeypatch):
    lnk = tmp_path / "Riz.lnk"
    lnk.write_text("x")
    monkeypatch.setattr(startup, "shortcut_path", lambda: lnk)
    startup.set_start_with_windows(False, Path("C:/py/pythonw.exe"))
    assert not lnk.exists()
    startup.set_start_with_windows(False, Path("C:/py/pythonw.exe"))  # already gone: no error


def test_paths_with_quotes_are_escaped(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(startup.subprocess, "run", lambda args, **k: calls.append(args))
    monkeypatch.setattr(startup, "shortcut_path", lambda: tmp_path / "Riz.lnk")
    startup.set_start_with_windows(True, Path("C:/Sam's tools/pythonw.exe"))
    assert "Sam''s tools" in calls[0][-1]


def test_launch_target_runs_python_module_from_source(monkeypatch):
    monkeypatch.delattr(startup.sys, "frozen", raising=False)
    _exe, args, workdir = startup.launch_target()
    assert args == "-m riz --tray" and workdir == startup.BACKEND_DIR


def test_launch_target_runs_the_exe_when_packaged(monkeypatch):
    monkeypatch.setattr(startup.sys, "frozen", True, raising=False)
    monkeypatch.setattr(startup.sys, "executable", "C:/Apps/Riz/Riz.exe")
    exe, args, workdir = startup.launch_target()
    assert exe == Path("C:/Apps/Riz/Riz.exe") and args == "--tray" and workdir == Path("C:/Apps/Riz")
