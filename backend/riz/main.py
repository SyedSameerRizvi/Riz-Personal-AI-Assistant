"""Desktop shell: local server, pywebview window, tray icon and global hotkey."""

import socket
import sys
import threading
import time

import uvicorn

from riz import startup
from riz.db import connect, data_dir, get_settings
from riz.server import create_app

TITLE = "Riz"
FIRST_RUN_MARKER = ".startup-applied"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _tray_image():
    """The Riz mark: a periwinkle rounded square with a small sun."""
    from PIL import Image, ImageDraw

    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=16, fill="#8B97FF")
    ink = "#0E1014"
    c = size / 2
    d.ellipse((c - 10, c - 10, c + 10, c + 10), outline=ink, width=5)
    for x1, y1, x2, y2 in [(c, 8, c, 18), (c, 46, c, 56), (8, c, 18, c), (46, c, 56, c)]:
        d.line((x1, y1, x2, y2), fill=ink, width=5)
    return img


def run() -> None:
    import keyboard
    import pystray
    import webview

    start_hidden = "--tray" in sys.argv
    folder = data_dir()
    conn = connect(folder / "riz.db")
    settings = get_settings(conn)
    marker = folder / FIRST_RUN_MARKER
    if not marker.exists():
        startup.set_start_with_windows(
            settings["start_with_windows"] == "true", startup.pythonw_exe()
        )
        marker.write_text("1")
    conn.close()

    # 1. Server on a free localhost port, in a background thread.
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(create_app(folder), host="127.0.0.1", port=port, log_level="warning")
    )
    threading.Thread(target=server.run, daemon=True).start()
    while not server.started:
        time.sleep(0.05)

    state = {"visible": not start_hidden, "quitting": False}
    window = None

    class Api:
        def pick_file(self):
            result = window.create_file_dialog(webview.FileDialog.OPEN)
            return result[0] if result else None

    # 2. The window.
    window = webview.create_window(
        TITLE,
        f"http://127.0.0.1:{port}",
        js_api=Api(),
        width=1280,
        height=800,
        min_size=(900, 600),
        hidden=start_hidden,
        background_color="#0E1014",
    )

    def show():
        window.show()
        window.restore()
        state["visible"] = True

    def hide():
        window.hide()
        state["visible"] = False

    def toggle():
        hide() if state["visible"] else show()

    # 3. Closing hides to the tray instead of quitting.
    def on_closing():
        if state["quitting"]:
            return True
        hide()
        return False

    window.events.closing += on_closing

    # 4. Tray icon.
    def quit_app(icon, _item=None):
        state["quitting"] = True
        server.should_exit = True
        icon.stop()
        window.destroy()

    tray = pystray.Icon(
        "riz",
        _tray_image(),
        TITLE,
        menu=pystray.Menu(
            pystray.MenuItem("Show Riz", lambda icon, item: show(), default=True),
            pystray.MenuItem("Quit", quit_app),
        ),
    )
    tray.run_detached()

    # 5. Global hotkey.
    try:
        keyboard.add_hotkey(settings["hotkey"], toggle)
    except (ValueError, ImportError, OSError) as e:
        print(f"Hotkey {settings['hotkey']!r} not registered: {e}", file=sys.stderr)

    webview.start()
    server.should_exit = True
