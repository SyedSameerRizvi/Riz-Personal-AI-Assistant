# PyInstaller build for Riz.exe. Run from backend/: pyinstaller packaging/riz.spec
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

here = Path(SPECPATH)
dist_ui = here.parents[1] / "frontend" / "dist"

hidden = [
    *collect_submodules("riz"),
    *collect_submodules("uvicorn"),
    *collect_submodules("langgraph"),
    *collect_submodules("langchain_ollama"),
    *collect_submodules("send2trash"),
    "pystray._win32",
    "aiosqlite",
]

a = Analysis(
    [str(here / "launch.py")],
    pathex=[str(here.parent)],
    datas=[(str(dist_ui), "frontend/dist")],
    hiddenimports=hidden,
    excludes=["tkinter", "pytest", "ruff"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Riz",
    icon=str(here / "riz.ico"),
    console=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Riz")
