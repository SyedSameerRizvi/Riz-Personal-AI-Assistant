import shutil

import pytest

from riz.tools import delete_file, read_file, run_command, write_file, write_preview

needs_powershell = pytest.mark.skipif(
    shutil.which("powershell") is None, reason="run_command needs Windows PowerShell"
)


def test_read_truncates_large_file(tmp_path):
    p = tmp_path / "big.txt"
    p.write_text("a" * 30_000)
    out = read_file(str(p))
    assert out.startswith("a" * 20_000)
    assert "[truncated: showing first 20000 of 30000 bytes]" in out


def test_read_rejects_binary(tmp_path):
    p = tmp_path / "x.bin"
    p.write_bytes(b"\x00\x01\x02")
    assert read_file(str(p)) == f"Not a text file: {p}"


def test_read_missing(tmp_path):
    assert read_file(str(tmp_path / "nope.txt")).startswith("File not found")


def test_read_falls_back_to_cp1252(tmp_path):
    p = tmp_path / "w.txt"
    p.write_bytes("café".encode("cp1252"))
    assert read_file(str(p)) == "café"


def test_write_creates_dirs_and_preview_counts(tmp_path):
    p = tmp_path / "a" / "b.txt"
    assert write_preview(str(p), "1\n2\n")["old_lines"] == 0
    assert write_file(str(p), "1\n2\n") == f"Wrote 2 lines to {p}"
    prev = write_preview(str(p), "1\n")
    assert (prev["old_lines"], prev["new_lines"]) == (2, 1) and "-2" in prev["diff"]


def test_delete_uses_recycle_bin(tmp_path, monkeypatch):
    sent = []
    monkeypatch.setattr("riz.tools.send2trash", sent.append)
    p = tmp_path / "x.txt"
    p.write_text("x")
    assert "Recycle Bin" in delete_file(str(p)) and sent == [str(p)]


def test_delete_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("riz.tools.send2trash", lambda p: pytest.fail("must not be called"))
    assert delete_file(str(tmp_path / "nope.txt")).startswith("File not found")


@needs_powershell
def test_command_output_and_exit_code():
    assert run_command("Write-Output hi").startswith("Exit code 0\nhi")


@needs_powershell
def test_command_timeout():
    assert run_command("Start-Sleep 5", timeout=1) == "Command timed out after 1 s"


@needs_powershell
def test_command_output_capped():
    out = run_command("'x' * 20000")
    assert len(out) <= 10_000 + len("\n[output truncated]") + 20
    assert out.endswith("[output truncated]")
