"""Plain tool functions. They return a string for the model and never raise for user errors."""

import difflib
import os
import subprocess
from pathlib import Path

from send2trash import send2trash

READ_MAX_BYTES = 20_000
CMD_TIMEOUT_S = 60
CMD_MAX_CHARS = 10_000
DIFF_MAX_CHARS = 5_000
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0  # no console flash


def read_file(path: str, max_bytes: int = READ_MAX_BYTES) -> str:
    p = Path(path)
    try:
        size = p.stat().st_size
        with p.open("rb") as f:
            data = f.read(max_bytes)
    except FileNotFoundError:
        return f"File not found: {path}"
    except IsADirectoryError:
        return f"Not a file: {path}"
    except OSError as e:
        return f"Can't read {path}: {e.strerror or e}"
    if b"\x00" in data[:1024]:
        return f"Not a text file: {path}"
    text = _decode(data, truncated=size > max_bytes)
    if size > max_bytes:
        text += f"\n[truncated: showing first {max_bytes} of {size} bytes]"
    return text


def _decode(data: bytes, truncated: bool) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as e:
        # A cut can split the last UTF-8 character; drop that partial tail only.
        if truncated and e.start >= len(data) - 3:
            try:
                return data[: e.start].decode("utf-8")
            except UnicodeDecodeError:
                pass
    return data.decode("cp1252", errors="replace")


def write_file(path: str, content: str) -> str:
    p = Path(path)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    except OSError as e:
        return f"Can't write {path}: {e.strerror or e}"
    return f"Wrote {len(content.splitlines())} lines to {path}"


def write_preview(path: str, content: str) -> dict:
    p = Path(path)
    try:
        old = p.read_text(encoding="utf-8", errors="replace") if p.is_file() else ""
    except OSError:
        old = ""
    old_lines, new_lines = old.splitlines(keepends=True), content.splitlines(keepends=True)
    diff = "".join(difflib.unified_diff(old_lines, new_lines, fromfile=path, tofile=path))
    if len(diff) > DIFF_MAX_CHARS:
        diff = diff[:DIFF_MAX_CHARS] + "\n[diff truncated]"
    return {"old_lines": len(old_lines), "new_lines": len(new_lines), "diff": diff}


def delete_file(path: str) -> str:
    if not Path(path).exists():
        return f"File not found: {path}"
    try:
        send2trash(path)
    except OSError as e:
        return f"Can't move {path} to the Recycle Bin: {e}"
    return f"Moved {path} to the Recycle Bin"


def run_command(command: str, timeout: int = CMD_TIMEOUT_S) -> str:
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=NO_WINDOW,
        )
    except subprocess.TimeoutExpired:
        return f"Command timed out after {timeout} s"
    except FileNotFoundError:
        return "PowerShell was not found on this PC."
    out = f"Exit code {proc.returncode}\n{proc.stdout or ''}{proc.stderr or ''}"
    if len(out) > CMD_MAX_CHARS:
        out = out[:CMD_MAX_CHARS] + "\n[output truncated]"
    return out
