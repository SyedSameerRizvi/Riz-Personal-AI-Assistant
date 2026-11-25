"""FastAPI app: REST for chats, memory and settings, a WebSocket for chat streaming."""

import asyncio
import contextlib
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from pydantic import BaseModel

from riz import db, stats
from riz.agent import build_graph
from riz.runner import ChatRunner

NUM_CTX = 8192
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class ChatPatch(BaseModel):
    title: str | None = None
    pinned: bool | None = None


class MemoryBody(BaseModel):
    text: str
    kind: Literal["preference", "project", "personal"]


def create_app(data_dir: Path, model: BaseChatModel | None = None) -> FastAPI:
    db_path = Path(data_dir) / "riz.db"

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        conn = db.connect(db_path)
        async with AsyncSqliteSaver.from_conn_string(str(db_path)) as saver:
            await saver.setup()
            app.state.conn = conn
            app.state.saver = saver
            app.state.runner = None
            ensure_runner(app)
            yield
        conn.close()

    app = FastAPI(title="Riz", lifespan=lifespan)

    def ensure_runner(app: FastAPI) -> ChatRunner:
        """Build the runner, rebuilding it when the model setting has changed."""
        conn = app.state.conn
        name = db.get_settings(conn)["model"]
        runner = app.state.runner
        if runner is not None and (model is not None or runner.model_name == name):
            return runner
        chat_model = model or ChatOllama(model=name, num_ctx=NUM_CTX, reasoning=False)
        graph = build_graph(chat_model, conn, app.state.saver)
        app.state.runner = ChatRunner(graph, conn, name)
        return app.state.runner

    def conn():
        return app.state.conn

    # Chats

    @app.get("/api/chats")
    def list_chats():
        return db.list_chats(conn())

    @app.post("/api/chats")
    def create_chat(body: dict | None = None):
        return db.create_chat(conn(), "New chat")

    @app.patch("/api/chats/{chat_id}")
    def update_chat(chat_id: str, body: ChatPatch):
        if db.get_chat(conn(), chat_id) is None:
            raise HTTPException(404, "Chat not found")
        if body.title is not None:
            db.rename_chat(conn(), chat_id, body.title.strip() or "New chat")
        if body.pinned is not None:
            db.set_pinned(conn(), chat_id, body.pinned)
        return db.get_chat(conn(), chat_id)

    @app.delete("/api/chats/{chat_id}")
    async def delete_chat(chat_id: str):
        await asyncio.to_thread(db.delete_chat, conn(), chat_id)
        await app.state.saver.adelete_thread(chat_id)
        return {"ok": True}

    @app.get("/api/chats/{chat_id}/messages")
    async def chat_messages(chat_id: str):
        runner = ensure_runner(app)
        return {
            "messages": await runner.history(chat_id),
            "pending": await runner.pending(chat_id),
        }

    # Memory

    @app.get("/api/memory")
    def list_memory(kind: str | None = None, q: str | None = None):
        if q and q.strip():
            found = db.search_memories(conn(), q, limit=200)
            return [m for m in found if kind is None or m["kind"] == kind]
        return db.list_memories(conn(), kind or None)

    @app.post("/api/memory")
    def create_memory(body: MemoryBody):
        return db.add_memory(conn(), body.text.strip(), body.kind, None)

    @app.patch("/api/memory/{memory_id}")
    def update_memory(memory_id: int, body: MemoryBody):
        db.update_memory(conn(), memory_id, body.text.strip(), body.kind)
        return {"ok": True}

    @app.delete("/api/memory/{memory_id}")
    def delete_memory(memory_id: int):
        db.delete_memory(conn(), memory_id)
        return {"ok": True}

    # Settings

    @app.get("/api/settings")
    def get_settings():
        return db.get_settings(conn())

    @app.patch("/api/settings")
    def update_settings(values: dict[str, str]):
        try:
            db.update_settings(conn(), values)
        except KeyError as e:
            raise HTTPException(400, str(e.args[0])) from None
        return db.get_settings(conn())

    # Dashboard

    @app.get("/api/stats")
    def get_stats(range: Literal["7d", "30d", "all"] = "7d"):
        return stats.get_stats(conn(), range, date.today())

    @app.get("/api/status")
    async def get_status():
        return await stats.get_status(db.get_settings(conn())["model"])

    # Chat stream

    @app.websocket("/ws")
    async def chat_socket(ws: WebSocket):
        await ws.accept()
        tasks: dict[str, asyncio.Task] = {}
        lock = asyncio.Lock()

        async def emit(event: dict):
            async with lock:
                with contextlib.suppress(Exception):
                    await ws.send_json(event)

        async def forward(events):
            async for e in events:
                await emit(e)

        try:
            while True:
                msg = await ws.receive_json()
                kind, chat_id = msg.get("type"), msg.get("chat_id")
                if not chat_id:
                    continue
                if kind == "stop":
                    task = tasks.pop(chat_id, None)
                    if task and not task.done():
                        task.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await task
                    await emit({"type": "done", "chat_id": chat_id, "stats": None})
                    continue
                if chat_id in tasks and not tasks[chat_id].done():
                    await emit(
                        {
                            "type": "error",
                            "chat_id": chat_id,
                            "message": "Riz is still busy with this chat.",
                        }
                    )
                    continue
                runner = ensure_runner(app)
                if kind == "send":
                    events = runner.send(chat_id, msg.get("text", ""))
                elif kind == "approve":
                    decision = {"decision": msg.get("decision"), "path": msg.get("path")}
                    events = runner.resume(chat_id, decision)
                elif kind == "regenerate":
                    events = runner.regenerate(chat_id)
                else:
                    continue
                tasks[chat_id] = asyncio.create_task(forward(events))
        except WebSocketDisconnect:
            pass
        finally:
            for task in tasks.values():
                task.cancel()

    if FRONTEND_DIST.is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

    return app


def dev_app() -> FastAPI:
    return create_app(db.data_dir())
