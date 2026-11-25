import pytest

from riz.db import connect


@pytest.fixture(autouse=True)
def _data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("RIZ_DATA_DIR", str(tmp_path))


@pytest.fixture
def conn(tmp_path):
    c = connect(tmp_path / "riz.db")
    yield c
    c.close()
