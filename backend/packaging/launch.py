"""Entry point for the packaged Riz.exe."""

import sys


def smoke_test() -> int:
    """Used by CI: start the bundled app in-process and check the UI and API answer."""
    import tempfile
    from pathlib import Path

    from fastapi.testclient import TestClient

    from riz.server import create_app

    with tempfile.TemporaryDirectory() as tmp, TestClient(create_app(Path(tmp))) as client:
        ok = client.get("/").status_code == 200 and client.get("/api/chats").status_code == 200
    return 0 if ok else 1


if __name__ == "__main__":
    if "--smoke-test" in sys.argv:
        sys.exit(smoke_test())
    from riz.main import run

    run()
