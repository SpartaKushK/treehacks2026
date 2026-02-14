"""LLM planner protocol and factory."""

from __future__ import annotations

from typing import Literal

Provider = Literal["openai", "claude"]


def get_planner(provider: Provider):
    from .claude import ClaudePlanner
    from .openai_planner import OpenAIPlanner

    return OpenAIPlanner() if provider == "openai" else ClaudePlanner()
