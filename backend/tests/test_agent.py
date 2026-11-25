from datetime import date

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from riz.agent import build_graph, build_system_prompt, make_tools
from riz.db import add_memory, list_memories

from .fakes import ScriptedModel, ai_call


def cfg(chat_id):
    return {"configurable": {"thread_id": chat_id}}


ALLOW = {"decision": "allow", "path": None}
DENY = {"decision": "deny", "path": None}


async def test_free_tool_runs_without_interrupt(conn):
    add_memory(conn, "Prefers short answers", "preference", None)
    model = ScriptedModel(
        responses=[ai_call("recall_memory", {"query": "short"}, "1"), AIMessage("ok")]
    )
    g = build_graph(model, conn, MemorySaver())
    out = await g.ainvoke({"messages": [HumanMessage("hi")]}, cfg("c1"))
    assert out["messages"][-1].content == "ok"
    tool_msg = out["messages"][-2]
    assert "Prefers short answers" in tool_msg.content
    assert tool_msg.additional_kwargs["decision"] == "auto"


async def test_read_file_interrupts_then_pick_replaces_path(conn, tmp_path):
    other = tmp_path / "other.txt"
    other.write_text("picked")
    model = ScriptedModel(
        responses=[ai_call("read_file", {"path": "C:/wrong.txt"}, "1"), AIMessage("done")]
    )
    g = build_graph(model, conn, MemorySaver())
    await g.ainvoke({"messages": [HumanMessage("read")]}, cfg("c1"))
    payload = (await g.aget_state(cfg("c1"))).interrupts[0].value
    assert payload["tool"] == "read_file" and payload["args"]["path"] == "C:/wrong.txt"
    assert payload["call_id"] == "1" and payload["preview"] is None
    out = await g.ainvoke(Command(resume={"decision": "pick", "path": str(other)}), cfg("c1"))
    assert out["messages"][-2].content == "picked"
    assert out["messages"][-2].additional_kwargs["decision"] == "allowed"


async def test_deny_returns_denial_to_model(conn, tmp_path):
    target = tmp_path / "x.txt"
    model = ScriptedModel(
        responses=[
            ai_call("write_file", {"path": str(target), "content": "x"}, "1"),
            AIMessage("ok"),
        ]
    )
    g = build_graph(model, conn, MemorySaver())
    await g.ainvoke({"messages": [HumanMessage("w")]}, cfg("c1"))
    out = await g.ainvoke(Command(resume=DENY), cfg("c1"))
    assert out["messages"][-2].content == "The user denied this action." and not target.exists()
    assert out["messages"][-2].additional_kwargs["decision"] == "denied"


async def test_write_file_payload_has_preview(conn, tmp_path):
    target = tmp_path / "x.txt"
    target.write_text("a\nb\n")
    model = ScriptedModel(
        responses=[ai_call("write_file", {"path": str(target), "content": "a\n"}, "1")]
    )
    g = build_graph(model, conn, MemorySaver())
    await g.ainvoke({"messages": [HumanMessage("w")]}, cfg("c1"))
    preview = (await g.aget_state(cfg("c1"))).interrupts[0].value["preview"]
    assert (preview["old_lines"], preview["new_lines"]) == (2, 1)


async def test_multiple_calls_execute_once(conn, tmp_path, monkeypatch):
    runs = []
    monkeypatch.setattr(
        "riz.agent.tools.run_command", lambda c, **k: runs.append(c) or "Exit code 0"
    )
    a = tmp_path / "a.txt"
    msg = AIMessage(
        "",
        tool_calls=[
            {"name": "write_file", "args": {"path": str(a), "content": "1"}, "id": "1"},
            {"name": "run_command", "args": {"command": "echo"}, "id": "2"},
        ],
    )
    g = build_graph(ScriptedModel(responses=[msg, AIMessage("ok")]), conn, MemorySaver())
    await g.ainvoke({"messages": [HumanMessage("go")]}, cfg("c1"))
    await g.ainvoke(Command(resume=ALLOW), cfg("c1"))
    assert not a.exists() and runs == []  # nothing runs until every call is decided
    await g.ainvoke(Command(resume=ALLOW), cfg("c1"))
    assert runs == ["echo"] and a.read_text() == "1"
    decisions = [r["decision"] for r in conn.execute("select decision from tool_calls")]
    assert decisions == ["allowed", "allowed"]


async def test_pick_is_only_for_read_file(conn, monkeypatch):
    runs = []
    monkeypatch.setattr("riz.agent.tools.run_command", lambda c, **k: runs.append(c) or "x")
    model = ScriptedModel(
        responses=[ai_call("run_command", {"command": "dir"}, "1"), AIMessage("ok")]
    )
    g = build_graph(model, conn, MemorySaver())
    await g.ainvoke({"messages": [HumanMessage("go")]}, cfg("c1"))
    out = await g.ainvoke(Command(resume={"decision": "pick", "path": "C:/x"}), cfg("c1"))
    assert runs == [] and out["messages"][-2].content == "The user denied this action."


async def test_save_memory_uses_chat_id_and_model_sees_memories(conn):
    model = ScriptedModel(
        responses=[
            ai_call("save_memory", {"text": "Likes tea", "kind": "preference"}, "1"),
            AIMessage("noted"),
        ]
    )
    g = build_graph(model, conn, MemorySaver())
    out = await g.ainvoke({"messages": [HumanMessage("I like tea")]}, cfg("c9"))
    assert out["messages"][-2].content == "Saved to memory: Likes tea"
    [m] = list_memories(conn)
    assert m["source_chat_id"] == "c9"
    second_call = model.calls[1]
    assert isinstance(second_call[0], SystemMessage) and "Likes tea" in second_call[0].content


async def test_save_memory_bad_kind_is_reported_not_raised(conn):
    model = ScriptedModel(
        responses=[ai_call("save_memory", {"text": "x", "kind": "secret"}, "1"), AIMessage("ok")]
    )
    g = build_graph(model, conn, MemorySaver())
    out = await g.ainvoke({"messages": [HumanMessage("hi")]}, cfg("c1"))
    assert "kind must be one of" in out["messages"][-2].content and list_memories(conn) == []


def test_make_tools_names(conn):
    assert {t.name for t in make_tools(conn)} == {
        "recall_memory",
        "save_memory",
        "read_file",
        "write_file",
        "delete_file",
        "run_command",
    }


def test_system_prompt_lists_memories():
    p = build_system_prompt([{"text": "Likes tea"}], date(2026, 11, 25))
    assert "Riz" in p and "Likes tea" in p and "2026-11-25" in p
