from datetime import date, timedelta

import httpx

from riz.db import log_model_call, log_tool_call
from riz.stats import get_stats, get_status


def test_tokens_zero_filled_7d(conn):
    today = date.today()
    log_model_call(conn, "c1", "m", 10, 5, 100, 1000)
    days = get_stats(conn, "7d", today)["tokens_per_day"]
    assert len(days) == 7
    assert days[0]["day"] == (today - timedelta(days=6)).isoformat()
    assert days[0]["input"] == 0
    assert days[-1] == {"day": today.isoformat(), "input": 10, "output": 5}


def test_speed_formula(conn):
    log_model_call(conn, "c1", "m", 1, 100, 1000, 5000)
    log_model_call(conn, "c2", "m", 1, 200, 500, 6500)
    stats = get_stats(conn, "7d", date.today())
    today = stats["speed"][-1]
    assert today["tok_per_s"] == 30.0 and today["first_token_ms"] == 750.0
    assert stats["speed"][0]["tok_per_s"] is None
    assert stats["totals"] == {"messages": 2, "chats": 2}


def test_tool_counts(conn):
    for d in ["allowed", "allowed", "denied"]:
        log_tool_call(conn, "c1", "read_file", {"path": "x"}, d)
    log_tool_call(conn, "c1", "save_memory", {"text": "x"}, "auto")
    tools = {t["tool"]: t for t in get_stats(conn, "all", date.today())["tools"]}
    assert tools["read_file"] == {"tool": "read_file", "allowed": 2, "denied": 1, "auto": 0}
    assert tools["save_memory"]["auto"] == 1


def test_all_range_lists_only_days_with_data(conn):
    log_model_call(conn, "c1", "m", 3, 4, 10, 100)
    assert get_stats(conn, "all", date.today())["tokens_per_day"] == [
        {"day": date.today().isoformat(), "input": 3, "output": 4}
    ]


async def test_status_offline(monkeypatch):
    async def boom(*a, **k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx.AsyncClient, "get", boom)
    status = await get_status("qwen3:8b")
    assert status["ollama"] is False and status["model"] is None


async def test_status_reads_loaded_model(monkeypatch):
    async def fake_get(self, url, **k):
        return httpx.Response(
            200,
            json={"models": [{"name": "qwen3:8b", "size_vram": 5 * 1024**3}]},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    monkeypatch.setattr("riz.stats._gpu_total_gb", lambda: 6.0)
    assert await get_status("qwen3:8b") == {
        "ollama": True,
        "model": "qwen3:8b",
        "vram_used_gb": 5.0,
        "vram_total_gb": 6.0,
    }
