"""Drives the agent graph for one chat and turns it into UI events."""

import re
import sqlite3
import time
from collections.abc import AsyncIterator

import httpx
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    HumanMessage,
    RemoveMessage,
    ToolMessage,
)
from langgraph.types import Command

from riz.db import get_chat, log_model_call, rename_chat, touch_chat

OPEN, CLOSE = "<think>", "</think>"
THINK_RE = re.compile(r"<think>.*?(</think>|$)\s*", re.DOTALL)
OLLAMA_DOWN = "Can't reach Ollama. Is it running?"
PENDING = "Answer the pending approval first."
TITLE_CHARS = 40
SUMMARY_CHARS = 200


def strip_think(text: str) -> str:
    return THINK_RE.sub("", text)


def _partial_suffix(text: str, tag: str) -> int:
    """Length of the longest end of `text` that could be the start of `tag`."""
    for n in range(min(len(tag) - 1, len(text)), 0, -1):
        if tag.startswith(text[-n:]):
            return n
    return 0


class ThinkFilter:
    """Drops <think>...</think> from streamed text, even when tags are split across chunks."""

    def __init__(self) -> None:
        self._buf = ""
        self._inside = False

    def feed(self, text: str) -> str:
        self._buf += text
        out = []
        while True:
            tag = CLOSE if self._inside else OPEN
            i = self._buf.find(tag)
            if i >= 0:
                if not self._inside:
                    out.append(self._buf[:i])
                self._buf = self._buf[i + len(tag) :]
                self._inside = not self._inside
                continue
            keep = _partial_suffix(self._buf, tag)
            if not self._inside:
                out.append(self._buf[: len(self._buf) - keep])
            self._buf = self._buf[len(self._buf) - keep :]
            return "".join(out)

    def flush(self) -> str:
        rest, self._buf = ("" if self._inside else self._buf), ""
        return rest


def _text(content) -> str:
    if isinstance(content, str):
        return content
    return "".join(p.get("text", "") for p in content if isinstance(p, dict))


class ChatRunner:
    def __init__(self, graph, conn: sqlite3.Connection, model_name: str) -> None:
        self.graph = graph
        self.conn = conn
        self.model_name = model_name

    @staticmethod
    def _config(chat_id: str) -> dict:
        return {"configurable": {"thread_id": chat_id}}

    async def pending(self, chat_id: str) -> dict | None:
        state = await self.graph.aget_state(self._config(chat_id))
        return state.interrupts[0].value if state.interrupts else None

    async def send(self, chat_id: str, text: str) -> AsyncIterator[dict]:
        if await self.pending(chat_id):
            yield {"type": "error", "chat_id": chat_id, "message": PENDING}
            return
        chat = get_chat(self.conn, chat_id)
        if chat and chat["title"] == "New chat":
            rename_chat(self.conn, chat_id, text.strip()[:TITLE_CHARS] or "New chat")
        touch_chat(self.conn, chat_id)
        async for e in self._stream(chat_id, {"messages": [HumanMessage(text)]}):
            yield e

    async def resume(self, chat_id: str, decision: dict) -> AsyncIterator[dict]:
        if not await self.pending(chat_id):
            yield {
                "type": "error",
                "chat_id": chat_id,
                "message": "Nothing is waiting for approval.",
            }
            return
        touch_chat(self.conn, chat_id)
        async for e in self._stream(chat_id, Command(resume=decision)):
            yield e

    async def regenerate(self, chat_id: str) -> AsyncIterator[dict]:
        if await self.pending(chat_id):
            yield {"type": "error", "chat_id": chat_id, "message": PENDING}
            return
        config = self._config(chat_id)
        messages = (await self.graph.aget_state(config)).values.get("messages", [])
        last = next(
            (i for i in range(len(messages) - 1, -1, -1) if isinstance(messages[i], HumanMessage)),
            None,
        )
        if last is None:
            yield {"type": "error", "chat_id": chat_id, "message": "Nothing to regenerate."}
            return
        text = _text(messages[last].content)
        await self.graph.aupdate_state(
            config, {"messages": [RemoveMessage(id=m.id) for m in messages[last:]]}
        )
        async for e in self.send(chat_id, text):
            yield e

    async def history(self, chat_id: str) -> list[dict]:
        state = await self.graph.aget_state(self._config(chat_id))
        messages = state.values.get("messages", [])
        call_args = {
            c["id"]: c["args"] for m in messages if isinstance(m, AIMessage) for c in m.tool_calls
        }
        out = []
        for m in messages:
            if isinstance(m, HumanMessage):
                out.append({"role": "user", "content": _text(m.content)})
            elif isinstance(m, ToolMessage):
                out.append(self._tool_row(m, call_args.get(m.tool_call_id, {})))
            elif isinstance(m, AIMessage):
                text = strip_think(_text(m.content))
                if text.strip():
                    out.append({"role": "assistant", "content": text})
        return out

    @staticmethod
    def _tool_row(m: ToolMessage, args: dict) -> dict:
        return {
            "role": "tool",
            "tool": m.name,
            "args": m.additional_kwargs.get("args", args),
            "decision": m.additional_kwargs.get("decision", "auto"),
            "summary": _text(m.content)[:SUMMARY_CHARS],
        }

    async def _stream(self, chat_id: str, graph_input) -> AsyncIterator[dict]:
        config = self._config(chat_id)
        think = ThinkFilter()
        started = time.perf_counter()
        first_token_ms: int | None = None
        last_stats: dict | None = None
        try:
            async for chunk, meta in self.graph.astream(
                graph_input, config, stream_mode="messages"
            ):
                if isinstance(chunk, ToolMessage):
                    yield {
                        "type": "tool_result",
                        "chat_id": chat_id,
                        **self._tool_row(chunk, {}),
                    }
                    started, first_token_ms = time.perf_counter(), None
                    continue
                if (
                    not isinstance(chunk, (AIMessage, AIMessageChunk))
                    or meta.get("langgraph_node") != "model"
                ):
                    continue
                text = _text(chunk.content)
                if text and first_token_ms is None:
                    first_token_ms = int((time.perf_counter() - started) * 1000)
                visible = think.feed(text) if text else ""
                if visible:
                    yield {"type": "token", "chat_id": chat_id, "text": visible}
                if chunk.usage_metadata:
                    total_ms = max(1, int((time.perf_counter() - started) * 1000))
                    out_tokens = chunk.usage_metadata.get("output_tokens", 0)
                    log_model_call(
                        self.conn,
                        chat_id,
                        self.model_name,
                        chunk.usage_metadata.get("input_tokens", 0),
                        out_tokens,
                        first_token_ms,
                        total_ms,
                    )
                    gen_ms = max(1, total_ms - (first_token_ms or 0))
                    last_stats = {
                        "output_tokens": out_tokens,
                        "tok_per_s": round(out_tokens / gen_ms * 1000, 1),
                        "total_ms": total_ms,
                    }
                    started, first_token_ms = time.perf_counter(), None
            rest = think.flush()
            if rest:
                yield {"type": "token", "chat_id": chat_id, "text": rest}
        except (httpx.ConnectError, ConnectionError):
            yield {"type": "error", "chat_id": chat_id, "message": OLLAMA_DOWN}
            return
        except Exception as exc:  # noqa: BLE001 - shown in the chat instead of a traceback
            yield {"type": "error", "chat_id": chat_id, "message": str(exc) or type(exc).__name__}
            return
        payload = await self.pending(chat_id)
        if payload:
            yield {"type": "tool_request", "chat_id": chat_id, **payload}
        else:
            yield {"type": "done", "chat_id": chat_id, "stats": last_stats}
