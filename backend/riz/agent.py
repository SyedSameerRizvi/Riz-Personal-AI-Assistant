"""LangChain tool wrappers, system prompt and the LangGraph graph with approval interrupts."""

import asyncio
import sqlite3
from datetime import date

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    SystemMessage,
    ToolMessage,
    trim_messages,
)
from langchain_core.messages.utils import count_tokens_approximately
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool, tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.types import interrupt

from riz import tools
from riz.db import add_memory, list_memories, log_tool_call, search_memories

APPROVAL_TOOLS = {"read_file", "write_file", "delete_file", "run_command"}
DENIED = "The user denied this action."
HISTORY_MAX_TOKENS = 6000
PROMPT_MEMORIES = 20


def _chat_id(config: RunnableConfig) -> str | None:
    return config.get("configurable", {}).get("thread_id")


def _recall(conn: sqlite3.Connection, query: str) -> str:
    found = search_memories(conn, query)
    if not found:
        return "No saved facts match."
    return "\n".join(f"- {m['text']}" for m in found)


def _save(conn: sqlite3.Connection, text: str, kind: str, chat_id: str | None) -> str:
    try:
        add_memory(conn, text, kind, chat_id)
    except ValueError as e:
        return f"Not saved: {e}"
    return f"Saved to memory: {text}"


def make_tools(conn: sqlite3.Connection) -> list[BaseTool]:
    @tool
    def recall_memory(query: str) -> str:
        """Search the facts saved about the user. Use a few keywords."""
        return _recall(conn, query)

    @tool
    def save_memory(text: str, kind: str, config: RunnableConfig) -> str:
        """Save a lasting fact about the user. kind is preference, project or personal."""
        return _save(conn, text, kind, _chat_id(config))

    @tool
    def read_file(path: str) -> str:
        """Read a text file on the user's PC. Needs the user's approval."""
        return tools.read_file(path)

    @tool
    def write_file(path: str, content: str) -> str:
        """Create or overwrite a text file on the user's PC. Needs the user's approval."""
        return tools.write_file(path, content)

    @tool
    def delete_file(path: str) -> str:
        """Move a file to the Recycle Bin. Needs the user's approval."""
        return tools.delete_file(path)

    @tool
    def run_command(command: str) -> str:
        """Run a PowerShell command and return its output. Needs the user's approval."""
        return tools.run_command(command)

    return [recall_memory, save_memory, read_file, write_file, delete_file, run_command]


def build_system_prompt(memories: list[dict], today: date) -> str:
    lines = [
        "You are Riz, a personal AI assistant running locally on the user's Windows PC.",
        "You can search and save facts about the user freely.",
        "Reading, writing or deleting files and running PowerShell commands need the user's approval.",
        "If the user denies an action, accept it and continue without it.",
        "Deleted files go to the Recycle Bin.",
        f"Today's date is {today.isoformat()}.",
    ]
    if memories:
        lines.append("\nWhat you know about the user:")
        lines += [f"- {m['text']}" for m in memories[:PROMPT_MEMORIES]]
    return "\n".join(lines)


def _payload(call: dict) -> dict:
    preview = None
    if call["name"] == "write_file":
        args = call["args"]
        preview = tools.write_preview(args.get("path", ""), args.get("content", ""))
    return {"call_id": call["id"], "tool": call["name"], "args": call["args"], "preview": preview}


def _resolve(call: dict, decision: dict | None) -> tuple[str, dict]:
    """Turn a call and the user's decision into (outcome, args to run with)."""
    if decision is None:
        return "auto", call["args"]
    choice = decision.get("decision")
    if choice == "allow":
        return "allowed", call["args"]
    if choice == "pick" and call["name"] == "read_file" and decision.get("path"):
        return "allowed", {**call["args"], "path": decision["path"]}
    return "denied", call["args"]  # deny, or anything we don't recognise


async def _run_tool(conn: sqlite3.Connection, name: str, args: dict, chat_id: str | None) -> str:
    try:
        match name:
            case "recall_memory":
                return _recall(conn, args["query"])
            case "save_memory":
                return _save(conn, args["text"], args["kind"], chat_id)
            case "read_file":
                return await asyncio.to_thread(tools.read_file, args["path"])
            case "write_file":
                return await asyncio.to_thread(tools.write_file, args["path"], args["content"])
            case "delete_file":
                return await asyncio.to_thread(tools.delete_file, args["path"])
            case "run_command":
                return await asyncio.to_thread(tools.run_command, args["command"])
            case _:
                return f"Unknown tool: {name}"
    except KeyError as e:
        return f"Missing argument {e} for {name}"


def build_graph(model: BaseChatModel, conn: sqlite3.Connection, checkpointer):
    bound = model.bind_tools(make_tools(conn))

    async def model_node(state: MessagesState) -> dict:
        history = trim_messages(
            state["messages"],
            max_tokens=HISTORY_MAX_TOKENS,
            token_counter=count_tokens_approximately,
            strategy="last",
            start_on="human",
        )
        system = SystemMessage(build_system_prompt(list_memories(conn), date.today()))
        return {"messages": [await bound.ainvoke([system, *history])]}

    async def tools_node(state: MessagesState, config: RunnableConfig) -> dict:
        calls = state["messages"][-1].tool_calls
        # LangGraph re-runs this node from the top on every resume, so ask for every
        # approval first (no side effects), and only then run anything, exactly once.
        decisions = {c["id"]: interrupt(_payload(c)) for c in calls if c["name"] in APPROVAL_TOOLS}
        chat_id = _chat_id(config)
        results = []
        for c in calls:
            outcome, args = _resolve(c, decisions.get(c["id"]))
            if outcome == "denied":
                content = DENIED
            else:
                content = await _run_tool(conn, c["name"], args, chat_id)
            log_tool_call(conn, chat_id, c["name"], args, outcome)
            results.append(
                ToolMessage(
                    content,
                    tool_call_id=c["id"],
                    name=c["name"],
                    additional_kwargs={"decision": outcome, "args": args},
                )
            )
        return {"messages": results}

    def route(state: MessagesState) -> str:
        last = state["messages"][-1] if state["messages"] else None
        return "tools" if isinstance(last, AIMessage) and last.tool_calls else END

    graph = StateGraph(MessagesState)
    graph.add_node("model", model_node)
    graph.add_node("tools", tools_node)
    graph.add_edge(START, "model")
    graph.add_conditional_edges("model", route, ["tools", END])
    graph.add_edge("tools", "model")
    return graph.compile(checkpointer=checkpointer)
