from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from riz.server import create_app

from .fakes import ScriptedModel, ai_call


def client_with(tmp_path, responses=()):
    return TestClient(create_app(tmp_path, model=ScriptedModel(responses=list(responses))))


def receive_until(ws, types):
    events = []
    while True:
        e = ws.receive_json()
        events.append(e)
        if e["type"] in types:
            return events


def test_chat_crud(tmp_path):
    with client_with(tmp_path) as c:
        chat = c.post("/api/chats", json={}).json()
        assert chat["title"] == "New chat"
        c.patch(f"/api/chats/{chat['id']}", json={"pinned": True, "title": "Todo"})
        [listed] = c.get("/api/chats").json()
        assert listed["title"] == "Todo" and listed["pinned"] is True
        assert c.delete(f"/api/chats/{chat['id']}").status_code == 200
        assert c.get("/api/chats").json() == []
        assert c.patch("/api/chats/nope", json={"title": "x"}).status_code == 404


def test_memory_crud_and_search(tmp_path):
    with client_with(tmp_path) as c:
        tea = c.post("/api/memory", json={"text": "Likes tea", "kind": "preference"}).json()
        c.post("/api/memory", json={"text": "Works on Riz", "kind": "project"})
        assert [m["text"] for m in c.get("/api/memory", params={"q": "tea"}).json()] == [
            "Likes tea"
        ]
        assert len(c.get("/api/memory", params={"kind": "project"}).json()) == 1
        c.patch(f"/api/memory/{tea['id']}", json={"text": "Likes green tea", "kind": "preference"})
        assert c.get("/api/memory", params={"q": "green"}).json()[0]["id"] == tea["id"]
        c.delete(f"/api/memory/{tea['id']}")
        assert len(c.get("/api/memory").json()) == 1
        bad = c.post("/api/memory", json={"text": "x", "kind": "secret"})
        assert bad.status_code == 422


def test_settings_patch_rejects_unknown(tmp_path):
    with client_with(tmp_path) as c:
        assert c.patch("/api/settings", json={"nope": "1"}).status_code == 400
        assert c.patch("/api/settings", json={"theme": "dark"}).status_code == 200
        assert c.get("/api/settings").json()["theme"] == "dark"


def test_ws_send_streams_until_done(tmp_path):
    with client_with(tmp_path, [AIMessage("Hello there")]) as c:
        chat = c.post("/api/chats", json={}).json()
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"type": "send", "chat_id": chat["id"], "text": "hi"})
            events = receive_until(ws, {"done", "error"})
        assert "".join(e["text"] for e in events if e["type"] == "token") == "Hello there"
        assert events[-1]["type"] == "done"
        assert c.get("/api/chats").json()[0]["title"] == "hi"


def test_pending_survives_reload(tmp_path):
    with client_with(tmp_path, [ai_call("read_file", {"path": "x"}, "1"), AIMessage("ok")]) as c:
        chat = c.post("/api/chats", json={}).json()
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"type": "send", "chat_id": chat["id"], "text": "read x"})
            assert receive_until(ws, {"tool_request"})[-1]["tool"] == "read_file"
        body = c.get(f"/api/chats/{chat['id']}/messages").json()
        assert body["pending"]["tool"] == "read_file"
        assert body["messages"] == [{"role": "user", "content": "read x"}]
        with c.websocket_connect("/ws") as ws:
            ws.send_json(
                {"type": "approve", "chat_id": chat["id"], "decision": "deny", "path": None}
            )
            events = receive_until(ws, {"done", "error"})
        assert events[0]["decision"] == "denied" and events[-1]["type"] == "done"


def test_pending_survives_app_restart(tmp_path):
    with client_with(tmp_path, [ai_call("read_file", {"path": "x"}, "1")]) as c:
        chat = c.post("/api/chats", json={}).json()
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"type": "send", "chat_id": chat["id"], "text": "read x"})
            receive_until(ws, {"tool_request"})
    with client_with(tmp_path) as c:
        assert c.get(f"/api/chats/{chat['id']}/messages").json()["pending"]["tool"] == "read_file"


def test_stats_and_status_routes(tmp_path, monkeypatch):
    async def offline(name):
        return {"ollama": False, "model": None, "vram_used_gb": None, "vram_total_gb": None}

    monkeypatch.setattr("riz.stats.get_status", offline)
    with client_with(tmp_path) as c:
        assert len(c.get("/api/stats", params={"range": "30d"}).json()["tokens_per_day"]) == 30
        assert c.get("/api/stats", params={"range": "1y"}).status_code == 422
        assert c.get("/api/status").json()["ollama"] is False


def test_ws_allow_runs_tool_and_logs(tmp_path):
    note = tmp_path / "note.txt"
    note.write_text("hello")
    script = [ai_call("read_file", {"path": str(note)}, "1"), AIMessage("It says hello")]
    with client_with(tmp_path, script) as c:
        chat = c.post("/api/chats", json={}).json()
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"type": "send", "chat_id": chat["id"], "text": "read it"})
            receive_until(ws, {"tool_request"})
            ws.send_json({"type": "approve", "chat_id": chat["id"], "decision": "allow"})
            events = receive_until(ws, {"done", "error"})
        assert events[0]["summary"] == "hello" and events[-1]["type"] == "done"
        tools = c.get("/api/stats", params={"range": "7d"}).json()["tools"]
        assert tools == [{"tool": "read_file", "allowed": 1, "denied": 0, "auto": 0}]
