"""SQLite connection, app tables, CRUD and usage logging."""

import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

DEFAULT_SETTINGS: dict[str, str] = {
    "model": "qwen3:8b",
    "theme": "system",
    "hotkey": "ctrl+space",
    "start_with_windows": "true",
}

MEMORY_KINDS = {"preference", "project", "personal"}
TOOL_DECISIONS = {"auto", "allowed", "denied"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    kind TEXT NOT NULL,
    source_chat_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    model TEXT NOT NULL,
    started_at TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    first_token_ms INTEGER,
    total_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    tool TEXT NOT NULL,
    args_json TEXT NOT NULL,
    decision TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat()


def data_dir() -> Path:
    """RIZ_DATA_DIR if set, else %APPDATA%\\Riz. Created if missing."""
    env = os.environ.get("RIZ_DATA_DIR")
    path = Path(env) if env else Path(os.environ.get("APPDATA", Path.home())) / "Riz"
    path.mkdir(parents=True, exist_ok=True)
    return path


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # the checkpointer shares this file
    conn.executescript(SCHEMA)
    return conn


# Chats


def create_chat(conn: sqlite3.Connection, title: str) -> dict:
    now = _now()
    chat_id = uuid4().hex
    conn.execute(
        "INSERT INTO chats (id, title, pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
        (chat_id, title, now, now),
    )
    conn.commit()
    return get_chat(conn, chat_id)


def get_chat(conn: sqlite3.Connection, chat_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
    return _chat(row) if row else None


def list_chats(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC, rowid DESC")
    return [_chat(r) for r in rows]


def rename_chat(conn: sqlite3.Connection, chat_id: str, title: str) -> None:
    conn.execute("UPDATE chats SET title = ? WHERE id = ?", (title, chat_id))
    conn.commit()


def set_pinned(conn: sqlite3.Connection, chat_id: str, pinned: bool) -> None:
    conn.execute("UPDATE chats SET pinned = ? WHERE id = ?", (int(pinned), chat_id))
    conn.commit()


def touch_chat(conn: sqlite3.Connection, chat_id: str) -> None:
    conn.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (_now(), chat_id))
    conn.commit()


def delete_chat(conn: sqlite3.Connection, chat_id: str) -> None:
    conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
    conn.commit()


def _chat(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["pinned"] = bool(d["pinned"])
    return d


# Memories


def add_memory(conn: sqlite3.Connection, text: str, kind: str, source_chat_id: str | None) -> dict:
    _check_kind(kind)
    now = _now()
    cur = conn.execute(
        "INSERT INTO memories (text, kind, source_chat_id, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (text, kind, source_chat_id, now, now),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM memories WHERE id = ?", (cur.lastrowid,)).fetchone())


def list_memories(conn: sqlite3.Connection, kind: str | None = None) -> list[dict]:
    if kind is None:
        rows = conn.execute("SELECT * FROM memories ORDER BY created_at DESC, id DESC")
    else:
        rows = conn.execute(
            "SELECT * FROM memories WHERE kind = ? ORDER BY created_at DESC, id DESC", (kind,)
        )
    return [dict(r) for r in rows]


def search_memories(conn: sqlite3.Connection, query: str, limit: int = 10) -> list[dict]:
    """Memories whose text contains every word of the query (case-insensitive)."""
    words = query.split()
    if not words:
        return []
    where = " AND ".join("text LIKE ? ESCAPE '\\'" for _ in words)
    params = [f"%{_escape_like(w)}%" for w in words]
    rows = conn.execute(
        f"SELECT * FROM memories WHERE {where} ORDER BY created_at DESC, id DESC LIMIT ?",
        (*params, limit),
    )
    return [dict(r) for r in rows]


def update_memory(conn: sqlite3.Connection, memory_id: int, text: str, kind: str) -> None:
    _check_kind(kind)
    conn.execute(
        "UPDATE memories SET text = ?, kind = ?, updated_at = ? WHERE id = ?",
        (text, kind, _now(), memory_id),
    )
    conn.commit()


def delete_memory(conn: sqlite3.Connection, memory_id: int) -> None:
    conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
    conn.commit()


def _check_kind(kind: str) -> None:
    if kind not in MEMORY_KINDS:
        raise ValueError(f"kind must be one of {sorted(MEMORY_KINDS)}, got {kind!r}")


def _escape_like(word: str) -> str:
    return word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# Settings


def get_settings(conn: sqlite3.Connection) -> dict[str, str]:
    stored = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM settings")}
    return {**DEFAULT_SETTINGS, **stored}


def update_settings(conn: sqlite3.Connection, values: dict[str, str]) -> None:
    unknown = set(values) - set(DEFAULT_SETTINGS)
    if unknown:
        raise KeyError(f"Unknown setting(s): {', '.join(sorted(unknown))}")
    conn.executemany(
        "INSERT INTO settings (key, value) VALUES (?, ?)"
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [(k, str(v)) for k, v in values.items()],
    )
    conn.commit()


# Logs


def log_model_call(
    conn: sqlite3.Connection,
    chat_id: str | None,
    model: str,
    input_tokens: int,
    output_tokens: int,
    first_token_ms: int | None,
    total_ms: int,
) -> None:
    conn.execute(
        "INSERT INTO model_calls (chat_id, model, started_at, input_tokens, output_tokens,"
        " first_token_ms, total_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (chat_id, model, _now(), input_tokens, output_tokens, first_token_ms, total_ms),
    )
    conn.commit()


def log_tool_call(
    conn: sqlite3.Connection, chat_id: str | None, tool: str, args: dict, decision: str
) -> None:
    if decision not in TOOL_DECISIONS:
        raise ValueError(f"decision must be one of {sorted(TOOL_DECISIONS)}, got {decision!r}")
    conn.execute(
        "INSERT INTO tool_calls (chat_id, tool, args_json, decision, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (chat_id, tool, json.dumps(args), decision, _now()),
    )
    conn.commit()
