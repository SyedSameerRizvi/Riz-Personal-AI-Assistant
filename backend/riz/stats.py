"""Dashboard queries and live Ollama / GPU status."""

import asyncio
import os
import sqlite3
import subprocess
from datetime import date, timedelta
from typing import Literal

import httpx

OLLAMA_URL = "http://127.0.0.1:11434"
RANGE_DAYS = {"7d": 7, "30d": 30}
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def get_stats(conn: sqlite3.Connection, range_: Literal["7d", "30d", "all"], today: date) -> dict:
    days = RANGE_DAYS.get(range_)
    start = (today - timedelta(days=days - 1)).isoformat() if days else "0000-01-01"
    model_rows = conn.execute(
        """
        SELECT date(started_at, 'localtime') AS day,
               sum(input_tokens) AS input, sum(output_tokens) AS output,
               sum(CASE WHEN first_token_ms IS NOT NULL THEN output_tokens END) AS gen_tokens,
               sum(total_ms - first_token_ms) AS gen_ms,
               avg(first_token_ms) AS first_token_ms
        FROM model_calls WHERE date(started_at, 'localtime') >= ?
        GROUP BY day ORDER BY day
        """,
        (start,),
    ).fetchall()
    by_day = {r["day"]: r for r in model_rows}
    day_list = (
        [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
        if days
        else list(by_day)
    )

    tokens, speed = [], []
    for d in day_list:
        r = by_day.get(d)
        tokens.append(
            {"day": d, "input": r["input"] if r else 0, "output": r["output"] if r else 0}
        )
        tok_per_s = None
        if r and r["gen_ms"]:
            tok_per_s = round(r["gen_tokens"] / r["gen_ms"] * 1000, 1)
        ftm = round(r["first_token_ms"], 1) if r and r["first_token_ms"] is not None else None
        speed.append({"day": d, "tok_per_s": tok_per_s, "first_token_ms": ftm})

    tools = [
        dict(r)
        for r in conn.execute(
            """
            SELECT tool,
                   sum(decision = 'allowed') AS allowed,
                   sum(decision = 'denied') AS denied,
                   sum(decision = 'auto') AS auto
            FROM tool_calls WHERE date(created_at, 'localtime') >= ?
            GROUP BY tool ORDER BY count(*) DESC, tool
            """,
            (start,),
        )
    ]
    totals = conn.execute(
        "SELECT count(*) AS messages, count(DISTINCT chat_id) AS chats FROM model_calls"
        " WHERE date(started_at, 'localtime') >= ?",
        (start,),
    ).fetchone()
    return {
        "tokens_per_day": tokens,
        "speed": speed,
        "tools": tools,
        "totals": {"messages": totals["messages"], "chats": totals["chats"]},
    }


def _gpu_total_gb() -> float | None:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            check=True,
            capture_output=True,
            text=True,
            timeout=2,
            creationflags=NO_WINDOW,
        ).stdout
        return round(float(out.splitlines()[0]) / 1024, 1)
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None


async def get_status(model_name: str) -> dict:
    status = {"ollama": False, "model": None, "vram_used_gb": None, "vram_total_gb": None}
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/ps")
            resp.raise_for_status()
            loaded = resp.json().get("models", [])
    except (httpx.HTTPError, ValueError):
        return status
    status["ollama"] = True
    if loaded:
        match = next((m for m in loaded if m.get("name") == model_name), loaded[0])
        status["model"] = match.get("name")
        status["vram_used_gb"] = round(sum(m.get("size_vram", 0) for m in loaded) / 1024**3, 1)
    status["vram_total_gb"] = await asyncio.to_thread(_gpu_total_gb)
    return status
