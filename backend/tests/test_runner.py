import pytest
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import MemorySaver

from riz.agent import build_graph
from riz.db import get_chat
from riz.runner import ChatRunner, ThinkFilter

from .fakes import ScriptedModel, ai_call


class DownModel(ScriptedModel):
    error: Exception

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        raise self.error


@pytest.fixture
def runner_with(conn):
    def make(responses=None, raises=None):
        model = (
            DownModel(responses=[], error=raises)
            if raises
            else ScriptedModel(responses=list(responses))
        )
        conn.execute(
            "INSERT INTO chats (id, title, pinned, created_at, updated_at)"
            " VALUES ('c1', 'New chat', 0, '2026-11-25T00:00:00', '2026-11-25T00:00:00')"
        )
        conn.commit()
        return ChatRunner(build_graph(model, conn, MemorySaver()), conn, "qwen3:8b"), conn

    return make


async def collect(aiter):
    return [e async for e in aiter]


def usage(i, o):
    return {"input_tokens": i, "output_tokens": o, "total_tokens": i + o}


async def test_send_streams_tokens_then_done_and_logs(runner_with):
    r, conn = runner_with([AIMessage("hello", usage_metadata=usage(5, 2))])
    ev = await collect(r.send("c1", "hi"))
    assert "".join(e["text"] for e in ev if e["type"] == "token") == "hello"
    assert ev[-1]["type"] == "done"
    assert ev[-1]["stats"]["output_tokens"] == 2
    assert conn.execute("select output_tokens from model_calls").fetchone()[0] == 2


async def test_approval_flow_and_pending_blocks_send(runner_with):
    r, _ = runner_with([ai_call("read_file", {"path": "x"}, "1"), AIMessage("ok")])
    ev = await collect(r.send("c1", "read"))
    assert ev[-1]["type"] == "tool_request" and ev[-1]["call_id"] == "1"
    assert await r.pending("c1")
    assert await collect(r.send("c1", "again")) == [
        {"type": "error", "chat_id": "c1", "message": "Answer the pending approval first."}
    ]
    ev = await collect(r.resume("c1", {"decision": "deny", "path": None}))
    assert ev[0]["type"] == "tool_result" and ev[0]["decision"] == "denied"
    assert ev[0]["args"] == {"path": "x"} and ev[-1]["type"] == "done"
    assert await r.pending("c1") is None


async def test_title_set_from_first_message(runner_with):
    r, conn = runner_with([AIMessage("ok")])
    await collect(r.send("c1", "Please tidy my todo list and sort it into sections"))
    assert get_chat(conn, "c1")["title"] == "Please tidy my todo list and sort it int"


async def test_ollama_down_yields_error(runner_with):
    r, _ = runner_with(raises=ConnectionError("refused"))
    ev = await collect(r.send("c1", "hi"))
    assert ev[-1] == {
        "type": "error",
        "chat_id": "c1",
        "message": "Can't reach Ollama. Is it running?",
    }


async def test_regenerate_replaces_last_answer(runner_with):
    r, _ = runner_with([AIMessage("first"), AIMessage("second")])
    await collect(r.send("c1", "hi"))
    await collect(r.regenerate("c1"))
    assert [m["content"] for m in await r.history("c1")] == ["hi", "second"]


async def test_history_includes_tool_rows(runner_with, tmp_path):
    p = tmp_path / "n.txt"
    p.write_text("note")
    r, _ = runner_with(
        [ai_call("read_file", {"path": str(p)}, "1"), AIMessage("<think>x</think>It says note")]
    )
    await collect(r.send("c1", "read"))
    await collect(r.resume("c1", {"decision": "allow", "path": None}))
    assert await r.history("c1") == [
        {"role": "user", "content": "read"},
        {
            "role": "tool",
            "tool": "read_file",
            "args": {"path": str(p)},
            "decision": "allowed",
            "summary": "note",
        },
        {"role": "assistant", "content": "It says note"},
    ]


async def test_think_block_is_stripped_from_tokens(runner_with):
    r, _ = runner_with([AIMessage("<think>\nplan\n</think>\n\nhello")])
    ev = await collect(r.send("c1", "hi"))
    assert "".join(e["text"] for e in ev if e["type"] == "token").strip() == "hello"
    assert all(e["text"] for e in ev if e["type"] == "token")


def test_think_filter_handles_split_tags():
    f = ThinkFilter()
    out = "".join(f.feed(t) for t in ["<thi", "nk>sec", "ret</th", "ink>Hi", " there"])
    assert out == "Hi there"


def test_think_filter_releases_lone_angle_bracket():
    f = ThinkFilter()
    assert f.feed("a <") + f.feed("b") + f.flush() == "a <b"
