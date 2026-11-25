"""A scripted chat model so agent tests run without Ollama."""

from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field


class ScriptedModel(BaseChatModel):
    """Returns the scripted AIMessages in order and records what it was called with."""

    responses: list[AIMessage]
    calls: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedModel":
        return self

    def _generate(self, messages: list[BaseMessage], stop=None, run_manager=None, **kwargs):
        self.calls.append(list(messages))
        if not self.responses:
            raise AssertionError("ScriptedModel ran out of responses")
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


def ai_call(name: str, args: dict, id: str) -> AIMessage:
    return AIMessage("", tool_calls=[{"name": name, "args": args, "id": id}])
