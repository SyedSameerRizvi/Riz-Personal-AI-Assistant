"""Writes packaging/riz.ico from the same drawing as the tray icon."""

from pathlib import Path

from riz.main import _tray_image

out = Path(__file__).with_name("riz.ico")
_tray_image(256).save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (256, 256)])
print(out)
