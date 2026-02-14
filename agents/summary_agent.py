"""SummaryAgent — Port 8006. Summarization via local Ollama (llama3.2). NVIDIA/open-model angle."""
import os
from typing import Any, Optional

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="SummaryAgent")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


class RunRequest(BaseModel):
    input: dict[str, Any]
    context: Optional[dict[str, Any]] = None


class RunResponse(BaseModel):
    output: dict[str, Any]
    meta: Optional[dict[str, Any]] = None


@app.post("/run")
async def run(request: RunRequest) -> RunResponse:
    text = request.input.get("text", "")
    max_length = request.input.get("max_length", 200)

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": (
                    f"Summarize the following text in {max_length} words or fewer. "
                    f"Be concise and capture the key points:\n\n{text}"
                ),
                "stream": False,
            },
        )
        resp.raise_for_status()
        result = resp.json()
        summary = result.get("response", "")

    return RunResponse(
        output={"summary": summary},
        meta={"model": OLLAMA_MODEL, "runtime": "ollama-local", "open_model": True},
    )


@app.get("/health")
async def health():
    # Check if Ollama is reachable
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            models = [m["name"] for m in resp.json().get("models", [])]
            return {"status": "ok", "agent": "SummaryAgent", "model": OLLAMA_MODEL, "available_models": models}
    except Exception:
        return {"status": "degraded", "agent": "SummaryAgent", "error": "Ollama unreachable"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8006)
