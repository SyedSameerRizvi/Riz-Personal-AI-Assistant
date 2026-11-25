import pytest

from riz.db import (
    add_memory,
    create_chat,
    data_dir,
    delete_chat,
    get_chat,
    get_settings,
    list_chats,
    log_tool_call,
    search_memories,
    set_pinned,
    touch_chat,
    update_settings,
)


def test_chats_pinned_first_then_recent(conn):
    a = create_chat(conn, "A")
    b = create_chat(conn, "B")
    set_pinned(conn, a["id"], True)
    assert [c["title"] for c in list_chats(conn)] == ["A", "B"]
    touch_chat(conn, b["id"])
    set_pinned(conn, a["id"], False)
    assert list_chats(conn)[0]["title"] == "B"


def test_memory_search_matches_all_words_case_insensitive(conn):
    add_memory(conn, "Prefers short answers", "preference", None)
    add_memory(conn, "Keeps notes in F:\\notes", "project", None)
    assert [m["text"] for m in search_memories(conn, "SHORT answers")] == ["Prefers short answers"]
    assert search_memories(conn, "short notes") == []


def test_settings_defaults_and_unknown_key(conn):
    assert get_settings(conn)["model"] == "qwen3:8b"
    update_settings(conn, {"theme": "dark"})
    assert get_settings(conn)["theme"] == "dark"
    with pytest.raises(KeyError):
        update_settings(conn, {"nope": "x"})


def test_delete_chat_removes_row(conn):
    c = create_chat(conn, "x")
    delete_chat(conn, c["id"])
    assert get_chat(conn, c["id"]) is None


def test_data_dir_uses_env(tmp_path):
    assert data_dir() == tmp_path


def test_log_tool_call_rejects_unknown_decision(conn):
    log_tool_call(conn, "c1", "read_file", {"path": "x"}, "allowed")
    with pytest.raises(ValueError):
        log_tool_call(conn, "c1", "read_file", {"path": "x"}, "maybe")
